import { type ColorSource, Container, type FederatedPointerEvent, type PointData, type Ticker } from 'pixi.js';
import { damp } from '../motion';
import { SilkGraphics } from '../SilkGraphics';
import { type Signal, signal } from '../signal';
import type { Camera, WorldRect } from './camera';
import { Driver } from './driver';
import { type InputProfiles, inputKind, inputProfile } from './input';
import { onKey } from './keys';
import { boundsQuad, type Quad } from './outline';
import { hex } from './paint';

/** `intersect` picks what the rectangle touches, `contain` only what is fully inside. */
export type MarqueeMode = 'intersect' | 'contain';

/** How a drag combines with the selection: replace it, add to it (Shift) or take away from it (Alt). */
export type MarqueeOp = 'replace' | 'add' | 'subtract';

/** Options of {@link Marquee}. */
export interface MarqueeOptions {
    /** The camera: the rectangle is drawn on screen and tested in its world. */
    camera: Camera;
    /**
     * Where presses on empty canvas land, usually `app.stage` with `hitArea = app.screen`. A drag
     * starts only when the press hit this container itself, not one of its children. Its
     * `eventMode` is set to `static` when it was `none`, `passive` or `auto`.
     */
    surface: Container;
    /**
     * Objects the rectangle can pick, or a function called on every move that returns them.
     * Hidden, destroyed and detached ones are skipped. Ignored when `hit` is given.
     */
    candidates?: readonly Container[] | (() => readonly Container[]);
    /** Your own hit test: what the world rectangle picks. Use it for spatial indexes or custom shapes. */
    hit?: (rect: WorldRect, mode: MarqueeMode) => readonly Container[];
    /** Initial value of {@link Marquee.mode}. Default `intersect`. */
    mode?: MarqueeMode;
    /** Returns the selection before the drag, read once on press, for Shift and Alt. Default empty. */
    selection?: () => readonly Container[];
    /** Called when the selection changes during a drag, with the new selection and what the rectangle covers. */
    onChange?: (selection: readonly Container[], hits: readonly Container[]) => void;
    /** Called when the pointer has moved past the tap slop and the rectangle appears. */
    onStart?: () => void;
    /** Called when a drag ends with the final selection. Not called on cancel. */
    onEnd?: (selection: readonly Container[]) => void;
    /** A click on empty canvas without Shift clears the selection (calls `onChange` with `[]`). Default true. */
    clearOnClick?: boolean;
    /** Pans the camera while the pointer is within 24 pixels of the view's edge, up to 600 pixels a second. Default true. */
    autoPan?: boolean;
    /** Colour of the rectangle's fill and border. Default `0x0a84ff`. */
    color?: ColorSource;
    /** Per pointer kind overrides of `slop`, how far a press moves before the rectangle starts. */
    profiles?: InputProfiles;
    /** Ticker that runs fades and auto-pan. Default `Ticker.shared`. With `null`, call {@link Marquee.tick} yourself. */
    ticker?: Ticker | null;
}

/** The reactive state of a {@link Marquee}. */
export interface MarqueeState {
    /** True while a rectangle is being dragged. */
    active: Signal<boolean>;
    /** The rectangle in world units, or null when no drag is live. */
    rect: Signal<WorldRect | null>;
    /** What the rectangle covers now. Only changes when the list itself changes. */
    hits: Signal<readonly Container[]>;
}

interface Drag {
    pointerId: number;
    start: PointData;
    screen0: PointData;
    pointer: PointData;
    base: readonly Container[];
    op: MarqueeOp;
    live: boolean;
    slop: number;
}

/**
 * True when a parallelogram quad (corners in order, as {@link boundsQuad} returns) touches an
 * axis-aligned rectangle. Edges that only touch count. Uses separating axes, so other quads may be wrong.
 */
export function quadIntersects(q: Quad, r: WorldRect): boolean {
    const rect: Quad = [
        { x: r.x, y: r.y },
        { x: r.x + r.width, y: r.y },
        { x: r.x + r.width, y: r.y + r.height },
        { x: r.x, y: r.y + r.height },
    ];
    const axes: PointData[] = [
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: q[1].x - q[0].x, y: q[1].y - q[0].y },
        { x: q[3].x - q[0].x, y: q[3].y - q[0].y },
    ];

    for (const a of axes) {
        if (a.x === 0 && a.y === 0) continue;
        let q0 = Infinity;
        let q1 = -Infinity;
        let r0 = Infinity;
        let r1 = -Infinity;

        for (const p of q) {
            const d = p.x * a.x + p.y * a.y;

            q0 = Math.min(q0, d);
            q1 = Math.max(q1, d);
        }
        for (const p of rect) {
            const d = p.x * a.x + p.y * a.y;

            r0 = Math.min(r0, d);
            r1 = Math.max(r1, d);
        }
        if (q1 < r0 || r1 < q0) return false;
    }

    return true;
}

/** True when all four corners of a quad are inside an axis-aligned rectangle, edges included. */
export function quadInside(q: Quad, r: WorldRect): boolean {
    return q.every((p) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height);
}

/**
 * Combines a selection with what a marquee covers. `add` appends hits not in `base`, keeping
 * order. `subtract` removes them. Always returns a new array.
 */
export function combineSelection(
    base: readonly Container[],
    hits: readonly Container[],
    op: MarqueeOp,
): readonly Container[] {
    if (op === 'replace') return [...hits];
    if (op === 'add') return [...base, ...hits.filter((h) => !base.includes(h))];

    return base.filter((b) => !hits.includes(b));
}

const sameList = (a: readonly Container[], b: readonly Container[]): boolean =>
    a.length === b.length && a.every((t, i) => t === b[i]);

/**
 * Rubber-band selection: drag on empty canvas to pick every object the rectangle touches (or
 * fully contains). Shift adds to the selection, Alt takes away, Escape cancels.
 *
 * Only left drags from the bare `surface` start it. A {@link Camera} keeps middle, right, Space
 * and two-finger drags, and a pan that starts mid-drag cancels the marquee. The selection updates
 * live through `onChange`. Near the edge of the view the camera pans, and the rectangle keeps
 * its world corner.
 *
 * It holds no selection of its own: plain arrays of containers in, plain arrays out. Hit tests
 * use each object's transformed bounds box, not its exact shape. Put it in screen space above the
 * world. It listens for Escape on `window`.
 *
 * Experimental: the API may change in a minor release.
 * @experimental
 */
export class Marquee extends Container {
    /** Drag state, rectangle and hits, as signals. */
    readonly state: MarqueeState = {
        active: signal(false),
        rect: signal<WorldRect | null>(null),
        hits: signal<readonly Container[]>([], sameList),
    };
    /** Hit mode. Takes effect on the next pointer move. */
    mode: MarqueeMode;

    private readonly _opts: MarqueeOptions;
    private readonly _camera: Camera;
    private readonly _surface: Container;
    private readonly _g = new SilkGraphics({ label: 'Marquee' });
    private readonly _driver: Driver;
    private readonly _color: number;
    private readonly _off: (() => void)[] = [];
    private _drag: Drag | null = null;
    private _fade = 0;
    private _last: { x0: number; y0: number; x1: number; y1: number } | null = null;

    constructor(options: MarqueeOptions) {
        super({ label: 'Marquee' });
        this._opts = options;
        this._camera = options.camera;
        this._surface = options.surface;
        this.mode = options.mode ?? 'intersect';
        this._color = hex(options.color ?? 0x0a84ff);
        this.eventMode = 'none';
        this.addChild(this._g);
        this._driver = new Driver((dt) => this._step(dt), options.ticker);
        const s = options.surface;
        const down = (e: FederatedPointerEvent) => this._down(e);
        const move = (e: FederatedPointerEvent) => this._move(e);
        const up = (e: FederatedPointerEvent) => this._up(e);

        if (s.eventMode === 'passive' || s.eventMode === 'none' || s.eventMode === 'auto') s.eventMode = 'static';
        s.on('pointerdown', down);
        s.on('globalpointermove', move);
        s.on('pointerup', up);
        s.on('pointerupoutside', up);
        this._off.push(() => {
            s.off('pointerdown', down);
            s.off('globalpointermove', move);
            s.off('pointerup', up);
            s.off('pointerupoutside', up);
        });
        // a pan that starts mid-drag (a second finger, Space) wins
        this._off.push(
            options.camera.state.panning.subscribe((p) => {
                if (p) this.cancel();
            }),
        );
        this._off.push(
            onKey((code, isDown) => {
                if (isDown && code === 'Escape') this.cancel();
            }),
        );
    }

    /** The rectangle in this overlay's space (CSS pixels) now, or null when no drag is live. */
    get screenRect(): WorldRect | null {
        const d = this._drag;

        if (!d?.live) return null;
        const a = this._camera.worldToScreen(d.start);
        const b = d.pointer;

        return {
            x: Math.min(a.x, b.x),
            y: Math.min(a.y, b.y),
            width: Math.abs(b.x - a.x),
            height: Math.abs(b.y - a.y),
        };
    }

    /** What a world rectangle picks, by `hit` or by testing the candidates. Does not change the selection. */
    pick(rect: WorldRect, mode: MarqueeMode = this.mode): readonly Container[] {
        if (this._opts.hit) return this._opts.hit(rect, mode);
        const c = this._opts.candidates;
        const list = typeof c === 'function' ? c() : (c ?? []);
        const world = this._camera.world;
        const test = mode === 'contain' ? quadInside : quadIntersects;

        return list.filter((t) => !t.destroyed && t.visible && t.parent && test(boundsQuad(t, world), rect));
    }

    /**
     * Stops the drag. A live drag calls `onChange` with the selection from before the drag. Escape
     * and a camera pan call it too. No-op without a drag.
     */
    cancel(): void {
        const d = this._drag;

        if (!d) return;
        this._drag = null;
        if (d.live) {
            this._opts.onChange?.(d.base, []);
            this._finish();
        }
    }

    /** Advances fades and auto-pan by `dt` seconds (clamped to 0..0.1). Only needed with `ticker: null`. */
    tick(dt: number): boolean {
        return this._driver.tick(dt);
    }

    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        for (const off of this._off) off();
        this._off.length = 0;
        this._driver.sleep();
        super.destroy(options ?? { children: true });
    }

    // ------------------------------------------------------------------------------- internals

    private _op(e: { shiftKey?: boolean; altKey?: boolean }): MarqueeOp {
        return e.altKey ? 'subtract' : e.shiftKey ? 'add' : 'replace';
    }

    private _screen(e: { global: PointData }): PointData {
        return this.toLocal(e.global);
    }

    private _down(e: FederatedPointerEvent): void {
        if (this._drag || e.target !== this._surface || e.button !== 0 || this._camera.state.panning.value) return;
        const p = this._screen(e);

        this._drag = {
            pointerId: e.pointerId,
            start: this._camera.screenToWorld(p),
            screen0: p,
            pointer: p,
            base: [...(this._opts.selection?.() ?? [])],
            op: this._op(e),
            live: false,
            slop: inputProfile(inputKind(e), this._opts.profiles).slop,
        };
    }

    private _move(e: FederatedPointerEvent): void {
        const d = this._drag;

        if (!d || e.pointerId !== d.pointerId) return;
        d.pointer = this._screen(e);
        d.op = this._op(e);
        if (!d.live) {
            if (Math.hypot(d.pointer.x - d.screen0.x, d.pointer.y - d.screen0.y) < d.slop) return;
            d.live = true;
            this.state.active.set(true);
            this._opts.onStart?.();
        }
        this._update();
        this._driver.wake();
    }

    private _update(): void {
        const d = this._drag;

        if (!d?.live) return;
        const b = this._camera.screenToWorld(d.pointer);
        const rect = {
            x: Math.min(d.start.x, b.x),
            y: Math.min(d.start.y, b.y),
            width: Math.abs(b.x - d.start.x),
            height: Math.abs(b.y - d.start.y),
        };
        const hits = this.pick(rect);
        const before = this.state.hits.value;

        this.state.rect.set(rect);
        this.state.hits.set(hits);
        if (!sameList(before, hits) || d.op !== this._lastOp) {
            this._lastOp = d.op;
            this._opts.onChange?.(combineSelection(d.base, hits, d.op), hits);
        }
    }

    private _lastOp: MarqueeOp | null = null;

    private _up(e: FederatedPointerEvent): void {
        const d = this._drag;

        if (!d || e.pointerId !== d.pointerId) return;
        this._drag = null;
        if (!d.live) {
            // a click on empty canvas
            if ((this._opts.clearOnClick ?? true) && d.op === 'replace') this._opts.onChange?.([], []);

            return;
        }
        this._opts.onEnd?.(combineSelection(d.base, this.state.hits.value, d.op));
        this._finish();
    }

    private _finish(): void {
        this._lastOp = null;
        this.state.active.set(false);
        this.state.rect.set(null);
        this.state.hits.set([]);
        this._driver.wake();
    }

    private _step(dt: number): boolean {
        const d = this._drag;
        const live = !!d?.live;
        let busy = live;

        // nudge the view when the pointer nears its edge
        if (d && live && (this._opts.autoPan ?? true)) {
            const view = this._camera.view;
            const k = this._camera.zoom;
            const W = view.width * k;
            const H = view.height * k;
            const edge = 24;
            const speed = (v: number, size: number) =>
                v < edge ? (edge - v) / edge : v > size - edge ? -(v - (size - edge)) / edge : 0;
            const vx = speed(d.pointer.x, W) * 600;
            const vy = speed(d.pointer.y, H) * 600;

            if (vx || vy) {
                this._camera.panBy(vx * dt, vy * dt);
                this._update();
            }
        }
        const r = this.screenRect;

        if (r) this._last = { x0: r.x, y0: r.y, x1: r.x + r.width, y1: r.y + r.height };
        const to = live ? 1 : 0;

        this._fade = damp(this._fade, to, live ? 30 : 14, dt);
        if (Math.abs(this._fade - to) < 0.004) this._fade = to;
        else busy = true;
        const g = this._g.clear();
        const box = this._last;

        if (box && this._fade > 0) {
            const a = this._fade;
            const w = box.x1 - box.x0;
            const h = box.y1 - box.y0;
            // on the way out it settles inwards a little
            const inset = live ? 0 : (1 - a) * Math.min(4, w / 4, h / 4);

            g.rect(box.x0 + inset, box.y0 + inset, Math.max(0, w - inset * 2), Math.max(0, h - inset * 2))
                .fill({ color: this._color, alpha: 0.12 * a })
                .stroke({ width: 1, color: this._color, alpha: 0.9 * a, alignment: 'inside' });
        }
        if (!live && this._fade === 0) this._last = null;

        return busy;
    }
}
