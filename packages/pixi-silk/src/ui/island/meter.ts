import { type ColorSource, Container, Rectangle } from 'pixi.js';
import { SilkGraphics } from '../../SilkGraphics';
import type { ReadSignal } from '../../signal';
import type { LabelFactory, TextLabel } from '../label';
import { hex } from '../paint';
import { islandLabel } from './text';

/** Options of {@link IslandMeter}. */
export interface IslandMeterOptions {
    /** Small caption above the number, such as `FPS`. */
    title: string;
    /** The number to show. `null` shows a dash. */
    value: ReadSignal<number | null> | ReadSignal<number>;
    /** Formats the number. Default rounded. */
    format?: (value: number) => string;
    /** Colour of the number and the bars for a value. Default white. */
    tone?: (value: number) => ColorSource;
    /** Box width, local units. Default 76. */
    width?: number;
    /** Samples kept for the bars. 0 hides them. Default 18. */
    history?: number;
    /** Top of the bar scale. Default the largest sample kept. */
    max?: number;
    /** Builds the text. Default PixiJS `Text`. */
    label?: LabelFactory;
}

/** Green at 55 frames per second and up, amber from 30, red below: a `tone` for an FPS meter. */
export function fpsTone(fps: number): number {
    return fps >= 55 ? 0x30d158 : fps >= 30 ? 0xffd60a : 0xff453a;
}

/**
 * A caption, a number and a row of bars with its recent values: FPS, frame time, draw calls or
 * any live count. Its box is `width` by 64 from (0, 0). It redraws when the value changes, not
 * every frame.
 */
export class IslandMeter extends Container {
    private readonly _title: TextLabel;
    private readonly _value: TextLabel;
    private readonly _bars = new SilkGraphics();
    private readonly _samples: number[] = [];
    private readonly _opts: IslandMeterOptions;
    private readonly _width: number;
    private readonly _unsub: () => void;

    constructor(options: IslandMeterOptions) {
        super({ label: 'IslandMeter' });
        this._opts = options;
        this._width = options.width ?? 76;
        this._title = islandLabel(options.label, { fontSize: 10, fontWeight: '600', letterSpacing: 1 });
        this._value = islandLabel(options.label, { fontSize: 22, fontWeight: '600' });
        this._title.text = options.title.toUpperCase();
        this._title.tint = 0x8e8e93;
        this._title.anchor.set(0.5, 0);
        this._value.anchor.set(0.5, 0);
        this._title.position.set(this._width / 2, 0);
        this._value.position.set(this._width / 2, 13);
        this.addChild(this._title, this._value, this._bars);
        // a fixed box, so a stack of meters does not move as the numbers change
        this.boundsArea = new Rectangle(0, 0, this._width, 64);
        this._unsub = options.value.subscribe((v) => this._set(v));
        this._set(options.value.value);
    }

    /** Recent values, oldest first. */
    get samples(): readonly number[] {
        return this._samples;
    }

    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        this._unsub();
        super.destroy(options);
    }

    private _set(v: number | null): void {
        const o = this._opts;
        const keep = o.history ?? 18;

        if (v === null) {
            this._value.text = '-';
            this._value.tint = 0xffffff;

            return;
        }
        this._value.text = o.format ? o.format(v) : String(Math.round(v));
        this._value.tint = hex(o.tone?.(v) ?? 0xffffff);
        if (keep <= 0) return;
        this._samples.push(v);
        while (this._samples.length > keep) this._samples.shift();
        this._drawBars(keep);
    }

    private _drawBars(keep: number): void {
        const g = this._bars.clear();
        const top = this._opts.max ?? Math.max(1e-6, ...this._samples);
        const step = this._width / keep;
        const w = Math.max(1, step - 1.5);
        const base = 64;
        const h = 14;

        this._samples.forEach((s, i) => {
            const bh = Math.max(1.5, (Math.min(s, top) / top) * h);
            const x = this._width - (this._samples.length - i) * step;

            g.roundRect(x, base - bh, w, bh, Math.min(1, w / 2)).fill({
                color: hex(this._opts.tone?.(s) ?? 0xffffff),
                alpha: 0.35 + (0.65 * (i + 1)) / this._samples.length,
            });
        });
    }
}
