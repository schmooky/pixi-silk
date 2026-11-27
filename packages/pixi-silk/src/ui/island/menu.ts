import { type ColorSource, Container, Rectangle, type Ticker } from 'pixi.js';
import { damp } from '../../motion';
import { SilkGraphics } from '../../SilkGraphics';
import type { Signal } from '../../signal';
import { Driver } from '../driver';
import type { LabelFactory, TextLabel } from '../label';
import { hex, mix } from '../paint';
import { islandLabel } from './text';

/** One row of an {@link IslandMenu}. */
export type IslandMenuItem =
    | {
          /** Stable id, handed to `onSelect`. */
          id: string;
          /** Text of the row. */
          label: string;
          /** A switch bound to a signal. */
          type: 'toggle';
          value: Signal<boolean>;
      }
    | {
          id: string;
          label: string;
          /** A value that steps through `options` on each tap. */
          type: 'choice';
          options: readonly string[];
          value: Signal<string>;
      }
    | {
          id: string;
          label: string;
          /** A plain row that only reports the tap. Default. */
          type?: 'action';
          /** Grey text on the right. */
          detail?: string;
      };

/** Options of {@link IslandMenu}. */
export interface IslandMenuOptions {
    /** The rows, top to bottom. */
    items: readonly IslandMenuItem[];
    /** Small grey heading above the rows. */
    title?: string;
    /** Width, local units. Default 220. */
    width?: number;
    /** Row height. Default 40. */
    rowHeight?: number;
    /** Colour of switches that are on. Default 0x30d158. */
    accent?: ColorSource;
    /** Called after a row is tapped, with its id, once a toggle or choice has changed. */
    onSelect?: (id: string) => void;
    /** Builds the text. Default PixiJS `Text`. */
    label?: LabelFactory;
    /** `null` to step it by hand with {@link IslandMenu.tick}. Default `Ticker.shared`. */
    ticker?: Ticker | null;
}

/** Draws a gear, `size` wide, centred on (0, 0), in white: an {@link IconSource} for a settings island. */
export function gearIcon(g: SilkGraphics, size: number): void {
    const r = size / 2;

    g.boolean(
        'subtract',
        (g) => g.star(0, 0, 8, r, r * 0.74, Math.PI / 8, r * 0.12),
        (g) => g.circle(0, 0, r * 0.36),
    ).fill(0xffffff);
}

const PAD = 12;

/**
 * Rows of switches, choices and actions, sized for the open state of a small island: a settings
 * menu that grows out of a gear. Its box is {@link IslandMenu.boxWidth} by
 * {@link IslandMenu.boxHeight} from (0, 0).
 * Switches slide when their signal changes, from a tap or from elsewhere.
 */
export class IslandMenu extends Container {
    /** Width of the menu's box, local units. */
    readonly boxWidth: number;
    /** Height of the menu's box, local units. */
    readonly boxHeight: number;
    private readonly _onSelect?: (id: string) => void;
    private readonly _g = new SilkGraphics();
    private readonly _items: readonly IslandMenuItem[];
    private readonly _knobs: number[];
    private readonly _values: (TextLabel | null)[] = [];
    private readonly _driver: Driver;
    private readonly _w: number;
    private readonly _rowH: number;
    private readonly _top: number;
    private readonly _accent: number;
    private readonly _unsubs: (() => void)[] = [];
    private _hover = -1;

    constructor(options: IslandMenuOptions) {
        super({ label: 'IslandMenu' });
        this._items = options.items;
        this._w = options.width ?? 220;
        this.boxWidth = this._w;
        this._rowH = options.rowHeight ?? 40;
        this._accent = hex(options.accent ?? 0x30d158);
        this.addChild(this._g);
        let top = PAD;

        if (options.title) {
            const t = islandLabel(options.label, { fontSize: 11, fontWeight: '600', letterSpacing: 1 });

            t.text = options.title.toUpperCase();
            t.tint = 0x8e8e93;
            t.position.set(PAD + 4, top);
            this.addChild(t);
            top += 22;
        }
        this._top = top;
        this.boxHeight = top + this._items.length * this._rowH + PAD - 4;
        this._knobs = this._items.map((it) => (it.type === 'toggle' && it.value.value ? 1 : 0));

        this._items.forEach((item, i) => {
            const y = top + i * this._rowH;
            const row = new Container({ label: `IslandMenu:${item.id}` });
            const text = islandLabel(options.label, { fontSize: 14, fontWeight: '500' });

            text.text = item.label;
            text.anchor.set(0, 0.5);
            text.position.set(PAD + 4, this._rowH / 2);
            row.addChild(text);
            let value: TextLabel | null = null;

            if (item.type === 'choice' || (item.type !== 'toggle' && item.detail)) {
                value = islandLabel(options.label, { fontSize: 13, fontWeight: '500' });
                value.text = item.type === 'choice' ? item.value.value : (item.detail ?? '');
                value.tint = 0x8e8e93;
                value.anchor.set(1, 0.5);
                value.position.set(this._w - PAD - 4, this._rowH / 2);
                row.addChild(value);
            }
            this._values.push(value);
            row.position.set(0, y);
            row.hitArea = new Rectangle(4, 0, this._w - 8, this._rowH);
            row.eventMode = 'static';
            row.cursor = 'pointer';
            row.on('pointerenter', () => this._setHover(i));
            row.on('pointerleave', () => this._setHover(this._hover === i ? -1 : this._hover));
            row.on('pointertap', () => this._select(i));
            this.addChild(row);
            if (item.type === 'toggle') this._unsubs.push(item.value.subscribe(() => this._driver.wake()));
            if (item.type === 'choice') {
                this._unsubs.push(
                    item.value.subscribe((v) => {
                        if (value) value.text = v;
                    }),
                );
            }
        });
        this.boundsArea = new Rectangle(0, 0, this.boxWidth, this.boxHeight);
        this._driver = new Driver((dt) => this._step(dt), options.ticker);
        this._onSelect = options.onSelect;
        this._draw();
    }

    /** Advances the switches by `dt` seconds (for `ticker: null`). Returns true while one moves. */
    tick(dt: number): boolean {
        return this._driver.tick(dt);
    }

    /** Taps a row by index, as a pointer would. */
    select(index: number): void {
        this._select(index);
    }

    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        this._driver.sleep();
        for (const u of this._unsubs) u();
        super.destroy(options);
    }

    private _select(i: number): void {
        const item = this._items[i];

        if (!item) return;
        if (item.type === 'toggle') item.value.value = !item.value.value;
        else if (item.type === 'choice') {
            const at = item.options.indexOf(item.value.value);

            item.value.value = item.options[(at + 1) % item.options.length];
        }
        this._onSelect?.(item.id);
    }

    private _setHover(i: number): void {
        if (i === this._hover) return;
        this._hover = i;
        this._draw();
    }

    private _step(dt: number): boolean {
        let busy = false;

        this._items.forEach((item, i) => {
            if (item.type !== 'toggle') return;
            const target = item.value.value ? 1 : 0;
            const k = damp(this._knobs[i], target, 16, dt);

            this._knobs[i] = Math.abs(k - target) < 0.002 ? target : k;
            if (this._knobs[i] !== target) busy = true;
        });
        this._draw();

        return busy;
    }

    private _draw(): void {
        const g = this._g.clear();
        const h = this._rowH;

        if (this._hover >= 0) {
            g.roundRect(4, this._top + this._hover * h + 2, this._w - 8, h - 4, 12).fill({
                color: 0xffffff,
                alpha: 0.08,
            });
        }
        this._items.forEach((item, i) => {
            const y = this._top + i * h;

            if (i > 0) g.rect(PAD + 4, y, this._w - PAD * 2 - 8, 1).fill({ color: 0xffffff, alpha: 0.06 });
            if (item.type === 'toggle') {
                const k = this._knobs[i];
                const tw = 40;
                const th = 24;
                const x = this._w - PAD - 4 - tw;
                const cy = y + h / 2;

                g.pill(x, cy - th / 2, tw, th).fill(mix(0x3a3a3c, this._accent, k));
                g.circle(x + th / 2 + k * (tw - th), cy, th / 2 - 2.5).fill(0xffffff);
            } else if (item.type !== 'choice') {
                // chevron
                const x = this._w - PAD - 6;
                const cy = y + h / 2;

                if (!this._values[i]) {
                    g.moveTo(x - 4, cy - 5)
                        .lineTo(x, cy)
                        .lineTo(x - 4, cy + 5)
                        .stroke({ width: 2, color: 0x8e8e93, cap: 'round', join: 'round' });
                }
            }
        });
    }
}
