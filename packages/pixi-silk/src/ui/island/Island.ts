import { type ColorSource, Container, type FederatedPointerEvent, Rectangle, type Ticker } from 'pixi.js';
import { Spring } from '../../motion';
import { SilkGraphics } from '../../SilkGraphics';
import { type Signal, signal } from '../../signal';
import { rubberBand } from '../arc';
import { Driver } from '../driver';
import { type GesturePoint, trackGesture } from '../gesture';
import { clamp01, hex } from '../paint';
import {
    drawIslandShape,
    edgeInsets,
    edgeRect,
    edgeSpan,
    followViewport,
    type IslandEdge,
    type IslandInsets,
    type IslandRect,
    type IslandShape,
    type IslandViewport,
    islandShape,
    readViewport,
} from './geometry';
import { IslandStack } from './stack';

/** Size of an island in one state, in edge terms. */
export interface IslandSize {
    /** Along the edge, local units. */
    length: number;
    /** Out of the edge into the viewport, local units. 0 hides the island. */
    depth: number;
}

/** Options of {@link Island}. */
export interface IslandOptions {
    /** Edge it grows from. Default `right`. */
    edge?: IslandEdge;
    /**
     * What it sits on. An Application is followed on resize. A signal of a rectangle, such as
     * `IslandFrame.inner`, is followed on change. A plain rectangle in the parent's space puts it
     * on the side of a panel. Without one the island draws nothing until {@link Island.setViewport}.
     */
    viewport?: IslandViewport;
    /**
     * Notches and rounded screen corners. The island still grows from the true edge, but its
     * content clears the inset on that edge, and it stays between the insets at the ends.
     */
    safeArea?: IslandInsets;
    /** Place along the edge: 0 at the start (top or left), 1 at the end. Default 0.5. */
    align?: number;
    /** Extra shift along the edge, local units. Default 0. */
    offset?: number;
    /** Open length along the edge. Default: from `items`, else 240. */
    length?: number;
    /** Open depth. Default: from `items`, else 96. */
    depth?: number;
    /** Depth of the lip left showing at rest, the edge you pull it out by. 0 hides it. Default 12. */
    peek?: number;
    /** Length of that lip. Default 40% of the open length, at least 48. */
    peekLength?: number;
    /**
     * More states, or other sizes for `hidden`, `peek` and `open`. A notch adds `compact`
     * between its lip and its panel, for example. Dragging stops at every state.
     */
    sizes?: Record<string, IslandSize>;
    /** First state. Default `peek`. */
    state?: string;
    /** State it goes back to when closed. Default `peek`. */
    rest?: string;
    /** State it shows while hovered at rest, such as `compact`. Default none. */
    hover?: string | null;
    /** Radius of the far corners. Default 28. */
    radius?: number;
    /** Radius of the concave flares where it meets the edge. Default 22. */
    flare?: number;
    /** Squircle smoothing of the far corners, 0..1. Default 0.6. */
    smoothing?: number;
    /** Fill colour. Default black, so the island reads as part of the bezel. */
    color?: ColorSource;
    /** Fill alpha. Default 1. */
    alpha?: number;
    /** Grip line on the lip at rest. `false` hides it. Default white at 40%. */
    grip?: boolean | ColorSource;
    /** Content for the `open` state, stacked along the edge. Ignored when `views.open` is set. */
    items?: Container[];
    /** Space between items. Default 16. */
    gap?: number;
    /** Space around the items. Default 16. */
    padding?: number;
    /**
     * Content per state. Each view is laid out in the box its state's size gives (see
     * {@link Island.boxOf}), anchored to the far side, and fades in as the island reaches that state.
     */
    views?: Record<string, Container>;
    /** Pull and push it by dragging. Default true. */
    draggable?: boolean;
    /** Tap on the island's own surface while open closes it. Default true. */
    tapToClose?: boolean;
    /** Spring of the depth. Default 300 stiffness, 26 damping: a small bounce. */
    spring?: { stiffness?: number; damping?: number };
    /**
     * Extra room around the lip that takes touches, local units. A finger misses a 12-unit lip,
     * so the zone reaches this far past it along the edge and into the viewport. It takes input
     * only at rest. 0 turns it off. Default 24.
     */
    grab?: number;
    /**
     * The lip leans toward a pointer near it at rest: it grows by `depth` and slides up to
     * `slide` along the edge. On touch it follows the finger that lands near the edge, then lets
     * go. `false` turns it off. Default `{ radius: 120, depth: 8, slide: 14 }`.
     */
    magnet?: false | IslandMagnet;
    /** Plays {@link Island.hint} every this many ms at rest, until it is first opened. 0 turns it off. Default 0. */
    hintEvery?: number;
    /** What the timed hint plays. Default `pulse`. */
    hintKind?: IslandHint;
    /**
     * How far the body reaches past the edge line, local units, so the join with a bezel shows no
     * seam. Use 0 for an island inside an object such as a card, or a sliver shows past its edge.
     * Default 1.
     */
    bleed?: number;
    /** `null` to step it by hand with {@link Island.tick}. Default `Ticker.shared`. */
    ticker?: Ticker | null;
}

/** How the lip of an {@link Island} leans toward a pointer. */
export interface IslandMagnet {
    /** Distance at which it starts to lean, local units. Default 120. */
    radius?: number;
    /** Extra depth with the pointer on the lip. Default 8. */
    depth?: number;
    /** Largest slide along the edge toward the pointer. Default 14. */
    slide?: number;
}

/** A hint that the island can be pulled out: `pulse` swells it, `wiggle` shakes it along the edge. */
export type IslandHint = 'pulse' | 'wiggle';

/** Live state of an {@link Island}. */
export interface IslandState {
    /** State it is in or heading to. Set it to move there. */
    name: Signal<string>;
    /** 0 at rest, 1 open, between while it moves or is dragged. Read only. */
    openness: Signal<number>;
    /** True while a pointer drags it. Read only. */
    dragging: Signal<boolean>;
    /** True while a pointer is over it. Read only. */
    hovered: Signal<boolean>;
}

const DRAG_PROJECT = 0.12;

/**
 * A surface that grows out of an edge of the viewport, like part of the bezel: a rounded body
 * joined to the edge by concave flares, drawn as one exact shape. It rests as a lip you can pull
 * out and opens on a tap or a drag. It springs between named sizes, so a notch can morph from a
 * lip to a pill to a panel. Content fades in per state.
 *
 * The main case is a full-screen canvas: pass the Application as `viewport`. It also sits on the
 * side of a panel (a rectangle) or on the inner edge of an {@link IslandFrame} (`frame.inner`).
 * It redraws only while it moves.
 *
 * @example
 * ```ts
 * import { Island, IslandGauge } from 'pixi-silk/ui/island';
 *
 * const island = new Island({
 *     viewport: app,
 *     edge: 'right',
 *     items: [new IslandGauge({ value: 0.73, color: 0xff5a1f })],
 * });
 *
 * app.stage.addChild(island);
 * island.open();
 * ```
 */
export class Island extends Container {
    /** Edge it grows from. */
    readonly edge: IslandEdge;
    /** Live state. Setting `state.name` moves it. */
    readonly state: IslandState;
    /** The `open` content built from `items`, if any. */
    readonly stack: IslandStack | null;
    /** Pull and push it by dragging. */
    draggable: boolean;
    /** Tap on the island's own surface while open closes it. */
    tapToClose: boolean;
    /** State it goes back to when closed. */
    rest: string;
    /** State it shows while hovered at rest. */
    hover: string | null;
    private readonly _shape = new SilkGraphics();
    private readonly _grip = new SilkGraphics();
    private readonly _sizes = new Map<string, IslandSize>();
    private readonly _views = new Map<string, Container>();
    private readonly _depth: Spring;
    private readonly _length: Spring;
    private readonly _driver: Driver;
    private readonly _color: number;
    private readonly _alpha: number;
    private readonly _gripColor: number | null;
    private readonly _radius: number;
    private readonly _flare: number;
    private readonly _smoothing: number;
    private readonly _bleed: number;
    private _source: IslandViewport | null = null;
    private _unfollow: (() => void) | null = null;
    private _safe: IslandInsets;
    private _align: number;
    private _offset: number;
    private _box: IslandRect = { x: 0, y: 0, width: 0, height: 0 };
    private _shapeData: IslandShape | null = null;
    private _drag: { d0: number; t: number; v: number; vel: number } | null = null;
    private _stopGesture: () => void;
    private _unwatch: () => void;
    // lean toward a pointer and slide along the edge: magnet and hints
    private readonly _lean = new Spring(0, 260, 22);
    private readonly _slide = new Spring(0, 200, 12);
    private readonly _grabArea = new Container({ label: 'IslandGrab' });
    private readonly _grab: number;
    private readonly _magnet: Required<IslandMagnet> | null;
    private _cu = 0;
    private _release: ReturnType<typeof setTimeout> | null = null;
    private _hintTimer: ReturnType<typeof setInterval> | null = null;
    private _flashTimer: ReturnType<typeof setTimeout> | null = null;
    private _flashing: string | null = null;
    private _opened = false;
    private _maxLength = Infinity;

    constructor(options: IslandOptions = {}) {
        super({ label: 'Island' });
        this.edge = options.edge ?? 'right';
        this._safe = { ...options.safeArea };
        this._align = options.align ?? 0.5;
        this._offset = options.offset ?? 0;
        this._color = hex(options.color ?? 0x000000);
        this._alpha = options.alpha ?? 1;
        this._gripColor =
            options.grip === false
                ? null
                : options.grip === true || options.grip === undefined
                  ? 0xffffff
                  : hex(options.grip);
        this._radius = options.radius ?? 28;
        this._flare = options.flare ?? 22;
        this._smoothing = options.smoothing ?? 0.6;
        this._bleed = options.bleed ?? 1;
        this.draggable = options.draggable ?? true;
        this.tapToClose = options.tapToClose ?? true;
        this.rest = options.rest ?? 'peek';
        this.hover = options.hover ?? null;

        // content: views per state, or the items stacked for `open`
        const pad = options.padding ?? 16;
        const along = this.edge === 'left' || this.edge === 'right' ? 'y' : 'x';
        const views = { ...options.views };

        this.stack =
            !views.open && options.items?.length
                ? new IslandStack(options.items, { axis: along, gap: options.gap ?? 16 })
                : null;
        if (this.stack) views.open = this.stack;
        const length = options.length ?? (this.stack ? this.stack.along + pad * 2 : 240);
        const depth = options.depth ?? (this.stack ? this.stack.across + pad * 2 : 96);
        const peek = options.peek ?? 12;
        const peekLength = options.peekLength ?? Math.max(48, length * 0.4);

        this._sizes.set('hidden', { length: peekLength, depth: 0 });
        this._sizes.set('peek', { length: peekLength, depth: peek });
        this._sizes.set('open', { length, depth });
        for (const [name, size] of Object.entries(options.sizes ?? {})) this._sizes.set(name, { ...size });

        this._grab = options.grab ?? 24;
        this._magnet = options.magnet === false ? null : { radius: 120, depth: 8, slide: 14, ...options.magnet };
        this.addChild(this._grabArea, this._shape, this._grip);
        this._grabArea.hitArea = new Rectangle();
        this._shape.eventMode = 'static';
        this._grip.eventMode = 'none';
        for (const [name, view] of Object.entries(views)) {
            this._views.set(name, view);
            view.alpha = 0;
            view.visible = false;
            this.addChild(view);
        }
        this._layoutViews();

        const first = options.state ?? this.rest;
        const start = this.sizeOf(first);
        const spring = options.spring ?? {};

        this._depth = new Spring(start.depth, spring.stiffness ?? 300, spring.damping ?? 26);
        this._length = new Spring(start.length, 260, 30);
        this.state = {
            name: signal(first),
            openness: signal(0),
            dragging: signal(false),
            hovered: signal(false),
        };
        this._driver = new Driver((dt) => this._step(dt), options.ticker);
        this._unwatch = this.state.name.subscribe((name) => {
            if (name === 'open') this._opened = true;
            this._retarget(name);
        });

        this._stopGesture = trackGesture(this, {
            onDragStart: (p) => this._dragStart(p),
            onDrag: (p) => this._dragMove(p),
            onDragEnd: () => this._dragEnd(),
            onTap: (p) => this._tap(p.event.target === this._shape),
        });
        this.on('pointerenter', () => this._hover(true));
        this.on('pointerleave', () => this._hover(false));
        this.on('globalpointermove', (e) => this._near(e));
        this.on('pointerdown', (e) => this._near(e));
        if (options.hintEvery && options.hintEvery > 0) {
            const kind = options.hintKind ?? 'pulse';

            this._hintTimer = setInterval(() => {
                if (this._opened) this._stopHints();
                else if (this._atRest()) this.hint(kind);
            }, options.hintEvery);
        }
        if (options.viewport) this.setViewport(options.viewport);
    }

    /** Place along the edge, 0..1. Setting it moves the island at once. */
    get align(): number {
        return this._align;
    }

    set align(value: number) {
        this._align = value;
        this._draw();
    }

    /** Extra shift along the edge, local units. */
    get offset(): number {
        return this._offset;
    }

    set offset(value: number) {
        this._offset = value;
        this._draw();
    }

    /** The visible body right now, in the parent's space: from the edge line to the far side. */
    get box(): IslandRect {
        return { ...this._box };
    }

    /** The outline right now, or null while hidden. */
    get shape(): IslandShape | null {
        return this._shapeData;
    }

    /** True while it animates. */
    get moving(): boolean {
        return this._driver.running;
    }

    /** Names of the states, shallowest first. */
    get states(): string[] {
        return [...this._sizes.entries()].sort((a, b) => a[1].depth - b[1].depth).map(([n]) => n);
    }

    /** Size of a state. Unknown names give the `open` size. */
    sizeOf(name: string): IslandSize {
        const size = this._sizes.get(name) ?? this._sizes.get('open');

        return { length: size?.length ?? 0, depth: size?.depth ?? 0 };
    }

    /**
     * The box a state's view is laid out in, in screen terms. On the left or right edge the width
     * is the state's depth. On the top or bottom edge the width is its length.
     */
    boxOf(name: string): { width: number; height: number } {
        const s = this.sizeOf(name);

        return this.edge === 'left' || this.edge === 'right'
            ? { width: s.depth, height: s.length }
            : { width: s.length, height: s.depth };
    }

    /** Changes the size of a state, or adds one. The island morphs when it is in that state. */
    setStateSize(name: string, size: IslandSize): this {
        this._sizes.set(name, { ...size });
        this._layoutViews();
        if (this.state.name.value === name) this._retarget(name);

        return this;
    }

    /** Moves to a state with the spring. `instant` jumps there. */
    go(name: string, instant = false): this {
        if (instant) {
            const s = this.sizeOf(name);

            this._depth.value = this._depth.target = s.depth;
            this._length.value = this._length.target = s.length;
            this._depth.velocity = this._length.velocity = 0;
        }
        if (this.state.name.value === name) this._retarget(name);
        else this.state.name.value = name;
        if (instant) this._draw();

        return this;
    }

    /** Opens it. */
    open(): this {
        return this.go('open');
    }

    /** Goes back to the rest state, the lip by default. */
    close(): this {
        return this.go(this.rest);
    }

    /** Hides it completely. */
    hide(): this {
        return this.go('hidden');
    }

    /** Opens it at rest, closes it otherwise. */
    toggle(): this {
        const name = this.state.name.value;

        return name === this.rest || name === this.hover || name === 'hidden' ? this.open() : this.close();
    }

    /**
     * Hints that the island can be pulled out: `pulse` swells it out and back, `wiggle` shakes it
     * along the edge. A hidden island peeks out for a moment. `strength` scales it. Default 1.
     */
    hint(kind: IslandHint = 'pulse', strength = 1): this {
        if (this._drag) return this;
        if (kind === 'wiggle') this._slide.velocity += 320 * strength;
        else {
            this._lean.velocity += 220 * strength;
            this._length.velocity += 90 * strength;
        }
        this._driver.wake();

        return this;
    }

    /**
     * Moves to a state, then back to rest after `ms`: a notification or a live update that shows
     * and leaves. A drag or a tap keeps it where it is. A pointer over it holds it until it leaves.
     */
    flash(name: string, ms = 2400): this {
        this._clearFlash();
        this.go(name);
        this._flashTimer = setTimeout(() => {
            this._flashTimer = null;
            if (this.state.name.value !== name) return;
            if (this.state.hovered.value) this._flashing = name;
            else this.close();
        }, ms);

        return this;
    }

    /** Follows a new viewport and redraws. `null` stops following. */
    setViewport(source: IslandViewport | null): this {
        this._unfollow?.();
        this._unfollow = null;
        this._source = source;
        if (source) this._unfollow = followViewport(source, () => this._draw());
        this._draw();

        return this;
    }

    /** Sets the safe-area insets and redraws. */
    setSafeArea(insets: IslandInsets): this {
        this._safe = { ...insets };
        this._draw();

        return this;
    }

    /** Advances the animation by `dt` seconds (for `ticker: null`). Returns true while it moves. */
    tick(dt: number): boolean {
        return this._driver.tick(dt);
    }

    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        this._driver.sleep();
        this._stopHints();
        this._clearFlash();
        if (this._release) clearTimeout(this._release);
        this._unfollow?.();
        this._unwatch();
        this._stopGesture();
        super.destroy(options);
    }

    // ------------------------------------------------------------------ motion

    private _retarget(name: string): void {
        const s = this.sizeOf(name);

        this._depth.target = s.depth;
        this._length.target = s.length;
        this._driver.wake();
    }

    private _step(dt: number): boolean {
        this._lean.step(dt);
        this._slide.step(dt);
        const leaning = !this._lean.settled || !this._slide.settled;

        if (!leaning) {
            this._lean.value = this._lean.target;
            this._slide.value = this._slide.target;
        }
        if (this._drag) {
            this._draw();

            return leaning;
        }
        this._depth.step(dt);
        this._length.step(dt);
        const busy = !this._depth.settled || !this._length.settled;

        if (!busy) {
            this._depth.value = this._depth.target;
            this._length.value = this._length.target;
        }
        this._draw();

        return busy || leaning;
    }

    private _atRest(): boolean {
        const name = this.state.name.value;

        return !this._drag && (name === this.rest || name === 'hidden');
    }

    private _stopHints(): void {
        if (this._hintTimer) clearInterval(this._hintTimer);
        this._hintTimer = null;
    }

    private _clearFlash(): void {
        if (this._flashTimer) clearTimeout(this._flashTimer);
        this._flashTimer = null;
        this._flashing = null;
    }

    /** Leans the lip toward a pointer near it, at rest. */
    private _near(e: FederatedPointerEvent): void {
        const m = this._magnet;

        if (!m) return;
        let lean = 0;
        let slide = 0;

        if (this._atRest()) {
            const view = readViewport(this._source);
            const p = this.toLocal(e.global);
            const vertical = this.edge === 'left' || this.edge === 'right';
            const u = vertical ? p.y - view.y : p.x - view.x;
            const v =
                this.edge === 'left'
                    ? p.x - view.x
                    : this.edge === 'right'
                      ? view.x + view.width - p.x
                      : this.edge === 'top'
                        ? p.y - view.y
                        : view.y + view.height - p.y;
            const du = u - this._cu;
            const along = Math.max(0, Math.abs(du) - this._length.value / 2);
            const depth = Math.max(0, this._depth.value);
            const k = clamp01(1 - (v - depth) / m.radius) * clamp01(1 - along / m.radius);

            if (v > -8 && k > 0) {
                const e2 = k * k;

                lean = m.depth * e2;
                slide = Math.max(-m.slide, Math.min(m.slide, du * 0.25)) * e2;
            }
        }
        if (lean === this._lean.target && slide === this._slide.target) return;
        this._lean.target = lean;
        this._slide.target = slide;
        this._driver.wake();
        // a finger sends no moves once lifted: let go a little after the last one
        if (this._release) clearTimeout(this._release);
        this._release =
            lean > 0 && e.pointerType === 'touch'
                ? setTimeout(() => {
                      this._release = null;
                      this._lean.target = 0;
                      this._slide.target = 0;
                      this._driver.wake();
                  }, 500)
                : null;
    }

    /** Length for a depth between the states around it, so a drag morphs the outline. */
    private _lengthAt(depth: number): number {
        const list = this._ladder();

        if (!list.length) return this._length.value;
        if (depth <= list[0][1].depth) return list[0][1].length;
        for (let i = 1; i < list.length; i++) {
            const a = list[i - 1][1];
            const b = list[i][1];

            if (depth <= b.depth) {
                const t = (depth - a.depth) / Math.max(1e-6, b.depth - a.depth);

                return a.length + (b.length - a.length) * t;
            }
        }

        return list[list.length - 1][1].length;
    }

    /** States a drag can stop at, shallowest first. `hidden` only when there is no lip. */
    private _ladder(): [string, IslandSize][] {
        const peek = this._sizes.get('peek')?.depth ?? 0;

        return [...this._sizes.entries()]
            .filter(([n]) => n !== 'hidden' || peek <= 0)
            .filter(([n]) => n !== 'peek' || peek > 0)
            .sort((a, b) => a[1].depth - b[1].depth);
    }

    private _inward(p: GesturePoint): number {
        switch (this.edge) {
            case 'left':
                return p.dx;
            case 'right':
                return -p.dx;
            case 'top':
                return p.dy;
            default:
                return -p.dy;
        }
    }

    private _dragStart(p: GesturePoint): void {
        if (!this.draggable) return;
        this._clearFlash();
        this._drag = { d0: this._depth.value, t: performance.now(), v: this._depth.value, vel: 0 };
        this._driver.sleep();
        this.state.dragging.value = true;
        this._dragMove(p);
    }

    private _dragMove(p: GesturePoint): void {
        const d = this._drag;

        if (!d) return;
        const list = this._ladder();
        const lo = list[0]?.[1].depth ?? 0;
        const hi = list[list.length - 1]?.[1].depth ?? 0;
        const depth = rubberBand(d.d0 + this._inward(p), lo, hi, 28);
        const now = performance.now();
        const dt = Math.max(1, now - d.t) / 1000;

        d.vel = d.vel * 0.3 + ((depth - d.v) / dt) * 0.7;
        d.v = depth;
        d.t = now;
        this._depth.value = this._depth.target = depth;
        this._length.value = this._length.target = this._lengthAt(depth);
        this._depth.velocity = this._length.velocity = 0;
        this._draw();
    }

    private _dragEnd(): void {
        const d = this._drag;

        if (!d) return;
        this._drag = null;
        this.state.dragging.value = false;
        // a stale drag (held still before release) has no speed
        const vel = performance.now() - d.t > 80 ? 0 : d.vel;
        const aim = this._depth.value + vel * DRAG_PROJECT;
        let best = this.state.name.value;
        let gap = Infinity;

        for (const [name, size] of this._ladder()) {
            const g = Math.abs(size.depth - aim);

            if (g < gap) {
                gap = g;
                best = name;
            }
        }
        this._depth.velocity = vel;
        this.go(best);
    }

    private _tap(onSurface: boolean): void {
        const name = this.state.name.value;

        this._clearFlash();
        if (name === this.rest || name === this.hover || name === 'hidden') this.open();
        else if (onSurface && this.tapToClose) this.close();
    }

    private _hover(on: boolean): void {
        this.state.hovered.value = on;
        if (!on && this._flashing) {
            if (this.state.name.value === this._flashing) this.close();
            this._flashing = null;
        }
        if (!this.hover || this._drag) return;
        const name = this.state.name.value;

        if (on && name === this.rest) this.go(this.hover);
        else if (!on && name === this.hover) this.go(this.rest);
    }

    // ------------------------------------------------------------------ drawing

    private _draw(): void {
        const view = readViewport(this._source);
        const ins = edgeInsets(this.edge, this._safe);
        const span = edgeSpan(this.edge, view);
        const depth = Math.max(0, this._depth.value);
        // the lean of the magnet and the hints adds to the depth, a hidden island peeks out with it
        const grown = Math.max(0, depth + this._lean.value);
        // the island grows from the true edge, its content clears the inset on that edge
        const reach = grown > 0 ? grown + ins.edge * Math.min(1, grown / 8) : 0;
        const lo = ins.start + this._flare;
        const hi = span - ins.end - this._flare;
        // never longer than the edge it sits on
        this._maxLength = Math.max(0, hi - lo);
        const length = Math.min(Math.max(0, this._length.value), this._maxLength);
        const room = hi - lo - length;
        const want = lo + length / 2 + room * this._align + this._offset;
        const base = room > 0 ? Math.max(lo + length / 2, Math.min(hi - length / 2, want)) : (lo + hi) / 2;
        const cu = room > 0 ? Math.max(lo + length / 2, Math.min(hi - length / 2, base + this._slide.value)) : base;

        this._cu = base;
        // as long as the edge allows, with no insets at its ends: it spans the edge and meets the sides
        const full = this._length.value >= this._maxLength - 0.5 && ins.start === 0 && ins.end === 0;
        const shape = islandShape(this.edge, view, cu, length, reach, this._radius, this._flare, {
            smoothing: this._smoothing,
            bleed: this._bleed,
            full,
        });

        this._shapeData = shape;
        this._box = shape ? shape.box : { x: 0, y: 0, width: 0, height: 0 };
        this._shape.clear();
        if (shape) drawIslandShape(this._shape, shape, { color: this._color, alpha: this._alpha });

        // openness: 0 at rest, 1 open
        const restDepth = this.sizeOf(this.rest).depth;
        const openDepth = this.sizeOf('open').depth;
        const openness = clamp01((depth - restDepth) / Math.max(1e-6, openDepth - restDepth));

        this.state.openness.value = openness;
        this._placeGrab(view, cu, reach, length, openness);
        this._drawGrip(view, cu, reach, length, openness);
        this._placeViews(view, cu, reach, depth);
    }

    /** The touch zone around the lip: input at rest only. */
    private _placeGrab(view: IslandRect, u: number, reach: number, length: number, openness: number): void {
        const g = this._grab;
        const on = g > 0 && openness < 0.5 && this.draggable && view.width > 0;

        this._grabArea.eventMode = on ? 'static' : 'none';
        if (!on) return;
        const r = edgeRect(this.edge, view, u - length / 2 - g, u + length / 2 + g, 0, reach + g);

        (this._grabArea.hitArea as Rectangle).copyFrom(new Rectangle(r.x, r.y, r.width, r.height));
    }

    private _drawGrip(view: IslandRect, u: number, reach: number, length: number, openness: number): void {
        this._grip.clear();
        const a = (1 - openness * 3) * 0.4;

        if (this._gripColor === null || a <= 0.01 || reach < 4) return;
        const len = Math.min(36, length * 0.4);
        const thick = Math.min(4, reach * 0.3);
        const r = edgeRect(this.edge, view, u - len / 2, u + len / 2, reach / 2 - thick / 2, reach / 2 + thick / 2);

        this._grip.roundRect(r.x, r.y, r.width, r.height, thick / 2).fill({ color: this._gripColor, alpha: a });
    }

    /** Lays out the stack in its box once the sizes are known. */
    private _layoutViews(): void {
        if (!this.stack) return;
        const box = this.boxOf('open');

        this.stack.layout(box.width, box.height);
    }

    private _placeViews(view: IslandRect, u: number, reach: number, depth: number): void {
        if (!this._views.size) return;
        const length = this._length.value;
        const sizes = [...this._sizes.entries()].filter(([n]) => n !== 'hidden');
        // distance between two sizes: depth and length both count, so states of equal depth still differ
        const gap = (a: IslandSize, l: number, d: number) => Math.hypot(a.depth - d, a.length - l);

        for (const [name, v] of this._views) {
            const s = this.sizeOf(name);
            // the nearest other state sets how far the view fades
            let room = s.depth;

            for (const [other, z] of sizes)
                if (other !== name) room = Math.min(room, gap(z, s.length, s.depth) || room);
            const w = 1 - gap(s, length, depth) / Math.max(1e-6, room);
            // fade in over the last stretch, so content shows once it fits
            const t = clamp01((clamp01(w) - 0.4) / 0.6);
            const alpha = t * t * (3 - 2 * t);

            v.alpha = alpha;
            v.visible = alpha > 0.01;
            v.interactiveChildren = alpha > 0.6;
            // anchored to the far side, centred along the edge, so it rides out with the surface
            const len = Math.min(s.length, this._maxLength);
            const at = edgeRect(this.edge, view, u - len / 2, u + len / 2, reach - s.depth, reach);

            v.position.set(at.x, at.y);
        }
    }
}
