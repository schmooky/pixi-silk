import { Container, type FederatedPointerEvent, type PointData, type Ticker } from 'pixi.js';
import type { Command, HistoryLike } from '../history';
import { damp, Spring } from '../motion';
import {
    type BezierPath,
    type Cubic,
    clonePath,
    cubicPoint,
    drawPath,
    type HandleSide,
    insertAnchor,
    mapPath,
    moveAnchors,
    nearestOnCubic,
    removeAnchors,
    reversePath,
    segmentAt,
    segmentCount,
    setHandle,
    toggleAnchorType,
    type Vec,
} from '../path';
import { SilkGraphics } from '../SilkGraphics';
import { batch, type ReadSignal, type Signal, signal } from '../signal';
import { Driver } from './driver';
import { type InputKind, type InputProfiles, inputKind, inputProfile } from './input';
import { altDown, isTypingTarget, shiftDown } from './keys';
import { hex, mix } from './paint';

// ------------------------------------------------------------------------------------- pen tool

/**
 * Where the pen tool is.
 * - `idle`: not drawing. The next click starts or continues the path.
 * - `drawing`: the next click adds an anchor.
 * - `dragging`: the button is down on the newly placed anchor, and the drag pulls out its handles.
 * - `closing`: the click closed the path, and the drag shapes the first anchor.
 */
export type PenPhase = 'idle' | 'drawing' | 'dragging' | 'closing';

/** What the pointer is on and which modifiers are down, for {@link PenTool}. */
export interface PenInput {
    /** The press landed on the path's first or last anchor. */
    on?: 'first' | 'last' | null;
    /** Alt: the drag moves only the outgoing handle. */
    alt?: boolean;
    /** Shift: handles and new anchors keep to 45 degree steps. */
    shift?: boolean;
}

/** Options of {@link PenTool}. */
export interface PenToolOptions {
    /** How far a press must move, in path units, before it pulls out handles. Default 2. */
    slop?: number;
}

const snap45 = (d: Vec): Vec => {
    const l = Math.hypot(d.x, d.y);
    const a = Math.round(Math.atan2(d.y, d.x) / (Math.PI / 4)) * (Math.PI / 4);

    return { x: Math.cos(a) * l, y: Math.sin(a) * l };
};

/**
 * The pen tool's state machine, without pointer events or drawing: feed it presses, moves and
 * releases in path coordinates and read the path back. A click adds a corner. A drag pulls out
 * mirrored handles, and Alt moves only the outgoing one. A click on the first anchor closes the
 * path, and a click on the last one drops its outgoing handle. {@link PathGizmo} drives one.
 */
export class PenTool {
    /** How far a press must move, in path units, before it pulls out handles. */
    slop: number;
    private _path: BezierPath;
    private _phase: PenPhase = 'idle';
    private _index = -1;
    private _outOnly = false;
    private _shaping = false;
    private _cursor: Vec | null = null;

    constructor(path: BezierPath = { anchors: [], closed: false }, options: PenToolOptions = {}) {
        this._path = clonePath(path);
        this.slop = options.slop ?? 2;
    }

    /** The path as drawn so far. */
    get path(): BezierPath {
        return this._path;
    }

    /** Where the tool is. */
    get phase(): PenPhase {
        return this._phase;
    }

    /** The last pointer position, for the rubber band. */
    get cursor(): Vec | null {
        return this._cursor;
    }

    /** The segment the next click would add, from the last anchor to the cursor, or null. */
    get preview(): Cubic | null {
        const anchors = this._path.anchors;
        const a = anchors[anchors.length - 1];
        const c = this._cursor;

        if (this._phase !== 'drawing' || !a || !c || this._path.closed) return null;
        const o = a.out ?? { x: 0, y: 0 };

        return [{ x: a.x, y: a.y }, { x: a.x + o.x, y: a.y + o.y }, { ...c }, { ...c }];
    }

    /** Starts from `path` (a closed one leaves nothing to draw) and stops drawing. */
    load(path: BezierPath): void {
        this._path = clonePath(path);
        this._phase = 'idle';
        this._index = -1;
    }

    /** A press at `p`. Returns the label of what it changed, or null when it changed nothing. */
    down(p: Vec, input: PenInput = {}): string | null {
        const path = this._path;
        const n = path.anchors.length;

        this._cursor = { x: p.x, y: p.y };
        if (path.closed || this._phase === 'dragging' || this._phase === 'closing') return null;
        this._shaping = false;
        if (this._phase === 'idle' && n > 0 && input.on) {
            // pick up an open path again from either end
            if (input.on === 'first' && n > 1) this._path = reversePath(path);
            this._phase = 'drawing';

            return null;
        }
        if (input.on === 'first' && n > 1) {
            this._path = { anchors: path.anchors.map((a) => ({ ...a })), closed: true };
            this._index = 0;
            this._outOnly = false;
            this._phase = 'closing';

            return 'Close path';
        }
        if (input.on === 'last' && n > 0) {
            // a click on the newest anchor makes it a cusp: drag for a new outgoing handle
            const out = clonePath(path);
            const last = out.anchors[n - 1];

            delete last.out;
            last.type = 'corner';
            this._path = out;
            this._index = n - 1;
            this._outOnly = true;
            this._phase = 'dragging';

            return 'Edit point';
        }
        let at = { x: p.x, y: p.y };
        const prev = path.anchors[n - 1];

        if (input.shift && prev) {
            const d = snap45({ x: p.x - prev.x, y: p.y - prev.y });

            at = { x: prev.x + d.x, y: prev.y + d.y };
        }
        this._path = { anchors: [...path.anchors, { x: at.x, y: at.y, type: 'corner' }], closed: false };
        this._index = n;
        this._outOnly = false;
        this._phase = 'dragging';

        return 'Add point';
    }

    /** A move to `p`. Returns true when it changed the path. */
    move(p: Vec, input: PenInput = {}): boolean {
        this._cursor = { x: p.x, y: p.y };
        if (this._phase !== 'dragging' && this._phase !== 'closing') return false;
        const out = clonePath(this._path);
        const a = out.anchors[this._index];

        if (!a) return false;
        let d = { x: p.x - a.x, y: p.y - a.y };

        if (!this._shaping && Math.hypot(d.x, d.y) < this.slop) return false;
        this._shaping = true;
        if (input.shift) d = snap45(d);
        if (Math.hypot(d.x, d.y) < 1e-9) {
            delete a.out;
            if (!this._outOnly && !input.alt) delete a.in;
        } else if (this._outOnly || input.alt) {
            a.out = d;
            a.type = 'corner';
        } else {
            a.out = d;
            a.in = { x: -d.x || 0, y: -d.y || 0 };
            a.type = 'mirrored';
        }
        this._path = out;

        return true;
    }

    /** The release. Ends a handle drag. The tool keeps drawing until {@link PenTool.finish} or a close. */
    up(): void {
        if (this._phase === 'dragging') this._phase = 'drawing';
        else if (this._phase === 'closing') this._phase = 'idle';
        this._shaping = false;
    }

    /** Stops drawing and leaves the path open. Returns false when it was not drawing. */
    finish(): boolean {
        if (this._phase === 'idle') return false;
        this.up();
        this._phase = 'idle';

        return true;
    }
}

// ------------------------------------------------------------------------------------ the gizmo

/** The two modes of a {@link PathGizmo}. */
export type PathTool = 'edit' | 'pen';

/**
 * A part of the path under the pointer. `index` is an anchor index. A segment hit has the curve
 * parameter `t` (0 to 1) and the nearest point (`x`, `y`) in path coordinates.
 */
export type PathHit =
    | { kind: 'anchor'; index: number }
    | { kind: 'handle'; index: number; side: HandleSide }
    | { kind: 'segment'; segment: number; t: number; x: number; y: number };

/** What is being snapped, as the `snap` option gets it. */
export interface PathSnapInfo {
    /** What moves: an anchor drag, a handle drag or a pen click or drag. */
    kind: 'anchor' | 'handle' | 'pen';
    /** Index of the anchor dragged, or of the handle's anchor. */
    index: number;
    /** Which handle, for `kind: 'handle'`. */
    side?: HandleSide;
}

/** Colours of a {@link PathGizmo} (any Pixi colour). */
export interface PathGizmoTheme {
    /** Path outline, selected anchors and highlights. */
    accent: number | string;
    /** Fill of unselected anchors and handle dots. */
    anchor: number | string;
    /** Handle lines. */
    handle: number | string;
}

/** Default theme: a blue outline with white anchors. Override single colours with the `theme` option. */
export const PATH_GIZMO_THEME: Readonly<PathGizmoTheme> = {
    accent: 0x0a84ff,
    anchor: 0xffffff,
    handle: 0x0a84ff,
};

/** The signals of a {@link PathGizmo}. */
export interface PathGizmoState {
    /** The path being edited. Set it to load another one. */
    path: Signal<BezierPath>;
    /** Indices of the selected anchors. */
    selected: Signal<readonly number[]>;
    /** What the pointer is over. */
    hover: ReadSignal<PathHit | null>;
    /** `edit` moves anchors and handles, `pen` adds anchors. */
    tool: Signal<PathTool>;
    /** True while a press is being dragged. */
    dragging: ReadSignal<boolean>;
}

/** Options of {@link PathGizmo}. */
export interface PathGizmoOptions {
    /** The path to edit. Default empty, ready for the pen. */
    path?: BezierPath;
    /** The space the path's coordinates are in, such as a camera's world. Default the gizmo's parent. */
    space?: Container;
    /** Starting tool. Default `edit`. */
    tool?: PathTool;
    /** Records every edit as one undoable step. Any {@link HistoryLike} works, such as `History`. */
    history?: HistoryLike;
    /** Moves a dragged point, in path coordinates, such as onto a grid or a `SnapEngine` point. */
    snap?: (p: Vec, info: PathSnapInfo) => Vec;
    /**
     * Delete, Backspace, Escape, Enter and the arrow keys, read on `window` while the gizmo is on stage
     * and visible. Keys aimed at a text field are left alone. Default true.
     */
    keys?: boolean;
    /** Draw the path's outline. Default true. */
    outline?: boolean;
    /** Colours that replace parts of {@link PATH_GIZMO_THEME}. */
    theme?: Partial<PathGizmoTheme>;
    /** Per pointer kind overrides of hit sizes and the drag threshold. Touch gets larger targets. */
    profiles?: InputProfiles;
    /** Ticker driving the animation. Default `Ticker.shared`. `null` for manual {@link PathGizmo.tick}. */
    ticker?: Ticker | null;
    /** Called on every change of the path, drags included. */
    onChange?: (path: BezierPath) => void;
    /** Called once per finished edit, with its label. */
    onCommit?: (path: BezierPath, label: string) => void;
}

type Drag =
    | {
          kind: 'anchors';
          id: number;
          p0: Vec;
          s0: Vec;
          base: BezierPath;
          indices: number[];
          lead: number;
          moved: boolean;
          /** A plain press on an anchor: with a quick second one it is a double-click. */
          click?: boolean;
      }
    | { kind: 'handle'; id: number; index: number; side: HandleSide; broken: boolean }
    | { kind: 'pen'; id: number };

interface Affine {
    a: number;
    b: number;
    c: number;
    d: number;
    tx: number;
    ty: number;
}

const sameAffine = (p: Affine, q: Affine | null) =>
    !!q && p.a === q.a && p.b === q.b && p.c === q.c && p.d === q.d && p.tx === q.tx && p.ty === q.ty;
const NUDGE_MS = 800;

/**
 * Edits a cubic bezier path: anchors, handles and segments, plus a pen tool that adds anchors.
 *
 * - Click an anchor to select it, Shift + click to add or remove it, drag to move the selection.
 * - Drag a handle to bend a curve. Alt + drag breaks the symmetry. Double-click an anchor to
 *   switch it between a corner and a smooth point.
 * - Click a segment to add an anchor there. The curve keeps its shape.
 * - Delete or Backspace removes the selected anchors. Arrow keys nudge them.
 * - The `pen` tool adds anchors: click for corners, drag for curves, click the first anchor to
 *   close. Escape or Enter stops.
 *
 * Put the gizmo in a screen-space overlay. With `space` set to a camera's world it follows pans and
 * zooms, and anchors and handles keep their size on screen. Every edit is one undoable step when
 * a `history` is given. The gizmo edits one path at a time and does not draw its fill or stroke:
 * draw the path yourself from `state.path`.
 *
 * Experimental: the API may change in a minor release.
 *
 * @experimental
 */
export class PathGizmo extends Container {
    /** Path, selection, hover, tool and drag flag. Set `path` or `tool` to change them. */
    readonly state: PathGizmoState;
    /** The pen's state machine. */
    readonly pen: PenTool;
    /** Moves dragged points. Change it at any time. */
    snap: ((p: Vec, info: PathSnapInfo) => Vec) | undefined;

    private readonly _g = new SilkGraphics();
    private readonly _opts: PathGizmoOptions;
    private readonly _driver: Driver;
    private readonly _theme: Record<keyof PathGizmoTheme, number>;
    private readonly _hover: Signal<PathHit | null> = signal<PathHit | null>(null, sameHit);
    private readonly _dragging = signal(false);
    private _grow: Spring[] = [];
    private _sel: number[] = [];
    private _fade: [number, number][] = [];
    private _drag: Drag | null = null;
    private _before: { path: BezierPath; selected: readonly number[]; label: string } | null = null;
    private _kind: InputKind = 'mouse';
    private _last: Affine | null = null;
    private _dirty = true;
    private _click: { index: number; at: number } | null = null;
    private _penWrite = false;
    private readonly _offKeys: () => void;

    constructor(options: PathGizmoOptions = {}) {
        super({ label: 'PathGizmo' });
        this._opts = options;
        this.snap = options.snap;
        this._theme = Object.fromEntries(
            Object.entries({ ...PATH_GIZMO_THEME, ...options.theme }).map(([k, v]) => [k, hex(v)]),
        ) as Record<keyof PathGizmoTheme, number>;
        const path = clonePath(options.path ?? { anchors: [], closed: false });

        this.pen = new PenTool(path);
        this.state = {
            path: signal(path),
            selected: signal<readonly number[]>([]),
            hover: this._hover,
            tool: signal<PathTool>(options.tool ?? 'edit'),
            dragging: this._dragging,
        };
        this.addChild(this._g);
        this._driver = new Driver((dt) => this._step(dt), options.ticker);
        this.eventMode = 'static';
        // the pen draws anywhere. In edit mode only the path's parts catch the pointer
        this.hitArea = { contains: (x: number, y: number) => this._wantsAll() || this.pick(x, y) !== null };
        this.on('pointerdown', this._onDown, this);
        this.on('globalpointermove', this._onMove, this);
        this.on('pointerup', this._onUp, this);
        this.on('pointerupoutside', this._onUp, this);
        this.on('pointerout', () => {
            if (!this._drag) this._hover.set(null);
        });
        const wake = () => {
            this._dirty = true;
            this._driver.wake();
        };

        this.state.path.subscribe((p) => {
            // a path set from outside restarts the pen on it
            if (!this._penWrite) this.pen.load(p);
            this._opts.onChange?.(p);
            wake();
        });
        this.state.selected.subscribe(wake);
        this._hover.subscribe(wake);
        this.state.tool.subscribe((tool) => {
            if (tool !== 'pen') this.pen.finish();
            this.cursor = tool === 'pen' ? 'crosshair' : 'default';
            wake();
        });
        this.cursor = this.state.tool.value === 'pen' ? 'crosshair' : 'default';
        this._offKeys = options.keys === false ? () => {} : this._bindKeys();
        this.on('added', wake);
        wake();
    }

    /** The path being edited, the same object as `state.path.value`. Treat it as read only. */
    get path(): BezierPath {
        return this.state.path.value;
    }

    /** Selected anchor indices. */
    get selected(): readonly number[] {
        return this.state.selected.value;
    }

    /** Advances the animation by `dt` seconds (only needed with `ticker: null`). Returns true while moving. */
    tick(dt: number): boolean {
        return this._driver.tick(dt);
    }

    /** Selects anchors: `replace` (default), `add`, `remove` or `toggle`. */
    select(indices: readonly number[], mode: 'replace' | 'add' | 'remove' | 'toggle' = 'replace'): void {
        const n = this.path.anchors.length;
        const valid = indices.filter((i) => i >= 0 && i < n);
        const cur = this.selected;
        let next: number[];

        if (mode === 'replace') next = [...new Set(valid)];
        else if (mode === 'add') next = [...new Set([...cur, ...valid])];
        else if (mode === 'remove') next = cur.filter((i) => !valid.includes(i));
        else next = [...cur.filter((i) => !valid.includes(i)), ...valid.filter((i) => !cur.includes(i))];
        if (next.length === cur.length && next.every((v, i) => v === cur[i])) return;
        this.state.selected.set(next);
    }

    /** Selects the anchors inside a rectangle in path coordinates: the hook for a marquee. */
    selectInRect(
        rect: { x: number; y: number; width: number; height: number },
        mode: 'replace' | 'add' | 'remove' | 'toggle' = 'replace',
    ): void {
        const x0 = Math.min(rect.x, rect.x + rect.width);
        const x1 = Math.max(rect.x, rect.x + rect.width);
        const y0 = Math.min(rect.y, rect.y + rect.height);
        const y1 = Math.max(rect.y, rect.y + rect.height);
        const hits: number[] = [];

        this.path.anchors.forEach((a, i) => {
            if (a.x >= x0 && a.x <= x1 && a.y >= y0 && a.y <= y1) hits.push(i);
        });
        this.select(hits, mode);
    }

    /**
     * Applies an edit as one undoable step labelled `label`. `fn` gets the path and returns a new
     * one, without mutating it. `selected` replaces the selection, if given.
     */
    edit(label: string, fn: (path: BezierPath) => BezierPath, selected?: readonly number[]): void {
        const before = { path: this.path, selected: this.selected, label };
        const next = fn(this.path);

        batch(() => {
            this._setPath(next);
            if (selected) this.state.selected.set(selected);
        });
        this._commit(before);
    }

    /** Removes the selected anchors as one undoable step. No-op when nothing is selected. */
    deleteSelected(): void {
        if (!this.selected.length) return;
        const drop = this.selected;

        this.edit(drop.length > 1 ? 'Delete points' : 'Delete point', (p) => removeAnchors(p, drop), []);
    }

    /** Adds an anchor on segment `segment` at `t` (0 to 1) without changing the shape, selects it and returns its index. */
    insertAt(segment: number, t: number): number {
        const { path, index } = insertAnchor(this.path, segment, t);

        this.edit('Add point', () => path, [index]);

        return index;
    }

    /** Switches anchor `index` between a corner and a smooth point. */
    toggleType(index: number): void {
        this.edit('Change point type', (p) => toggleAnchorType(p, index));
    }

    /** Closes or opens the path. Closing needs at least two anchors. */
    setClosed(closed: boolean): void {
        if (this.path.closed === closed || (closed && this.path.anchors.length < 2)) return;
        this.edit(closed ? 'Close path' : 'Open path', (p) => ({ ...clonePath(p), closed }));
    }

    /** Stops the pen and leaves the path open. */
    finish(): void {
        if (this.pen.finish()) this._dirty = true;
        this._driver.wake();
    }

    /** What is under a point of the gizmo's own space, or null. Handles win over anchors, anchors over segments. */
    pick(x: number, y: number): PathHit | null {
        const path = this.path;
        const m = this._affine();
        const r = this._radius();
        const map = (p: Vec) => apply(m, p);
        const near = (p: Vec, k = 1) => Math.hypot(p.x - x, p.y - y) <= r * k;

        // handles first: they are small and sit on top
        for (let i = path.anchors.length - 1; i >= 0; i--) {
            const a = path.anchors[i];

            for (const side of ['out', 'in'] as const) {
                const h = a[side];

                if (!h || !this._handleShown(i, side)) continue;
                if (near(map({ x: a.x + h.x, y: a.y + h.y }))) return { kind: 'handle', index: i, side };
            }
        }
        for (let i = path.anchors.length - 1; i >= 0; i--)
            if (near(map(path.anchors[i]))) return { kind: 'anchor', index: i };
        if (this.state.tool.value === 'pen' && !path.closed) return null;
        let best: PathHit | null = null;
        let bestD = r;

        for (let i = 0; i < segmentCount(path); i++) {
            const c = segmentAt(path, i).map(map) as Cubic;
            const hit = nearestOnCubic(c, { x, y });

            if (hit.distance <= bestD) {
                const q = cubicPoint(segmentAt(path, i), hit.t);

                bestD = hit.distance;
                best = { kind: 'segment', segment: i, t: hit.t, x: q.x, y: q.y };
            }
        }

        return best;
    }

    /** Stops the animation and the key listener. */
    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        this._driver.sleep();
        this._offKeys();
        super.destroy(options);
    }

    // ---------------------------------------------------------------------------------- input

    /** The space the path lives in. */
    private get _space(): Container {
        return this._opts.space ?? this.parent ?? this;
    }

    private _wantsAll(): boolean {
        return this.state.tool.value === 'pen' && !this.path.closed;
    }

    /** Pointer position in path coordinates. */
    private _p(e: { global: PointData }): Vec {
        const space = this._space;
        const p = space === this ? this.toLocal(e.global) : space.toLocal(e.global);

        return { x: p.x, y: p.y };
    }

    private _snap(p: Vec, info: PathSnapInfo): Vec {
        return this.snap ? this.snap(p, info) : p;
    }

    private _setPath(path: BezierPath): void {
        this.state.path.set(path);
    }

    private _start(label: string): void {
        this._before = { path: this.path, selected: this.selected, label };
    }

    private _commit(before: { path: BezierPath; selected: readonly number[]; label: string } | null): void {
        if (!before || before.path === this.path) return;
        const after = { path: this.path, selected: this.selected };
        const restore = (s: { path: BezierPath; selected: readonly number[] }) =>
            batch(() => {
                this._setPath(s.path);
                this.state.selected.set(s.selected);
            });

        this._opts.history?.record({
            label: before.label,
            do: () => restore(after),
            undo: () => restore(before),
        });
        this._opts.onCommit?.(after.path, before.label);
    }

    private _onDown(e: FederatedPointerEvent): void {
        if (this._drag) return;
        this._kind = inputKind(e);
        const local = this.toLocal(e.global);
        const hit = this.pick(local.x, local.y);
        const p = this._p(e);
        const shift = e.shiftKey || shiftDown();
        const alt = e.altKey || altDown();

        if (this.state.tool.value === 'pen' && !this.path.closed) {
            const n = this.path.anchors.length;
            const on =
                hit?.kind === 'anchor' && hit.index === 0 && n > 1
                    ? 'first'
                    : hit?.kind === 'anchor' && hit.index === n - 1
                      ? 'last'
                      : null;
            const before = { path: this.path, selected: this.selected, label: '' };
            const at = on ? p : this._snap(p, { kind: 'pen', index: n });
            const label = this.pen.down(at, { on, alt, shift });

            if (label) {
                before.label = label;
                this._before = before;
                this._writePen();
                const idx = label === 'Close path' ? 0 : this.pen.path.anchors.length - 1;

                this.state.selected.set([idx]);
            }
            this._drag = { kind: 'pen', id: e.pointerId };
            this._dragging.set(true);
            e.stopPropagation();
            this._driver.wake();

            return;
        }
        if (!hit) {
            if (!shift) this.select([]);

            return;
        }
        e.stopPropagation();
        if (hit.kind === 'handle') {
            this._start('Edit curve');
            this._drag = { kind: 'handle', id: e.pointerId, index: hit.index, side: hit.side, broken: alt };
        } else if (hit.kind === 'segment') {
            const { path, index } = insertAnchor(this.path, hit.segment, hit.t);

            this._start('Add point');
            batch(() => {
                this._setPath(path);
                this.state.selected.set([index]);
            });
            this._drag = this._anchorDrag(e, index, [index]);
        } else {
            const index = hit.index;
            const now = performance.now();
            const twice = this._click && this._click.index === index && now - this._click.at < 320;

            if (twice && !shift) {
                this._click = null;
                this.toggleType(index);

                return;
            }
            if (shift) {
                this.select([index], 'toggle');
                if (!this.selected.includes(index)) return;
            } else if (!this.selected.includes(index)) this.select([index]);
            this._start(this.selected.length > 1 ? 'Move points' : 'Move point');
            this._drag = this._anchorDrag(e, index, [...this.selected]);
            this._drag.click = !shift;
        }
        this._hover.set(hit.kind === 'segment' ? { kind: 'anchor', index: this.selected[0] } : hit);
        this._dragging.set(true);
        this._driver.wake();
    }

    private _anchorDrag(e: FederatedPointerEvent, lead: number, indices: number[]): Extract<Drag, { kind: 'anchors' }> {
        const local = this.toLocal(e.global);

        return {
            kind: 'anchors',
            id: e.pointerId,
            p0: this._p(e),
            s0: { x: local.x, y: local.y },
            base: this.path,
            indices,
            lead,
            moved: false,
        };
    }

    private _onMove(e: FederatedPointerEvent): void {
        const drag = this._drag;
        const p = this._p(e);
        const shift = e.shiftKey || shiftDown();
        const alt = e.altKey || altDown();

        if (!drag) {
            if (inputKind(e) === 'touch') return;
            this._kind = inputKind(e);
            const local = this.toLocal(e.global);
            const hit = this.pick(local.x, local.y);

            this._hover.set(hit);
            if (this.state.tool.value === 'pen' && !this.path.closed) {
                this.pen.move(this._snap(p, { kind: 'pen', index: this.path.anchors.length }), { shift });
                this._dirty = true;
            } else this.cursor = hit ? 'pointer' : 'default';
            this._driver.wake();

            return;
        }
        if (e.pointerId !== drag.id) return;
        if (drag.kind === 'pen') {
            if (this.pen.move(p, { alt, shift })) this._writePen();
        } else if (drag.kind === 'handle') {
            const a = this.path.anchors[drag.index];

            if (!a) return;
            let d = { x: p.x - a.x, y: p.y - a.y };

            if (shift) d = snap45(d);
            const end = this._snap(
                { x: a.x + d.x, y: a.y + d.y },
                { kind: 'handle', index: drag.index, side: drag.side },
            );

            drag.broken ||= alt;
            this._setPath(setHandle(this.path, drag.index, drag.side, { x: end.x - a.x, y: end.y - a.y }, drag.broken));
        } else {
            const local = this.toLocal(e.global);
            const slop = inputProfile(this._kind, this._opts.profiles).slop;

            if (!drag.moved && Math.hypot(local.x - drag.s0.x, local.y - drag.s0.y) < slop) return;
            drag.moved = true;
            let dx = p.x - drag.p0.x;
            let dy = p.y - drag.p0.y;

            if (shift) {
                if (Math.abs(dx) > Math.abs(dy)) dy = 0;
                else dx = 0;
            }
            const lead = drag.base.anchors[drag.lead];

            if (lead) {
                const to = this._snap({ x: lead.x + dx, y: lead.y + dy }, { kind: 'anchor', index: drag.lead });

                dx = to.x - lead.x;
                dy = to.y - lead.y;
            }
            this._setPath(moveAnchors(drag.base, drag.indices, dx, dy));
        }
        this._driver.wake();
    }

    private _onUp(e: FederatedPointerEvent): void {
        const drag = this._drag;

        if (!drag || e.pointerId !== drag.id) return;
        this._drag = null;
        if (drag.kind === 'pen') this.pen.up();
        this._click =
            drag.kind === 'anchors' && drag.click && !drag.moved ? { index: drag.lead, at: performance.now() } : null;
        // a plain click on one of several selected anchors selects only that one
        if (drag.kind === 'anchors' && !drag.moved && drag.indices.length > 1 && !(e.shiftKey || shiftDown()))
            this.select([drag.lead]);
        this._dragging.set(false);
        const before = this._before;

        this._before = null;
        this._commit(before);
        if (drag.kind === 'pen' && this.pen.phase === 'idle' && this.path.closed) this.state.tool.set('edit');
        this._dirty = true;
        this._driver.wake();
    }

    /** Copies the pen's path into the state without restarting the pen. */
    private _writePen(): void {
        this._penWrite = true;
        try {
            this._setPath(this.pen.path);
        } finally {
            this._penWrite = false;
        }
    }

    private _bindKeys(): () => void {
        if (typeof window === 'undefined') return () => {};
        const onKey = (e: KeyboardEvent) => {
            if (e.defaultPrevented || !this.parent || !this.visible || isTypingTarget(e.target)) return;
            if (e.metaKey || e.ctrlKey) return;
            const pen = this.state.tool.value === 'pen';

            if (e.key === 'Escape' || e.key === 'Enter') {
                if (pen && this.pen.phase !== 'idle') this.finish();
                else if (e.key === 'Escape' && this.selected.length) this.select([]);
                else return;
                e.preventDefault();

                return;
            }
            if ((e.key === 'Delete' || e.key === 'Backspace') && this.selected.length && !this._drag) {
                e.preventDefault();
                this.deleteSelected();

                return;
            }
            const arrows: Record<string, [number, number]> = {
                ArrowLeft: [-1, 0],
                ArrowRight: [1, 0],
                ArrowUp: [0, -1],
                ArrowDown: [0, 1],
            };
            const dir = arrows[e.key];

            if (!dir || !this.selected.length || this._drag) return;
            e.preventDefault();
            this.nudge(dir[0] * (e.shiftKey ? 10 : 1), dir[1] * (e.shiftKey ? 10 : 1));
        };

        window.addEventListener('keydown', onKey);

        return () => window.removeEventListener('keydown', onKey);
    }

    /** Moves the selected anchors by (dx, dy). Quick repeats merge into one undo step. */
    nudge(dx: number, dy: number): void {
        const indices = [...this.selected];

        if (!indices.length) return;
        const from = this.path;

        this._setPath(moveAnchors(from, indices, dx, dy));
        const sel = this.selected;
        const restore = (path: BezierPath) =>
            batch(() => {
                this._setPath(path);
                this.state.selected.set(sel);
            });
        const command: Nudge = {
            label: 'Nudge',
            first: from,
            last: this.path,
            at: performance.now(),
            do: () => restore(command.last),
            undo: () => restore(command.first),
            // a nudge right after the last one, from where it left off, joins its step
            merge: (next: Command) => {
                const n = next as Partial<Nudge>;

                if (n.first !== command.last || !n.last || (n.at ?? 0) - command.at > NUDGE_MS) return false;
                command.last = n.last;
                command.at = n.at ?? command.at;

                return true;
            },
        };

        this._opts.history?.record(command);
        this._opts.onCommit?.(this.path, 'Nudge');
    }

    // -------------------------------------------------------------------------------- drawing

    private _radius(): number {
        const k = inputProfile(this._kind, this._opts.profiles).scale;

        return (this._kind === 'touch' ? 14 : 7) * k;
    }

    /** Path coordinates to the gizmo's own, as an affine map (exact for curves). */
    private _affine(): Affine {
        const space = this._space;

        if (space === this) return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
        const o = this.toLocal(space.toGlobal({ x: 0, y: 0 }));
        const ex = this.toLocal(space.toGlobal({ x: 1, y: 0 }));
        const ey = this.toLocal(space.toGlobal({ x: 0, y: 1 }));

        return { a: ex.x - o.x, b: ex.y - o.y, c: ey.x - o.x, d: ey.y - o.y, tx: o.x, ty: o.y };
    }

    /** True when handle `side` of anchor `i` shows: on selected anchors and next to them. */
    private _handleShown(i: number, side: HandleSide): boolean {
        const f = this._fade[i];

        return !!f && f[side === 'in' ? 0 : 1] > 0.5;
    }

    private _handleTarget(i: number, side: HandleSide): number {
        const path = this.path;
        const n = path.anchors.length;
        const sel = this.selected;
        const pen = this.state.tool.value === 'pen' && !path.closed;

        if (sel.includes(i)) return 1;
        if (pen && i === n - 1) return 1;
        // the facing handle of a neighbour shapes the same segment
        const prev = i > 0 || path.closed ? (i - 1 + n) % n : -1;
        const next = i < n - 1 || path.closed ? (i + 1) % n : -1;

        if (side === 'in' && prev >= 0 && sel.includes(prev)) return 1;
        if (side === 'out' && next >= 0 && sel.includes(next)) return 1;

        return 0;
    }

    private _step(dt: number): boolean {
        const path = this.path;
        const n = path.anchors.length;
        let moving = false;

        while (this._grow.length < n) this._grow.push(new Spring(0.4, 520, 20));
        this._grow.length = n;
        while (this._sel.length < n) this._sel.push(0);
        this._sel.length = n;
        while (this._fade.length < n) this._fade.push([0, 0]);
        this._fade.length = n;
        const hover = this._hover.value;
        const active = this._drag?.kind === 'anchors' ? this._drag.indices : [];

        for (let i = 0; i < n; i++) {
            const sp = this._grow[i];
            const over = hover?.kind === 'anchor' && hover.index === i;

            sp.target = active.includes(i) && this._dragging.value ? 1.2 : over ? 1.35 : 1;
            sp.step(dt);
            if (Math.abs(sp.value - sp.target) > 0.002 || Math.abs(sp.velocity) > 0.01) moving = true;
            const want = this.selected.includes(i) ? 1 : 0;
            const s = damp(this._sel[i], want, 18, dt);

            this._sel[i] = Math.abs(s - want) < 0.003 ? want : s;
            if (this._sel[i] !== want) moving = true;
            for (const k of [0, 1] as const) {
                const t = this._handleTarget(i, k === 0 ? 'in' : 'out');
                const v = damp(this._fade[i][k], t, 16, dt);

                this._fade[i][k] = Math.abs(v - t) < 0.003 ? t : v;
                if (this._fade[i][k] !== t) moving = true;
            }
        }
        const m = this._affine();

        if (moving || this._dirty || !sameAffine(m, this._last)) {
            this._last = m;
            this._dirty = false;
            this._render(m);
        }

        // keep watching the camera while shown
        return this.visible && !this.destroyed && !!this.parent;
    }

    private _render(m: Affine): void {
        const g = this._g;
        const th = this._theme;
        const path = this.path;
        const shown = mapPath(path, (p) => apply(m, p));
        const hover = this._hover.value;
        const pen = this.state.tool.value === 'pen';
        const k = inputProfile(this._kind, this._opts.profiles).scale;

        g.clear();
        if (this._opts.outline !== false && segmentCount(shown) > 0)
            drawPath(g, shown).stroke({ width: 1.5, color: th.accent, alpha: 0.9 });
        if (hover?.kind === 'segment' && !this._drag) {
            const [p0, c1, c2, p3] = segmentAt(shown, hover.segment);
            const q = apply(m, hover);

            g.moveTo(p0.x, p0.y)
                .bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p3.x, p3.y)
                .stroke({ width: 3, color: th.accent });
            g.circle(q.x, q.y, 3.5 * k)
                .fill(th.anchor)
                .stroke({ width: 1.5, color: th.accent });
        }
        const preview = pen ? this.pen.preview : null;

        if (preview) {
            const [p0, c1, c2, p3] = preview.map((p) => apply(m, p));

            g.moveTo(p0.x, p0.y)
                .bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p3.x, p3.y)
                .stroke({ width: 1.5, color: th.accent, alpha: 0.6, dash: [4, 4] });
        }
        // handles under the anchors
        shown.anchors.forEach((a, i) => {
            for (const [k2, side] of [
                [0, 'in'],
                [1, 'out'],
            ] as const) {
                const h = a[side];
                const f = this._fade[i]?.[k2] ?? 0;

                if (!h || f < 0.01) continue;
                const ex = a.x + h.x * f;
                const ey = a.y + h.y * f;
                const over = hover?.kind === 'handle' && hover.index === i && hover.side === side;

                g.moveTo(a.x, a.y)
                    .lineTo(ex, ey)
                    .stroke({ width: 1, color: th.handle, alpha: 0.85 * f });
                g.circle(ex, ey, (over ? 4.5 : 3.5) * k * f)
                    .fill({ color: over ? th.accent : th.anchor, alpha: f })
                    .stroke({ width: 1.25, color: th.accent, alpha: f });
            }
        });
        const n = shown.anchors.length;

        shown.anchors.forEach((a, i) => {
            const grow = this._grow[i]?.value ?? 1;
            const sel = this._sel[i] ?? 0;
            const fill = mix(th.anchor, th.accent, sel);
            const edge = mix(th.accent, th.anchor, sel);
            const corner = path.anchors[i].type === 'corner';

            if (pen && !path.closed && i === 0 && n > 1 && hover?.kind === 'anchor' && hover.index === 0)
                g.circle(a.x, a.y, 9 * k).stroke({ width: 1.5, color: th.accent, alpha: 0.8 });
            if (corner) {
                const s = 7 * k * grow;

                g.roundRect(a.x - s / 2, a.y - s / 2, s, s, 1.5)
                    .fill(fill)
                    .stroke({ width: 1.5, color: edge });
            } else
                g.circle(a.x, a.y, 4 * k * grow)
                    .fill(fill)
                    .stroke({ width: 1.5, color: edge });
        });
    }
}

const apply = (m: Affine, p: Vec): Vec => ({ x: m.a * p.x + m.c * p.y + m.tx, y: m.b * p.x + m.d * p.y + m.ty });

interface Nudge extends Command {
    first: BezierPath;
    last: BezierPath;
    at: number;
}

function sameHit(a: PathHit | null, b: PathHit | null): boolean {
    if (a === b) return true;
    if (!a || !b || a.kind !== b.kind) return false;
    if (a.kind === 'segment' && b.kind === 'segment') return a.segment === b.segment && Math.abs(a.t - b.t) < 1e-4;
    if (a.kind === 'handle' && b.kind === 'handle') return a.index === b.index && a.side === b.side;

    return (a as { index: number }).index === (b as { index: number }).index;
}
