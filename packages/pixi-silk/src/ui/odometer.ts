import { BitmapText, Container, Graphics, type TextStyleOptions, type Ticker } from 'pixi.js';
import { ease } from '../motion';
import { type Signal, signal } from '../signal';
import { Driver } from './driver';
import { hex } from './paint';

/**
 * Roll position of every digit column for a value, lowest place first. `units` is the value in
 * its smallest unit (value times 10 ** decimals). Each position runs from 0 to 10. A column only
 * rolls while the column below it passes from 9 to 0, so carries ripple like a mechanical counter.
 */
export function odometerColumns(units: number, columns: number): number[] {
    const out: number[] = [];
    const u = Math.max(0, units);

    for (let k = 0; k < columns; k++) {
        const p = 10 ** k;

        if (k === 0) {
            out.push(u % 10);
            continue;
        }
        const below = u % p;
        const digit = Math.floor(u / p) % 10;
        // the last unit of the lower places carries this column over
        const carry = below > p - 1 ? below - (p - 1) : 0;

        out.push(digit + carry);
    }

    return out;
}

/** Number of digit columns a whole number needs (at least `min`). */
export function digitCount(units: number, min = 1): number {
    const n = Math.floor(Math.abs(units));

    return Math.max(min, n === 0 ? 1 : Math.floor(Math.log10(n)) + 1);
}

/** Count-up time for a jump of `delta` units: longer for bigger jumps, with a cap. */
export function countDuration(base: number, delta: number, speedUp: boolean): number {
    if (!speedUp) return base;

    return base * Math.min(3, 0.6 + 0.3 * Math.log10(Math.abs(delta) + 1));
}

/** Options of {@link Odometer}. */
export interface OdometerOptions {
    /** Start value. Default 0. */
    value?: number;
    /** Digits after the decimal point. Default 0. */
    decimals?: number;
    /** Text before the number, such as a currency sign. */
    prefix?: string;
    /** Text after the number. */
    suffix?: string;
    /** Thousands separator, `''` for none. Default `,`. */
    thousands?: string;
    /** Decimal mark. Default `.`. */
    point?: string;
    /** Minimum number of whole digits. Default 1. */
    minDigits?: number;
    /** Default 32. */
    fontSize?: number;
    /** Default white. */
    color?: number | string;
    textStyle?: TextStyleOptions;
    /** Count-up time in seconds for a small change. Default 0.9. */
    duration?: number;
    /** Bigger jumps count for longer (up to 3x). Default true. */
    speedUp?: boolean;
    /** Easing of the count. Default `outCubic`. */
    easing?: (t: number) => number;
    ticker?: Ticker | null;
    /** The count reached its target. */
    onDone?: (value: number) => void;
}

/** The reactive state of an {@link Odometer}. */
export interface OdometerState {
    /** Target value. Writing it counts towards it. */
    value: Signal<number>;
    /** Value on display, as it counts. */
    shown: Signal<number>;
    /** True while counting. */
    counting: Signal<boolean>;
}

interface Column {
    root: Container;
    a: BitmapText;
    b: BitmapText;
    digit: number;
}

/**
 * A number that rolls its digits into place like a mechanical counter, for live readouts and win
 * counters. Each column shows two glyphs at most and the frame only moves them, so it stays cheap
 * while counting. Glyphs come from a bitmap font made from the text style on first use.
 * A mask clips the columns.
 */
export class Odometer extends Container {
    readonly state: OdometerState;

    private readonly _opts: OdometerOptions;
    private readonly _driver: Driver;
    private readonly _decimals: number;
    private readonly _style: TextStyleOptions;
    private _from = 0;
    private _to = 0;
    private _t = 1;
    private _dur = 0.9;
    private _columns: Column[] = [];
    private _statics: BitmapText[] = [];
    private _mask: Graphics | null = null;
    private readonly _wrap = new Container();
    private _layoutDigits = -1;
    private _digitW = 0;
    private _lineH = 0;

    constructor(options: OdometerOptions = {}) {
        super({ label: 'Odometer' });
        this._opts = options;
        this._decimals = Math.max(0, Math.min(8, options.decimals ?? 0));
        this._style = {
            fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
            fontWeight: '700',
            fontSize: options.fontSize ?? 32,
            fill: hex(options.color ?? 0xffffff),
            ...options.textStyle,
        };
        const v = options.value ?? 0;

        this._from = this._to = v;
        this.state = { value: signal(v), shown: signal(v), counting: signal(false) };
        this.state.value.subscribe((next) => this._countTo(next));
        this._driver = new Driver((dt) => this._step(dt), options.ticker);
        this._driver.wake();
    }

    /** Counts to `value`. Same as writing `state.value`. */
    set(value: number): void {
        this.state.value.set(value);
    }

    /** Jumps to the end of the current count. */
    skip(): void {
        this._t = 1;
        this._driver.wake();
    }

    /** Advances the count by `dt` seconds (only needed with `ticker: null`). Returns true while counting. */
    tick(dt: number): boolean {
        return this._driver.tick(dt);
    }

    /** Text of a value in this odometer's format, without rolling. */
    format(value: number): string {
        const { prefix = '', suffix = '', thousands = ',', point = '.' } = this._opts;
        const neg = value < 0;
        const fixed = Math.abs(value).toFixed(this._decimals);
        const [whole, frac] = fixed.split('.');
        const padded = whole.padStart(this._opts.minDigits ?? 1, '0');
        const grouped = thousands ? padded.replace(/\B(?=(\d{3})+(?!\d))/g, thousands) : padded;

        return `${neg ? '-' : ''}${prefix}${grouped}${frac ? point + frac : ''}${suffix}`;
    }

    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        this._driver.sleep();
        super.destroy(options ?? { children: true });
    }

    private _countTo(next: number): void {
        this._from = this.state.shown.value;
        this._to = next;
        this._t = 0;
        this._dur = countDuration(
            this._opts.duration ?? 0.9,
            (next - this._from) * 10 ** this._decimals,
            this._opts.speedUp ?? true,
        );
        this.state.counting.set(true);
        this._driver.wake();
    }

    private _step(dt: number): boolean {
        if (this._t < 1) this._t = Math.min(1, this._t + dt / Math.max(this._dur, 1e-3));
        const k = (this._opts.easing ?? ease.outCubic)(this._t);
        const shown = this._t >= 1 ? this._to : this._from + (this._to - this._from) * k;

        this.state.shown.set(shown);
        if (!this.destroyed && this.renderable) this._render(shown, this._t >= 1);
        if (this._t >= 1 && this.state.counting.value) {
            this.state.counting.set(false);
            this._opts.onDone?.(this._to);
        }

        return this._t < 1;
    }

    // ------------------------------------------------------------------------------ view

    private _glyph(text: string): BitmapText {
        const t = new BitmapText({ text, style: this._style });

        t.anchor.set(0.5, 0.5);

        return t;
    }

    /** Rebuilds the columns and separators when the number of digits changes. */
    private _layout(digits: number): void {
        for (const c of this._columns) c.root.destroy({ children: true });
        for (const s of this._statics) s.destroy();
        this._columns = [];
        this._statics = [];
        if (!this._mask) {
            // one mask for every column: digits roll in and out of a single window
            this._mask = new Graphics();
            this.addChild(this._wrap, this._mask);
            this._wrap.mask = this._mask;
        }
        const probe = this._glyph('0');

        this._digitW = probe.width;
        this._lineH = probe.height;
        probe.destroy();

        // layout from the left: prefix, digits with separators, point, decimals, suffix
        const { prefix = '', suffix = '', thousands = ',', point = '.' } = this._opts;
        const whole = digits - this._decimals;
        const pieces: { text: string; column: number }[] = [];

        if (prefix) pieces.push({ text: prefix, column: -1 });
        for (let i = 0; i < digits; i++) {
            const place = digits - 1 - i;

            if (i > 0 && i < whole && thousands && (whole - i) % 3 === 0) pieces.push({ text: thousands, column: -1 });
            if (i === whole && this._decimals > 0) pieces.push({ text: point, column: -1 });
            pieces.push({ text: '', column: place });
        }
        if (suffix) pieces.push({ text: suffix, column: -1 });

        const columns: Column[] = new Array(digits);
        let x = 0;

        for (const piece of pieces) {
            if (piece.column < 0) {
                const s = this._glyph(piece.text);

                s.position.set(x + s.width / 2, 0);
                x += s.width;
                this._statics.push(s);
                this.addChild(s);
                continue;
            }
            const root = new Container();
            const a = this._glyph('0');
            const b = this._glyph('1');

            root.position.set(x + this._digitW / 2, 0);
            root.addChild(a, b);
            this._wrap.addChild(root);
            columns[piece.column] = { root, a, b, digit: -1 };
            x += this._digitW;
        }
        this._columns = columns;
        // centred on the origin
        for (const child of [...this._wrap.children, ...this._statics]) child.x -= x / 2;
        this._mask
            .clear()
            .rect(-x / 2 - 4, -this._lineH * 0.5, x + 8, this._lineH)
            .fill(0xffffff);
        this._layoutDigits = digits;
    }

    private _render(shown: number, settled: boolean): void {
        const scale = 10 ** this._decimals;
        const exact = Math.abs(shown) * scale;
        // at rest every column sits on a whole digit, even when the value has more decimals than shown
        const units = settled ? Math.round(exact) : Math.round(exact * 1e6) / 1e6;
        const digits = Math.max(
            digitCount(Math.abs(this._to) * scale, (this._opts.minDigits ?? 1) + this._decimals),
            digitCount(units, (this._opts.minDigits ?? 1) + this._decimals),
        );

        if (digits !== this._layoutDigits) this._layout(digits);
        const pos = odometerColumns(units, digits);
        const h = this._lineH;

        for (let k = 0; k < digits; k++) {
            const col = this._columns[k];
            const p = pos[k];
            const d = Math.floor(p) % 10;
            const f = p - Math.floor(p);

            if (d !== col.digit) {
                col.a.text = String(d);
                col.b.text = String((d + 1) % 10);
                col.digit = d;
            }
            // the leading zeros of a column above the number fade out
            const lead = k >= this._decimals + (this._opts.minDigits ?? 1) && units < 10 ** k ? 0.25 : 1;

            col.a.y = -f * h;
            col.b.y = (1 - f) * h;
            col.a.alpha = (1 - f * 0.6) * lead;
            col.b.alpha = (0.4 + f * 0.6) * lead;
            col.b.visible = f > 0.001;
        }
    }
}
