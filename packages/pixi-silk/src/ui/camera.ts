import { Container, type PointData, Text, type Ticker } from 'pixi.js';
import { SilkGraphics } from '../SilkGraphics';
import { type ReadSignal, type Signal, signal } from '../signal';
import { Driver } from './driver';
import type { LabelFactory, TextLabel } from './label';
import { hex } from './paint';

/** A rectangle in world units (the local space of {@link CameraOptions.world}). */
export interface WorldRect {
    /** Left edge. */
    x: number;
    /** Top edge. */
    y: number;
    /** Width, 0 or more. */
    width: number;
    /** Height, 0 or more. */
    height: number;
}

/** Space to keep free on each side of the view, in CSS pixels. A side left out is 0. */
export interface CameraInsets {
    /** Free space above the content. */
    top?: number;
    /** Free space right of the content. */
    right?: number;
    /** Free space below the content. */
    bottom?: number;
    /** Free space left of the content. */
    left?: number;
}

/** Options of {@link Camera}. */
export interface CameraOptions {
    /** The container the camera moves and scales. Put overlays (outlines, measures) beside it, not inside. */
    world: Container;
    /** The element that receives input, usually `app.canvas`. */
    element: HTMLElement;
    /** Smallest and largest zoom, where 1 is 100%. Default `[0.02, 256]`. */
    zoomRange?: [number, number];
    /**
     * What a plain wheel does. `pan` (default, like Figma): scroll pans, pinch or ctrl / cmd +
     * wheel zooms. `zoom` (like a map): the wheel zooms, Shift + wheel pans.
     */
    wheel?: 'pan' | 'zoom';
    /** Mouse buttons that pan when dragged: 1 middle, 2 right. Default `[1, 2]`. */
    panButtons?: number[];
    /** Holding Space turns a left drag into a pan. Default true. */
    spacePan?: boolean;
    /** How touch pans: with `two` fingers (default, one finger stays with the scene) or `one`. */
    touchPan?: 'one' | 'two';
    /** Keep panning after a fling, slowing down. Default true. */
    inertia?: boolean;
    /**
     * Keyboard shortcuts on `window`: `+` and `-` zoom, Shift + 0 is 100%, Shift + 1 fits
     * {@link Camera.content}. Default true.
     */
    keys?: boolean;
    /**
     * Who gets a plain scroll while the canvas sits in a page that scrolls. With `auto` (default) or
     * `true` the page keeps scrolling until the canvas is clicked, then the camera pans until the
     * pointer leaves. Pinch and ctrl / cmd + wheel always zoom. `auto` only applies when the page
     * can scroll, so a full-screen canvas pans at once. `false` always pans.
     */
    pageScroll?: boolean | 'auto';
    /** How fast animated zooms settle, about 1 / seconds. Default 16. */
    smoothing?: number;
    /**
     * Element points (CSS pixels) the camera leaves alone: wheels and pan drags there go to the
     * scene instead. Use it for panels drawn over the view, with `panelHitTest` from `pixi-silk/ui/panel`.
     */
    ignore?: (point: PointData) => boolean;
    /**
     * Ticker that runs animations and flings. Default `Ticker.shared`. With `null` nothing animates
     * until you call {@link Camera.tick}.
     */
    ticker?: Ticker | null;
}

/** The reactive view of a {@link Camera}: where it is now, animations included. */
export interface CameraState {
    /** Scale of the world. 1 is 100%. */
    zoom: ReadSignal<number>;
    /** Screen x of the world's origin, in CSS pixels from the element's left edge. */
    x: ReadSignal<number>;
    /** Screen y of the world's origin, in CSS pixels from the element's top edge. */
    y: ReadSignal<number>;
    /** True while the user drags the view. */
    panning: ReadSignal<boolean>;
    /** Element width in CSS pixels. Follows resizes where `ResizeObserver` exists. */
    width: ReadSignal<number>;
    /** Element height in CSS pixels. Follows resizes where `ResizeObserver` exists. */
    height: ReadSignal<number>;
}

const isTyping = (t: EventTarget | null): boolean => {
    const el = t as HTMLElement | null;

    return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName ?? ''));
};

/**
 * Pans and zooms a world container over an unbounded canvas. It writes the world's `position`
 * and `scale`, so do not set them yourself while a camera owns the world.
 *
 * Zoom stays anchored under the cursor or between two fingers. Trackpads pinch to zoom and scroll
 * to pan, mouse wheels follow {@link CameraOptions.wheel}. Middle or right drag, Space + drag and
 * two-finger touch drags pan, and a fling keeps gliding. Pans never reach the scene, so the
 * scene keeps its own clicks and drags.
 *
 * The constructor adds listeners to the element and to `window`. Call {@link Camera.destroy} to
 * remove them. Overlays drawn beside the world, not inside it, keep a constant size on screen.
 * There is no rotation.
 *
 * Experimental: the API may change in a minor release.
 * @experimental
 */
export class Camera {
    /** Signals for overlays and readouts. They follow animations frame by frame. */
    readonly state: CameraState;
    /** What `fit()` frames by default and Shift + 1 fits. Default the world. */
    content: Container;
    /** Smallest and largest zoom. Changing it does not re-clamp the current zoom until the next zoom call. */
    zoomRange: [number, number];

    private readonly _world: Container;
    private readonly _el: HTMLElement;
    private readonly _opts: CameraOptions;
    private readonly _zoom: Signal<number>;
    private readonly _x: Signal<number>;
    private readonly _y: Signal<number>;
    private readonly _panning = signal(false);
    private readonly _width: Signal<number>;
    private readonly _height: Signal<number>;
    private readonly _driver: Driver;
    // target view and the screen point an animated zoom keeps still
    private _k: number;
    private _tx: number;
    private _ty: number;
    private _fx = 0;
    private _fy = 0;
    // fling velocity, pixels per second
    private _vx = 0;
    private _vy = 0;
    private _space = false;
    private _drag: { id: number; x: number; y: number; t: number } | null = null;
    private readonly _touches = new Map<number, { x: number; y: number }>();
    private _pinch: { d: number; cx: number; cy: number } | null = null;
    private _cursor = '';
    private readonly _off: (() => void)[] = [];

    constructor(options: CameraOptions) {
        this._opts = options;
        this._world = options.world;
        this._el = options.element;
        this.content = options.world;
        this.zoomRange = options.zoomRange ?? [0.02, 256];
        this._k = options.world.scale.x || 1;
        this._tx = options.world.position.x;
        this._ty = options.world.position.y;
        this._zoom = signal(this._k);
        this._x = signal(this._tx);
        this._y = signal(this._ty);
        this._width = signal(options.element.clientWidth);
        this._height = signal(options.element.clientHeight);
        this.state = {
            zoom: this._zoom,
            x: this._x,
            y: this._y,
            panning: this._panning,
            width: this._width,
            height: this._height,
        };
        this._driver = new Driver((dt) => this._step(dt), options.ticker);
        this._listen();
        this._observe();
    }

    /** The container the camera moves and scales, as passed in {@link CameraOptions.world}. */
    get world(): Container {
        return this._world;
    }

    /** The element that receives input. Its size is the size of the view. */
    get element(): HTMLElement {
        return this._el;
    }

    /** Zoom on screen now, 1 is 100%. During an animated zoom it is between the start and the target. */
    get zoom(): number {
        return this._zoom.value;
    }

    /** True while an animation or a fling runs. */
    get moving(): boolean {
        return this._driver.running;
    }

    /** Converts a point on the element (CSS pixels) to world units, using the view on screen now. */
    screenToWorld(p: PointData): PointData {
        return { x: (p.x - this._x.value) / this._zoom.value, y: (p.y - this._y.value) / this._zoom.value };
    }

    /** Converts a world point to CSS pixels on the element. The inverse of {@link Camera.screenToWorld}. */
    worldToScreen(p: PointData): PointData {
        return { x: p.x * this._zoom.value + this._x.value, y: p.y * this._zoom.value + this._y.value };
    }

    /** The part of the world the element shows now, in world units. Allocates a new object. */
    get view(): WorldRect {
        const a = this.screenToWorld({ x: 0, y: 0 });
        const k = this._zoom.value;

        return { x: a.x, y: a.y, width: this._el.clientWidth / k, height: this._el.clientHeight / k };
    }

    /**
     * Multiplies the zoom by `factor`, keeping the screen point `at` still (default the element's
     * centre). The result is clamped to {@link Camera.zoomRange}. Animates unless `animate` is false.
     */
    zoomBy(factor: number, at?: PointData, animate = true): this {
        const p = at ?? this._centre();
        const w = this._targetToWorld(p);
        const k = this._clamp(this._k * factor);

        this._fx = p.x;
        this._fy = p.y;
        this._k = k;
        this._tx = p.x - w.x * k;
        this._ty = p.y - w.y * k;

        return this._go(animate);
    }

    /** Zooms to `zoom` (1 is 100%) around the screen point `at`, default the centre. Clamped like {@link Camera.zoomBy}. */
    zoomTo(zoom: number, at?: PointData, animate = true): this {
        return this.zoomBy(zoom / this._k, at, animate);
    }

    /** Moves the world by `dx`, `dy` CSS pixels on screen. Jumps by default. During a zoom animation it shifts the target. */
    panBy(dx: number, dy: number, animate = false): this {
        this._tx += dx;
        this._ty += dy;
        this._fx += dx;
        this._fy += dy;
        // while a zoom eases, the step re-derives the position from the moved target
        if (this._driver.running || animate) return this._go(true, this._free);
        this._apply(this._zoom.value, this._x.value + dx, this._y.value + dy);

        return this;
    }

    /** Puts a world point in the middle of the element, optionally at a new zoom (clamped). Animates by default. */
    centerOn(p: PointData, zoom: number = this._k, animate = true): this {
        const c = this._centre();
        const k = this._clamp(zoom);

        this._k = k;
        this._tx = c.x - p.x * k;
        this._ty = c.y - p.y * k;
        this._fx = c.x;
        this._fy = c.y;

        return this._go(animate, true);
    }

    /**
     * Frames a world rectangle or a container (default {@link Camera.content}) with `padding`
     * CSS pixels around it, default 48. Padding per side (`{ left: 260 }`) keeps the content clear
     * of docked panels. An empty target keeps the zoom and only centres. Animates by default.
     */
    fit(target: WorldRect | Container = this.content, padding: number | CameraInsets = 48, animate = true): this {
        const r = 'width' in target && 'x' in target && !('children' in target) ? target : this._boundsOf(target);
        const p =
            typeof padding === 'number' ? { top: padding, right: padding, bottom: padding, left: padding } : padding;
        const left = p.left ?? 0;
        const top = p.top ?? 0;
        const w = Math.max(1, this._el.clientWidth - left - (p.right ?? 0));
        const h = Math.max(1, this._el.clientHeight - top - (p.bottom ?? 0));
        const k = r.width > 0 && r.height > 0 ? this._clamp(Math.min(w / r.width, h / r.height)) : this._k;
        const cx = left + w / 2;
        const cy = top + h / 2;

        // the middle of the free area, not of the element, shows the middle of the target
        this._k = k;
        this._tx = cx - (r.x + r.width / 2) * k;
        this._ty = cy - (r.y + r.height / 2) * k;
        this._fx = cx;
        this._fy = cy;

        return this._go(animate, true);
    }

    /** Back to 100% with the world's origin at the top left. */
    reset(animate = true): this {
        this._k = 1;
        this._tx = 0;
        this._ty = 0;
        this._fx = 0;
        this._fy = 0;

        return this._go(animate, true);
    }

    /**
     * Advances animations by `dt` seconds, clamped to 0..0.1. Only needed with `ticker: null`.
     * Returns true while the view still moves.
     */
    tick(dt: number): boolean {
        return this._driver.tick(dt);
    }

    /** Removes every listener and stops animations. The world keeps its last transform. Signals stay readable. */
    destroy(): void {
        for (const off of this._off) off();
        this._off.length = 0;
        this._driver.sleep();
        this._setCursor('');
    }

    // ------------------------------------------------------------------------------- internals

    private _centre(): PointData {
        return { x: this._el.clientWidth / 2, y: this._el.clientHeight / 2 };
    }

    private _clamp(k: number): number {
        return Math.min(this.zoomRange[1], Math.max(this.zoomRange[0], k));
    }

    /** A screen point in world units under the target view (where the camera is heading). */
    private _targetToWorld(p: PointData): PointData {
        return { x: (p.x - this._tx) / this._k, y: (p.y - this._ty) / this._k };
    }

    private _boundsOf(c: Container): WorldRect {
        const b = c === this._world ? c.getLocalBounds() : c.getBounds();

        if (c === this._world) return { x: b.minX, y: b.minY, width: b.width, height: b.height };
        const a = this._world.toLocal({ x: b.minX, y: b.minY });
        const z = this._world.toLocal({ x: b.maxX, y: b.maxY });

        return { x: a.x, y: a.y, width: z.x - a.x, height: z.y - a.y };
    }

    /**
     * Starts moving to the target. Without animation the view jumps. `free` animations (fit,
     * centre) glide the position too, others keep the focus point still while the zoom eases.
     */
    private _go(animate: boolean, free = false): this {
        this._free = free;
        if (!animate) this._apply(this._k, this._tx, this._ty);
        else this._driver.wake();

        return this;
    }

    private _free = false;

    private _step(dt: number): boolean {
        const rate = this._opts.smoothing ?? 16;
        const a = 1 - Math.exp(-rate * dt);
        let busy = false;

        // fling
        if (!this._drag && (this._vx !== 0 || this._vy !== 0)) {
            this._tx += this._vx * dt;
            this._ty += this._vy * dt;
            this._fx += this._vx * dt;
            this._fy += this._vy * dt;
            const decay = Math.exp(-5 * dt);

            this._vx *= decay;
            this._vy *= decay;
            if (Math.hypot(this._vx, this._vy) < 8) this._vx = this._vy = 0;
            else busy = true;
        }

        const k0 = this._zoom.value;
        let k = Math.exp(Math.log(k0) + (Math.log(this._k) - Math.log(k0)) * a);

        if (Math.abs(Math.log(k / this._k)) < 1e-4) k = this._k;
        else busy = true;
        let x: number;
        let y: number;

        if (this._free) {
            // fit / centre: glide the world point at the centre while zooming
            const c = this._centre();
            const now = this.screenToWorld(c);
            const goal = this._targetToWorld(c);
            const wx = now.x + (goal.x - now.x) * a;
            const wy = now.y + (goal.y - now.y) * a;

            x = c.x - wx * k;
            y = c.y - wy * k;
            if (Math.abs(goal.x - now.x) * k > 0.05 || Math.abs(goal.y - now.y) * k > 0.05) busy = true;
            if (!busy) {
                x = this._tx;
                y = this._ty;
            }
        } else {
            // the world point under the focus (where the target puts it) stays under the focus
            const w = this._targetToWorld({ x: this._fx, y: this._fy });

            x = this._fx - w.x * k;
            y = this._fy - w.y * k;
        }
        this._apply(k, x, y);

        return busy;
    }

    private _apply(k: number, x: number, y: number): void {
        this._world.scale.set(k);
        this._world.position.set(x, y);
        this._zoom.set(k);
        this._x.set(x);
        this._y.set(y);
    }

    private _local(e: { clientX: number; clientY: number }): PointData {
        const r = this._el.getBoundingClientRect();

        return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    private _setCursor(c: string): void {
        if (c === this._cursor) return;
        this._cursor = c;
        // the canvas sets its own cursor inline on hover, so override with priority
        if (c) this._el.style.setProperty('cursor', c, 'important');
        else this._el.style.removeProperty('cursor');
    }

    private _syncCursor(): void {
        this._setCursor(this._drag ? 'grabbing' : this._space ? 'grab' : '');
    }

    private _listen(): void {
        const el = this._el;
        const o = this._opts;
        const on = <K extends keyof WindowEventMap>(
            target: Window | HTMLElement,
            type: K,
            fn: (e: WindowEventMap[K]) => void,
            opts?: AddEventListenerOptions,
        ) => {
            target.addEventListener(type, fn as EventListener, opts);
            this._off.push(() => target.removeEventListener(type, fn as EventListener, opts));
        };
        const inside = (e: Event) => e.target === el || el.contains(e.target as Node);
        const panButtons = o.panButtons ?? [1, 2];

        on(
            el,
            'wheel',
            (e) => {
                if (!this._engaged && !e.ctrlKey && !e.metaKey && this._pageScrolls()) return;
                e.preventDefault();
                const p = this._local(e);

                if (o.ignore?.(p)) return;
                const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
                const dx = e.deltaX * unit;
                const dy = e.deltaY * unit;
                const zoom = e.ctrlKey || e.metaKey || ((o.wheel ?? 'pan') === 'zoom' && !e.shiftKey);

                this._vx = this._vy = 0;
                if (zoom) {
                    // pinches send small steps, mouse wheels big ones: both feel the same per gesture
                    const f = Math.exp(-dy * (Math.abs(dy) < 50 ? 0.012 : 0.0025));

                    this.zoomBy(f, p, Math.abs(dy) >= 50);
                } else if (e.shiftKey && dx === 0) this.panBy(-dy, 0);
                else this.panBy(-dx, -dy);
            },
            { passive: false },
        );

        // window capture: runs before Pixi's own listeners, so a pan never reaches the scene
        on(
            window,
            'pointerdown',
            (e) => {
                this._engaged = inside(e);
                if (!inside(e) || o.ignore?.(this._local(e))) return;
                if (e.pointerType === 'touch') {
                    this._touches.set(e.pointerId, this._local(e));
                    if (this._touches.size === 2 || (o.touchPan === 'one' && this._touches.size === 1)) {
                        e.stopPropagation();
                        this._vx = this._vy = 0;
                        this._pinch = pinchOf(this._touches);
                        this._panning.set(true);
                    }
                    return;
                }
                const space = (o.spacePan ?? true) && this._space && e.button === 0;

                if (!space && !panButtons.includes(e.button)) return;
                e.preventDefault();
                e.stopPropagation();
                const p = this._local(e);

                this._vx = this._vy = 0;
                this._drag = { id: e.pointerId, x: p.x, y: p.y, t: performance.now() };
                this._panning.set(true);
                this._syncCursor();
            },
            { capture: true },
        );
        on(
            window,
            'pointermove',
            (e) => {
                if (this._touches.has(e.pointerId)) {
                    this._touches.set(e.pointerId, this._local(e));
                    if (!this._pinch) return;
                    e.stopPropagation();
                    const next = pinchOf(this._touches);

                    this._fling(next.cx - this._pinch.cx, next.cy - this._pinch.cy);
                    this.panBy(next.cx - this._pinch.cx, next.cy - this._pinch.cy);
                    if (this._touches.size === 2)
                        this.zoomBy(next.d / this._pinch.d, { x: next.cx, y: next.cy }, false);
                    this._pinch = next;
                    return;
                }
                if (this._drag?.id !== e.pointerId) return;
                e.stopPropagation();
                const p = this._local(e);

                this._fling(p.x - this._drag.x, p.y - this._drag.y);
                this.panBy(p.x - this._drag.x, p.y - this._drag.y);
                this._drag.x = p.x;
                this._drag.y = p.y;
            },
            { capture: true },
        );
        const up = (e: PointerEvent) => {
            if (this._touches.delete(e.pointerId)) {
                if (!this._pinch) return;
                e.stopPropagation();
                if (this._touches.size === 0 || (o.touchPan !== 'one' && this._touches.size < 2)) {
                    this._pinch = null;
                    this._panning.set(false);
                    this._release();
                } else this._pinch = pinchOf(this._touches);
                return;
            }
            if (this._drag?.id !== e.pointerId) return;
            e.stopPropagation();
            this._drag = null;
            this._panning.set(false);
            this._syncCursor();
            this._release();
        };

        on(window, 'pointerup', up, { capture: true });
        on(window, 'pointercancel', up, { capture: true });
        on(el, 'pointerleave', () => {
            this._engaged = false;
        });
        on(el, 'contextmenu', (e) => {
            if (panButtons.includes(2)) e.preventDefault();
        });

        on(window, 'keydown', (e) => {
            if (isTyping(e.target)) return;
            if (e.code === 'Space' && (o.spacePan ?? true)) {
                if (!this._space && el.matches(':hover')) {
                    this._space = true;
                    this._syncCursor();
                }
                if (this._space) e.preventDefault();
                return;
            }
            if (!(o.keys ?? true) || e.altKey || !el.matches(':hover')) return;
            if (e.key === '+' || e.key === '=') this.zoomBy(1.5);
            else if (e.key === '-' || e.key === '_') this.zoomBy(1 / 1.5);
            else if (e.shiftKey && e.code === 'Digit0') this.zoomTo(1);
            // biome-ignore lint/suspicious/noFocusedTests: Camera.fit, not a focused test
            else if (e.shiftKey && e.code === 'Digit1') this.fit();
            else return;
            e.preventDefault();
        });
        on(window, 'keyup', (e) => {
            if (e.code !== 'Space' || !this._space) return;
            this._space = false;
            this._syncCursor();
        });
        on(window, 'blur', () => {
            this._space = false;
            this._syncCursor();
        });
    }

    /** Keeps `state.width` and `state.height` in step with the element. */
    private _observe(): void {
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(() => {
            this._width.set(this._el.clientWidth);
            this._height.set(this._el.clientHeight);
        });

        ro.observe(this._el);
        this._off.push(() => ro.disconnect());
    }

    /** Tracks drag speed for the fling, smoothed over the last few moves. */
    private _fling(dx: number, dy: number): void {
        const now = performance.now();
        const last = this._lastMove || now - 16;
        const dt = Math.max(1, now - last) / 1000;

        this._lastMove = now;
        this._vx = this._vx * 0.6 + (dx / dt) * 0.4;
        this._vy = this._vy * 0.6 + (dy / dt) * 0.4;
    }

    private _lastMove = 0;
    /** The pointer clicked the canvas and has not left it since: plain scrolls pan. */
    private _engaged = false;

    private _pageScrolls(): boolean {
        const mode = this._opts.pageScroll ?? 'auto';

        if (mode === false) return false;
        if (mode === true) return true;
        const doc = typeof document === 'undefined' ? null : document.scrollingElement;

        return !!doc && doc.scrollHeight > doc.clientHeight + 1;
    }

    private _release(): void {
        // a pause before letting go means no fling
        const stale = performance.now() - this._lastMove > 60;

        this._lastMove = 0;
        if (!(this._opts.inertia ?? true) || stale) this._vx = this._vy = 0;
        else {
            this._free = false;
            this._driver.wake();
        }
    }
}

function pinchOf(touches: Map<number, PointData>): { d: number; cx: number; cy: number } {
    const pts = [...touches.values()];
    const a = pts[0];
    const b = pts[1] ?? a;

    return { d: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
}

/** Options of {@link ZoomControl}. */
export interface ZoomControlOptions {
    /** Panel colour, drawn at 92% alpha. Default `0x1c1c1e`. */
    fill?: number | string;
    /** Text and icon colour. Default white. */
    color?: number | string;
    /** Zoom factor of one click on `-` or `+`. Default 1.5. */
    step?: number;
    /** What a click on the percentage does: fit the content, go to 100%, or nothing. Default `fit`. */
    onLabel?: 'fit' | 'reset' | 'none';
    /**
     * Builds the percentage text. Default a PixiJS `Text` at resolution 3. Pass `silkLabel()` from
     * `pixi-silk/text` to draw it as SDF text instead.
     */
    label?: LabelFactory;
}

/**
 * A `- 100% +` pill for a {@link Camera}, 128x32 pixels. The buttons zoom around the view's centre and
 * the percentage fits the content (or resets). The readout follows the camera's zoom signal.
 * Place it in screen space, beside the world. Destroying it unsubscribes from the camera.
 *
 * Experimental: the API may change in a minor release.
 * @experimental
 */
export class ZoomControl extends Container {
    private readonly _bg = new SilkGraphics();
    private readonly _hl = new SilkGraphics();
    private readonly _label: TextLabel;
    private readonly _off: () => void;
    private readonly _w = 128;
    private readonly _h = 32;

    constructor(camera: Camera, options: ZoomControlOptions = {}) {
        super({ label: 'ZoomControl' });
        const color = hex(options.color ?? 0xffffff);
        const step = options.step ?? 1.5;
        const w = this._w;
        const h = this._h;
        const minus = new SilkGraphics().rect(-5, -0.75, 10, 1.5).fill(color);
        const plus = new SilkGraphics().rect(-5, -0.75, 10, 1.5).rect(-0.75, -5, 1.5, 10).fill(color);

        this._bg
            .pill(0, 0, w, h)
            .fill({ color: 0x000000, alpha: 0.35, blur: 10, spread: 1 })
            .pill(0, 0, w, h)
            .fill({ color: hex(options.fill ?? 0x1c1c1e), alpha: 0.92 })
            .stroke({ width: 1, color: 0xffffff, alpha: 0.12, alignment: 'inside' });
        const style = {
            fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
            fontSize: 12,
            fontWeight: '600',
            fill: color,
        } as const;

        this._label = options.label ? options.label(style) : new Text({ text: '100%', style, resolution: 3 });
        this._label.text = '100%';
        this._label.anchor.set(0.5);
        this._label.position.set(w / 2, h / 2);
        minus.position.set(h / 2, h / 2);
        plus.position.set(w - h / 2, h / 2);
        this.addChild(this._bg, this._hl, minus, plus, this._label);

        const zone = (x: number) => (x < h ? -1 : x > w - h ? 1 : 0);
        const highlight = (z: number | null) => {
            this._hl.clear();
            if (z === null) return;
            const x = z < 0 ? 2 : z > 0 ? w - h + 2 : h;
            const ww = z === 0 ? w - 2 * h : h - 4;

            this._hl.roundRect(x, 2, ww, h - 4, (h - 4) / 2).fill({ color: 0xffffff, alpha: 0.1 });
        };

        this.eventMode = 'static';
        this.cursor = 'pointer';
        this.hitArea = { contains: (x: number, y: number) => x >= 0 && x <= w && y >= 0 && y <= h };
        this.on('pointermove', (e) => highlight(zone(this.toLocal(e.global).x)));
        this.on('pointerout', () => highlight(null));
        this.on('pointertap', (e) => {
            e.stopPropagation();
            const z = zone(this.toLocal(e.global).x);

            if (z < 0) camera.zoomBy(1 / step);
            else if (z > 0) camera.zoomBy(step);
            else if (options.onLabel === 'reset') camera.zoomTo(1);
            else if (options.onLabel !== 'none') camera.fit();
        });
        this.on('pointerdown', (e) => e.stopPropagation());
        this._off = camera.state.zoom.subscribe((k) => {
            this._label.text = zoomLabel(k);
        });
        this._label.text = zoomLabel(camera.zoom);
    }

    /** Width and height of the control in local units, `[128, 32]`. */
    get size(): [number, number] {
        return [this._w, this._h];
    }

    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        this._off();
        super.destroy(options);
    }
}

/**
 * Formats a zoom (1 is 100%) as a short percentage. Below 10% it keeps one decimal (`2.5%`),
 * from 10,000% it switches to `k` (`2.5k%`) and from 1,000,000% to `M` (`1.2M%`).
 */
export function zoomLabel(k: number): string {
    const p = k * 100;

    if (p >= 1e6) return `${(p / 1e6).toFixed(1)}M%`;
    if (p >= 1e4) return `${(p / 1e3).toFixed(1)}k%`;

    return `${p >= 10 ? Math.round(p) : p.toFixed(1)}%`;
}
