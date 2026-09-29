import {
    Bounds,
    Buffer,
    BufferUsage,
    Color,
    type ColorSource,
    type DestroyOptions,
    Geometry,
    Mesh,
    type PointData,
    type Shader,
    type UniformGroup,
} from 'pixi.js';
import { GradientAtlas } from './atlas';
import { parseColor, type RGBA } from './color';
import { CAP0_SHIFT, CAP1_SHIFT, Cap, Extend, Flag, INSTANCE_ATTRIBUTES, Prim, STRIDE, TAU } from './constants';
import { catmullRom, flattenCubic, flattenQuadratic, monotoneX, type PointsInput, toFlat } from './curves';
import { ConicGradient, Gradient, type ShapeFrame } from './gradient';
import { hitTest } from './hit';
import { createSilkShader } from './shader';

// ---------------------------------------------------------------------------------------------
// Public style types
// ---------------------------------------------------------------------------------------------

/** How a fill is painted: a colour, a gradient, opacity and an optional gaussian blur for glows and soft shadows. */
export interface FillStyle {
    /** Colour, any Pixi `ColorSource`. With a gradient, it tints the gradient. */
    color?: ColorSource;
    /** Opacity from 0 to 1. Default 1. */
    alpha?: number;
    /** Gradient paint. `color` (if given) tints it. */
    gradient?: Gradient;
    /** Gaussian blur radius (standard deviation, local units). Great for glows and soft shadows. */
    blur?: number;
}

/** What `fill()` accepts: any Pixi colour, a gradient or a {@link FillStyle}. */
export type FillInput = ColorSource | Gradient | FillStyle;

/** Shape of the ends of open paths and of every dash: flat, round or square. */
export type LineCap = 'butt' | 'round' | 'square';

/** How a stroke is painted: width (or tapered widths), alignment, caps, dashes, plus everything in {@link FillStyle}. */
export interface StrokeStyle extends FillStyle {
    /**
     * Default 1. On polylines an array tapers the stroke: `[start, end]` interpolates along the
     * path length, one value per point sets each vertex.
     */
    width?: number | number[];
    /** `inside` | `center` | `outside`, or Pixi's numeric alignment (1 inside, 0.5 center, 0 outside). */
    alignment?: 'inside' | 'center' | 'outside' | number;
    /** Ends of open paths and of dashes. Default `butt` (Pixi default). */
    cap?: LineCap;
    /** `[dash, gap]` or a single number for equal dash and gap. A 0 dash with round caps gives dots. */
    dash?: number | [number, number];
    /** Shifts the dash pattern along the path, in local units. Default 0. */
    dashOffset?: number;
    /** On closed outlines stretch the pattern so it tiles without a seam. Default true. */
    dashFit?: boolean;
    /** Shade a round arc tip when it touches the start cap near one full turn. Default true. Set false to disable. */
    tipShadow?: boolean;
    /** Accepted for Pixi compatibility. Joins are always round, the smoothest choice. */
    join?: 'round' | 'miter' | 'bevel';
    /** Accepted for Pixi compatibility and ignored. */
    miterLimit?: number;
}

/** What `stroke()` accepts: any Pixi colour, a gradient or a {@link StrokeStyle}. */
export type StrokeInput = ColorSource | Gradient | StrokeStyle;

/** Options of `polyline()`: closed loops and monotone or Catmull-Rom smoothing of the points. */
export interface PolylineOptions {
    /** Connect the last point back to the first. Default false. */
    closed?: boolean;
    /** Resample through a smooth curve. `monotone` never overshoots (charts), `catmull` for free paths. */
    smooth?: false | 'monotone' | 'catmull';
    /** Sample spacing for smoothing, local units. Default 2. */
    step?: number;
}

/** Options of `area()`: monotone smoothing of the series and its sample spacing. */
export interface AreaOptions {
    /** `monotone` draws a smooth curve through the points that never overshoots. Default false. */
    smooth?: false | 'monotone';
    /** Sample spacing for smoothing, local units. Default 2. */
    step?: number;
}

/** Per-object rendering settings of a {@link SilkGraphics}: dithering, anti-aliasing width and hairline threshold. */
export interface SilkGraphicsOptions {
    /** Dither amplitude in 8-bit steps (0 disables). Applied to gradients and blurs only. Default 1. */
    dither?: number;
    /** AA ramp width in device pixels. 1 = crisp box filter. Default 1. */
    aaWidth?: number;
    /** Strokes thinner than this (device px) keep this width and fade instead. Default 1. */
    minStrokePx?: number;
    /** Pixi label of the object, for debugging. Default `SilkGraphics`. */
    label?: string;
}

// ---------------------------------------------------------------------------------------------
// Internal shapes
// ---------------------------------------------------------------------------------------------

/** Shapes are stored already transformed. `k` is the uniform scale of the transform, used for widths. */
type Shape = { k: number } & (
    | {
          kind: 'rect';
          cx: number;
          cy: number;
          hw: number;
          hh: number;
          r: [number, number, number, number];
          smoothing: number;
          rot: number;
      }
    | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; rot: number }
    | { kind: 'arc'; cx: number; cy: number; r: number; start: number; sweep: number }
    | { kind: 'sector'; cx: number; cy: number; r0: number; r1: number; start: number; sweep: number; corner: number }
    | { kind: 'path'; subpaths: SubPath[] }
    | { kind: 'area'; top: number[]; bottom: number[] }
    | { kind: 'heart'; cx: number; cy: number; size: number; round: number; rot: number }
    | {
          kind: 'star';
          cx: number;
          cy: number;
          n: number;
          r: number;
          en: number;
          rot: number;
          corner: number;
          ri: number;
      }
    | { kind: 'triangle'; pts: number[]; corner: number }
);

interface Affine {
    a: number;
    b: number;
    c: number;
    d: number;
    tx: number;
    ty: number;
}

interface SubPath {
    pts: number[];
    closed: boolean;
}

interface Paint {
    rgba: RGBA;
    gradient: Gradient | null;
    blur: number;
}

interface Stroke extends Paint {
    width: number;
    /** Tapered polylines: `[start, end]` or one width per point. */
    widths: number[] | null;
    align: number;
    cap: Cap;
    dash: [number, number] | null;
    dashOffset: number;
    dashFit: boolean;
    tipShadow: boolean;
}

interface LastEmit {
    shapes: Shape[];
    start: number;
    fill: Paint;
}

const CLOSED_KINDS = new Set(['rect', 'ellipse', 'sector', 'heart', 'star', 'triangle']);
const FILL_KEYS = [
    'color',
    'alpha',
    'gradient',
    'blur',
    'width',
    'alignment',
    'cap',
    'dash',
    'dashOffset',
    'dashFit',
    'tipShadow',
    'join',
];
const CAPS: Record<LineCap, Cap> = { butt: Cap.Butt, round: Cap.Round, square: Cap.Square };
const EXTEND: Record<string, Extend> = { pad: Extend.Pad, repeat: Extend.Repeat, reflect: Extend.Reflect };
const HEART_W = 1.2071; // width of the unit heart (height 1.1036)
const HEART_H = 1.1036;

let warnedPathFill = false;
let warnedAreaRotation = false;

function scalePaint<T extends Paint>(p: T, k: number): T {
    return k === 1 ? p : { ...p, blur: p.blur * k };
}

function scaleStroke(st: Stroke, k: number): Stroke {
    if (k === 1) return st;

    return {
        ...st,
        width: st.width * k,
        widths: st.widths ? st.widths.map((w) => w * k) : null,
        blur: st.blur * k,
        dash: st.dash ? [st.dash[0] * k, st.dash[1] * k] : null,
        dashOffset: st.dashOffset * k,
    };
}

function isStyleObject(v: unknown): v is FillStyle & StrokeStyle {
    if (typeof v !== 'object' || v === null || Array.isArray(v) || v instanceof Color || ArrayBuffer.isView(v))
        return false;

    return FILL_KEYS.some((k) => k in v);
}

function resolvePaint(input: FillInput | StrokeInput | undefined): Paint & Omit<StrokeStyle, 'gradient' | 'blur'> {
    if (input instanceof Gradient) return { rgba: [1, 1, 1, 1], gradient: input, blur: 0 };
    if (input === undefined || input === null) return { rgba: [1, 1, 1, 1], gradient: null, blur: 0 };
    if (isStyleObject(input)) {
        return {
            ...input,
            rgba: parseColor(input.color ?? 0xffffff, input.alpha ?? 1),
            gradient: input.gradient ?? null,
            blur: Math.max(0, input.blur ?? 0),
        };
    }

    return { rgba: parseColor(input as ColorSource), gradient: null, blur: 0 };
}

function resolveStroke(input: StrokeInput | undefined): Stroke {
    const p = resolvePaint(input);
    let align = 0;

    if (typeof p.alignment === 'number') align = 1 - 2 * p.alignment;
    else if (p.alignment === 'inside') align = -1;
    else if (p.alignment === 'outside') align = 1;
    let dash: [number, number] | null = null;

    if (p.dash !== undefined) {
        dash = typeof p.dash === 'number' ? [p.dash, p.dash] : [p.dash[0], p.dash[1]];
        if (dash[0] + dash[1] <= 0) dash = null;
    }

    const widths = Array.isArray(p.width) && p.width.length ? p.width.map((w) => Math.max(0, w)) : null;

    return {
        rgba: p.rgba,
        gradient: p.gradient,
        blur: p.blur,
        width: widths ? Math.max(...widths) : Math.max(0, (p.width as number | undefined) ?? 1),
        widths,
        align: Math.max(-1, Math.min(1, align)),
        cap: CAPS[p.cap ?? 'butt'] ?? Cap.Butt,
        dash,
        dashOffset: p.dashOffset ?? 0,
        dashFit: p.dashFit ?? true,
        tipShadow: p.tipShadow ?? true,
    };
}

/** Exponent that makes a superellipse corner of radius r*(1+s) hug the same diagonal as a circle of radius r. */
function squircleExponent(s: number): number {
    if (s <= 0) return 2;

    return -1 / Math.log2(1 - 0.29289 / (1 + s));
}

function arcExtent(cx: number, cy: number, r: number, start: number, sweep: number, out: number[]): void {
    const include = (a: number) => {
        const x = cx + r * Math.cos(a);
        const y = cy + r * Math.sin(a);

        if (x < out[0]) out[0] = x;
        if (y < out[1]) out[1] = y;
        if (x > out[2]) out[2] = x;
        if (y > out[3]) out[3] = y;
    };

    if (Math.abs(sweep) >= TAU - 1e-6) {
        include(0);
        include(Math.PI / 2);
        include(Math.PI);
        include(-Math.PI / 2);

        return;
    }
    const lo = Math.min(start, start + sweep);
    const hi = Math.max(start, start + sweep);

    include(lo);
    include(hi);
    for (let k = Math.ceil(lo / (Math.PI / 2)); k * (Math.PI / 2) <= hi; k++) include(k * (Math.PI / 2));
}

function pointsBox(pts: number[], out: number[]): void {
    for (let i = 0; i < pts.length; i += 2) {
        const x = pts[i];
        const y = pts[i + 1];

        if (x < out[0]) out[0] = x;
        if (y < out[1]) out[1] = y;
        if (x > out[2]) out[2] = x;
        if (y > out[3]) out[3] = y;
    }
}

/** Removes consecutive duplicates and a closing duplicate of the first point. `keep` maps to input indices. */
function cleanPoints(pts: number[], closed: boolean): { pts: number[]; keep: number[] } {
    const out: number[] = [];
    const keep: number[] = [];

    for (let i = 0; i < pts.length; i += 2) {
        const n = out.length;

        if (n >= 2 && Math.abs(out[n - 2] - pts[i]) < 1e-9 && Math.abs(out[n - 1] - pts[i + 1]) < 1e-9) continue;
        out.push(pts[i], pts[i + 1]);
        keep.push(i / 2);
    }
    if (closed && out.length >= 4) {
        const n = out.length;

        if (Math.abs(out[0] - out[n - 2]) < 1e-9 && Math.abs(out[1] - out[n - 1]) < 1e-9) {
            out.length = n - 2;
            keep.length -= 1;
        }
    }

    return { pts: out, keep };
}

// ---------------------------------------------------------------------------------------------
// Geometry: a unit quad + an interleaved instance buffer
// ---------------------------------------------------------------------------------------------

/**
 * Geometry behind every {@link SilkGraphics}: one unit quad plus an interleaved instance buffer
 * (40 floats per primitive). You rarely need it directly.
 */
export class SilkGeometry extends Geometry {
    /** Per-primitive data, grown on demand and reused across `clear()`. */
    readonly instanceBuffer: Buffer;
    /** Bounds of everything drawn, in local units (includes stroke widths and blur). */
    readonly localBounds: Bounds = new Bounds();

    constructor() {
        const instanceBuffer = new Buffer({
            data: new Float32Array(STRIDE * 32),
            usage: BufferUsage.VERTEX | BufferUsage.COPY_DST,
            label: 'silk-instances',
            shrinkToFit: false,
        });
        const attributes: Record<
            string,
            {
                buffer: Buffer | Float32Array;
                format: 'float32x2' | 'float32x4';
                stride: number;
                offset: number;
                instance?: boolean;
            }
        > = {
            aCorner: { buffer: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), format: 'float32x2', stride: 8, offset: 0 },
        };

        INSTANCE_ATTRIBUTES.forEach((name, i) => {
            attributes[name] = {
                buffer: instanceBuffer,
                format: 'float32x4',
                stride: STRIDE * 4,
                offset: i * 16,
                instance: true,
            };
        });
        super({ attributes, indexBuffer: new Uint16Array([0, 1, 2, 0, 2, 3]), instanceCount: 0 });
        this.instanceBuffer = instanceBuffer;
    }

    override get bounds(): Bounds {
        return this.localBounds;
    }
}

// ---------------------------------------------------------------------------------------------
// SilkGraphics
// ---------------------------------------------------------------------------------------------

/**
 * A PixiJS display object with a `Graphics`-like API. Every primitive is a signed distance field
 * evaluated per pixel, so edges are smooth at any scale, rotation and device pixel ratio. Each
 * object is one instanced draw call.
 *
 * Shapes go on the active path and are painted by {@link SilkGraphics.fill | fill()} or
 * {@link SilkGraphics.stroke | stroke()}. `stroke()` right after `fill()` paints the same shapes.
 * Redrawing every frame is cheap, because {@link SilkGraphics.clear | clear()} keeps the buffers.
 *
 * @example
 * ```ts
 * const g = new SilkGraphics()
 *     .roundRect(0, 0, 160, 80, 20, 0.6).fill(0x1c1c1e)
 *     .arc(80, 40, 28, -Math.PI / 2, Math.PI).stroke({ width: 8, cap: 'round', color: 0x30d158 });
 * app.stage.addChild(g);
 * ```
 */
export class SilkGraphics extends Mesh<SilkGeometry, Shader> {
    /** Settings for new objects. Change them before you create any SilkGraphics. */
    static defaults: Required<Omit<SilkGraphicsOptions, 'label'>> = { dither: 1, aaWidth: 1, minStrokePx: 1 };

    private _f: Float32Array;
    private _count = 0;
    /** Shapes of the active path. fill() and stroke() consume them without clearing, like Pixi's GraphicsContext. */
    private _pending: Shape[] = [];
    private _consumed = false;
    private _last: LastEmit | null = null;
    /** Gradient ramps this graphics holds a reference to (key -> atlas row). */
    private _rows = new Map<string, number>();
    private _cursor: [number, number] | null = null;
    private _m: Affine = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
    private _mStack: Affine[] = [];
    private readonly _box = [0, 0, 0, 0];
    private readonly _silk: Float32Array;
    private readonly _uniforms: UniformGroup;

    constructor(options: SilkGraphicsOptions = {}) {
        const geometry = new SilkGeometry();
        const settings = { ...SilkGraphics.defaults, ...options };
        const shader = createSilkShader(settings);

        super({ geometry, shader, label: options.label ?? 'SilkGraphics' });
        this._f = geometry.instanceBuffer.data as Float32Array;
        this._uniforms = shader.resources.silkUniforms as UniformGroup;
        this._silk = this._uniforms.uniforms.uSilk as Float32Array;
    }

    /** Number of primitives (= instances in the single draw call). */
    get primitiveCount(): number {
        return this._count;
    }

    /** Dither amplitude in 8-bit steps for gradients and blurs (0 disables). Default 1. */
    get dither(): number {
        return this._silk[0];
    }

    /** Sets the dither amplitude of this object. */
    set dither(v: number) {
        this._setting(0, v);
    }

    /** Width of the anti-aliasing ramp in device pixels. 1 is a crisp box filter, larger is softer. */
    get aaWidth(): number {
        return this._silk[1];
    }

    /** Sets the anti-aliasing width of this object. */
    set aaWidth(v: number) {
        this._setting(1, v);
    }

    /** Strokes thinner than this many device pixels keep this width and fade instead (hairlines). */
    get minStrokePx(): number {
        return this._silk[2];
    }

    /** Sets the hairline threshold of this object. */
    set minStrokePx(v: number) {
        this._setting(2, v);
    }

    private _setting(i: number, v: number): void {
        this._silk[i] = v;
        this._uniforms.update();
    }

    // -------------------------------------------------------------------------------- transform

    /** Pushes the current transform (Pixi GraphicsContext API). */
    save(): this {
        this._mStack.push({ ...this._m });

        return this;
    }

    /** Pops the transform pushed by the matching {@link SilkGraphics.save | save()}. */
    restore(): this {
        const m = this._mStack.pop();

        if (m) this._m = m;

        return this;
    }

    /** Resets the current transform to identity. */
    resetTransform(): this {
        this._m = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

        return this;
    }

    /** Replaces the current transform with the matrix `[a c tx; b d ty]`. */
    setTransform(a: number, b: number, c: number, d: number, tx: number, ty: number): this {
        this._m = { a, b, c, d, tx, ty };

        return this;
    }

    /** Moves the coordinate system. Shapes drawn next are offset by (x, y). */
    translateTransform(x: number, y: number = x): this {
        const m = this._m;

        m.tx += m.a * x + m.c * y;
        m.ty += m.b * x + m.d * y;

        return this;
    }

    /** Scales the coordinate system. Stroke widths, dashes and blur scale with its uniform part. */
    scaleTransform(x: number, y: number = x): this {
        const m = this._m;

        m.a *= x;
        m.b *= x;
        m.c *= y;
        m.d *= y;

        return this;
    }

    /** Rotates the coordinate system by `angle` radians (clockwise on screen). Rotated primitives stay exact. */
    rotateTransform(angle: number): this {
        const m = this._m;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const { a, b, c, d } = m;

        m.a = a * cos + c * sin;
        m.b = b * cos + d * sin;
        m.c = c * cos - a * sin;
        m.d = d * cos - b * sin;

        return this;
    }

    private _x(x: number, y: number): number {
        return this._m.a * x + this._m.c * y + this._m.tx;
    }

    private _y(x: number, y: number): number {
        return this._m.b * x + this._m.d * y + this._m.ty;
    }

    private _pts(pts: number[]): number[] {
        const m = this._m;

        if (m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1 && m.tx === 0 && m.ty === 0) return pts;
        const out = new Array<number>(pts.length);

        for (let i = 0; i < pts.length; i += 2) {
            out[i] = this._x(pts[i], pts[i + 1]);
            out[i + 1] = this._y(pts[i], pts[i + 1]);
        }

        return out;
    }

    /** Uniform scale of the current transform. */
    private get _k(): number {
        return Math.sqrt(Math.abs(this._m.a * this._m.d - this._m.b * this._m.c));
    }

    private get _rot(): number {
        return Math.atan2(this._m.b, this._m.a);
    }

    /** Maps an angle through the transform's linear part. */
    private _angle(angle: number): number {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        return Math.atan2(this._m.b * cos + this._m.d * sin, this._m.a * cos + this._m.c * sin);
    }

    private get _mirrored(): boolean {
        return this._m.a * this._m.d - this._m.b * this._m.c < 0;
    }

    // ----------------------------------------------------------------------------------- shapes

    /** Axis-aligned rectangle (rotated by the current transform, if any). */
    rect(x: number, y: number, w: number, h: number): this {
        return this.roundRect(x, y, w, h, 0);
    }

    /**
     * Rectangle with rounded corners. `smoothing` above 0 turns the corners into squircles.
     *
     * @param radius - one radius or `[topLeft, topRight, bottomRight, bottomLeft]`
     * @param smoothing - 0..1 continuous-curvature ("squircle") corners, iOS uses about 0.6
     */
    roundRect(x: number, y: number, w: number, h: number, radius: number | number[] = 0, smoothing = 0): this {
        if (w < 0) {
            x += w;
            w = -w;
        }
        if (h < 0) {
            y += h;
            h = -h;
        }
        const k = this._k;
        const list = typeof radius === 'number' ? [radius] : radius;
        const r = [
            list[0] ?? 0,
            list[1] ?? list[0] ?? 0,
            list[2] ?? list[0] ?? 0,
            list[3] ?? list[1] ?? list[0] ?? 0,
        ].map((v) => Math.max(0, v) * k) as [number, number, number, number];
        const cx = x + w / 2;
        const cy = y + h / 2;

        return this._begin({
            kind: 'rect',
            cx: this._x(cx, cy),
            cy: this._y(cx, cy),
            hw: (w / 2) * Math.hypot(this._m.a, this._m.b),
            hh: (h / 2) * Math.hypot(this._m.c, this._m.d),
            r,
            smoothing: Math.max(0, smoothing),
            rot: this._rot,
            k,
        });
    }

    /** Rounded rect with fully round ends. */
    pill(x: number, y: number, w: number, h: number): this {
        return this.roundRect(x, y, w, h, Math.min(Math.abs(w), Math.abs(h)) / 2);
    }

    /** Circle centred on (x, y). */
    circle(x: number, y: number, radius: number): this {
        return this.ellipse(x, y, radius, radius);
    }

    /** Ellipse centred on (x, y) with an exact distance field (no polygon approximation). */
    ellipse(x: number, y: number, rx: number, ry: number): this {
        return this._begin({
            kind: 'ellipse',
            cx: this._x(x, y),
            cy: this._y(x, y),
            rx: Math.abs(rx) * Math.hypot(this._m.a, this._m.b),
            ry: Math.abs(ry) * Math.hypot(this._m.c, this._m.d),
            rot: this._rot,
            k: this._k,
        });
    }

    /** Open circular arc (stroke it). Angles work as in canvas. It starts its own subpath. */
    arc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number, anticlockwise = false): this {
        let sweep = endAngle - startAngle;

        if (!anticlockwise) {
            if (sweep >= TAU) sweep = TAU;
            else {
                sweep %= TAU;
                if (sweep < 0) sweep += TAU;
            }
        } else if (sweep <= -TAU) sweep = -TAU;
        else {
            sweep %= TAU;
            if (sweep > 0) sweep -= TAU;
        }

        return this.arcSweep(cx, cy, radius, startAngle, sweep);
    }

    /** Open arc given start angle and signed sweep (positive = clockwise on screen). Sweeps may exceed one turn. */
    arcSweep(cx: number, cy: number, radius: number, startAngle: number, sweep: number): this {
        sweep = Number.isFinite(sweep) ? sweep : 0;
        const k = this._k;

        return this._begin({
            kind: 'arc',
            cx: this._x(cx, cy),
            cy: this._y(cx, cy),
            r: Math.abs(radius) * k,
            start: this._angle(startAngle),
            sweep: this._mirrored ? -sweep : sweep,
            k,
        });
    }

    /**
     * Closed annular sector: pie slices, donut segments, gauge segments.
     * @param innerRadius - 0 for a pie slice
     * @param cornerRadius - rounds all corners
     */
    sector(
        cx: number,
        cy: number,
        radius: number,
        startAngle: number,
        endAngle: number,
        innerRadius = 0,
        cornerRadius = 0,
    ): this {
        const sweep = Math.max(-TAU, Math.min(TAU, endAngle - startAngle));
        const r0 = Math.max(0, Math.min(innerRadius, radius));
        const corner = Math.max(0, Math.min(cornerRadius, (radius - r0) / 2));
        const k = this._k;

        return this._begin({
            kind: 'sector',
            cx: this._x(cx, cy),
            cy: this._y(cx, cy),
            r0: r0 * k,
            r1: radius * k,
            start: this._angle(startAngle),
            sweep: this._mirrored ? -sweep : sweep,
            corner: corner * k,
            k,
        });
    }

    /** Heart icon centred at (cx, cy), `size` wide. `rounding` (0..0.3) puffs it up. */
    heart(cx: number, cy: number, size: number, rounding = 0): this {
        const k = this._k;

        return this._begin({
            kind: 'heart',
            cx: this._x(cx, cy),
            cy: this._y(cx, cy),
            size: size * k,
            round: Math.max(0, rounding),
            rot: this._rot,
            k,
        });
    }

    /** Star with `points` tips. `innerRadius` defaults to a classic star. */
    star(
        cx: number,
        cy: number,
        points: number,
        radius: number,
        innerRadius?: number,
        rotation = 0,
        cornerRadius = 0,
    ): this {
        const n = Math.max(3, Math.round(points));
        const an = Math.PI / n;
        const ri = Math.min(innerRadius ?? radius * 0.5, radius * Math.cos(an));
        const en = Math.atan2(Math.sin(an), Math.cos(an) - ri / radius);
        const k = this._k;

        return this._begin({
            kind: 'star',
            cx: this._x(cx, cy),
            cy: this._y(cx, cy),
            n,
            r: radius * k,
            en,
            rot: rotation + this._rot,
            corner: Math.max(0, cornerRadius) * k,
            ri: ri * k,
            k,
        });
    }

    /** Regular polygon (first vertex points up). */
    regularPoly(cx: number, cy: number, radius: number, sides: number, rotation = 0, cornerRadius = 0): this {
        const n = Math.max(3, Math.round(sides));

        return this.star(cx, cy, n, radius, radius * Math.cos(Math.PI / n), rotation, cornerRadius);
    }

    /** Triangle through three points, with optionally rounded corners. */
    triangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, cornerRadius = 0): this {
        const k = this._k;

        return this._begin({
            kind: 'triangle',
            pts: this._pts([x0, y0, x1, y1, x2, y2]),
            corner: Math.max(0, cornerRadius) * k,
            k,
        });
    }

    /** Straight line (stroke it). */
    line(x0: number, y0: number, x1: number, y1: number): this {
        return this._begin({
            kind: 'path',
            subpaths: [{ pts: this._pts([x0, y0, x1, y1]), closed: false }],
            k: this._k,
        });
    }

    /** Polyline through points (stroke it), optionally smoothed. */
    polyline(points: PointsInput, options: PolylineOptions = {}): this {
        let pts = toFlat(points);
        const closed = options.closed ?? false;

        if (options.smooth === 'monotone') pts = monotoneX(pts, options.step);
        else if (options.smooth === 'catmull') pts = catmullRom(pts, closed, options.step);

        return this._begin({ kind: 'path', subpaths: [{ pts: this._pts(pts), closed }], k: this._k });
    }

    /** Pixi-style polygon path. Only strokes are supported for arbitrary paths. */
    poly(points: PointsInput, close = true): this {
        return this.polyline(points, { closed: close });
    }

    /**
     * Area under a series. Fill it, then `stroke` draws the top line. Points must be sorted by x.
     * @param lower - baseline y, or a second series with the same x values for bands
     */
    area(points: PointsInput, lower: number | PointsInput, options: AreaOptions = {}): this {
        let top = toFlat(points);
        let bottom: number[];

        if (typeof lower === 'number') {
            if (options.smooth === 'monotone') top = monotoneX(top, options.step);
            bottom = [];
            for (let i = 0; i < top.length; i += 2) bottom.push(top[i], lower);
        } else {
            bottom = toFlat(lower);
            if (options.smooth === 'monotone') {
                top = monotoneX(top, options.step);
                bottom = monotoneX(bottom, options.step);
            }
            if (bottom.length !== top.length) {
                console.warn('[pixi-silk] area(): upper and lower series must have the same number of points');

                return this;
            }
        }
        // areas are built from vertical columns: only translate/scale apply (rotate the container instead)
        const m = this._m;

        if ((m.b !== 0 || m.c !== 0) && !warnedAreaRotation) {
            warnedAreaRotation = true;
            console.warn(
                '[pixi-silk] area() ignores rotation/skew of the path transform; rotate the SilkGraphics instead',
            );
        }
        const map = (pts: number[]) => pts.map((v, i) => (i % 2 === 0 ? m.a * v + m.tx : m.d * v + m.ty));

        top = map(top);
        bottom = map(bottom);
        if (top.length >= 4 && top[0] > top[top.length - 2]) {
            top = reversePairs(top);
            bottom = reversePairs(bottom);
        }

        return this._begin({ kind: 'area', top, bottom, k: this._k });
    }

    // ------------------------------------------------------------------------- path building

    /** Starts a new, empty path (shapes drawn so far are kept). */
    beginPath(): this {
        this._pending = [];
        this._consumed = false;
        this._last = null;
        this._cursor = null;

        return this;
    }

    /** Starts a new subpath at (x, y). Paths are stroke-only. */
    moveTo(x: number, y: number): this {
        const shape = this._pathShape();
        const px = this._x(x, y);
        const py = this._y(x, y);

        shape.subpaths.push({ pts: [px, py], closed: false });
        this._cursor = [px, py];

        return this;
    }

    /** Straight segment from the current point to (x, y). */
    lineTo(x: number, y: number): this {
        const px = this._x(x, y);
        const py = this._y(x, y);
        const sp = this._currentSubpath(px, py);

        sp.pts.push(px, py);
        this._cursor = [px, py];

        return this;
    }

    /** Quadratic Bezier to (x, y), flattened adaptively. */
    quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): this {
        const [qx, qy, px, py] = this._pts([cpx, cpy, x, y]);
        const sp = this._currentSubpath(qx, qy);
        const n = sp.pts.length;

        flattenQuadratic(sp.pts, sp.pts[n - 2], sp.pts[n - 1], qx, qy, px, py);
        this._cursor = [px, py];

        return this;
    }

    /** Cubic Bezier to (x, y), flattened adaptively. */
    bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): this {
        const [ax, ay, bx, by, px, py] = this._pts([cp1x, cp1y, cp2x, cp2y, x, y]);
        const sp = this._currentSubpath(ax, ay);
        const n = sp.pts.length;

        flattenCubic(sp.pts, sp.pts[n - 2], sp.pts[n - 1], ax, ay, bx, by, px, py);
        this._cursor = [px, py];

        return this;
    }

    /** Closes the current subpath back to its first point. */
    closePath(): this {
        const shape = this._pending[this._pending.length - 1];

        if (!this._consumed && shape?.kind === 'path' && shape.subpaths.length) {
            const sp = shape.subpaths[shape.subpaths.length - 1];

            sp.closed = true;
            this._cursor = [sp.pts[0], sp.pts[1]];
        }

        return this;
    }

    private _pathShape(): Extract<Shape, { kind: 'path' }> {
        const last = this._pending[this._pending.length - 1];

        if (!this._consumed && last?.kind === 'path') return last;
        const shape: Extract<Shape, { kind: 'path' }> = { kind: 'path', subpaths: [], k: this._k };

        this._begin(shape);

        return shape;
    }

    private _currentSubpath(x: number, y: number): SubPath {
        const shape = this._pathShape();
        let sp = shape.subpaths[shape.subpaths.length - 1];

        if (!sp || sp.closed) {
            const start = this._cursor ?? [x, y];

            sp = { pts: [start[0], start[1]], closed: false };
            shape.subpaths.push(sp);
        }

        return sp;
    }

    // ---------------------------------------------------------------------------------- paint

    /** Fills the shapes of the active path (Pixi semantics: `rect().circle().fill()` fills both). */
    fill(style?: FillInput): this {
        const shapes = this._pending;

        if (!shapes.length) return this;
        const paint = resolvePaint(style);
        const start = this._count;

        for (const shape of shapes) {
            if (shape.kind === 'area') this._emitArea(shape, scalePaint(paint, shape.k));
            else if (CLOSED_KINDS.has(shape.kind)) this._emitClosed(shape, scalePaint(paint, shape.k), null);
            else if (shape.kind === 'path' && !warnedPathFill) {
                warnedPathFill = true;
                console.warn(
                    '[pixi-silk] fill() on free paths is not supported yet; use stroke(), area() or the closed shapes',
                );
            }
        }
        this._last = { shapes, start, fill: paint };
        this._consumed = true;
        this._commit();

        return this;
    }

    /** Strokes the shapes of the active path. Right after `fill()` it merges into the same instances. */
    stroke(style?: StrokeInput): this {
        const shapes = this._pending;

        if (!shapes.length) return this;
        const stroke = resolveStroke(style);
        const last = this._last;

        this._last = null;
        this._consumed = true;
        if (stroke.width <= 0) return this;

        const merge =
            last &&
            last.shapes === shapes &&
            last.start + shapes.length === this._count &&
            shapes.every((sh) => CLOSED_KINDS.has(sh.kind));

        if (merge) {
            // rewind the fill-only instances and re-emit them with both paints
            this._rewind(last);
            for (const shape of shapes)
                this._emitClosed(shape, scalePaint(last.fill, shape.k), scaleStroke(stroke, shape.k));
        } else {
            for (const shape of shapes) {
                const st = scaleStroke(stroke, shape.k);

                if (CLOSED_KINDS.has(shape.kind)) this._emitClosed(shape, null, st);
                else if (shape.kind === 'arc') this._emitArc(shape, st);
                else if (shape.kind === 'path')
                    for (const sp of shape.subpaths) this._emitPath(sp.pts, sp.closed, st, null);
                else if (shape.kind === 'area') this._emitPath(shape.top, false, st, null);
            }
        }
        this._commit();

        return this;
    }

    /** Removes everything. Keeps the buffers for reuse, so redrawing every frame is cheap. */
    clear(): this {
        this._releaseRamps();
        this._count = 0;
        this._pending = [];
        this._consumed = false;
        this._last = null;
        this._cursor = null;
        this._mStack.length = 0;
        this.resetTransform();
        this.geometry.localBounds.clear();
        this._commit();

        return this;
    }

    /**
     * Hit test against the real shapes (local coordinates): rings are hollow, lines count only
     * within their stroke. Used by Pixi's event system when `eventMode` is set.
     */
    override containsPoint(point: PointData): boolean {
        if (!this.geometry.localBounds.containsPoint(point.x, point.y)) return false;

        return hitTest(this._f, this._count, point.x, point.y);
    }

    override destroy(options?: DestroyOptions): void {
        this._releaseRamps();
        const geometry = this.geometry;
        const shader = this.shader;

        super.destroy(options);
        geometry.destroy(true);
        shader?.destroy();
    }

    // ------------------------------------------------------------------------------ internals

    private _begin(shape: Shape): this {
        if (this._consumed) {
            this._pending = [];
            this._consumed = false;
        }
        this._pending.push(shape);
        this._last = null;

        return this;
    }

    private _rewind(last: LastEmit): void {
        this._count = last.start;
    }

    private _releaseRamps(): void {
        const atlas = GradientAtlas.shared;

        for (const key of this._rows.keys()) atlas.release(key);
        this._rows.clear();
    }

    private _alloc(): number {
        const need = (this._count + 1) * STRIDE;

        if (need > this._f.length) {
            const bigger = new Float32Array(Math.max(this._f.length * 2, need));

            bigger.set(this._f);
            this._f = bigger;
            this.geometry.instanceBuffer.data = bigger;
        }
        const o = this._count * STRIDE;

        this._f.fill(0, o, o + STRIDE);
        this._count++;

        return o;
    }

    private _commit(): void {
        const geometry = this.geometry;

        geometry.instanceCount = this._count;
        geometry.instanceBuffer.update(Math.max(this._count, 1) * STRIDE * 4);
    }

    private _setBounds(o: number, minX: number, minY: number, maxX: number, maxY: number): void {
        const f = this._f;

        f[o] = minX;
        f[o + 1] = minY;
        f[o + 2] = maxX;
        f[o + 3] = maxY;
        this.geometry.localBounds.addFrame(minX, minY, maxX, maxY);
    }

    private _set4(o: number, a: number, b: number, c: number, d: number): void {
        const f = this._f;

        f[o] = a;
        f[o + 1] = b;
        f[o + 2] = c;
        f[o + 3] = d;
    }

    /** Premultiplied color. With a gradient paint it multiplies the ramp (white = untinted). */
    private _premul(o: number, rgba: RGBA): void {
        const a = rgba[3];

        this._set4(o, rgba[0] * a, rgba[1] * a, rgba[2] * a, a);
    }

    /** Writes gradient geometry + atlas row. Returns flags to add. */
    private _gradient(o: number, gradient: Gradient, frame: ShapeFrame, forStroke: boolean): number {
        let row = this._rows.get(gradient.key);

        if (row === undefined) {
            row = GradientAtlas.shared.acquire(gradient);
            this._rows.set(gradient.key, row);
        }
        gradient.resolve(frame, this._f, o + 28);
        this._set4(o + 32, gradient.kind, row, EXTEND[gradient.extend] ?? Extend.Pad, 0);

        return Flag.Dither | (forStroke ? Flag.GradStroke : 0);
    }

    private _frame(shape: Shape): ShapeFrame {
        const b = this._box;

        switch (shape.kind) {
            case 'rect': {
                const c = Math.abs(Math.cos(shape.rot));
                const sn = Math.abs(Math.sin(shape.rot));
                const ex = shape.hw * c + shape.hh * sn;
                const ey = shape.hw * sn + shape.hh * c;

                return { x: shape.cx - ex, y: shape.cy - ey, w: ex * 2, h: ey * 2 };
            }
            case 'ellipse': {
                const c = Math.cos(shape.rot);
                const sn = Math.sin(shape.rot);
                const ex = Math.hypot(shape.rx * c, shape.ry * sn);
                const ey = Math.hypot(shape.rx * sn, shape.ry * c);

                return { x: shape.cx - ex, y: shape.cy - ey, w: ex * 2, h: ey * 2 };
            }
            case 'arc':
                return {
                    x: shape.cx - shape.r,
                    y: shape.cy - shape.r,
                    w: shape.r * 2,
                    h: shape.r * 2,
                    start: shape.start,
                    sweep: shape.sweep,
                };
            case 'sector':
                return {
                    x: shape.cx - shape.r1,
                    y: shape.cy - shape.r1,
                    w: shape.r1 * 2,
                    h: shape.r1 * 2,
                    start: shape.start,
                    sweep: shape.sweep,
                };
            case 'heart': {
                const hh = (shape.size * HEART_H) / HEART_W / 2;
                const hw = shape.size / 2;
                const c = Math.abs(Math.cos(shape.rot));
                const sn = Math.abs(Math.sin(shape.rot));
                const ex = hw * c + hh * sn;
                const ey = hw * sn + hh * c;

                return { x: shape.cx - ex, y: shape.cy - ey, w: ex * 2, h: ey * 2 };
            }
            case 'star':
                return { x: shape.cx - shape.r, y: shape.cy - shape.r, w: shape.r * 2, h: shape.r * 2 };
            default: {
                b[0] = b[1] = Infinity;
                b[2] = b[3] = -Infinity;
                if (shape.kind === 'triangle') pointsBox(shape.pts, b);
                else if (shape.kind === 'path') for (const sp of shape.subpaths) pointsBox(sp.pts, b);
                else if (shape.kind === 'area') {
                    pointsBox(shape.top, b);
                    pointsBox(shape.bottom, b);
                }
                if (!Number.isFinite(b[0])) return { x: 0, y: 0, w: 0, h: 0 };

                return { x: b[0], y: b[1], w: b[2] - b[0], h: b[3] - b[1] };
            }
        }
    }

    private _emitClosed(shape: Shape, fill: Paint | null, stroke: Stroke | null): void {
        // Two gradients or two different blurs can't share one instance: split.
        if (fill && stroke && ((fill.gradient && stroke.gradient) || fill.blur !== stroke.blur)) {
            this._emitClosed(shape, fill, null);
            this._emitClosed(shape, null, stroke);

            return;
        }
        const f = this._f;
        const o = this._alloc();
        const sigma = Math.max(fill?.blur ?? 0, stroke?.blur ?? 0);
        const frame = this._frame(shape);
        let flags = 0;
        let sw = 0;
        let align = 0;

        if (fill) flags |= Flag.Fill;
        if (stroke) {
            flags |= Flag.Stroke | (stroke.cap << CAP0_SHIFT) | (stroke.cap << CAP1_SHIFT);
            sw = stroke.width;
            align = stroke.align;
        }
        if (sigma > 0) flags |= Flag.Dither;
        const outset = (stroke ? (sw / 2) * (1 + align) : 0) + 3 * sigma;
        let type: Prim;

        switch (shape.kind) {
            case 'rect': {
                const grow = 1 + shape.smoothing;
                const lim = Math.min(shape.hw, shape.hh);
                const [tl, tr, br, bl] = shape.r.map((r) => Math.min(r * grow, lim));

                type = Prim.Rect;
                this._set4(o + 4, shape.cx, shape.cy, shape.hw, shape.hh);
                this._set4(o + 8, br, tr, bl, tl);
                this._set4(o + 12, squircleExponent(shape.smoothing), 0, 0, shape.rot);
                break;
            }
            case 'ellipse':
                type = Prim.Ellipse;
                this._set4(o + 4, shape.cx, shape.cy, shape.rx, shape.ry);
                f[o + 15] = shape.rot;
                break;
            case 'sector':
                type = Prim.Sector;
                this._set4(o + 4, shape.cx, shape.cy, shape.r1, shape.start);
                this._set4(o + 8, shape.sweep, shape.r0, shape.corner, 0);
                break;
            case 'heart': {
                const s = shape.size / (HEART_W + 2 * shape.round);

                type = Prim.Heart;
                this._set4(o + 4, shape.cx, shape.cy, s, shape.round);
                f[o + 15] = shape.rot;
                break;
            }
            case 'star':
                type = Prim.Star;
                this._set4(o + 4, shape.cx, shape.cy, shape.r, shape.rot);
                this._set4(o + 8, shape.n, shape.en, Math.min(shape.corner, shape.ri * 0.9), 0);
                break;
            case 'triangle': {
                const p = insetTriangle(shape.pts, shape.corner);

                type = Prim.Triangle;
                this._set4(o + 4, p[0], p[1], p[2], p[3]);
                this._set4(o + 8, p[4], p[5], p[6], 0);
                break;
            }
            default:
                this._count--;

                return;
        }

        // tight bounds
        const b = this._box;

        if (shape.kind === 'sector') {
            b[0] = b[1] = Infinity;
            b[2] = b[3] = -Infinity;
            arcExtent(shape.cx, shape.cy, shape.r1, shape.start, shape.sweep, b);
            if (shape.r0 > 0) arcExtent(shape.cx, shape.cy, shape.r0, shape.start, shape.sweep, b);
            else pointsBox([shape.cx, shape.cy], b);
        } else {
            b[0] = frame.x;
            b[1] = frame.y;
            b[2] = frame.x + frame.w;
            b[3] = frame.y + frame.h;
        }
        this._setBounds(o, b[0] - outset, b[1] - outset, b[2] + outset, b[3] + outset);

        const gradient = fill?.gradient ?? stroke?.gradient ?? null;

        if (fill) this._premul(o + 20, fill.rgba);
        if (stroke) this._premul(o + 24, stroke.rgba);
        if (gradient) flags |= this._gradient(o, gradient, frame, !fill?.gradient);

        if (stroke?.dash && shape.kind === 'ellipse') {
            let [dash, gap] = stroke.dash;

            if (stroke.dashFit) {
                const rm = (shape.rx + shape.ry) / 2 + (align * sw) / 2;
                const L = TAU * rm;
                const n = Math.max(1, Math.round(L / (dash + gap)));
                const s = L / (n * (dash + gap));

                dash *= s;
                gap *= s;
            }
            flags |= Flag.Dash;
            this._set4(o + 36, dash, gap, stroke.dashOffset, align);
        } else {
            f[o + 39] = align;
        }
        this._set4(o + 16, type, flags, sw, sigma);
    }

    private _emitArc(shape: Extract<Shape, { kind: 'arc' }>, stroke: Stroke): void {
        const o = this._alloc();
        const hw = stroke.width / 2;
        const sigma = stroke.blur;
        let flags = Flag.Stroke | (stroke.cap << CAP0_SHIFT) | (stroke.cap << CAP1_SHIFT);
        let tipShadow = false;
        let overlapsStart = false;

        if (sigma > 0) flags |= Flag.Dither;
        if (
            (stroke.tipShadow || stroke.gradient instanceof ConicGradient) &&
            stroke.cap === Cap.Round &&
            !stroke.dash &&
            shape.r > hw
        ) {
            const sweep = Math.abs(shape.sweep);
            // Round caps touch when the distance between their centres falls below the stroke width.
            overlapsStart =
                sweep >= TAU || (sweep > Math.PI && 2 * shape.r * Math.sin((TAU - sweep) / 2) < stroke.width);
            tipShadow = stroke.tipShadow && overlapsStart;
        }
        this._set4(o + 4, shape.cx, shape.cy, shape.r, shape.start);
        this._set4(o + 8, shape.sweep, 0, 0, 0);
        const b = this._box;

        b[0] = b[1] = Infinity;
        b[2] = b[3] = -Infinity;
        arcExtent(shape.cx, shape.cy, shape.r, shape.start, shape.sweep, b);
        const pad = hw + 3 * sigma;

        this._setBounds(o, b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad);
        this._premul(o + 24, stroke.rgba);
        if (stroke.gradient) {
            const gradient = stroke.gradient;

            flags |= this._gradient(o, gradient, this._frame(shape), true);
            if (gradient instanceof ConicGradient) {
                const centerAligned =
                    gradient.units === 'shape'
                        ? gradient.center[0] === 0.5 && gradient.center[1] === 0.5
                        : gradient.center[0] === shape.cx && gradient.center[1] === shape.cy;
                const sweep =
                    gradient.sweep !== undefined && gradient.sweepDirection === 'shape'
                        ? Math.abs(gradient.sweep) * (shape.sweep < 0 ? -1 : 1)
                        : (gradient.sweep ?? shape.sweep);

                if (centerAligned && (gradient.startAngle ?? shape.start) === shape.start && sweep === shape.sweep) {
                    flags |= Flag.GradArcAligned;
                    if (overlapsStart) flags |= Flag.ArcTipOverlap;
                    // Use identical float32 geometry for both centres and angles.
                    this._f[o + 28] = this._f[o + 4];
                    this._f[o + 29] = this._f[o + 5];
                    this._f[o + 30] = this._f[o + 7];
                    this._f[o + 31] = this._f[o + 8];
                }
            }
        }
        if (stroke.dash) {
            let [dash, gap] = stroke.dash;

            if (stroke.dashFit && Math.abs(shape.sweep) >= TAU - 1e-6) {
                const L = TAU * shape.r;
                const n = Math.max(1, Math.round(L / (dash + gap)));
                const s = L / (n * (dash + gap));

                dash *= s;
                gap *= s;
            }
            flags |= Flag.Dash;
            this._set4(o + 36, dash, gap, stroke.dashOffset, 0);
        }
        this._f[o + 35] = tipShadow ? 1 : 0;
        this._set4(o + 16, Prim.Arc, flags, stroke.width, sigma);
    }

    private _emitPath(raw: number[], closed: boolean, stroke: Stroke, frameOverride: ShapeFrame | null): void {
        const { pts, keep } = cleanPoints(raw, closed);
        const n = pts.length / 2;

        if (n === 0) return;
        if (n < 3) closed = false;
        const segs = n === 1 ? 1 : closed ? n : n - 1;
        const cum = new Array<number>(segs + 1);

        cum[0] = 0;
        for (let i = 0; i < segs; i++) {
            const j = (i + 1) % n;

            cum[i + 1] = cum[i] + Math.hypot(pts[j * 2] - pts[i * 2], pts[j * 2 + 1] - pts[i * 2 + 1]);
        }
        const total = cum[segs];
        let dash = 0;
        let gap = 0;

        if (stroke.dash) {
            [dash, gap] = stroke.dash;
            if (closed && stroke.dashFit && total > 0) {
                const k = Math.max(1, Math.round(total / (dash + gap)));
                const s = total / (k * (dash + gap));

                dash *= s;
                gap *= s;
            }
        }
        const b = this._box;

        b[0] = b[1] = Infinity;
        b[2] = b[3] = -Infinity;
        pointsBox(pts, b);
        const frame = frameOverride ?? { x: b[0], y: b[1], w: b[2] - b[0], h: b[3] - b[1] };
        const hw = stroke.width / 2;
        // per-point half widths: constant, tapered by length, or one per input point
        const radii = new Array<number>(n);
        const widths = stroke.widths;

        for (let i = 0; i < n; i++) {
            if (widths && widths.length === raw.length / 2 && widths.length > 2) radii[i] = widths[keep[i]] / 2;
            else if (widths && widths.length >= 2) {
                const u = total > 0 ? cum[Math.min(i, segs)] / total : 0;

                radii[i] = (widths[0] + (widths[widths.length - 1] - widths[0]) * u) / 2;
            } else radii[i] = hw;
        }
        const sigma = stroke.blur;
        const pad = hw + 3 * sigma;
        let base = Flag.Stroke | (stroke.cap << CAP0_SHIFT) | (stroke.cap << CAP1_SHIFT);

        if (sigma > 0) base |= Flag.Dither;
        if (stroke.dash) base |= Flag.Dash;
        if (closed) base |= Flag.Closed;
        let row = -1;
        let gradFlags = 0;

        for (let i = 0; i < segs; i++) {
            const o = this._alloc();
            const ia = i;
            const ib = n === 1 ? 0 : (i + 1) % n;
            const ax = pts[ia * 2];
            const ay = pts[ia * 2 + 1];
            const bx = pts[ib * 2];
            const by = pts[ib * 2 + 1];
            const hasPrev = closed || i > 0;
            const hasNext = closed || i < segs - 1;
            const ip = (ia - 1 + n) % n;
            const inx = (ib + 1) % n;
            let flags = base;

            if (hasPrev) flags |= Flag.Prev;
            if (hasNext) flags |= Flag.Next;
            this._set4(o + 4, ax, ay, bx, by);
            this._set4(
                o + 8,
                hasPrev ? pts[ip * 2] : ax,
                hasPrev ? pts[ip * 2 + 1] : ay,
                hasNext ? pts[inx * 2] : bx,
                hasNext ? pts[inx * 2 + 1] : by,
            );
            this._set4(o + 12, cum[i], total, radii[ia], radii[ib]);
            this._setBounds(
                o,
                Math.min(ax, bx) - pad,
                Math.min(ay, by) - pad,
                Math.max(ax, bx) + pad,
                Math.max(ay, by) + pad,
            );
            this._premul(o + 24, stroke.rgba);
            if (stroke.gradient) {
                if (row < 0) {
                    gradFlags = this._gradient(o, stroke.gradient, frame, true);
                    row = this._f[o + 33];
                } else {
                    stroke.gradient.resolve(frame, this._f, o + 28);
                    this._set4(o + 32, stroke.gradient.kind, row, EXTEND[stroke.gradient.extend] ?? Extend.Pad, 0);
                }
                flags |= gradFlags;
            }
            if (stroke.dash) this._set4(o + 36, dash, gap, stroke.dashOffset, 0);
            // neighbour radii for the ownership test (aDash.w / aPaint.w are free on segments)
            this._f[o + 39] = radii[hasPrev ? ip : ia];
            this._f[o + 35] = radii[hasNext ? inx : ib];
            this._set4(o + 16, Prim.Segment, flags, stroke.width, sigma);
        }
    }

    private _emitArea(shape: Extract<Shape, { kind: 'area' }>, fill: Paint): void {
        const { top, bottom } = shape;
        const n = top.length / 2;

        if (n < 2) return;
        const frame = this._frame(shape);
        const sigma = fill.blur;
        const pad = 3 * sigma;
        const y0 = frame.y - pad;
        const y1 = frame.y + frame.h + pad;
        let base = Flag.Fill;

        if (sigma > 0) base |= Flag.Dither;
        let row = -1;
        let gradFlags = 0;
        let first = -1;
        let lastIdx = -1;

        for (let i = 0; i < n - 1; i++) {
            if (top[(i + 1) * 2] - top[i * 2] > 1e-9) {
                if (first < 0) first = i;
                lastIdx = i;
            }
        }
        for (let i = first; i >= 0 && i <= lastIdx; i++) {
            const xa = top[i * 2];
            const xb = top[(i + 1) * 2];

            if (xb - xa <= 1e-9) continue;
            const o = this._alloc();
            let flags = base;

            if (i === first) flags |= Flag.EdgeLeft;
            if (i === lastIdx) flags |= Flag.EdgeRight;
            this._set4(o + 4, xa, top[i * 2 + 1], xb, top[i * 2 + 3]);
            this._set4(o + 8, bottom[i * 2], bottom[i * 2 + 1], bottom[(i + 1) * 2], bottom[i * 2 + 3]);
            this._setBounds(o, i === first ? xa - pad : xa, y0, i === lastIdx ? xb + pad : xb, y1);
            this._premul(o + 20, fill.rgba);
            if (fill.gradient) {
                if (row < 0) {
                    gradFlags = this._gradient(o, fill.gradient, frame, false);
                    row = this._f[o + 33];
                } else {
                    fill.gradient.resolve(frame, this._f, o + 28);
                    this._set4(o + 32, fill.gradient.kind, row, EXTEND[fill.gradient.extend] ?? Extend.Pad, 0);
                }
                flags |= gradFlags;
            }
            this._set4(o + 16, Prim.Area, flags, 0, sigma);
        }
    }
}

function reversePairs(pts: number[]): number[] {
    const out: number[] = [];

    for (let i = pts.length - 2; i >= 0; i -= 2) out.push(pts[i], pts[i + 1]);

    return out;
}

/** Shrinks a triangle towards its incenter so that re-inflating by `r` rounds its corners. */
function insetTriangle(p: number[], r: number): number[] {
    if (r <= 0) return [...p, 0];
    const [x0, y0, x1, y1, x2, y2] = p;
    const a = Math.hypot(x2 - x1, y2 - y1);
    const b = Math.hypot(x2 - x0, y2 - y0);
    const c = Math.hypot(x1 - x0, y1 - y0);
    const per = a + b + c;

    if (per <= 0) return [...p, 0];
    const ix = (a * x0 + b * x1 + c * x2) / per;
    const iy = (a * y0 + b * y1 + c * y2) / per;
    const area = Math.abs((x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)) / 2;
    const inr = (2 * area) / per;
    const rr = Math.min(r, inr * 0.95);
    const k = (inr - rr) / inr;

    return [
        ix + (x0 - ix) * k,
        iy + (y0 - iy) * k,
        ix + (x1 - ix) * k,
        iy + (y1 - iy) * k,
        ix + (x2 - ix) * k,
        iy + (y2 - iy) * k,
        rr,
    ];
}
