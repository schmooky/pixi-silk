import { Container, type FederatedPointerEvent, type PointData, type Ticker } from 'pixi.js';
import { damp, Spring } from '../motion';
import { SilkGraphics } from '../SilkGraphics';
import { type Signal, signal } from '../signal';
import { AngleAccumulator, angleDelta, snapTo, TAU } from './arc';
import { Driver } from './driver';
import { type InputKind, type InputProfiles, inputKind, inputProfile } from './input';
import { altDown, modDown, shiftDown } from './keys';
import { boundsQuad, type Quad, scaleQuad } from './outline';
import { hex, mix } from './paint';
import type { SnapEngine, SnapGuides, SnapRect } from './snap';
import { ValuePill } from './ValuePill';

/** Which tools the gizmo shows. `universal` combines move, rotate and scale. */
export type GizmoMode = 'move' | 'rotate' | 'scale' | 'box' | 'universal';

/** Axes of move handles: the object's own (`local`) or its parent's (`world`). */
export type GizmoSpace = 'local' | 'world';

/** A grabbable part of the gizmo. */
export type GizmoHandle =
    | 'move-x'
    | 'move-y'
    | 'move-free'
    | 'rotate'
    | 'scale-x'
    | 'scale-y'
    | 'scale-uniform'
    | 'box-n'
    | 'box-s'
    | 'box-e'
    | 'box-w'
    | 'box-ne'
    | 'box-nw'
    | 'box-se'
    | 'box-sw'
    | 'box-rotate'
    | 'box-move';

/** Position, rotation and scale of the target, in its parent's space. */
export interface GizmoTransform {
    x: number;
    y: number;
    rotation: number;
    scaleX: number;
    scaleY: number;
}

/** Colours of a {@link TransformGizmo} (any Pixi colour). */
export interface GizmoTheme {
    x: number | string;
    y: number | string;
    accent: number | string;
    handle: number | string;
    active: number | string;
}

/** Default theme: red X, green Y, blue free handles, white box handles. */
export const GIZMO_THEME: Readonly<GizmoTheme> = {
    x: 0xff453a,
    y: 0x30d158,
    accent: 0x0a84ff,
    handle: 0xffffff,
    active: 0xffd60a,
};

/** Snap steps. Snapping is on while Shift is held, or always with `enabled` (then Shift turns it off). */
export interface GizmoSnap {
    /** Grid step for moves, in parent units. Default 10. */
    translate?: number;
    /** Angle step in radians. Default 15 degrees. */
    angle?: number;
    /** Scale step. Default 0.1. */
    scale?: number;
    /** Snap without Shift. Default false. */
    enabled?: boolean;
}

/** The reactive state of a {@link TransformGizmo}. */
export interface GizmoState {
    mode: Signal<GizmoMode>;
    space: Signal<GizmoSpace>;
    /** Handle under the pointer. */
    hover: Signal<GizmoHandle | null>;
    /** Handle being dragged. */
    active: Signal<GizmoHandle | null>;
    dragging: Signal<boolean>;
    /** True while the current drag snaps to steps. */
    snapping: Signal<boolean>;
}

/** Options of {@link TransformGizmo}. */
export interface TransformGizmoOptions {
    /** Default `universal`. */
    mode?: GizmoMode;
    /** Default `local`. Scale handles always follow the object's own axes. */
    space?: GizmoSpace;
    /** Object to transform. */
    target?: Container | null;
    /** Length of the axis handles, in gizmo units. Default 84. */
    size?: number;
    snap?: GizmoSnap;
    /** Smart guides for free moves: aligns the target's bounds with other objects. Ctrl or Cmd turns them off. */
    snapEngine?: SnapEngine;
    /** Draws what `snapEngine` found. Put it in the target's parent space. */
    snapGuides?: SnapGuides;
    /** Show a value pill (angle, size, offset) while dragging. Default true. */
    readout?: boolean;
    /**
     * What happens when the gizmo moves to another object. `pop` (default): the old handles shrink
     * away where they were, the new ones spring in group by group, and input waits until they land.
     * `glide`: the handles slide over. Following the same object is always exact.
     */
    transition?: 'pop' | 'glide';
    /** Write the new transform into the target. Default true. Set false to apply it yourself in `onChange`. */
    apply?: boolean;
    theme?: Partial<GizmoTheme>;
    profiles?: InputProfiles;
    ticker?: Ticker | null;
    onStart?: (handle: GizmoHandle, transform: GizmoTransform) => void;
    onChange?: (transform: GizmoTransform, handle: GizmoHandle) => void;
    onEnd?: (transform: GizmoTransform, handle: GizmoHandle) => void;
}

interface Drag {
    handle: GizmoHandle;
    id: number;
    start: GizmoTransform;
    p0: PointData;
    acc: AngleAccumulator;
    /** Box drags: the box in the rotated frame, its origin and the local bounds. */
    box?: { o: PointData; w: number; h: number; lx: number; ly: number; lw: number; lh: number; grab: PointData };
    centre: PointData;
    /** Angle in gizmo space where a rotation started, for the sweep. */
    a0: number;
    rect0?: SnapRect;
}

const BOX_HANDLES: GizmoHandle[] = ['box-nw', 'box-n', 'box-ne', 'box-e', 'box-se', 'box-s', 'box-sw', 'box-w'];
/** Box handle positions on the unit box, matching BOX_HANDLES. */
const BOX_UV: [number, number][] = [
    [0, 0],
    [0.5, 0],
    [1, 0],
    [1, 0.5],
    [1, 1],
    [0.5, 1],
    [0, 1],
    [0, 0.5],
];

const lerp = (a: PointData, b: PointData, t: number): PointData => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
});

function segDist(p: PointData, a: PointData, b: PointData): number {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const len2 = abx * abx + aby * aby;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2)) : 0;

    return Math.hypot(p.x - a.x - abx * t, p.y - a.y - aby * t);
}

function inQuad(p: PointData, q: Quad): boolean {
    let sign = 0;

    for (let i = 0; i < 4; i++) {
        const a = q[i];
        const b = q[(i + 1) % 4];
        const c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);

        if (c === 0) continue;
        if (sign === 0) sign = Math.sign(c);
        else if (Math.sign(c) !== sign) return false;
    }

    return true;
}

/**
 * Transform handles for editors: move, rotate, scale and a design-tool bounding box.
 *
 * - `move`: X and Y arrows lock to an axis, the centre square moves freely.
 * - `rotate`: a ring. The swept angle is shaded and read out, with snap ticks while snapping.
 * - `scale`: axis handles with cube ends, the centre ring scales evenly.
 * - `box`: eight resize handles, rotate zones right outside the corners. Shift keeps the aspect,
 *   Alt resizes from the centre.
 * - `universal`: move, rotate and scale at once.
 *
 * Shift snaps moves, angles and scales to steps (in box mode it locks the aspect and snaps angles).
 * Handles light up under the pointer and grow for touch. Put the gizmo in an overlay above the
 * scene. It follows the target every frame and writes the new transform into it.
 */
export class TransformGizmo extends Container {
    readonly state: GizmoState;
    /** Snap steps and whether snapping is on without Shift. Change it at any time. */
    snap: GizmoSnap;

    private _g = new SilkGraphics();
    /** The previous target's handles, frozen and popping out. */
    private _gOut = new SilkGraphics();
    private _out: { pos: PointData; t: number } | null = null;
    /** Pop-in of the handle groups: move arrows, then the rotate ring, then the scale handles. */
    private readonly _grp: { move: Spring; rotate: Spring; scale: Spring } = {
        move: new Spring(1, 420, 20),
        rotate: new Spring(1, 420, 20),
        scale: new Spring(1, 420, 20),
    };
    private _since = 1;
    private _glide: { pos: PointData; axis: number; quad: Quad | null; k: number } | null = null;
    private readonly _driver: Driver;
    private readonly _opts: TransformGizmoOptions;
    private readonly _theme: Record<keyof GizmoTheme, number>;
    private readonly _pill: ValuePill | null;
    private _target: Container | null = null;
    private _hover = new Map<GizmoHandle, number>();
    private _drag: Drag | null = null;
    private _kind: InputKind = 'mouse';
    private _axis = 0;
    private _quad: Quad | null = null;
    private _sweep = 0;
    private _fade = 0;

    constructor(options: TransformGizmoOptions = {}) {
        super({ label: 'TransformGizmo' });
        this._opts = options;
        this.snap = { ...options.snap };
        this._theme = Object.fromEntries(
            Object.entries({ ...GIZMO_THEME, ...options.theme }).map(([k, v]) => [k, hex(v)]),
        ) as Record<keyof GizmoTheme, number>;
        this.state = {
            mode: signal<GizmoMode>(options.mode ?? 'universal'),
            space: signal<GizmoSpace>(options.space ?? 'local'),
            hover: signal<GizmoHandle | null>(null),
            active: signal<GizmoHandle | null>(null),
            dragging: signal(false),
            snapping: signal(false),
        };
        this._pill = options.readout === false ? null : new ValuePill({ fill: 0x1c1c1e, color: 0xffffff });
        this.addChild(this._gOut, this._g);
        if (this._pill) this.addChild(this._pill);
        this._driver = new Driver((dt) => this._step(dt), options.ticker);
        this.eventMode = 'static';
        // only the handles catch the pointer: clicks elsewhere reach the scene
        this.hitArea = { contains: (x: number, y: number) => this.pick(x, y) !== null };
        this.on('pointerdown', this._onDown, this);
        this.on('globalpointermove', this._onMove, this);
        this.on('pointerup', this._onUp, this);
        this.on('pointerupoutside', this._onUp, this);
        this.on('pointerout', () => {
            if (!this._drag) this.state.hover.set(null);
        });
        this.state.mode.subscribe(() => this._driver.wake());
        this.state.space.subscribe(() => this._driver.wake());
        this.state.hover.subscribe(() => this._driver.wake());
        this.attach(options.target ?? null);
    }

    /** Object being transformed. */
    get target(): Container | null {
        return this._target;
    }

    /** Transforms `target` from now on (null hides the gizmo). */
    attach(target: Container | null): void {
        if (this._drag) this._end();
        const prev = this._target;

        if (prev === target) {
            this._sync();

            return;
        }
        const parent = this.parent;
        const had = !!prev && this.visible && this._fade > 0.01 && !!parent;

        if (had && target && parent && this._opts.transition === 'glide') {
            const quad = this._quad ? (this._quad.map((p) => parent.toLocal(this.toGlobal(p))) as Quad) : null;

            this._glide = { pos: { x: this.x, y: this.y }, axis: this._axis, quad, k: 0 };
        } else {
            if (had) {
                // keep the old drawing where it was and let it pop out
                const old = this._g;

                this._g = this._gOut;
                this._gOut = old;
                // the recycled graphics may still carry an earlier pop-out's offset and shrink
                this._g.clear();
                this._g.position.set(0, 0);
                this._g.scale.set(1);
                this.addChildAt(this._gOut, 0);
                this._out = { pos: { x: this.x, y: this.y }, t: 1 };
            }
            for (const sp of Object.values(this._grp)) {
                sp.value = 0;
                sp.velocity = 0;
                sp.target = 0;
            }
            this._since = 0;
            this._glide = null;
        }
        this._target = target;
        this.visible = !!target || !!this._out;
        this._sync();
        this._driver.wake();
    }

    /** True while the handles pop or glide in. The gizmo ignores the pointer meanwhile. */
    get transitioning(): boolean {
        if (this._glide) return true;

        return Object.values(this._grp).some((sp) => sp.target < 1 || Math.abs(sp.value - 1) > 0.08);
    }

    /** Current transform of the target. */
    read(): GizmoTransform {
        const t = this._target;

        if (!t) return { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };

        return { x: t.x, y: t.y, rotation: t.rotation, scaleX: t.scale.x, scaleY: t.scale.y };
    }

    /** Advances the animation by `dt` seconds (only needed with `ticker: null`). */
    tick(dt: number): boolean {
        return this._driver.tick(dt);
    }

    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        this._driver.sleep();
        super.destroy(options ?? { children: true });
    }

    // ------------------------------------------------------------------------------ geometry

    private get _size(): number {
        return (this._opts.size ?? 84) * this._k;
    }

    /** Handle scale for the current pointer kind. */
    private get _k(): number {
        return inputProfile(this._kind, this._opts.profiles).scale;
    }

    /** How far from a handle the pointer may be and still grab it. */
    private get _tol(): number {
        return 6 + inputProfile(this._kind, this._opts.profiles).slop * 0.7;
    }

    private _ringR(): number {
        return this.state.mode.value === 'universal' ? this._size * 1.22 : this._size * 0.92;
    }

    /** Reads where the target is and how it is turned, in the gizmo's parent space. */
    private _sync(): void {
        const t = this._target;
        const parent = this.parent;

        if (!t || !parent) return;
        const o = parent.toLocal(t.toGlobal({ x: t.pivot.x, y: t.pivot.y }));
        const ox = parent.toLocal(t.toGlobal({ x: t.pivot.x + 1, y: t.pivot.y }));
        const axis = Math.atan2(ox.y - o.y, ox.x - o.x);
        const box = this.state.mode.value === 'box';
        const glide = this._glide;

        if (!glide) {
            this.position.set(o.x, o.y);
            this._axis = axis;
            this._quad = box ? boundsQuad(t, this) : null;

            return;
        }
        const k = glide.k;
        const live = boundsQuad(t, parent);

        this.position.set(glide.pos.x + (o.x - glide.pos.x) * k, glide.pos.y + (o.y - glide.pos.y) * k);
        this._axis = glide.axis + angleDelta(axis, glide.axis) * k;
        if (!box) {
            this._quad = null;

            return;
        }
        const from = glide.quad ?? live;

        this._quad = live.map((p, i) =>
            this.toLocal(
                parent.toGlobal({ x: from[i].x + (p.x - from[i].x) * k, y: from[i].y + (p.y - from[i].y) * k }),
            ),
        ) as Quad;
    }

    /** Angle of an axis in gizmo space (0 = x, 1 = y). Scale handles always use local axes. */
    private _dir(axis: 0 | 1, forceLocal = false): number {
        const local = forceLocal || this.state.space.value === 'local';
        const base = local ? this._axis : 0;

        return base + (axis === 1 ? Math.PI / 2 : 0);
    }

    /** The handle under (x, y) in gizmo space, or null. */
    pick(x: number, y: number): GizmoHandle | null {
        if (!this._target || !this.visible || this.transitioning) return null;
        const mode = this.state.mode.value;
        const p = { x, y };
        const tol = this._tol;
        const size = this._size;
        const d = Math.hypot(x, y);
        const at = (angle: number, r: number): PointData => ({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });

        if (mode === 'box') {
            const q = this._quad;

            if (!q) return null;
            const r = 6 * this._k + tol * 0.6;

            for (let i = 0; i < 8; i++) {
                const [u, v] = BOX_UV[i];
                const hp = lerp(lerp(q[0], q[1], u), lerp(q[3], q[2], u), v);

                if (Math.hypot(x - hp.x, y - hp.y) <= r) return BOX_HANDLES[i];
            }
            const edges: GizmoHandle[] = ['box-n', 'box-e', 'box-s', 'box-w'];

            for (let i = 0; i < 4; i++) {
                if (segDist(p, q[i], q[(i + 1) % 4]) <= tol * 0.6) return edges[i];
            }
            if (inQuad(p, q)) return 'box-move';
            for (const c of q) {
                if (Math.hypot(x - c.x, y - c.y) <= 26 * this._k) return 'box-rotate';
            }

            return null;
        }
        const moves = mode === 'move' || mode === 'universal';
        const scales = mode === 'scale' || mode === 'universal';
        const rotates = mode === 'rotate' || mode === 'universal';

        // small targets first: they sit on top of the long ones
        if (moves && Math.abs(x) <= 9 * this._k + tol * 0.4 && Math.abs(y) <= 9 * this._k + tol * 0.4) {
            return 'move-free';
        }
        if (scales) {
            const reach = mode === 'universal' ? size * 0.58 : size;

            for (const axis of [0, 1] as const) {
                const c = at(this._dir(axis, true), reach);

                if (Math.hypot(x - c.x, y - c.y) <= 7 * this._k + tol * 0.6) return axis ? 'scale-y' : 'scale-x';
            }
            if (mode === 'universal') {
                const c = at(this._dir(0, true) + Math.PI / 4, size * 0.42);

                if (Math.hypot(x - c.x, y - c.y) <= 7 * this._k + tol * 0.6) return 'scale-uniform';
            } else if (Math.abs(d - 16 * this._k) <= tol * 0.7) return 'scale-uniform';
        }
        if (moves) {
            for (const axis of [0, 1] as const) {
                const a = this._dir(axis);

                if (segDist(p, at(a, 16 * this._k), at(a, size + 4)) <= tol) return axis ? 'move-y' : 'move-x';
            }
        }
        if (scales && mode === 'scale') {
            for (const axis of [0, 1] as const) {
                const a = this._dir(axis, true);

                if (segDist(p, at(a, 20 * this._k), at(a, size)) <= tol) return axis ? 'scale-y' : 'scale-x';
            }
        }
        if (rotates && Math.abs(d - this._ringR()) <= tol) return 'rotate';

        return null;
    }

    // ------------------------------------------------------------------------------ input

    private _snapping(): boolean {
        return (this.snap.enabled ?? false) !== shiftDown();
    }

    /** Pointer in the target's parent space. */
    private _p(e: { global: PointData }): PointData {
        const parent = this._target?.parent;

        return parent ? parent.toLocal(e.global) : { x: e.global.x, y: e.global.y };
    }

    /**
     * Starts dragging from a pointer press that landed elsewhere, such as on the object itself:
     * press an object and move it in one go. Defaults to a free move.
     */
    grab(e: FederatedPointerEvent, handle?: GizmoHandle): void {
        this._begin(e, handle ?? (this.state.mode.value === 'box' ? 'box-move' : 'move-free'));
    }

    private _onDown(e: FederatedPointerEvent): void {
        this._begin(e, null);
    }

    private _begin(e: FederatedPointerEvent, forced: GizmoHandle | null): void {
        const t = this._target;

        if (!t || this._drag) return;
        this._kind = inputKind(e);
        this._sync();
        const local = this.toLocal(e.global);
        const handle = forced ?? this.pick(local.x, local.y);

        if (!handle) return;
        const start = this.read();
        const p0 = this._p(e);
        const acc = new AngleAccumulator();
        let centre: PointData = { x: start.x, y: start.y };
        const drag: Drag = { handle, id: e.pointerId, start, p0, acc, centre, a0: Math.atan2(local.y, local.x) };

        if (handle.startsWith('box') && handle !== 'box-move') {
            const b = t.getLocalBounds();
            const o = this._p({ global: t.toGlobal({ x: b.minX, y: b.minY }) });
            const w = b.width * Math.abs(start.scaleX);
            const h = b.height * Math.abs(start.scaleY);
            const c = Math.cos(start.rotation);
            const s = Math.sin(start.rotation);

            centre = { x: o.x + (c * w) / 2 - (s * h) / 2, y: o.y + (s * w) / 2 + (c * h) / 2 };
            drag.centre = centre;
            const q = this._frame(p0, o, start.rotation);

            drag.box = { o, w, h, lx: b.minX, ly: b.minY, lw: b.width || 1, lh: b.height || 1, grab: { x: 0, y: 0 } };
            // remember how far from the grabbed edges the pointer started, so nothing jumps
            const ex = handle.includes('e') ? w : handle.includes('w') ? 0 : q.x;
            const ey = handle.includes('s') ? h : handle.includes('n') ? 0 : q.y;

            drag.box.grab = { x: ex - q.x, y: ey - q.y };
            if (handle === 'box-rotate') {
                const g = this._toGizmo(centre);

                drag.a0 = Math.atan2(local.y - g.y, local.x - g.x);
            }
        }
        if (handle.startsWith('move') || handle === 'box-move') drag.rect0 = this._rect();
        acc.reset(p0.x - centre.x, p0.y - centre.y);
        this._drag = drag;
        this.state.active.set(handle);
        this.state.dragging.set(true);
        this._opts.onStart?.(handle, start);
        e.stopPropagation();
        this._driver.wake();
    }

    private _onMove(e: FederatedPointerEvent): void {
        if (!this._target) return;
        const drag = this._drag;

        if (!drag) {
            if (inputKind(e) === 'touch') return;
            this._kind = inputKind(e);
            const local = this.toLocal(e.global);
            const handle = this.pick(local.x, local.y);

            this.state.hover.set(handle);
            this.cursor = cursorFor(handle);

            return;
        }
        if (e.pointerId !== drag.id) return;
        const next = this._compute(drag, this._p(e));

        if (this._opts.apply !== false) this._write(next);
        this._readout(drag, next, this.toLocal(e.global));
        this._opts.onChange?.(next, drag.handle);
        this._driver.wake();
    }

    private _onUp(e: FederatedPointerEvent): void {
        if (this._drag && e.pointerId === this._drag.id) this._end();
    }

    private _end(): void {
        const drag = this._drag;

        if (!drag) return;
        this._drag = null;
        this.state.active.set(null);
        this.state.dragging.set(false);
        this.state.snapping.set(false);
        this._opts.snapGuides?.clear();
        this._pill?.hide();
        this._opts.onEnd?.(this.read(), drag.handle);
        this._driver.wake();
    }

    /** Pointer in a box drag's rotated frame, relative to the box origin. */
    private _frame(p: PointData, o: PointData, rot: number): PointData {
        const c = Math.cos(-rot);
        const s = Math.sin(-rot);
        const dx = p.x - o.x;
        const dy = p.y - o.y;

        return { x: c * dx - s * dy, y: s * dx + c * dy };
    }

    /** A point of the target's parent space in gizmo space. */
    private _toGizmo(p: PointData): PointData {
        const tp = this._target?.parent;

        return tp ? this.toLocal(tp.toGlobal(p)) : p;
    }

    /** Target bounds as an axis-aligned rect in its parent space. */
    private _rect(): SnapRect | undefined {
        const t = this._target;
        const parent = t?.parent;

        if (!t || !parent) return undefined;
        const q = boundsQuad(t, parent);
        const xs = q.map((p) => p.x);
        const ys = q.map((p) => p.y);
        const x = Math.min(...xs);
        const y = Math.min(...ys);

        return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
    }

    /** The new transform for a drag at pointer `p` (target parent space). */
    private _compute(drag: Drag, p: PointData): GizmoTransform {
        const s = drag.start;
        const snapping = this._snapping();
        const snap = this.snap;
        const step = snap.translate ?? 10;
        const angleStep = snap.angle ?? Math.PI / 12;
        const scaleStep = snap.scale ?? 0.1;
        const next: GizmoTransform = { ...s };
        const dx = p.x - drag.p0.x;
        const dy = p.y - drag.p0.y;
        const axisAngle = (axis: 0 | 1, forceLocal = false) =>
            (forceLocal || this.state.space.value === 'local' ? s.rotation : 0) + (axis ? Math.PI / 2 : 0);
        let snapped = false;

        switch (drag.handle) {
            case 'move-x':
            case 'move-y': {
                const a = axisAngle(drag.handle === 'move-x' ? 0 : 1);
                const ux = Math.cos(a);
                const uy = Math.sin(a);
                let along = dx * ux + dy * uy;

                if (snapping) {
                    along = snapTo(along, step);
                    snapped = true;
                }
                next.x = s.x + ux * along;
                next.y = s.y + uy * along;
                break;
            }
            case 'move-free':
            case 'box-move': {
                next.x = s.x + dx;
                next.y = s.y + dy;
                if (snapping) {
                    next.x = snapTo(next.x, step);
                    next.y = snapTo(next.y, step);
                    snapped = true;
                } else if (this._opts.snapEngine && drag.rect0 && !modDown()) {
                    const r0 = drag.rect0;
                    const moved = { ...r0, x: r0.x + next.x - s.x, y: r0.y + next.y - s.y };
                    const own = this._opts.snapEngine.targets.filter(
                        (t) => Math.abs(t.x - r0.x) < 0.5 && Math.abs(t.y - r0.y) < 0.5,
                    );
                    const res = this._opts.snapEngine.snap(moved, own);

                    next.x += res.dx;
                    next.y += res.dy;
                    snapped = res.snappedX || res.snappedY;
                    this._opts.snapGuides?.show(res.guides);
                }
                break;
            }
            case 'rotate':
            case 'box-rotate': {
                drag.acc.push(p.x - drag.centre.x, p.y - drag.centre.y);
                let rot = s.rotation + drag.acc.total;

                if (snapping) {
                    rot = snapTo(rot, angleStep);
                    snapped = true;
                }
                next.rotation = rot;
                if (drag.handle === 'box-rotate') {
                    const delta = rot - s.rotation;
                    const c = Math.cos(delta);
                    const sn = Math.sin(delta);
                    const ox = s.x - drag.centre.x;
                    const oy = s.y - drag.centre.y;

                    next.x = drag.centre.x + c * ox - sn * oy;
                    next.y = drag.centre.y + sn * ox + c * oy;
                }
                break;
            }
            case 'scale-x':
            case 'scale-y': {
                const a = axisAngle(drag.handle === 'scale-x' ? 0 : 1, true);
                const ux = Math.cos(a);
                const uy = Math.sin(a);
                const s0 = (drag.p0.x - s.x) * ux + (drag.p0.y - s.y) * uy;
                const s1 = (p.x - s.x) * ux + (p.y - s.y) * uy;
                const f = Math.abs(s0) > 1e-3 ? s1 / s0 : 1;
                const key = drag.handle === 'scale-x' ? 'scaleX' : 'scaleY';
                let v = s[key] * f;

                if (snapping) {
                    v = snapTo(v, scaleStep);
                    snapped = true;
                }
                next[key] = keepAway(v, s[key]);
                break;
            }
            case 'scale-uniform': {
                const d0 = Math.hypot(drag.p0.x - s.x, drag.p0.y - s.y);
                const d1 = Math.hypot(p.x - s.x, p.y - s.y);
                let f = d0 > 1e-3 ? d1 / d0 : 1;

                if (snapping) {
                    f = Math.max(scaleStep, snapTo(f, scaleStep));
                    snapped = true;
                }
                next.scaleX = keepAway(s.scaleX * f, s.scaleX);
                next.scaleY = keepAway(s.scaleY * f, s.scaleY);
                break;
            }
            default:
                this._resize(drag, p, next);
        }
        this.state.snapping.set(snapped);

        return next;
    }

    /** Box handles: resize in the box's own frame, keeping the opposite side (or the centre) still. */
    private _resize(drag: Drag, p: PointData, next: GizmoTransform): void {
        const box = drag.box;

        if (!box) return;
        const s = drag.start;
        const h = drag.handle;
        const q = this._frame(p, box.o, s.rotation);
        const qx = q.x + box.grab.x;
        const qy = q.y + box.grab.y;
        const fromCentre = altDown();
        let x0 = 0;
        let x1 = box.w;
        let y0 = 0;
        let y1 = box.h;
        const e = h.includes('e');
        const w = h.endsWith('w');
        const n = h === 'box-n' || h === 'box-ne' || h === 'box-nw';
        const so = h === 'box-s' || h === 'box-se' || h === 'box-sw';

        if (e) x1 = qx;
        if (w) x0 = qx;
        if (so) y1 = qy;
        if (n) y0 = qy;
        if (fromCentre) {
            if (e) x0 = box.w - x1;
            if (w) x1 = box.w - x0;
            if (so) y0 = box.h - y1;
            if (n) y1 = box.h - y0;
        }
        let width = Math.max(1, x1 - x0);
        let height = Math.max(1, y1 - y0);
        const corner = (e || w) && (n || so);

        if (corner && shiftDown()) {
            const r = box.w / box.h;

            if (width / box.w > height / box.h) height = width / r;
            else width = height * r;
        }
        // re-anchor the side that did not move
        if (fromCentre) {
            x0 = (box.w - width) / 2;
            y0 = (box.h - height) / 2;
        } else {
            x0 = w ? x1 - width : x0;
            y0 = n ? y1 - height : y0;
        }
        const sx = (width / box.lw) * Math.sign(s.scaleX || 1);
        const sy = (height / box.lh) * Math.sign(s.scaleY || 1);
        const c = Math.cos(s.rotation);
        const sn = Math.sin(s.rotation);
        // where the local top left must land, minus how far the pivot sits from it after scaling
        const tlx = box.o.x + c * x0 - sn * y0;
        const tly = box.o.y + sn * x0 + c * y0;
        const t = this._target as Container;
        const dx = (box.lx - t.pivot.x) * sx;
        const dy = (box.ly - t.pivot.y) * sy;

        next.scaleX = sx;
        next.scaleY = sy;
        next.x = tlx - (c * dx - sn * dy);
        next.y = tly - (sn * dx + c * dy);
    }

    private _write(t: GizmoTransform): void {
        const target = this._target;

        if (!target) return;
        target.position.set(t.x, t.y);
        target.rotation = t.rotation;
        target.scale.set(t.scaleX, t.scaleY);
    }

    private _readout(drag: Drag, t: GizmoTransform, at: PointData): void {
        const pill = this._pill;

        if (!pill) return;
        const s = drag.start;
        const h = drag.handle;
        let text: string;

        if (h === 'rotate' || h === 'box-rotate') {
            const deg = ((t.rotation - s.rotation) * 180) / Math.PI;

            text = `${deg >= 0 ? '+' : ''}${deg.toFixed(0)}°`;
            this._sweep = t.rotation - s.rotation;
        } else if (h.startsWith('scale')) {
            text = `${t.scaleX.toFixed(2)} x ${t.scaleY.toFixed(2)}`;
        } else if (h.startsWith('box') && h !== 'box-move') {
            const b = drag.box;

            text = b ? `${Math.round(Math.abs(t.scaleX) * b.lw)} x ${Math.round(Math.abs(t.scaleY) * b.lh)}` : '';
        } else {
            text = `${Math.round(t.x - s.x)}, ${Math.round(t.y - s.y)}`;
        }
        pill.position.set(at.x + 28, at.y + 26);
        pill.show(text);
    }

    // ------------------------------------------------------------------------------ drawing

    private _step(dt: number): boolean {
        let busy = !!this._target;

        if (this._glide) {
            this._glide.k = damp(this._glide.k, 1, this._opts.transition === 'glide' ? 16 : 30, dt);
            if (this._glide.k > 0.999) this._glide = null;
        }
        this._sync();
        const show = this._target ? 1 : 0;
        const out = this._out;

        if (out) {
            out.t = damp(out.t, 0, 14, dt);
            const parent = this.parent;
            const at = parent ? this.toLocal(parent.toGlobal(out.pos)) : out.pos;

            this._gOut.position.set(at.x, at.y);
            this._gOut.scale.set(0.85 + 0.15 * out.t);
            this._gOut.alpha = out.t;
            if (out.t < 0.01) {
                this._gOut.clear();
                this._out = null;
                if (!this._target) this.visible = false;
            } else busy = true;
        }
        this._since += dt;
        const delays = { move: 0, rotate: 0.05, scale: 0.1 };

        for (const [name, sp] of Object.entries(this._grp) as [keyof typeof delays, Spring][]) {
            if (this._since >= delays[name]) sp.target = 1;
            sp.step(dt);
            if (!sp.settled) busy = true;
        }

        this._fade = damp(this._fade, show, 18, dt);
        if (Math.abs(this._fade - show) < 0.004) this._fade = show;
        const hovered = this.state.active.value ?? this.state.hover.value;
        const all: GizmoHandle[] = [
            'move-x',
            'move-y',
            'move-free',
            'rotate',
            'scale-x',
            'scale-y',
            'scale-uniform',
            'box-rotate',
            'box-move',
            ...BOX_HANDLES,
        ];

        for (const h of all) {
            const target = h === hovered ? 1 : 0;
            const v = damp(this._hover.get(h) ?? 0, target, 20, dt);

            this._hover.set(h, Math.abs(v - target) < 0.003 ? target : v);
        }
        if (!this._drag) this._sweep = damp(this._sweep, 0, 14, dt);
        if (this._pill?.update(dt)) busy = true;
        this._draw();

        return busy || this._fade !== show;
    }

    private _h(handle: GizmoHandle): number {
        return this._hover.get(handle) ?? 0;
    }

    private _color(base: number, handle: GizmoHandle): number {
        const active = this.state.active.value === handle;

        return active ? this._theme.active : mix(base, 0xffffff, this._h(handle) * 0.35);
    }

    private _draw(): void {
        const g = this._g;

        g.clear();
        g.alpha = this._fade;
        if (!this._target) return;
        const mode = this.state.mode.value;

        if (mode === 'box') {
            this._drawBox();

            return;
        }
        const t = this._theme;
        const k = this._k;
        const dragging = this.state.active.value;
        const grp = this._grp;
        const groupOf = (h: GizmoHandle): Spring =>
            h.startsWith('rotate') ? grp.rotate : h.startsWith('scale') ? grp.scale : grp.move;
        // while dragging, the other handles step back. While popping in, each group fades in
        const dim = (h: GizmoHandle) =>
            (dragging && dragging !== h ? 0.25 : 1) * Math.max(0, Math.min(1, groupOf(h).value));
        const grow = (sp: Spring) => 0.85 + 0.15 * sp.value;
        let size = this._size * grow(grp.move);

        if (mode === 'rotate' || mode === 'universal') {
            const R = this._ringR() * grow(grp.rotate);
            const hv = this._h('rotate');

            if (Math.abs(this._sweep) > 0.001 && (dragging === 'rotate' || !dragging)) {
                const a0 = this._drag?.a0 ?? 0;

                g.sector(0, 0, R, a0, a0 + this._sweep, 0).fill({ color: t.accent, alpha: 0.16 });
                g.line(0, 0, Math.cos(a0) * R, Math.sin(a0) * R).stroke({ width: 1, color: t.accent, alpha: 0.6 });
                g.line(0, 0, Math.cos(a0 + this._sweep) * R, Math.sin(a0 + this._sweep) * R).stroke({
                    width: 1.5,
                    color: t.accent,
                });
            }
            g.circle(0, 0, R).stroke({
                width: 2.5 + hv * 1.5,
                color: this._color(t.accent, 'rotate'),
                alpha: dim('rotate'),
            });
            if (dragging === 'rotate' && this.state.snapping.value) {
                const step = this.snap.angle ?? Math.PI / 12;

                for (let a = 0; a < TAU - 1e-6; a += step) {
                    const c = Math.cos(a);
                    const s = Math.sin(a);

                    g.line(c * (R - 6), s * (R - 6), c * (R + 6), s * (R + 6)).stroke({
                        width: 1.5,
                        color: 0xffffff,
                        alpha: 0.5,
                    });
                }
            }
        }
        if (mode === 'move' || mode === 'universal') {
            for (const axis of [0, 1] as const) {
                const handle: GizmoHandle = axis ? 'move-y' : 'move-x';
                const a = this._dir(axis);
                const c = Math.cos(a);
                const s = Math.sin(a);
                const hv = this._h(handle);
                const color = this._color(axis ? t.y : t.x, handle);
                const alpha = dim(handle);

                const w = 2.5 + hv * 1.5;

                // shaft and head are one shape: a union has no seam or double-blended overlap
                g.save()
                    .rotateTransform(a)
                    .pill(16 * k - w / 2, -w / 2, size - 20 * k + w / 2, w)
                    .restore()
                    .regularPoly(c * (size - 4 * k), s * (size - 4 * k), (8 + hv * 2) * k, 3, a + Math.PI / 2, 1.5)
                    .fill({ color, alpha, union: true });
            }
            const hv = this._h('move-free');
            const r = (7 + hv * 1.5) * k;

            g.roundRect(-r, -r, r * 2, r * 2, 3).fill({
                color: this._color(t.accent, 'move-free'),
                alpha: 0.9 * dim('move-free'),
            });
        }
        if (mode === 'scale' || mode === 'universal') {
            size = this._size * grow(grp.scale);
            const reach = mode === 'universal' ? size * 0.58 : size;

            for (const axis of [0, 1] as const) {
                const handle: GizmoHandle = axis ? 'scale-y' : 'scale-x';
                const a = this._dir(axis, true);
                const hv = this._h(handle);
                const color = this._color(axis ? t.y : t.x, handle);
                const r = (5.5 + hv * 1.5) * k;

                const w = 2.5 + hv * 1.5;

                // the line runs into the square: one union, so the overlap is not painted twice
                g.save().rotateTransform(a);
                if (mode === 'scale') g.rect(20 * k, -w / 2, reach - 20 * k, w);
                g.translateTransform(reach, 0)
                    .roundRect(-r, -r, r * 2, r * 2, 2)
                    .restore()
                    .fill({ color, alpha: dim(handle), union: true });
            }
            const hv = this._h('scale-uniform');

            if (mode === 'universal') {
                const a = this._dir(0, true) + Math.PI / 4;
                const r = (5 + hv * 1.5) * k;

                g.save()
                    .translateTransform(Math.cos(a) * size * 0.42, Math.sin(a) * size * 0.42)
                    .rotateTransform(a - Math.PI / 4)
                    .roundRect(-r, -r, r * 2, r * 2, 2)
                    .fill({ color: this._color(t.handle, 'scale-uniform'), alpha: dim('scale-uniform') })
                    .restore();
            } else {
                g.circle(0, 0, 16 * k).stroke({
                    width: 2.5 + hv * 1.5,
                    color: this._color(t.handle, 'scale-uniform'),
                    alpha: dim('scale-uniform'),
                });
            }
        }
    }

    private _drawBox(): void {
        const g = this._g;
        const t = this._theme;
        const pop = this._grp.move;

        if (!this._quad) return;
        const q = scaleQuad(this._quad, 0.85 + 0.15 * pop.value);

        g.alpha = this._fade * Math.max(0, Math.min(1, pop.value));
        const k = this._k;
        const pts = q.flatMap((p) => [p.x, p.y]);

        g.poly(pts, true).stroke({ width: 1.5, color: t.accent });
        // rotate zones show a small arc when the pointer is near a corner
        const rv = this._h('box-rotate');

        if (rv > 0.01) {
            const cx = (q[0].x + q[2].x) / 2;
            const cy = (q[0].y + q[2].y) / 2;

            for (const c of q) {
                const a = Math.atan2(c.y - cy, c.x - cx);

                g.arcSweep(c.x + Math.cos(a) * 12, c.y + Math.sin(a) * 12, 9, a - 1, 2).stroke({
                    width: 2,
                    color: t.accent,
                    alpha: rv,
                    cap: 'round',
                });
            }
        }
        if (Math.abs(this._sweep) > 0.001 && this.state.active.value === 'box-rotate') {
            const cx = (q[0].x + q[2].x) / 2;
            const cy = (q[0].y + q[2].y) / 2;
            const a0 = this._drag?.a0 ?? 0;
            const R =
                Math.min(Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y), Math.hypot(q[3].x - q[0].x, q[3].y - q[0].y)) *
                0.35;

            g.sector(cx, cy, Math.max(R, 18), a0, a0 + this._sweep, 0).fill({ color: t.accent, alpha: 0.18 });
        }
        for (let i = 0; i < 8; i++) {
            const handle = BOX_HANDLES[i];
            const [u, v] = BOX_UV[i];
            const hp = lerp(lerp(q[0], q[1], u), lerp(q[3], q[2], u), v);
            const hv = this._h(handle);
            const r = (4.5 + hv * 1.5) * k * (u === 0.5 || v === 0.5 ? 0.85 : 1);
            const active = this.state.active.value === handle;

            g.save()
                .translateTransform(hp.x, hp.y)
                .rotateTransform(this._axis)
                .roundRect(-r, -r, r * 2, r * 2, 1.5)
                .fill(active ? t.active : t.handle)
                .stroke({ width: 1.5, color: t.accent })
                .restore();
        }
    }
}

/** Keeps a scale from collapsing to zero, on the side of `like`. */
function keepAway(v: number, like: number): number {
    const sign = Math.sign(v) || Math.sign(like) || 1;

    return Math.max(Math.abs(v), 0.01) * sign;
}

function cursorFor(h: GizmoHandle | null): string {
    if (!h) return 'default';
    if (h === 'rotate' || h === 'box-rotate') return 'grab';
    if (h.startsWith('move') || h === 'box-move') return 'move';
    if (h === 'box-n' || h === 'box-s' || h === 'scale-y') return 'ns-resize';
    if (h === 'box-e' || h === 'box-w' || h === 'scale-x') return 'ew-resize';
    if (h === 'box-ne' || h === 'box-sw') return 'nesw-resize';
    if (h === 'box-nw' || h === 'box-se') return 'nwse-resize';

    return 'pointer';
}
