import { Container, type PointData, type Ticker } from 'pixi.js';
import { damp, Spring } from '../motion';
import { SilkGraphics } from '../SilkGraphics';
import { type Signal, signal } from '../signal';
import { Driver } from './driver';
import { hex } from './paint';

/** Four corners of a box, clockwise from top left, in the outline's space. */
export type Quad = [PointData, PointData, PointData, PointData];

/** How an outline looks: a quiet `hover` line or an accented `selected` frame. */
export type OutlineMode = 'hover' | 'selected';

/** The reactive state of a {@link SelectionOutline}. */
export interface OutlineState {
    /** Outlined objects. Several are framed by one box around all of them. */
    targets: Signal<readonly Container[]>;
    mode: Signal<OutlineMode>;
}

/** Options of {@link SelectionOutline}. */
export interface SelectionOutlineOptions {
    /** Accent colour of the selected frame. Default blue. */
    color?: number | string;
    /** Colour of the hover line. Default the accent. */
    hoverColor?: number | string;
    /** Gap between the object and the frame, in outline units. Default 4. */
    padding?: number;
    /** Dash and gap of the selected frame. Default [5, 4]. */
    dash?: [number, number];
    /** Speed of the marching dashes, units per second. `0` keeps them still. Default 16. */
    march?: number;
    /** Draw corner brackets on the selected frame. Default true. */
    brackets?: boolean;
    /** Length of the corner brackets. Default 10. */
    bracketSize?: number;
    /** A faint tint inside the selected frame. Default 0.05. */
    fillAlpha?: number;
    /**
     * What happens when the selection changes. `pop` (default): the old frame shrinks and fades
     * away while the new one springs in. `glide`: one frame slides to the new box.
     * Following the same objects while they move is always exact.
     */
    transition?: 'pop' | 'glide';
    /** How fast a `glide` reaches the new box, about 1 / seconds. Default 22. */
    stiffness?: number;
    ticker?: Ticker | null;
}

/** Corners of `target`'s local bounds, mapped into `space`. Rotated objects give a rotated box. */
export function boundsQuad(target: Container, space: Container): Quad {
    const b = target.getLocalBounds();
    const map = (x: number, y: number): PointData => space.toLocal(target.toGlobal({ x, y }));

    return [map(b.minX, b.minY), map(b.maxX, b.minY), map(b.maxX, b.maxY), map(b.minX, b.maxY)];
}

/** Axis-aligned box around several quads. */
export function unionQuad(quads: readonly Quad[]): Quad {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;

    for (const q of quads) {
        for (const p of q) {
            x0 = Math.min(x0, p.x);
            y0 = Math.min(y0, p.y);
            x1 = Math.max(x1, p.x);
            y1 = Math.max(y1, p.y);
        }
    }

    return [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: y1 },
        { x: x0, y: y1 },
    ];
}

/** Scales a quad about its centre. */
export function scaleQuad(q: Quad, k: number): Quad {
    if (k === 1) return q;
    const cx = (q[0].x + q[2].x) / 2;
    const cy = (q[0].y + q[2].y) / 2;

    return q.map((p) => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k })) as Quad;
}

/** Pushes every side of a quad outwards by `pad`, along the quad's own axes. */
export function padQuad(q: Quad, pad: number): Quad {
    if (pad === 0) return q;
    const ux = q[1].x - q[0].x;
    const uy = q[1].y - q[0].y;
    const vx = q[3].x - q[0].x;
    const vy = q[3].y - q[0].y;
    const ul = Math.hypot(ux, uy) || 1;
    const vl = Math.hypot(vx, vy) || 1;
    const ax = (ux / ul) * pad;
    const ay = (uy / ul) * pad;
    const bx = (vx / vl) * pad;
    const by = (vy / vl) * pad;

    return [
        { x: q[0].x - ax - bx, y: q[0].y - ay - by },
        { x: q[1].x + ax - bx, y: q[1].y + ay - by },
        { x: q[2].x + ax + bx, y: q[2].y + ay + by },
        { x: q[3].x - ax + bx, y: q[3].y - ay + by },
    ];
}

/** A frame on its way out: frozen where its objects were, shrinking and fading. */
interface Leaving {
    quad: Quad;
    style: number;
    t: number;
}

const sameTargets = (a: readonly Container[], b: readonly Container[]): boolean =>
    a.length === b.length && a.every((t) => b.includes(t));

/**
 * Animated bounds around one or more objects, for hover and selection in editors.
 *
 * - Follows rotated and nested objects with an oriented box, exactly, every frame.
 * - Several targets get one box around all of them.
 * - A new selection pops: the old frame shrinks away while the new one springs in.
 *   Set `transition: 'glide'` to slide one frame over instead.
 * - The selected frame has marching dashes and corner brackets. The hover line is quiet.
 *
 * Add it to an overlay above the scene. It reads the targets every frame while it shows them.
 */
export class SelectionOutline extends Container {
    readonly state: OutlineState = {
        targets: signal<readonly Container[]>([]),
        mode: signal<OutlineMode>('selected'),
    };

    private readonly _g = new SilkGraphics();
    private readonly _driver: Driver;
    private readonly _opts: SelectionOutlineOptions;
    private readonly _color: number;
    private readonly _hoverColor: number;
    private _quad: Quad | null = null;
    private _shown: readonly Container[] = [];
    private _leaving: Leaving[] = [];
    private readonly _pop: Spring = new Spring(1, 520, 20);
    private _fade = 0;
    private _style = 1;
    private _offset = 0;
    /** Glide only: the box the frame slides from, and how far it got. */
    private _glideFrom: Quad | null = null;
    private _glide = 1;

    constructor(options: SelectionOutlineOptions = {}) {
        super({ label: 'SelectionOutline' });
        this._opts = options;
        this._color = hex(options.color ?? 0x0a84ff);
        this._hoverColor = hex(options.hoverColor ?? options.color ?? 0x0a84ff);
        this.eventMode = 'none';
        this.addChild(this._g);
        this._driver = new Driver((dt) => this._step(dt), options.ticker);
        this.state.targets.subscribe((next) => this._switch(next));
        this.state.mode.subscribe(() => this._driver.wake());
    }

    /** The box as drawn now, or null when nothing is framed. Exact while following the same objects. */
    get quad(): Quad | null {
        return this._quad;
    }

    /** True while a frame pops in or out. */
    get popping(): boolean {
        return this._leaving.length > 0 || Math.abs(this._pop.value - 1) > 0.003 || Math.abs(this._pop.velocity) > 0.05;
    }

    /** Frames `targets` (one object, several, or none to fade out). */
    set(targets: Container | readonly Container[] | null, mode: OutlineMode = this.state.mode.value): void {
        const list = targets === null ? [] : Array.isArray(targets) ? targets : [targets as Container];

        this.state.mode.set(mode);
        if (!sameTargets(list, this.state.targets.value)) this.state.targets.set(list);
    }

    /** Quiet outline around `target` (null hides it). */
    hover(target: Container | null): void {
        this.set(target, 'hover');
    }

    /** Selection frame around `targets`. */
    select(targets: Container | readonly Container[] | null): void {
        this.set(targets, 'selected');
    }

    /** Advances the animation by `dt` seconds (only needed with `ticker: null`). */
    tick(dt: number): boolean {
        return this._driver.tick(dt);
    }

    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        this._driver.sleep();
        super.destroy(options ?? { children: true });
    }

    private _switch(next: readonly Container[]): void {
        const had = this._quad && this._fade > 0.01 && this._shown.length > 0;
        const glide = (this._opts.transition ?? 'pop') === 'glide';

        if (had && this._quad) {
            if (glide && next.length) {
                this._glideFrom = this._quad.map((p) => ({ ...p })) as Quad;
                this._glide = 0;
            } else {
                this._leaving.push({ quad: this._quad, style: this._style, t: this._fade });
                this._fade = 0;
            }
        }
        if (!glide || !had) {
            // the new frame springs in from a little smaller
            this._pop.value = 0.85;
            this._pop.velocity = 0;
            this._pop.target = 1;
            this._glideFrom = null;
            this._glide = 1;
        }
        this._shown = next;
        if (!next.length) this._quad = null;
        this._driver.wake();
    }

    private _target(): Quad | null {
        const list = this.state.targets.value.filter((t) => !t.destroyed);

        if (!list.length) return null;
        const pad = this._opts.padding ?? 4;

        if (list.length === 1) return padQuad(boundsQuad(list[0], this), pad);

        return padQuad(unionQuad(list.map((t) => boundsQuad(t, this))), pad);
    }

    private _step(dt: number): boolean {
        const target = this._target();
        const selected = this.state.mode.value === 'selected';
        let busy = false;

        if (target) {
            // the same objects are followed exactly: no lag behind a drag
            if (this._glideFrom && this._glide < 1) {
                this._glide = damp(this._glide, 1, this._opts.stiffness ?? 22, dt);
                if (this._glide > 0.999) {
                    this._glide = 1;
                    this._glideFrom = null;
                }
                const from = this._glideFrom;
                const k = this._glide;

                this._quad = from
                    ? (target.map((p, i) => ({
                          x: from[i].x + (p.x - from[i].x) * k,
                          y: from[i].y + (p.y - from[i].y) * k,
                      })) as Quad)
                    : target;
                busy = true;
            } else this._quad = target;
            // targets can move at any time: keep watching while something is framed
            busy = true;
        }
        const show = target ? 1 : 0;

        this._fade = damp(this._fade, show, show ? 22 : 14, dt);
        if (Math.abs(this._fade - show) < 0.004) this._fade = show;
        if (this._fade !== show) busy = true;
        this._pop.step(dt);
        if (!this._pop.settled) busy = true;
        for (const l of this._leaving) l.t = damp(l.t, 0, 16, dt);
        this._leaving = this._leaving.filter((l) => l.t > 0.01);
        if (this._leaving.length) busy = true;
        const styleT = selected ? 1 : 0;

        this._style = damp(this._style, styleT, 16, dt);
        if (Math.abs(this._style - styleT) > 0.004) busy = true;
        const march = this._opts.march ?? 16;

        if (selected && march > 0) this._offset -= march * dt;
        this._g.clear();
        for (const l of this._leaving) {
            // shrinks towards 0.85 as it fades, dashes and brackets retract
            this._frame(scaleQuad(l.quad, 0.85 + 0.15 * l.t), l.t, l.style, l.t);
        }
        if (this._quad && this._fade > 0)
            this._frame(scaleQuad(this._quad, this._pop.value), this._fade, this._style, 1);

        return busy;
    }

    /** Draws one frame. `grow` 0..1 sets how much of the dashes and brackets is out. */
    private _frame(q: Quad, a: number, s: number, grow: number): void {
        const g = this._g;
        const pts = q.flatMap((p) => [p.x, p.y]);
        const [dash, gap] = this._opts.dash ?? [5, 4];

        if (s > 0.01 && (this._opts.fillAlpha ?? 0.05) > 0) {
            // free paths cannot be filled: draw the tint as a turned rectangle instead
            const w = Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y);
            const h = Math.hypot(q[3].x - q[0].x, q[3].y - q[0].y);

            g.save()
                .translateTransform(q[0].x, q[0].y)
                .rotateTransform(Math.atan2(q[1].y - q[0].y, q[1].x - q[0].x))
                .rect(0, 0, w, h)
                .fill({ color: this._color, alpha: (this._opts.fillAlpha ?? 0.05) * s * a })
                .restore();
        }
        // the hover line fades out as the selected frame fades in
        if (s < 0.99) {
            g.poly(pts, true).stroke({ width: 1.5, color: this._hoverColor, alpha: 0.7 * (1 - s) * a });
        }
        if (s > 0.01) {
            g.poly(pts, true).stroke({
                width: 1.5,
                color: this._color,
                alpha: s * a,
                dash: [Math.max(0.01, dash * grow), gap + dash * (1 - grow)],
                dashOffset: this._offset,
            });
            if (this._opts.brackets ?? true) this._brackets(q, s * a, grow);
        }
    }

    private _brackets(q: Quad, alpha: number, grow: number): void {
        const size = (this._opts.bracketSize ?? 10) * grow;

        if (size < 0.5) return;
        for (let i = 0; i < 4; i++) {
            const p = q[i];
            const next = q[(i + 1) % 4];
            const prev = q[(i + 3) % 4];
            const along = (to: PointData): PointData => {
                const dx = to.x - p.x;
                const dy = to.y - p.y;
                const len = Math.hypot(dx, dy) || 1;
                const l = Math.min(size, len / 3);

                return { x: p.x + (dx / len) * l, y: p.y + (dy / len) * l };
            };
            const a = along(prev);
            const b = along(next);

            this._g.polyline([a.x, a.y, p.x, p.y, b.x, b.y]).stroke({
                width: 3,
                color: this._color,
                alpha,
                cap: 'round',
            });
        }
    }
}
