import { Ticker } from 'pixi.js';

/**
 * Runs a widget's animation step on a ticker only while something moves. `step` returns true
 * while it still has work. Once it returns false the driver leaves the ticker, so idle widgets
 * cost nothing per frame.
 */
export class Driver {
    private _on = false;
    private readonly _step: (dt: number) => boolean;
    private readonly _ticker: Ticker | null;

    /** `ticker` defaults to `Ticker.shared`. Pass `null` to call {@link Driver.tick} yourself (tests, custom loops). */
    constructor(step: (dt: number) => boolean, ticker: Ticker | null = Ticker.shared) {
        this._step = step;
        this._ticker = ticker;
    }

    /** True while attached to the ticker. */
    get running(): boolean {
        return this._on;
    }

    /** Starts stepping on the next frame (no-op when already running). */
    wake(): void {
        if (this._on) return;
        this._on = true;
        this._ticker?.add(this._onTick, this);
    }

    /** Advances by `dt` seconds by hand, clamped to 0..0.1. Returns true while there is still work, and leaves the ticker when done. */
    tick(dt: number): boolean {
        const busy = this._step(Math.min(Math.max(dt, 0), 0.1));

        if (!busy) this.sleep();

        return busy;
    }

    /** Leaves the ticker. Safe to call twice, or after the ticker was destroyed. */
    sleep(): void {
        if (!this._on) return;
        this._on = false;
        try {
            this._ticker?.remove(this._onTick, this);
        } catch {
            // the ticker was destroyed first (an application tearing down its stage): nothing to leave
        }
    }

    private _onTick(ticker: Ticker): void {
        this.tick(ticker.deltaMS / 1000);
    }
}
