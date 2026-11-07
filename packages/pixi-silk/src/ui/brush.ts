import { Container, type FederatedPointerEvent, type Ticker } from 'pixi.js';
import { damp, Spring } from '../motion';
import { SilkGraphics } from '../SilkGraphics';
import { type Signal, signal } from '../signal';
import { clamp } from './arc';
import { Driver } from './driver';
import { onKey } from './keys';
import { hex } from './paint';
import { ValuePill } from './ValuePill';

/** Options of {@link BrushCursor}. Sizes are diameters in the cursor's coordinates. */
export interface BrushCursorOptions {
    /** Default 32. */
    size?: number;
    /** 0 (soft) to 1 (hard). Default 0.7. */
    hardness?: number;
    /** 0 to 1. Default 1. */
    opacity?: number;
    /** Default 1. */
    minSize?: number;
    /** Default 500. */
    maxSize?: number;
    /** Hold this key (a `KeyboardEvent.code`) and move to resize. Default `KeyF`. `null` turns it off. */
    resizeKey?: string | null;
    /** Right-button drag resizes too. Default true. */
    rightDragResize?: boolean;
    /** `[` and `]` step the size. Default true. */
    bracketKeys?: boolean;
    /** Size change per unit of horizontal drag while resizing. Default 1. */
    sizeRate?: number;
    /** Hardness change per unit of vertical drag while resizing. Default 1 / 200. */
    hardnessRate?: number;
    /** Painting area. The OS cursor is hidden over it, and right-drags on it resize. */
    surface?: Container;
    /** Hide the OS cursor over `surface`. Default true. */
    hideCursor?: boolean;
    /** Ring colour. Default white. */
    color?: number | string;
    /** Second ring for contrast on light backgrounds. Default black. */
    outline?: number | string;
    /** Ticker driving the animation. Default `Ticker.shared`. `null` for manual {@link BrushCursor.tick}. */
    ticker?: Ticker | null;
}

/** The reactive state of a {@link BrushCursor}. */
export interface BrushState {
    size: Signal<number>;
    hardness: Signal<number>;
    opacity: Signal<number>;
    /** Pen pressure, 0 to 1. Mice report 0.5 while a button is down. */
    pressure: Signal<number>;
    /** True while a resize gesture runs. */
    resizing: Signal<boolean>;
    /** True while the pointer is over the canvas. */
    inside: Signal<boolean>;
}

/**
 * Brush cursor for paint and sculpt tools: a ring the size of the brush that follows the pointer.
 *
 * - An inner ring shows hardness. A disc grows with pen pressure while drawing.
 * - Small brushes get a crosshair, so the hot spot stays visible.
 * - Hold `F` (or drag with the right button) and move: sideways changes the size, up and down the
 *   hardness. The ring stays where the resize began and a pill reads out the values.
 * - `[` and `]` step the size.
 *
 * Size, hardness, opacity and pressure are signals on `state`: bind your brush engine to them.
 */
export class BrushCursor extends Container {
    readonly state: BrushState;

    private readonly _opts: BrushCursorOptions;
    private readonly _g = new SilkGraphics();
    private readonly _driver: Driver;
    private readonly _color: number;
    private readonly _outline: number;
    private _pill: ValuePill | null = null;
    private _x = 0;
    private _y = 0;
    private _shownSize: number;
    private _shownHard: number;
    private _shownPressure = 0;
    private _fade = 0;
    /** Pop-in scale of the ring after it jumps (the end of a resize). */
    private readonly _pop: Spring = new Spring(1, 420, 20);
    private _anchor: { x: number; y: number; size: number; hardness: number } | null = null;
    private _rightId = -1;
    private _stops: (() => void)[] = [];

    constructor(options: BrushCursorOptions = {}) {
        super({ label: 'BrushCursor' });
        this._opts = options;
        const size = options.size ?? 32;
        const hardness = options.hardness ?? 0.7;

        this.state = {
            size: signal(size),
            hardness: signal(hardness),
            opacity: signal(options.opacity ?? 1),
            pressure: signal(0),
            resizing: signal(false),
            inside: signal(false),
        };
        this._shownSize = size;
        this._shownHard = hardness;
        this._color = hex(options.color ?? 0xffffff);
        this._outline = hex(options.outline ?? 0x000000);
        this._driver = new Driver((dt) => this._step(dt), options.ticker);
        this.addChild(this._g);
        // the cursor never takes hits itself, it only listens to moves
        this.eventMode = 'static';
        this.hitArea = { contains: () => false };
        this.interactiveChildren = false;
        this.on('globalpointermove', this._onMove, this);
        for (const sig of [this.state.size, this.state.hardness, this.state.resizing]) {
            this._stops.push(sig.subscribe(() => this._driver.wake()));
        }
        this._stops.push(onKey((code, down) => this._onKey(code, down)));
        const surface = options.surface;

        if (surface) {
            if (options.hideCursor ?? true) surface.cursor = 'none';
            if (surface.eventMode === 'none' || surface.eventMode === 'passive' || surface.eventMode === 'auto') {
                surface.eventMode = 'static';
            }
            const over = () => this._setInside(true);
            const out = () => this._setInside(false);
            const down = (e: FederatedPointerEvent) => this._onDown(e);
            const up = (e: FederatedPointerEvent) => this._onUp(e);

            surface.on('pointerover', over);
            surface.on('pointerout', out);
            surface.on('pointerdown', down);
            surface.on('pointerup', up);
            surface.on('pointerupoutside', up);
            this._stops.push(() => {
                surface.off('pointerover', over);
                surface.off('pointerout', out);
                surface.off('pointerdown', down);
                surface.off('pointerup', up);
                surface.off('pointerupoutside', up);
            });
        } else {
            this.state.inside.set(true);
        }
    }

    /** Sets the size, clamped to the allowed range. */
    setBrushSize(size: number): void {
        this.state.size.set(clamp(size, this._opts.minSize ?? 1, this._opts.maxSize ?? 500));
    }

    /** Sets the hardness, clamped to 0..1. */
    setHardness(hardness: number): void {
        this.state.hardness.set(clamp(hardness, 0, 1));
    }

    /** Moves the cursor to (x, y) in its own coordinates. Pointer moves call this. */
    setPointer(x: number, y: number): void {
        if (this._anchor) {
            const rate = this._opts.sizeRate ?? 1;
            const hRate = this._opts.hardnessRate ?? 1 / 200;

            this.setBrushSize(this._anchor.size + (x - this._anchor.x) * rate);
            this.setHardness(this._anchor.hardness - (y - this._anchor.y) * hRate);
        } else {
            this._x = x;
            this._y = y;
        }
        this._lastPointer = { x, y };
        this._driver.wake();
    }

    /** Starts a resize gesture at the current pointer position. */
    beginResize(): void {
        if (this._anchor) return;
        const p = this._lastPointer;

        this._anchor = { x: p.x, y: p.y, size: this.state.size.value, hardness: this.state.hardness.value };
        this.state.resizing.set(true);
    }

    /** Ends the resize gesture. */
    endResize(): void {
        if (!this._anchor) return;
        this._anchor = null;
        // the pointer moved during the resize: the ring pops out at the anchor and in under the pointer
        this._x = this._lastPointer.x;
        this._y = this._lastPointer.y;
        this._fade = 0;
        this._pop.value = 0.4;
        this._pop.velocity = 0;
        this.state.resizing.set(false);
        this._driver.wake();
    }

    /** Advances the animation by `dt` seconds (only needed with `ticker: null`). Returns true while moving. */
    tick(dt: number): boolean {
        return this._driver.tick(dt);
    }

    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        this._driver.sleep();
        for (const stop of this._stops) stop();
        this._stops = [];
        if (this._opts.surface && !this._opts.surface.destroyed) this._opts.surface.cursor = 'auto';
        super.destroy(options ?? { children: true });
    }

    // ------------------------------------------------------------------------------ input

    private _lastPointer = { x: 0, y: 0 };

    private _setInside(inside: boolean): void {
        this.state.inside.set(inside);
        this._driver.wake();
    }

    private _onMove(e: FederatedPointerEvent): void {
        const p = this.toLocal(e.global);

        if (e.pointerType === 'pen') this.state.pressure.set(e.buttons ? e.pressure : 0);
        else this.state.pressure.set(e.buttons & 1 ? 0.5 : 0);
        this.setPointer(p.x, p.y);
    }

    private _onDown(e: FederatedPointerEvent): void {
        if (e.button === 2 && (this._opts.rightDragResize ?? true) && this._rightId < 0) {
            this._rightId = e.pointerId;
            const p = this.toLocal(e.global);

            this._lastPointer = { x: p.x, y: p.y };
            this.beginResize();
        }
    }

    private _onUp(e: FederatedPointerEvent): void {
        if (e.pointerId === this._rightId) {
            this._rightId = -1;
            this.endResize();
        }
    }

    private _onKey(code: string, down: boolean): void {
        const key = this._opts.resizeKey === undefined ? 'KeyF' : this._opts.resizeKey;

        if (key && code === key) {
            if (down) this.beginResize();
            else if (this._rightId < 0) this.endResize();

            return;
        }
        if (!down || !(this._opts.bracketKeys ?? true)) return;
        const size = this.state.size.value;

        if (code === 'BracketRight') this.setBrushSize(Math.max(size + 1, size * 1.15));
        if (code === 'BracketLeft') this.setBrushSize(Math.min(size - 1, size / 1.15));
    }

    // ------------------------------------------------------------------------------ drawing

    private _step(dt: number): boolean {
        const st = this.state;
        const size = st.size.value;
        const hard = st.hardness.value;
        const pressure = st.pressure.value;
        const fadeT = st.inside.value || st.resizing.value ? 1 : 0;
        let busy = false;

        this._shownSize = damp(this._shownSize, size, 28, dt);
        this._shownHard = damp(this._shownHard, hard, 28, dt);
        this._shownPressure = damp(this._shownPressure, pressure, 30, dt);
        this._fade = damp(this._fade, fadeT, 16, dt);
        this._pop.step(dt);
        if (!this._pop.settled) busy = true;
        if (Math.abs(this._shownSize - size) > 0.01 * Math.max(1, size)) busy = true;
        if (Math.abs(this._shownHard - hard) > 0.002) busy = true;
        if (Math.abs(this._shownPressure - pressure) > 0.002) busy = true;
        if (Math.abs(this._fade - fadeT) > 0.002) busy = true;

        const g = this._g;
        const x = this._anchor ? this._anchor.x : this._x;
        const y = this._anchor ? this._anchor.y : this._y;
        const r = (this._shownSize / 2) * Math.max(0.05, this._pop.value);
        const a = this._fade;

        g.clear();
        if (a > 0.002) {
            // two rings, light over dark, read on any background
            g.circle(x, y, r).stroke({ width: 3, color: this._outline, alpha: 0.35 * a });
            g.circle(x, y, r).stroke({ width: 1.25, color: this._color, alpha: 0.95 * a });
            if (this._shownHard < 0.98 && r > 6) {
                g.circle(x, y, Math.max(1, r * this._shownHard)).stroke({
                    width: 1,
                    color: this._color,
                    alpha: 0.45 * a,
                    dash: [3, 3],
                });
            }
            if (this._shownPressure > 0.01) {
                g.circle(x, y, Math.max(1, r * this._shownPressure)).fill({
                    color: this._color,
                    alpha: 0.18 * a * st.opacity.value,
                });
            }
            if (r < 8 || st.resizing.value) {
                const arm = Math.max(5, Math.min(9, r + 4));

                for (const [dx, dy] of [
                    [1, 0],
                    [-1, 0],
                    [0, 1],
                    [0, -1],
                ]) {
                    const inner = r < 8 ? r + 2 : 2;

                    g.line(x + dx * inner, y + dy * inner, x + dx * (inner + arm), y + dy * (inner + arm)).stroke({
                        width: 1.25,
                        color: this._color,
                        alpha: 0.9 * a,
                        cap: 'round',
                    });
                }
            }
        }

        if (st.resizing.value) {
            this._pill ??= this.addChild(new ValuePill({ fill: 0x1c1c1e, color: 0xffffff }));
            this._pill.show(`${Math.round(size)} px  ${Math.round(hard * 100)}% hard`);
            this._pill.position.set(x, y + r + 20);
        } else {
            this._pill?.hide();
        }
        if (this._pill?.update(dt)) busy = true;

        return busy;
    }
}
