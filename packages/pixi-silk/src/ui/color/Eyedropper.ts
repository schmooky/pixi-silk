import { Container, type FederatedPointerEvent, type Ticker } from 'pixi.js';
import { damp } from '../../motion';
import { SilkGraphics } from '../../SilkGraphics';
import { type Signal, signal } from '../../signal';
import { Driver } from '../driver';
import { onKey } from '../keys';
import { type ColorModel, hexToRgb, luminance } from './model';

/**
 * Reads the colour under a point, in global (canvas) coordinates. Return null where there is
 * nothing to sample. The lib does not read pixels itself: the app knows its scene (a texture, a
 * render target with `renderer.extract`, or plain maths).
 */
export type ColorSampler = (x: number, y: number) => number | null;

/** Options of {@link Eyedropper}. */
export interface EyedropperOptions {
    model: ColorModel;
    sample: ColorSampler;
    ticker?: Ticker | null;
    /** Finished: the picked colour, or null when cancelled. */
    onDone?: (color: number | null) => void;
}

/**
 * Pick a colour from the scene. `start()` turns the canvas into a sampling surface: a loupe follows
 * the pointer showing the colour under it, a click or tap picks it, Escape or a right click cancels.
 * Add it last to the stage so it sits on top.
 */
export class Eyedropper extends Container {
    /** True while sampling. */
    readonly active: Signal<boolean> = signal(false);
    /** Colour under the pointer, or null. */
    readonly sampled: Signal<number | null> = signal<number | null>(null);
    private readonly _opts: EyedropperOptions;
    private readonly _g = new SilkGraphics();
    private readonly _driver: Driver;
    private _show = 0;
    private _x = 0;
    private _y = 0;
    private _stopKeys: (() => void) | null = null;

    constructor(options: EyedropperOptions) {
        super({ label: 'Eyedropper' });
        this._opts = options;
        this._driver = new Driver((dt) => this._step(dt), options.ticker);
        this.addChild(this._g);
        this.eventMode = 'none';
        this.hitArea = { contains: () => true };
        this.cursor = 'crosshair';
        this.on('globalpointermove', this._onMove, this);
        this.on('pointerdown', this._onDown, this);
        this.on('pointerup', this._onUp, this);
    }

    /** Starts sampling. */
    start(): void {
        if (this.active.value) return;
        this.parent?.addChild(this);
        this.eventMode = 'static';
        this.active.set(true);
        this._stopKeys = onKey((code, down) => {
            if (down && code === 'Escape') this.cancel();
        });
        this._driver.wake();
    }

    /** Stops without picking. */
    cancel(): void {
        this._finish(null);
    }

    /** Advances the animation by `dt` seconds (only needed with `ticker: null`). */
    tick(dt: number): boolean {
        return this._driver.tick(dt);
    }

    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        this._driver.sleep();
        this._stopKeys?.();
        super.destroy(options ?? { children: true });
    }

    /** Samples at a global point and moves the loupe there. */
    sampleAt(globalX: number, globalY: number): number | null {
        const p = this.toLocal({ x: globalX, y: globalY });

        this._x = p.x;
        this._y = p.y;
        const color = this._opts.sample(globalX, globalY);

        this.sampled.set(color);
        this._driver.wake();

        return color;
    }

    private _onMove(e: FederatedPointerEvent): void {
        if (this.active.value) this.sampleAt(e.global.x, e.global.y);
    }

    private _onDown(e: FederatedPointerEvent): void {
        if (!this.active.value) return;
        if (e.button === 2) {
            this.cancel();

            return;
        }
        this.sampleAt(e.global.x, e.global.y);
    }

    private _onUp(e: FederatedPointerEvent): void {
        if (!this.active.value || e.button === 2) return;
        const color = this.sampleAt(e.global.x, e.global.y);

        if (color !== null) {
            this._opts.model.setHex(color, undefined, this);
            this._opts.model.commit();
        }
        this._finish(color);
    }

    private _finish(color: number | null): void {
        if (!this.active.value) return;
        this.active.set(false);
        this.eventMode = 'none';
        this._stopKeys?.();
        this._stopKeys = null;
        this._opts.onDone?.(color);
        this._driver.wake();
    }

    private _step(dt: number): boolean {
        const target = this.active.value ? 1 : 0;

        this._show = damp(this._show, target, 18, dt);
        const g = this._g;
        const s = this._show;

        g.clear();
        if (s > 0.01) {
            const color = this.sampled.value;
            const r = 24 * (0.6 + 0.4 * s);
            const x = this._x;
            const y = this._y;

            g.circle(x, y + 1.5, r + 6).fill({ color: 0x000000, alpha: 0.3 * s, blur: 6 });
            if (color !== null) g.circle(x, y, r).stroke({ width: 12, color, alpha: s });
            else g.circle(x, y, r).stroke({ width: 12, color: 0x8e8e93, alpha: 0.5 * s, dash: [4, 4] });
            g.circle(x, y, r + 6).stroke({ width: 1.5, color: 0xffffff, alpha: s });
            g.circle(x, y, r - 6).stroke({ width: 1.5, color: 0xffffff, alpha: s });
            const mark = color !== null && luminance(hexToRgb(color)) > 0.5 ? 0x1c1c1e : 0xffffff;

            g.line(x - 5, y, x + 5, y).stroke({ width: 1.5, color: mark, alpha: s });
            g.line(x, y - 5, x, y + 5).stroke({ width: 1.5, color: mark, alpha: s });
        }

        return Math.abs(this._show - target) > 0.003;
    }
}
