import type { ColorSource } from 'pixi.js';
import { type ColorSpace, fromSpace, parseColor, type RGBA, toSpace } from './color';
import { GradKind, RAMP_WIDTH, TAU } from './constants';

/**
 * A color stop: a bare color (stops are spread evenly), `[offset, color]`,
 * `[offset, color, alpha]` or `{ offset, color, alpha }`.
 */
export type StopInput =
    | ColorSource
    | [number, ColorSource]
    | [number, ColorSource, number]
    | {
          /** Position on the ramp, from 0 to 1. */
          offset: number;
          /** Colour of the stop. */
          color: ColorSource;
          /** Opacity of the stop, from 0 to 1. Default 1. */
          alpha?: number;
      };

/**
 * How the ramp moves between stops.
 *
 * - `linear`: piecewise linear between stops (CSS behaviour).
 * - `smooth`: monotone cubic spline through the stops with eased ends. Removes the
 *   Mach bands you see at every stop of a linear ramp and never overshoots.
 * - a function remaps the gradient parameter before lookup (e.g. an easing curve for scrims).
 */
export type Easing = 'linear' | 'smooth' | ((t: number) => number);

/** Gradient coordinates: `shape` = fractions of each painted shape's box, `local` = the graphics' local units (one ramp across many shapes). */
export type GradientUnits = 'shape' | 'local';
/** What a gradient does outside 0..1: hold the end colours (`pad`), tile (`repeat`) or mirror (`reflect`). */
export type ExtendMode = 'pad' | 'repeat' | 'reflect';

/** Options shared by every gradient: colour stops, interpolation space, easing, extend mode and units. */
export interface GradientOptions {
    /** Colour stops. Bare colours are spread evenly. See {@link StopInput}. */
    stops: StopInput[];
    /** Interpolation space. OKLab keeps hue and lightness perceptually even. Default `oklab`. */
    space?: ColorSpace;
    /** How the ramp moves between stops. Default `linear`. */
    easing?: Easing;
    /** Portion of the colour ramp to sample, before easing. Endpoints are clamped to 0..1. Non-finite values reset to `[0, 1]`. */
    range?: [number, number];
    /** What the gradient does outside 0..1. Default `pad`. */
    extend?: ExtendMode;
    /** Coordinates of the gradient's points and radii: each shape's box (`shape`, default) or local units (`local`). */
    units?: GradientUnits;
}

/** Box a shape exposes to gradients in `shape` units (plus arc angles for conic gradients). */
export interface ShapeFrame {
    x: number;
    y: number;
    w: number;
    h: number;
    start?: number;
    sweep?: number;
}

interface Stop {
    offset: number;
    rgba: RGBA;
}

const fnIds = new WeakMap<(t: number) => number, number>();
let nextFnId = 1;

/** 2- and 3-element arrays are stops (`[offset, color, alpha?]`). Pass rgb colors as hex, strings or objects. */
function isStopTuple(s: StopInput): s is [number, ColorSource] | [number, ColorSource, number] {
    return Array.isArray(s) && (s.length === 2 || s.length === 3) && typeof s[0] === 'number';
}

function normalizeStops(input: StopInput[]): Stop[] {
    if (input.length === 0)
        return [
            { offset: 0, rgba: [0, 0, 0, 0] },
            { offset: 1, rgba: [0, 0, 0, 0] },
        ];
    const stops: Stop[] = input.map((s, i) => {
        const even = input.length === 1 ? 0 : i / (input.length - 1);

        if (isStopTuple(s)) return { offset: s[0], rgba: parseColor(s[1], s[2] ?? 1) };
        if (typeof s === 'object' && s !== null && !Array.isArray(s) && 'offset' in s && 'color' in s) {
            return { offset: s.offset, rgba: parseColor(s.color, s.alpha ?? 1) };
        }

        return { offset: even, rgba: parseColor(s as ColorSource) };
    });

    // CSS rules: clamp to 0..1 and force offsets to be non-decreasing.
    let last = 0;

    for (const s of stops) {
        s.offset = Math.min(1, Math.max(last, s.offset));
        last = s.offset;
    }
    if (stops.length === 1) stops.push({ offset: 1, rgba: stops[0].rgba });

    return stops;
}

/** Fritsch-Butland tangents with zero slope at both ends (so two stops ease like smoothstep). */
function monotoneTangents(xs: number[], ys: number[]): number[] {
    const n = xs.length;
    const m = new Array<number>(n).fill(0);

    for (let k = 1; k < n - 1; k++) {
        const h0 = xs[k] - xs[k - 1];
        const h1 = xs[k + 1] - xs[k];

        if (h0 <= 1e-9 || h1 <= 1e-9) continue;
        const d0 = (ys[k] - ys[k - 1]) / h0;
        const d1 = (ys[k + 1] - ys[k]) / h1;

        if (d0 * d1 <= 0) continue;
        const w1 = 2 * h1 + h0;
        const w2 = h1 + 2 * h0;

        m[k] = (w1 + w2) / (w1 / d0 + w2 / d1);
    }

    return m;
}

/**
 * Base class of all gradients. Stops are interpolated premultiplied (OKLab by default), baked into a
 * shared half-float atlas and dithered when sampled, so gradients stay smooth without banding.
 */
export abstract class Gradient {
    /** @internal Shader id of the gradient type. */
    abstract readonly kind: GradKind;
    /** @internal Normalised stops (offsets clamped and sorted, colours parsed). */
    readonly stops: Stop[];
    /** Interpolation space. */
    readonly space: ColorSpace;
    /** How the ramp moves between stops. */
    readonly easing: Easing;
    /** Portion of the colour ramp sampled before easing. */
    readonly range: readonly [number, number];
    /** What the gradient does outside 0..1. */
    readonly extend: ExtendMode;
    /** Coordinates of the gradient's points and radii. */
    readonly units: GradientUnits;
    /** @internal Identity of the baked ramp (geometry excluded), used to share atlas rows. */
    readonly key: string;

    constructor(options: GradientOptions) {
        this.stops = normalizeStops(options.stops);
        this.space = options.space ?? 'oklab';
        this.easing = options.easing ?? 'linear';
        const range = options.range;

        this.range =
            range && Number.isFinite(range[0]) && Number.isFinite(range[1])
                ? [Math.min(1, Math.max(0, range[0])), Math.min(1, Math.max(0, range[1]))]
                : [0, 1];
        this.extend = options.extend ?? 'pad';
        this.units = options.units ?? 'shape';

        let easingKey: string;

        if (typeof this.easing === 'function') {
            let id = fnIds.get(this.easing);

            if (!id) {
                id = nextFnId++;
                fnIds.set(this.easing, id);
            }
            easingKey = `fn${id}`;
        } else easingKey = this.easing;

        this.key = `${this.space}|${easingKey}|${this.range.join(',')}|${this.stops.map((s) => `${s.offset.toFixed(5)}:${s.rgba.map((c) => c.toFixed(5)).join(',')}`).join(';')}`;
    }

    /** @internal Writes the gradient geometry (local space) for a shape into `out[0..3]`. */
    abstract resolve(frame: ShapeFrame, out: Float32Array, offset: number): void;

    /** @internal Bakes RAMP_WIDTH premultiplied sRGB samples into `out` (rgba floats). */
    bake(out: Float32Array): void {
        const stops = this.stops;
        const n = stops.length;
        const xs = stops.map((s) => s.offset);
        // premultiplied working-space channels
        const ch: number[][] = [[], [], [], []];

        for (const s of stops) {
            const w = toSpace(s.rgba, this.space);
            const a = s.rgba[3];

            ch[0].push(w[0] * a);
            ch[1].push(w[1] * a);
            ch[2].push(w[2] * a);
            ch[3].push(a);
        }
        const smooth = this.easing === 'smooth';
        const tangents = smooth ? ch.map((ys) => monotoneTangents(xs, ys)) : null;
        const remap = typeof this.easing === 'function' ? this.easing : null;
        const v = [0, 0, 0, 0];

        for (let i = 0; i < RAMP_WIDTH; i++) {
            let t = this.range[0] + (i / (RAMP_WIDTH - 1)) * (this.range[1] - this.range[0]);

            if (remap) t = Math.min(1, Math.max(0, remap(t)));

            if (t <= xs[0]) {
                for (let c = 0; c < 4; c++) v[c] = ch[c][0];
            } else if (t >= xs[n - 1]) {
                for (let c = 0; c < 4; c++) v[c] = ch[c][n - 1];
            } else {
                let k = 0;

                while (k < n - 2 && t > xs[k + 1]) k++;
                // skip zero-width (hard) segments
                while (k < n - 2 && xs[k + 1] - xs[k] <= 1e-9) k++;
                const h = xs[k + 1] - xs[k];
                const s = h > 1e-9 ? (t - xs[k]) / h : 1;

                for (let c = 0; c < 4; c++) {
                    const y0 = ch[c][k];
                    const y1 = ch[c][k + 1];

                    if (tangents) {
                        const s2 = s * s;
                        const s3 = s2 * s;

                        v[c] =
                            (2 * s3 - 3 * s2 + 1) * y0 +
                            (s3 - 2 * s2 + s) * h * tangents[c][k] +
                            (-2 * s3 + 3 * s2) * y1 +
                            (s3 - s2) * h * tangents[c][k + 1];
                    } else {
                        v[c] = y0 + (y1 - y0) * s;
                    }
                }
            }

            const a = Math.min(1, Math.max(0, v[3]));
            const o = i * 4;

            if (a <= 1e-7) {
                out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0;
                continue;
            }
            const rgb = fromSpace([v[0] / a, v[1] / a, v[2] / a], this.space);

            out[o] = rgb[0] * a;
            out[o + 1] = rgb[1] * a;
            out[o + 2] = rgb[2] * a;
            out[o + 3] = a;
        }
    }
}

/** A point `[x, y]`. In `shape` units, x and y are fractions of the painted shape's box. */
export type Vec2 = [number, number];

function point(frame: ShapeFrame, units: GradientUnits, p: Vec2): Vec2 {
    return units === 'shape' ? [frame.x + p[0] * frame.w, frame.y + p[1] * frame.h] : p;
}

/** Options of {@link linear}: stops plus the start and end points of the ramp. */
export interface LinearGradientOptions extends GradientOptions {
    /** Start point. Default `[0, 0]` (top). */
    from?: Vec2;
    /** End point. Default `[0, 1]` (bottom). */
    to?: Vec2;
}

/** A straight ramp between two points. Create it with {@link linear}, {@link vertical} or {@link horizontal}. */
export class LinearGradient extends Gradient {
    /** @internal */
    readonly kind: GradKind = GradKind.Linear;
    /** Start point. */
    from: Vec2;
    /** End point. */
    to: Vec2;

    constructor(options: LinearGradientOptions) {
        super(options);
        this.from = options.from ?? [0, 0];
        this.to = options.to ?? [0, 1];
    }

    /** @internal */
    resolve(frame: ShapeFrame, out: Float32Array, o: number): void {
        const a = point(frame, this.units, this.from);
        const b = point(frame, this.units, this.to);

        out[o] = a[0];
        out[o + 1] = a[1];
        out[o + 2] = b[0];
        out[o + 3] = b[1];
    }
}

/** Options of {@link radial}: stops plus centre, outer radius and inner radius. */
export interface RadialGradientOptions extends GradientOptions {
    /** Default `[0.5, 0.5]`. */
    center?: Vec2;
    /** Outer radius. In shape units it is a fraction of the larger side. Default `0.5`. */
    radius?: number;
    /** Radius where the ramp starts. Default `0`. */
    innerRadius?: number;
}

/** A ramp from a centre outwards, optionally starting at an inner radius. Create it with {@link radial}. */
export class RadialGradient extends Gradient {
    /** @internal */
    readonly kind: GradKind = GradKind.Radial;
    /** Centre of the ramp. */
    center: Vec2;
    /** Radius where the ramp ends. */
    radius: number;
    /** Radius where the ramp starts. */
    innerRadius: number;

    constructor(options: RadialGradientOptions) {
        super(options);
        this.center = options.center ?? [0.5, 0.5];
        this.radius = options.radius ?? 0.5;
        this.innerRadius = options.innerRadius ?? 0;
    }

    /** @internal */
    resolve(frame: ShapeFrame, out: Float32Array, o: number): void {
        const c = point(frame, this.units, this.center);
        const scale = this.units === 'shape' ? Math.max(frame.w, frame.h) : 1;

        out[o] = c[0];
        out[o + 1] = c[1];
        out[o + 2] = this.radius * scale;
        out[o + 3] = this.innerRadius * scale;
    }
}

/** Options of {@link conic}: stops plus centre, start angle and sweep. */
export interface ConicGradientOptions extends GradientOptions {
    /** Default `[0.5, 0.5]`. */
    center?: Vec2;
    /**
     * Angle (radians, y-down so positive is clockwise) where the ramp starts.
     * Defaults to the arc start for arcs/sectors, otherwise 12 o'clock.
     */
    startAngle?: number;
    /** Angular length of the ramp. Defaults to the arc sweep for arcs/sectors, otherwise a full turn. */
    sweep?: number;
    /** With an explicit sweep, `shape` uses its magnitude and the arc's direction. Default `fixed` preserves its sign. */
    sweepDirection?: 'fixed' | 'shape';
}

/** An angular ramp around a centre. On arcs it follows the arc. Create it with {@link conic}. */
export class ConicGradient extends Gradient {
    /** @internal */
    readonly kind: GradKind = GradKind.Conic;
    /** Centre of the ramp. */
    center: Vec2;
    /** Angle where the ramp starts. Unset follows the arc, or 12 o'clock for other shapes. */
    startAngle?: number;
    /** Angular length of the ramp. Unset follows the arc, or a full turn for other shapes. */
    sweep?: number;
    /** Whether an explicit sweep keeps its sign or follows the painted arc's direction. */
    sweepDirection: 'fixed' | 'shape';

    constructor(options: ConicGradientOptions) {
        super(options);
        this.center = options.center ?? [0.5, 0.5];
        this.startAngle = options.startAngle;
        this.sweep = options.sweep;
        this.sweepDirection = options.sweepDirection ?? 'fixed';
    }

    /** @internal */
    resolve(frame: ShapeFrame, out: Float32Array, o: number): void {
        const c = point(frame, this.units, this.center);

        out[o] = c[0];
        out[o + 1] = c[1];
        out[o + 2] = this.startAngle ?? frame.start ?? -Math.PI / 2;
        out[o + 3] =
            this.sweep !== undefined && this.sweepDirection === 'shape'
                ? Math.abs(this.sweep) * ((frame.sweep ?? 0) < 0 ? -1 : 1)
                : (this.sweep ?? frame.sweep ?? TAU);
    }
}

/** A ramp that follows a stroke from its first point (t = 0) to its last (t = 1). Create it with {@link along}. */
export class PathGradient extends Gradient {
    /** @internal */
    readonly kind: GradKind = GradKind.Path;

    /** @internal */
    resolve(_frame: ShapeFrame, out: Float32Array, o: number): void {
        out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0;
    }
}

/**
 * Linear gradient. `from` / `to` default to top and bottom of the shape's box (`units: 'shape'`).
 *
 * @example
 * ```ts
 * g.roundRect(0, 0, 200, 60, 16).fill(linear([0x0a84ff, 0xbf5af2], { from: [0, 0], to: [1, 1] }));
 * ```
 */
export const linear = (stops: StopInput[], options: Omit<LinearGradientOptions, 'stops'> = {}): LinearGradient =>
    new LinearGradient({ ...options, stops });

/** Top-to-bottom linear gradient across the painted shape. */
export const vertical = (
    stops: StopInput[],
    options: Omit<LinearGradientOptions, 'stops' | 'from' | 'to'> = {},
): LinearGradient => new LinearGradient({ ...options, stops, from: [0, 0], to: [0, 1] });

/** Left-to-right linear gradient across the painted shape. */
export const horizontal = (
    stops: StopInput[],
    options: Omit<LinearGradientOptions, 'stops' | 'from' | 'to'> = {},
): LinearGradient => new LinearGradient({ ...options, stops, from: [0, 0], to: [1, 0] });

/** Radial gradient from `center` (default the box centre) out to `radius`, optionally starting at `innerRadius`. */
export const radial = (stops: StopInput[], options: Omit<RadialGradientOptions, 'stops'> = {}): RadialGradient =>
    new RadialGradient({ ...options, stops });

/**
 * Conic (angular) gradient. On arcs and sectors it spans the arc by default, so a ring's ramp
 * runs from its start cap to its end cap. Short round arcs ease out of the first stop
 * over one cap diameter. This applies to padded ramps aligned
 * with the arc. Independently positioned gradients keep their angular mapping.
 */
export const conic = (stops: StopInput[], options: Omit<ConicGradientOptions, 'stops'> = {}): ConicGradient =>
    new ConicGradient({ ...options, stops });

/** Gradient that follows a stroke from its first point (t = 0) to its last (t = 1). */
export const along = (stops: StopInput[], options: Omit<GradientOptions, 'stops' | 'units'> = {}): PathGradient =>
    new PathGradient({ ...options, stops });
