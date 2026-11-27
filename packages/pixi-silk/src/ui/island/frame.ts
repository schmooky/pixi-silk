import { type ColorSource, Container, type Ticker } from 'pixi.js';
import { Spring } from '../../motion';
import { SilkGraphics } from '../../SilkGraphics';
import { type ReadSignal, type Signal, signal } from '../../signal';
import { Driver } from '../driver';
import { clamp01, hex } from '../paint';
import {
    followViewport,
    type IslandEdge,
    type IslandInsets,
    type IslandRect,
    type IslandViewport,
    readViewport,
} from './geometry';
import { IslandStack } from './stack';

const SIDES: readonly IslandEdge[] = ['top', 'right', 'bottom', 'left'];

/** A column or row of items in one band of an {@link IslandFrame}, such as the icons of a side rail. */
export interface IslandRailOptions {
    /** Band it sits in. Default `left`. */
    side?: IslandEdge;
    /** Items at the start of the band (top, or left). */
    start?: Container[];
    /** Items at the end of the band (bottom, or right). */
    end?: Container[];
    /** Space between items. Default 14. */
    gap?: number;
    /** Space from the ends of the band. Default 18. */
    padding?: number;
}

/** Options of {@link IslandFrame}. */
export interface IslandFrameOptions {
    /** What it frames: an Application (follows its resize) or a rectangle. */
    viewport?: IslandViewport;
    /** Thickness of each band, local units, or one number for all four. Default 0. */
    bands?: IslandInsets | number;
    /** Radius of the inner corners, where the content window is rounded. Default 24. */
    radius?: number;
    /** Fill colour. Default black. Keep it opaque: the bands overlap at the corners. */
    color?: ColorSource;
    /** Items in one band. */
    rail?: IslandRailOptions;
    /** Spring of the bands. Default 240 stiffness, 28 damping. */
    spring?: { stiffness?: number; damping?: number };
    /** `null` to step it by hand with {@link IslandFrame.tick}. Default `Ticker.shared`. */
    ticker?: Ticker | null;
}

/**
 * Bands along the edges of the viewport with a rounded window cut out of them. The canvas reads
 * as a device with a bezel, and the app as the screen inside it. A band can be a side rail of
 * icons, a thin bezel, or nothing. Bands spring to new sizes with {@link IslandFrame.setBands}.
 *
 * `inner` is the window as a signal. Pass it as the viewport of a SmartContainer to lay the game
 * out inside it, and as the viewport of an {@link Island} to grow islands out of the bezel.
 *
 * Bands are plain rectangles (the fast path of the shader) and each inner corner is one small
 * shape, so a frame costs little however big the canvas. Use an opaque colour: the bands overlap
 * where they meet.
 *
 * @example
 * ```ts
 * import { IslandFrame } from 'pixi-silk/ui/island';
 * import { SmartContainer } from 'pixi-silk/ui/layout';
 *
 * const frame = new IslandFrame({ viewport: app, bands: { left: 64, top: 8, right: 8, bottom: 8 } });
 * const game = new SmartContainer({ viewport: frame.inner });
 *
 * app.stage.addChild(game, frame);
 * ```
 */
export class IslandFrame extends Container {
    /** The content window inside the bands, in the parent's space. */
    readonly inner: ReadSignal<IslandRect>;
    /** The rail built from `rail`, if any. */
    readonly rail: { side: IslandEdge; start: IslandStack; end: IslandStack } | null;
    private readonly _inner: Signal<IslandRect>;
    private readonly _g = new SilkGraphics();
    private readonly _springs: Record<IslandEdge, Spring>;
    private readonly _driver: Driver;
    private readonly _color: number;
    private _radius: number;
    private readonly _railPad: number;
    private _source: IslandViewport | null = null;
    private _unfollow: (() => void) | null = null;

    constructor(options: IslandFrameOptions = {}) {
        super({ label: 'IslandFrame' });
        const b =
            typeof options.bands === 'number'
                ? { top: options.bands, right: options.bands, bottom: options.bands, left: options.bands }
                : (options.bands ?? {});
        const sp = options.spring ?? {};

        this._springs = {
            top: new Spring(b.top ?? 0, sp.stiffness ?? 240, sp.damping ?? 28),
            right: new Spring(b.right ?? 0, sp.stiffness ?? 240, sp.damping ?? 28),
            bottom: new Spring(b.bottom ?? 0, sp.stiffness ?? 240, sp.damping ?? 28),
            left: new Spring(b.left ?? 0, sp.stiffness ?? 240, sp.damping ?? 28),
        };
        this._color = hex(options.color ?? 0x000000);
        this._radius = options.radius ?? 24;
        this._inner = signal<IslandRect>({ x: 0, y: 0, width: 0, height: 0 }, sameRect);
        this.inner = this._inner;
        this._g.eventMode = 'static';
        this.addChild(this._g);

        const rail = options.rail;

        this._railPad = rail?.padding ?? 18;
        if (rail) {
            const side = rail.side ?? 'left';
            const axis = side === 'left' || side === 'right' ? 'y' : 'x';
            const start = new IslandStack(rail.start ?? [], { axis, gap: rail.gap ?? 14 });
            const end = new IslandStack(rail.end ?? [], { axis, gap: rail.gap ?? 14 });

            this.rail = { side, start, end };
            this.addChild(start, end);
        } else this.rail = null;
        this._driver = new Driver((dt) => this._step(dt), options.ticker);
        if (options.viewport) this.setViewport(options.viewport);
    }

    /** Radius of the inner corners, local units. Setting it redraws at once. */
    get radius(): number {
        return this._radius;
    }

    set radius(value: number) {
        this._radius = Math.max(0, value);
        this._draw();
    }

    /** Where the bands are heading, local units. */
    get bands(): Required<IslandInsets> {
        const s = this._springs;

        return { top: s.top.target, right: s.right.target, bottom: s.bottom.target, left: s.left.target };
    }

    /** Springs the given bands to new thicknesses. `instant` jumps there. */
    setBands(bands: IslandInsets, instant = false): this {
        for (const side of SIDES) {
            const v = bands[side];

            if (v === undefined) continue;
            const s = this._springs[side];

            s.target = Math.max(0, v);
            if (instant) {
                s.value = s.target;
                s.velocity = 0;
            }
        }
        if (instant) this._draw();
        else this._driver.wake();

        return this;
    }

    /** The band of one side right now, in the parent's space. */
    bandRect(side: IslandEdge): IslandRect {
        const v = readViewport(this._source);
        const t = Math.max(0, this._springs[side].value);

        switch (side) {
            case 'top':
                return { x: v.x, y: v.y, width: v.width, height: t };
            case 'bottom':
                return { x: v.x, y: v.y + v.height - t, width: v.width, height: t };
            case 'left':
                return { x: v.x, y: v.y, width: t, height: v.height };
            default:
                return { x: v.x + v.width - t, y: v.y, width: t, height: v.height };
        }
    }

    /** Follows a new viewport and redraws. `null` stops following. */
    setViewport(source: IslandViewport | null): this {
        this._unfollow?.();
        this._unfollow = null;
        this._source = source;
        if (source) this._unfollow = followViewport(source, () => this._draw());
        this._draw();

        return this;
    }

    /** Advances the animation by `dt` seconds (for `ticker: null`). Returns true while it moves. */
    tick(dt: number): boolean {
        return this._driver.tick(dt);
    }

    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        this._driver.sleep();
        this._unfollow?.();
        super.destroy(options);
    }

    private _step(dt: number): boolean {
        let busy = false;

        for (const side of SIDES) {
            const s = this._springs[side];

            s.step(dt);
            if (s.settled) s.value = s.target;
            else busy = true;
        }
        this._draw();

        return busy;
    }

    private _draw(): void {
        const v = readViewport(this._source);
        const [t, r, b, l] = SIDES.map((s) => Math.max(0, this._springs[s].value));
        const inner = {
            x: v.x + l,
            y: v.y + t,
            width: Math.max(0, v.width - l - r),
            height: Math.max(0, v.height - t - b),
        };
        const g = this._g;
        const fill = { color: this._color };

        g.clear();
        if (v.width > 0 && v.height > 0) {
            // full-length bands overlap at the corners, so no anti-aliased seam shows between them
            if (t > 0.25) g.rect(v.x, v.y, v.width, t).fill(fill);
            if (b > 0.25) g.rect(v.x, v.y + v.height - b, v.width, b).fill(fill);
            if (l > 0.25) g.rect(v.x, v.y, l, v.height).fill(fill);
            if (r > 0.25) g.rect(v.x + v.width - r, v.y, r, v.height).fill(fill);
            const R = Math.min(this._radius, inner.width / 2, inner.height / 2);

            if (R >= 0.5) {
                const x0 = inner.x;
                const y0 = inner.y;
                const x1 = inner.x + inner.width;
                const y1 = inner.y + inner.height;

                // each inner corner: a square reaching one unit into the bands, less a circle
                for (const [sx, sy, cx, cy] of [
                    [x0 - 1, y0 - 1, x0 + R, y0 + R],
                    [x1 - R, y0 - 1, x1 - R, y0 + R],
                    [x1 - R, y1 - R, x1 - R, y1 - R],
                    [x0 - 1, y1 - R, x0 + R, y1 - R],
                ]) {
                    g.boolean(
                        'subtract',
                        (g) => g.rect(sx, sy, R + 1, R + 1),
                        (g) => g.circle(cx, cy, R),
                    ).fill(fill);
                }
            }
        }
        this._inner.value = inner;
        this._placeRail(v);
    }

    private _placeRail(v: IslandRect): void {
        const rail = this.rail;

        if (!rail) return;
        const band = this.bandRect(rail.side);
        const full = Math.max(1, this._springs[rail.side].target);
        const vertical = rail.side === 'left' || rail.side === 'right';
        const across = vertical ? band.width : band.height;
        const pad = this._railPad;
        // fades out as the band gets too thin for its items
        const need = Math.max(rail.start.across, rail.end.across, 1);
        const alpha =
            clamp01((across - need * 0.8) / Math.max(1, need * 0.4)) * clamp01(this._springs[rail.side].value / full);

        for (const [stack, atEnd] of [
            [rail.start, false],
            [rail.end, true],
        ] as const) {
            stack.alpha = alpha;
            stack.visible = alpha > 0.01;
            if (vertical) {
                stack.layout(across, stack.along);
                stack.position.set(band.x, atEnd ? v.y + v.height - pad - stack.along : v.y + pad);
            } else {
                stack.layout(stack.along, across);
                stack.position.set(atEnd ? v.x + v.width - pad - stack.along : v.x + pad, band.y);
            }
        }
    }
}

function sameRect(a: IslandRect, b: IslandRect): boolean {
    return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
