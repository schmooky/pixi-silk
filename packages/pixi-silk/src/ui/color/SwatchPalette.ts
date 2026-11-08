import { Container, type Ticker } from 'pixi.js';
import { damp } from '../../motion';
import { SilkGraphics } from '../../SilkGraphics';
import { type Signal, signal } from '../../signal';
import { Driver } from '../driver';
import { trackGesture } from '../gesture';
import type { InputProfiles } from '../input';
import { ColorModel, hexToRgb, luminance } from './model';

/** Options of {@link SwatchPalette}. */
export interface SwatchPaletteOptions {
    /** The colour a pick writes to, and whose `history` it shows. Default: a new model. */
    model?: ColorModel;
    /** Fixed colours (0xRRGGBB). Leave out to show the model's `history` (recent colours). */
    colors?: number[];
    /** `grid` rows of rounded squares, `ring` circles around the origin. Default `grid`. */
    layout?: 'grid' | 'ring';
    /** Swatches per row in a grid. Default 8. */
    columns?: number;
    /** Swatch size in local units. Default 24. */
    size?: number;
    /** Space between swatches in local units. Default 6. */
    gap?: number;
    /** Ring radius (to the swatch centres). Default fits the count. */
    radius?: number;
    /** Empty slots drawn while history is short. Default: `columns` for history, 0 for fixed colours. */
    placeholders?: number;
    /** Ticker that runs the hover and pop animation. Default `Ticker.shared`. With `null`, call {@link SwatchPalette.tick} yourself. */
    ticker?: Ticker | null;
    /** Per pointer kind overrides of the tap slop. */
    profiles?: InputProfiles;
}

interface Slot {
    color: number | null;
    x: number;
    y: number;
    hover: number;
    pop: number;
}

/**
 * Swatches to click: a fixed palette or the recent colours of a model, as a grid or a ring.
 * Dragging across swatches previews them, releasing commits. The swatch matching the current colour
 * wears a ring. A ring layout centres on the origin, a grid starts at it.
 */
export class SwatchPalette extends Container {
    /** The colour this palette writes to. */
    readonly model: ColorModel;
    /** Index of the swatch under the pointer, or -1. */
    readonly hovered: Signal<number> = signal(-1);
    private readonly _o: Required<Omit<SwatchPaletteOptions, 'model' | 'colors' | 'ticker' | 'profiles' | 'radius'>> & {
        radius: number | undefined;
    };
    private readonly _fixed: number[] | null;
    private readonly _g = new SilkGraphics();
    private readonly _driver: Driver;
    private _slots: Slot[] = [];
    private _pressed = -1;
    private readonly _stops: (() => void)[] = [];

    constructor(options: SwatchPaletteOptions = {}) {
        super({ label: 'SwatchPalette' });
        this.model = options.model ?? new ColorModel();
        this._fixed = options.colors ?? null;
        const columns = options.columns ?? 8;

        this._o = {
            layout: options.layout ?? 'grid',
            columns,
            size: options.size ?? 24,
            gap: options.gap ?? 6,
            radius: options.radius,
            placeholders: options.placeholders ?? (options.colors ? 0 : columns),
        };
        this._driver = new Driver((dt) => this._step(dt), options.ticker);
        this.addChild(this._g);
        this._stops.push(this.model.history.subscribe(() => this._rebuild()));
        this._stops.push(this.model.value.subscribe(() => this._driver.wake()));
        this._stops.push(
            trackGesture(
                this,
                {
                    onDown: (p) => this._press(p.x, p.y),
                    onDrag: (p) => this._press(p.x, p.y),
                    onUp: () => this._release(),
                },
                { space: this, holdMs: 0, flickSpeed: 0, profiles: options.profiles },
            ),
        );
        this.hitArea = { contains: (x: number, y: number) => this._slotAt(x, y, 4) >= 0 };
        this.cursor = 'pointer';
        this.on('globalpointermove', (e) => {
            const p = this.toLocal(e.global);

            this.hovered.set(this._slotAt(p.x, p.y, 0));
            this._driver.wake();
        });
        this._rebuild();
    }

    /** Colours shown, in order, as 0xRRGGBB. The fixed colours, or the model's history. */
    get colors(): readonly number[] {
        return this._fixed ?? this.model.history.value;
    }

    /** Advances the animation by `dt` seconds (only needed with `ticker: null`). Returns true while moving. */
    tick(dt: number): boolean {
        return this._driver.tick(dt);
    }

    /** Stops the animation and unsubscribes from the model. Destroys children by default. */
    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        this._driver.sleep();
        for (const stop of this._stops) stop();
        super.destroy(options ?? { children: true });
    }

    private _rebuild(): void {
        const colors = this.colors;
        const count = Math.max(colors.length, this._o.placeholders);
        const { layout, columns, size, gap } = this._o;
        const old = new Map(this._slots.map((s) => [s.color, s]));
        const radius = this._o.radius ?? Math.max(size, (count * (size + gap)) / (Math.PI * 2));

        this._slots = Array.from({ length: count }, (_, i) => {
            const color = colors[i] ?? null;
            const x =
                layout === 'ring'
                    ? Math.cos(-Math.PI / 2 + (i / count) * Math.PI * 2) * radius
                    : (i % columns) * (size + gap) + size / 2;
            const y =
                layout === 'ring'
                    ? Math.sin(-Math.PI / 2 + (i / count) * Math.PI * 2) * radius
                    : Math.floor(i / columns) * (size + gap) + size / 2;
            const prev = color !== null ? old.get(color) : undefined;

            // new colours pop in, kept colours slide to their new place
            return prev ? { ...prev, color, x, y } : { color, x, y, hover: 0, pop: color === null ? 1 : 0 };
        });
        this._driver.wake();
    }

    /** Index of the swatch at (x, y), or -1. */
    private _slotAt(x: number, y: number, pad: number): number {
        const half = this._o.size / 2 + pad;

        return this._slots.findIndex((s) => s.color !== null && Math.abs(x - s.x) <= half && Math.abs(y - s.y) <= half);
    }

    private _press(x: number, y: number): void {
        const i = this._slotAt(x, y, 2);

        if (i < 0 || i === this._pressed) return;
        this._pressed = i;
        this.model.setHex(this._slots[i].color as number, undefined, this);
        this._driver.wake();
    }

    private _release(): void {
        if (this._pressed < 0) return;
        this._pressed = -1;
        this.model.commit();
    }

    private _step(dt: number): boolean {
        const g = this._g;
        const { size, layout } = this._o;
        const current = this.model.hex;
        let busy = false;

        g.clear();
        this._slots.forEach((s, i) => {
            const hoverT = i === this.hovered.value || i === this._pressed ? 1 : 0;

            s.hover = damp(s.hover, hoverT, 18, dt);
            s.pop = damp(s.pop, 1, 12, dt);
            if (Math.abs(s.hover - hoverT) > 0.003 || 1 - s.pop > 0.003) busy = true;
            const k = (0.4 + 0.6 * s.pop) * (1 + 0.1 * s.hover);
            const half = (size / 2) * k;
            const round = layout === 'ring' ? half : Math.min(7, half);

            if (s.color === null) {
                g.roundRect(s.x - half, s.y - half, half * 2, half * 2, round).stroke({
                    width: 1.5,
                    color: 0x8e8e93,
                    alpha: 0.4,
                    dash: [3, 3],
                });

                return;
            }
            g.roundRect(s.x - half, s.y - half + 1, half * 2, half * 2, round).fill({
                color: 0x000000,
                alpha: 0.25,
                blur: 2,
            });
            g.roundRect(s.x - half, s.y - half, half * 2, half * 2, round).fill(s.color);
            if (s.color === current) {
                const dark = luminance(hexToRgb(s.color)) > 0.5;

                g.roundRect(s.x - half + 3, s.y - half + 3, half * 2 - 6, half * 2 - 6, Math.max(0, round - 3)).stroke({
                    width: 2,
                    color: dark ? 0x1c1c1e : 0xffffff,
                });
            }
        });

        return busy;
    }
}
