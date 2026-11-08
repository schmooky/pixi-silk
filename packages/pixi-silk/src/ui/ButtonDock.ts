import { Container, type Ticker } from 'pixi.js';
import { damp } from '../motion';
import { Driver } from './driver';
import type { SilkButton } from './SilkButton';

/** Options of {@link ButtonDock}. */
export interface ButtonDockOptions {
    /** Default `row`. */
    direction?: 'row' | 'column';
    /** Space between buttons, local units. Default 12. */
    gap?: number;
    /** Where the row sits on the dock's origin: `start` begins there, `end` ends there. Default `center`. */
    align?: 'start' | 'center' | 'end';
    /** Delay between buttons in `showAll` / `hideAll`, seconds. Default 0.04. */
    stagger?: number;
    /** Ticker that runs the reflow. Default `Ticker.shared`. With `null`, call {@link ButtonDock.tick} yourself. */
    ticker?: Ticker | null;
}

/**
 * A row or column of {@link SilkButton}s that closes the gap when one hides and opens it when it
 * comes back, gliding the others into place. Slot sizes follow each button's animated appearance,
 * so the reflow and the fade are one motion. The dock sets each button's `x` (row) or `y` (column),
 * so do not position them yourself.
 */
export class ButtonDock extends Container {
    private readonly _buttons: SilkButton[] = [];
    private readonly _stops = new Map<SilkButton, () => void>();
    private readonly _pos = new Map<SilkButton, number>();
    private readonly _driver: Driver;
    private readonly _opts: Required<Omit<ButtonDockOptions, 'ticker'>>;

    constructor(options: ButtonDockOptions = {}) {
        super({ label: 'ButtonDock' });
        this._opts = {
            direction: options.direction ?? 'row',
            gap: options.gap ?? 12,
            align: options.align ?? 'center',
            stagger: options.stagger ?? 0.04,
        };
        this._driver = new Driver((dt) => this._step(dt), options.ticker);
    }

    /** Buttons in order, hidden ones included. */
    get buttons(): readonly SilkButton[] {
        return this._buttons;
    }

    /** Appends buttons and adds them as children. A button already in the dock is skipped. */
    add(...buttons: SilkButton[]): this {
        for (const b of buttons) {
            if (this._buttons.includes(b)) continue;
            this._buttons.push(b);
            this.addChild(b);
            this._stops.set(
                b,
                b.state.phase.subscribe(() => this._driver.wake()),
            );
        }
        this._driver.wake();

        return this;
    }

    /** Removes a button from the dock and from its children. It is not destroyed. */
    remove(button: SilkButton): this {
        const i = this._buttons.indexOf(button);

        if (i < 0) return this;
        this._buttons.splice(i, 1);
        this._stops.get(button)?.();
        this._stops.delete(button);
        this._pos.delete(button);
        this.removeChild(button);
        this._driver.wake();

        return this;
    }

    /** Shows every button, first to last, `stagger` seconds apart. Resolves with each button's `show()` result. */
    showAll(): Promise<boolean[]> {
        return this._cascade(this._buttons, true);
    }

    /** Hides every button, last to first, `stagger` seconds apart. Resolves with each button's `hide()` result. */
    hideAll(): Promise<boolean[]> {
        return this._cascade([...this._buttons].reverse(), false);
    }

    /** Advances the layout by `dt` seconds (only needed with `ticker: null`). Returns true while moving. */
    tick(dt: number): boolean {
        return this._driver.tick(dt);
    }

    /** Stops the reflow. Pass `{ children: true }` to destroy the buttons too. */
    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        this._driver.sleep();
        for (const stop of this._stops.values()) stop();
        this._stops.clear();
        super.destroy(options);
    }

    private _cascade(list: SilkButton[], show: boolean): Promise<boolean[]> {
        const ms = this._opts.stagger * 1000;

        return Promise.all(
            list.map(
                (b, i) =>
                    new Promise<boolean>((resolve) => {
                        const go = () => (show ? b.show() : b.hide()).then(resolve);

                        if (i === 0 || ms <= 0) go();
                        else setTimeout(go, i * ms);
                    }),
            ),
        );
    }

    private _step(dt: number): boolean {
        const { direction, gap, align } = this._opts;
        const row = direction === 'row';
        const sizes = this._buttons.map((b) => (row ? b.buttonWidth : b.buttonHeight));
        const weights = this._buttons.map((b) => b.appearance);
        let total = 0;

        sizes.forEach((s, i) => {
            total += (s + gap) * weights[i];
        });
        total = Math.max(0, total - gap);
        let cursor = align === 'start' ? 0 : align === 'end' ? -total : -total / 2;
        let busy = false;

        this._buttons.forEach((b, i) => {
            const w = weights[i];
            // a hiding button stays centred on its shrinking slot
            const target = cursor + (sizes[i] * w) / 2;
            const prev = this._pos.get(b);
            const next = prev === undefined ? target : damp(prev, target, 16, dt);

            this._pos.set(b, next);
            if (Math.abs(next - target) > 0.05) busy = true;
            if (row) b.x = next;
            else b.y = next;
            cursor += (sizes[i] + gap) * w;
            const phase = b.state.phase.value;

            if (phase === 'showing' || phase === 'hiding') busy = true;
        });

        return busy;
    }
}
