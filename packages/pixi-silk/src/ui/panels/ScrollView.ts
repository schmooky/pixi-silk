import {
    Container,
    type FederatedPointerEvent,
    type FederatedWheelEvent,
    Graphics,
    Rectangle,
    type Ticker,
} from 'pixi.js';
import { damp } from '../../motion';
import { SilkGraphics } from '../../SilkGraphics';
import { type ReadSignal, type Signal, signal } from '../../signal';
import { Driver } from '../driver';
import { type PanelTheme, resolvePanelTheme } from './theme';

/** Options of {@link ScrollView}. */
export interface ScrollViewOptions {
    /** View width. Default 240. */
    width?: number;
    /** View height. Default 320. */
    height?: number;
    /** Height of what scrolls. Set it later with {@link ScrollView.contentHeight}. Default 0. */
    contentHeight?: number;
    /**
     * Which pointers drag the content: `touch` (fingers and pens, default), `all`, or `none`.
     * Mice scroll with the wheel and the scrollbar.
     */
    drag?: 'touch' | 'all' | 'none';
    /** Stretch past the ends and spring back. Default true. */
    overscroll?: boolean;
    /** Colours. */
    theme?: Partial<PanelTheme>;
    ticker?: Ticker | null;
}

/** The reactive state of a {@link ScrollView}. */
export interface ScrollViewState {
    /** How far the content is scrolled, in view units, as drawn (it can pass the ends while it stretches). */
    scrollY: ReadSignal<number>;
    /** True while a finger or the scrollbar drags the content. */
    dragging: ReadSignal<boolean>;
}

/** How far past an end a drag can stretch the content, for a pull of `over` units. */
function rubber(over: number, size: number): number {
    const c = 0.55;

    return (1 - 1 / ((Math.abs(over) * c) / Math.max(1, size) + 1)) * size * Math.sign(over);
}

/**
 * A clipped area that scrolls its {@link ScrollView.content} up and down, the way a native list
 * does. Wheels and trackpads glide to their target, fingers fling with momentum and stretch past
 * the ends, and a slim scrollbar fades in while it moves.
 *
 * Put children in `content` and set `contentHeight`. Lists that only draw their visible rows (the
 * layer tree) read `state.scrollY` and listen to the `scroll` event instead.
 *
 * @example
 * ```ts
 * const view = new ScrollView({ width: 240, height: 300 });
 *
 * view.content.addChild(list);
 * view.contentHeight = list.height;
 * ```
 */
export class ScrollView extends Container {
    /** What scrolls. It moves up as the view scrolls down. */
    readonly content: Container;
    /** Scroll position and drag state, as signals. */
    readonly state: ScrollViewState;
    /** Colours. */
    readonly theme: PanelTheme;

    private readonly _clip = new Graphics();
    private readonly _bar = new SilkGraphics();
    private readonly _driver: Driver;
    private readonly _opts: ScrollViewOptions;
    private readonly _y: Signal<number>;
    private readonly _dragging: Signal<boolean>;
    private _w: number;
    private _h: number;
    private _contentH: number;
    /** Where wheels and `scrollTo` head. Null while a drag or a fling moves the content. */
    private _target: number | null = null;
    private _v = 0;
    private _drag: { id: number; y: number; start: number; t: number; bar: boolean } | null = null;
    private _trail: { y: number; t: number }[] = [];
    private _show = 0;
    private _idle = 0;
    private _hover = false;
    private _wide = 0;

    constructor(options: ScrollViewOptions = {}) {
        super({ label: 'ScrollView' });
        this._opts = options;
        this.theme = resolvePanelTheme(options.theme);
        this._w = options.width ?? 240;
        this._h = options.height ?? 320;
        this._contentH = options.contentHeight ?? 0;
        this._y = signal(0);
        this._dragging = signal(false);
        this.state = { scrollY: this._y, dragging: this._dragging };
        this.content = new Container({ label: 'ScrollContent' });
        this.content.mask = this._clip;
        this.addChild(this._clip, this.content, this._bar);
        this._driver = new Driver((dt) => this._step(dt), options.ticker);
        this.eventMode = 'static';
        this.hitArea = new Rectangle(0, 0, this._w, this._h);
        this.on('wheel', this._onWheel, this);
        this.on('pointerdown', this._onDown, this);
        this.on('globalpointermove', this._onMove, this);
        this.on('pointerup', this._onUp, this);
        this.on('pointerupoutside', this._onUp, this);
        this.on('pointerover', () => {
            this._hover = true;
            this._driver.wake();
        });
        this.on('pointerout', () => {
            this._hover = false;
            this._driver.wake();
        });
        this._layout();
    }

    /** View width. */
    get viewWidth(): number {
        return this._w;
    }

    /** View height. */
    get viewHeight(): number {
        return this._h;
    }

    /** Height of what scrolls. */
    get contentHeight(): number {
        return this._contentH;
    }

    /** Sets {@link ScrollView.contentHeight}. The position stays inside the new range. */
    set contentHeight(h: number) {
        if (h === this._contentH) return;
        this._contentH = Math.max(0, h);
        this._settleInRange();
    }

    /** The largest scroll position. */
    get maxScroll(): number {
        return Math.max(0, this._contentH - this._h);
    }

    /** The scroll position as drawn. */
    get scrollY(): number {
        return this._y.value;
    }

    /** True while the content moves: a glide, a fling or a spring back. */
    get moving(): boolean {
        return this._driver.running;
    }

    /** Changes the view size. */
    resize(width: number, height: number): this {
        if (width === this._w && height === this._h) return this;
        this._w = Math.max(0, width);
        this._h = Math.max(0, height);
        (this.hitArea as Rectangle).width = this._w;
        (this.hitArea as Rectangle).height = this._h;
        this._layout();
        this._settleInRange();

        return this;
    }

    /** Scrolls to `y`, clamped to the range. Glides unless `animate` is false. */
    scrollTo(y: number, animate = true): this {
        const to = Math.min(this.maxScroll, Math.max(0, y));

        this._v = 0;
        if (!animate) {
            this._target = null;
            this._set(to);
        } else {
            this._target = to;
            this._flash();
        }

        return this;
    }

    /** Scrolls by `dy` from where the view is heading. */
    scrollBy(dy: number, animate = true): this {
        return this.scrollTo((this._target ?? this._y.value) + dy, animate);
    }

    /** Scrolls as little as needed to show the content band from `top` to `bottom`. */
    scrollIntoView(top: number, bottom: number, animate = true): this {
        const at = this._target ?? this._y.value;

        if (top < at) return this.scrollTo(top, animate);
        if (bottom > at + this._h) return this.scrollTo(bottom - this._h, animate);

        return this;
    }

    /** Advances the motion by `dt` seconds (only needed with `ticker: null`). Returns true while moving. */
    tick(dt: number): boolean {
        return this._driver.tick(dt);
    }

    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        this._driver.sleep();
        super.destroy(options ?? { children: true });
    }

    // ------------------------------------------------------------------------------- internals

    private _layout(): void {
        this._clip.clear().rect(0, 0, this._w, this._h).fill(0xffffff);
        this._drawBar();
    }

    private _set(y: number): void {
        this._y.set(y);
        this.content.y = -Math.round(y * 2) / 2;
        this._drawBar();
        this.emit('scroll', y);
    }

    private _flash(): void {
        this._idle = 0;
        this._driver.wake();
    }

    private _settleInRange(): void {
        const y = this._y.value;
        const max = this.maxScroll;

        if (this._drag) return;
        if (this._target !== null) this._target = Math.min(max, Math.max(0, this._target));
        if (y > max || y < 0) {
            // content shrank under the view: glide back in
            this._target = Math.min(max, Math.max(0, y));
            this._driver.wake();
        } else this._drawBar();
    }

    private _onWheel(e: FederatedWheelEvent): void {
        if (this.maxScroll <= 0) return;
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this._h : 1;
        const dy = (e.shiftKey && e.deltaX === 0 ? 0 : e.deltaY) * unit;

        if (dy === 0) return;
        e.stopPropagation();
        this._v = 0;
        // trackpads send many small steps, mice a few big ones: both glide to the sum
        this._target = Math.min(this.maxScroll, Math.max(0, (this._target ?? this._y.value) + dy));
        this._flash();
    }

    private _barRect(): { x: number; y: number; w: number; h: number } | null {
        const max = this.maxScroll;

        if (max <= 0) return null;
        const pad = 3;
        const track = this._h - pad * 2;
        const y = this._y.value;
        const over = y < 0 ? -y : y > max ? y - max : 0;
        const len = Math.max(24, (track * this._h) / this._contentH) - over * 0.5;
        const h = Math.max(10, len);
        const t = Math.min(1, Math.max(0, y / max));
        const w = 4 + 3 * this._wide;

        return { x: this._w - w - pad, y: pad + (track - h) * t, w, h };
    }

    private _onDown(e: FederatedPointerEvent): void {
        if (this._drag) return;
        const p = this.toLocal(e.global);
        const bar = this._barRect();
        const onBar = bar !== null && p.x >= bar.x - 6 && p.y >= bar.y - 4 && p.y <= bar.y + bar.h + 4;
        const mode = this._opts.drag ?? 'touch';
        const touch = e.pointerType === 'touch' || e.pointerType === 'pen';

        if (!onBar && (mode === 'none' || (mode === 'touch' && !touch))) return;
        if (this.maxScroll <= 0) return;
        e.stopPropagation();
        this._drag = { id: e.pointerId, y: p.y, start: this._y.value, t: performance.now(), bar: onBar };
        this._trail = [{ y: this._y.value, t: performance.now() }];
        this._target = null;
        this._v = 0;
        this._dragging.set(true);
        this._flash();
    }

    private _onMove(e: FederatedPointerEvent): void {
        const d = this._drag;

        if (!d || e.pointerId !== d.id) return;
        const dy = this.toLocal(e.global).y - d.y;

        this.dragBy(dy, d.bar);
    }

    /**
     * Moves the content as a drag of `dy` view units from the press does. With `bar`, the drag is
     * on the scrollbar and moves the other way, faster. Pointer moves call this.
     */
    dragBy(dy: number, bar = false): void {
        const d = this._drag;
        const start = d?.start ?? this._y.value;
        const max = this.maxScroll;
        let y: number;

        if (bar) {
            const r = this._barRect();
            const track = this._h - 6 - (r?.h ?? 0);

            y = Math.min(max, Math.max(0, start + (track > 0 ? (dy / track) * max : 0)));
        } else {
            y = start - dy;
            if (this._opts.overscroll ?? true) {
                if (y < 0) y = rubber(y, this._h);
                else if (y > max) y = max + rubber(y - max, this._h);
            } else y = Math.min(max, Math.max(0, y));
        }
        const now = performance.now();

        this._trail.push({ y, t: now });
        while (this._trail.length > 2 && now - this._trail[0].t > 80) this._trail.shift();
        this._set(y);
        this._flash();
    }

    private _onUp(e: FederatedPointerEvent): void {
        const d = this._drag;

        if (!d || e.pointerId !== d.id) return;
        this.release();
    }

    /** Drops a finger drag without a fling, when a child takes the gesture over (a long press that drags a row). */
    cancelDrag(): void {
        if (!this._drag) return;
        this._drag = null;
        this._dragging.set(false);
        this._v = 0;
        this._flash();
    }

    /** Lets go of a drag: a fast one keeps gliding and slows down, past an end the content springs back. */
    release(): void {
        const d = this._drag;

        this._drag = null;
        this._dragging.set(false);
        if (!d) return;
        const first = this._trail[0];
        const last = this._trail.at(-1);
        const now = performance.now();

        this._v = 0;
        if (!d.bar && first && last && now - last.t < 60 && this._trail.length > 1) {
            this._v = (last.y - first.y) / (Math.max(1, last.t - first.t) / 1000);
            if (Math.abs(this._v) < 60) this._v = 0;
        }
        this._flash();
    }

    private _step(dt: number): boolean {
        const max = this.maxScroll;
        let y = this._y.value;
        let busy = this._drag !== null;

        if (!this._drag) {
            if (this._v !== 0) {
                // a fling: coast, and brake hard past an end
                y += this._v * dt;
                const out = y < 0 || y > max;

                this._v *= Math.exp(-(out ? 18 : 3.2) * dt);
                if (Math.abs(this._v) < 12) this._v = 0;
                if (!(this._opts.overscroll ?? true)) {
                    y = Math.min(max, Math.max(0, y));
                    if (y === 0 || y === max) this._v = 0;
                }
                busy = true;
            } else if (this._target !== null) {
                y = damp(y, this._target, 16, dt);
                if (Math.abs(y - this._target) < 0.25) {
                    y = this._target;
                    this._target = null;
                } else busy = true;
            } else if (y < 0 || y > max) {
                // spring back from a stretch
                const end = y < 0 ? 0 : max;

                y = damp(y, end, 14, dt);
                if (Math.abs(y - end) < 0.25) y = end;
                else busy = true;
            }
            if (y !== this._y.value) this._set(y);
        }
        // the scrollbar shows while things move or the pointer is over the view, then fades
        this._idle += dt;
        const visible = max > 0 && (busy || this._hover || this._idle < 0.7) ? 1 : 0;
        const wide = this._drag?.bar ? 1 : 0;

        this._show = damp(this._show, visible, visible ? 18 : 6, dt);
        this._wide = damp(this._wide, wide, 18, dt);
        if (Math.abs(this._show - visible) > 0.01 || Math.abs(this._wide - wide) > 0.01) busy = true;
        if (visible && !this._hover && this._idle < 0.7) busy = true;
        this._drawBar();

        return busy;
    }

    private _drawBar(): void {
        const g = this._bar;
        const r = this._barRect();

        g.clear();
        if (!r || this._show < 0.01) return;
        g.roundRect(r.x, r.y, r.w, r.h, r.w / 2).fill({
            color: this.theme.scrollbar,
            alpha: (0.28 + 0.2 * this._wide) * this._show,
        });
    }
}
