import { type ColorSource, Container, Rectangle, type Ticker } from 'pixi.js';
import { damp } from '../../motion';
import { SilkGraphics } from '../../SilkGraphics';
import { type ReadSignal, type Signal, signal } from '../../signal';
import { Driver } from '../driver';
import { createIcon, type IconSource, tintIcon } from '../icon';
import type { LabelFactory, TextLabel } from '../label';
import { clamp01, hex } from '../paint';
import { islandLabel } from './text';

/** Options of {@link IslandGauge}. */
export interface IslandGaugeOptions {
    /** 0..1, or a signal to follow. Default 0. */
    value?: number | ReadSignal<number>;
    /** Ring colour. Default 0x30d158. */
    color?: ColorSource;
    /** Track colour, drawn at 18% alpha. Default white. */
    track?: ColorSource;
    /** Icon in the middle, drawn white: a string, texture, container or draw function. */
    icon?: IconSource;
    /** Ring diameter, local units. Default 52. */
    size?: number;
    /** Ring thickness. Default 5. */
    thickness?: number;
    /** Caption under the ring, from the value. `false` hides it. Default the percentage. */
    caption?: false | ((value: number) => string);
    /** Builds the caption. Default PixiJS `Text`. */
    label?: LabelFactory;
    /** `null` to step it by hand with {@link IslandGauge.tick}. Default `Ticker.shared`. */
    ticker?: Ticker | null;
}

/**
 * A progress ring with an icon in the middle and a caption under it, for quotas, levels and
 * loading. Its box is `size` wide and `size + 24` high with the caption, from (0, 0). The ring
 * eases to new values and redraws only while it moves.
 */
export class IslandGauge extends Container {
    /** `value` is 0..1. Set it to move the ring. */
    readonly state: { value: Signal<number> };
    private readonly _ring = new SilkGraphics();
    private readonly _icon: Container | null;
    private readonly _caption: TextLabel | null;
    private readonly _format: ((v: number) => string) | null;
    private readonly _driver: Driver;
    private readonly _size: number;
    private readonly _thick: number;
    private readonly _color: number;
    private readonly _track: number;
    private _shown: number;
    private _unsubs: (() => void)[] = [];

    constructor(options: IslandGaugeOptions = {}) {
        super({ label: 'IslandGauge' });
        this._size = options.size ?? 52;
        this._thick = options.thickness ?? 5;
        this._color = hex(options.color ?? 0x30d158);
        this._track = hex(options.track ?? 0xffffff);
        const source = options.value;
        const first = typeof source === 'number' ? source : (source?.value ?? 0);

        this.state = { value: signal(clamp01(first)) };
        this._shown = this.state.value.value;
        if (source && typeof source !== 'number') {
            this._unsubs.push(source.subscribe((v) => this.state.value.set(clamp01(v))));
        }
        this._format = options.caption === false ? null : (options.caption ?? ((v) => `${Math.round(v * 100)}%`));
        this._icon = options.icon !== undefined ? createIcon(options.icon, this._size * 0.42) : null;
        this._caption = this._format ? islandLabel(options.label, { fontSize: 13, fontWeight: '500' }) : null;
        this.addChild(this._ring);
        if (this._icon) {
            tintIcon(this._icon, 0xffffff);
            this._icon.position.set(this._size / 2, this._size / 2);
            this.addChild(this._icon);
        }
        if (this._caption) {
            this._caption.anchor.set(0.5, 0);
            this._caption.position.set(this._size / 2, this._size + 6);
            this.addChild(this._caption);
        }
        this.boundsArea = new Rectangle(0, 0, this._size, this._caption ? this._size + 24 : this._size);
        this._driver = new Driver((dt) => this._step(dt), options.ticker);
        this._unsubs.push(this.state.value.subscribe(() => this._driver.wake()));
        this._draw();
    }

    /** Advances the easing by `dt` seconds (for `ticker: null`). Returns true while it moves. */
    tick(dt: number): boolean {
        return this._driver.tick(dt);
    }

    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        this._driver.sleep();
        for (const u of this._unsubs) u();
        super.destroy(options);
    }

    private _step(dt: number): boolean {
        const target = this.state.value.value;

        this._shown = damp(this._shown, target, 10, dt);
        const done = Math.abs(this._shown - target) < 0.001;

        if (done) this._shown = target;
        this._draw();

        return !done;
    }

    private _draw(): void {
        const s = this._size;
        const r = (s - this._thick) / 2;
        const g = this._ring;
        const v = this._shown;

        g.clear()
            .circle(s / 2, s / 2, r)
            .stroke({ width: this._thick, color: this._track, alpha: 0.18 });
        if (v > 0.002) {
            g.arcSweep(s / 2, s / 2, r, -Math.PI / 2, Math.PI * 2 * Math.min(v, 0.9999)).stroke({
                width: this._thick,
                color: this._color,
                cap: 'round',
            });
        }
        if (this._caption && this._format) this._caption.text = this._format(this.state.value.value);
    }
}
