import { Circle, Container, type ContainerChild, type IHitArea, Rectangle, Ticker, UPDATE_PRIORITY } from 'pixi.js';
import { requestFrame, silkFrames } from '../frames';
import { Spring } from '../motion';
import { type FillInput, SilkGraphics, type SilkGraphicsOptions, type StrokeInput } from '../SilkGraphics';
import type { ReadSignal } from '../signal';
import { type DrawTextStyle, drawText, measureText } from '../text/draw';
import { FlexContainer, type SmartLayout } from './layout/flex-container';
import { SmartContainer, type SmartContainerOptions } from './layout/smart-container';

/*
 * Blocks: UI that draws in one call and costs almost nothing at rest.
 *
 * A BlockSurface is a SmartContainer with two SilkGraphics layers. Blocks are empty flex slots
 * that take input, and each paints itself into a layer at its slot, shapes and text alike (text
 * goes through drawText, so it is part of the same instanced draw).
 *
 * - The still layer holds what does not change: plates, panels, captions. It is painted once and
 *   cached as a texture, so the distance field of a big plate runs once, not every frame.
 * - The live layer holds the blocks that animate or change. A block moves there the first time it
 *   does. While something moves, only the live layer draws its shapes; at rest it is cached too.
 *
 * The loop runs only while a spring moves, a counter counts or a signal fires, and sleeps after.
 */

/** A value a block reads: a plain value, or a signal the block follows. */
export type Value<T> = T | ReadSignal<T>;

function isSignal<T>(v: Value<T>): v is ReadSignal<T> {
    return typeof v === 'object' && v !== null && 'subscribe' in v && 'value' in v;
}

/** Reads a {@link Value}: the signal's current value, or the value itself. */
export function read<T>(v: Value<T>): T {
    return isSignal(v) ? v.value : v;
}

/** Size of a block, in the surface's design units. */
export interface BlockOptions {
    /** Width. Default 0 (set by the layout through `onSize`). */
    width?: number;
    /** Height. Default 0 (set by the layout through `onSize`). */
    height?: number;
    /**
     * Which layer of the surface paints the block. `'auto'` (default) starts in the cached still
     * layer and moves to the live layer the first time the block animates or changes. `'still'`
     * stays in the still layer: a change repaints and re-caches that layer, and the block keeps its
     * place under live blocks. `'live'` starts in the live layer.
     */
    layer?: BlockLayer;
}

/** A layer of a {@link BlockSurface}: see {@link BlockOptions.layer}. */
export type BlockLayer = 'auto' | 'still' | 'live';

/** Hover and press state of a `pressable` block: springs from 0 to 1. */
export interface PressState {
    /** 1 while the pointer is over the block and it is enabled. */
    readonly hover: Spring;
    /** 1 while the block is held down. */
    readonly press: Spring;
}

/** Options of `pressable`. */
export interface PressableOptions {
    /** Called on a release inside the block after a press that started on it. */
    onPress: () => void;
    /** Whether the block takes input. Default true. */
    enabled?: Value<boolean>;
    /** Hit area: the slot's rectangle (default), the circle inscribed in it, or your own. */
    hitArea?: 'rect' | 'circle' | IHitArea;
    /** Container that takes the pointer. Default the block itself. Use a child for a second button in one block. */
    target?: Container;
}

/**
 * A piece of UI that paints into its surface's painter. Subclass it and implement
 * {@link Block.paint}: draw at `(x, y)`, the top-left corner of the block's slot, with the size in
 * `w` and `h`. Animate with `spring`, follow state with `watch`, take
 * input with `pressable`. Put blocks in a {@link BlockSurface} with
 * {@link Block.layout} or {@link stack}.
 */
export abstract class Block extends Container {
    /** Width of the slot, design units. The layout sets it. */
    w: number;
    /** Height of the slot, design units. The layout sets it. */
    h: number;
    /** The layer it asked for. See {@link BlockOptions.layer}. */
    readonly layer: BlockLayer;
    /** @internal Painted by the live layer. */
    _live: boolean;
    /** @internal Changed since the last paint. */
    _dirty = false;
    private readonly _springs: Spring[] = [];
    private readonly _offs: (() => void)[] = [];

    constructor(options: BlockOptions = {}) {
        super();
        this.w = options.width ?? 0;
        this.h = options.height ?? 0;
        this.layer = options.layer ?? 'auto';
        this._live = this.layer === 'live';
    }

    /** The surface the block is in, or null. */
    get surface(): BlockSurface | null {
        let c: Container | null = this.parent;

        while (c && !(c instanceof BlockSurface)) c = c.parent;

        return c;
    }

    /** Whether its surface uses the cheap look for weak devices (`lowEnd`). */
    protected get lowEnd(): boolean {
        return this.surface?.lowEnd ?? silkFrames.lowEnd;
    }

    /** Draws the block into `g` with its slot's top-left corner at `(x, y)`, in the surface's space. */
    abstract paint(g: SilkGraphics, x: number, y: number): void;

    /**
     * Advances the block's springs by `dt` seconds. Returns true while any moves. Override it to
     * animate something else, and return true while that runs.
     */
    step(dt: number): boolean {
        let moving = false;

        for (const s of this._springs) {
            s.step(dt);
            if (!s.settled) moving = true;
        }

        return moving;
    }

    /**
     * Asks the surface to repaint this block. The surface repaints until every block settles, then
     * sleeps. The first call moves an `'auto'` block to the live layer.
     */
    wake(): void {
        this._dirty = true;
        this.surface?._run();
    }

    /**
     * The flex style of this block's slot: its size, no shrinking, and an `onSize` that keeps
     * `w` and `h` in step with the layout. An absolute slot stretched between two edges (`inset`,
     * or `left` and `right`) takes its size from them instead. Pass it to `add` of a
     * FlexContainer or SmartContainer.
     */
    layout(style: SmartLayout = {}): SmartLayout {
        const onSize = style.onSize;
        const abs = style.position === 'absolute';
        // a slot stretched between two edges takes its size from them, not from the block
        const wide = abs && (style.inset !== undefined || (style.left !== undefined && style.right !== undefined));
        const tall = abs && (style.inset !== undefined || (style.top !== undefined && style.bottom !== undefined));

        return {
            ...(wide || this.w <= 0 ? {} : { width: this.w }),
            ...(tall || this.h <= 0 ? {} : { height: this.h }),
            shrink: 0,
            ...style,
            onSize: (w, h, child) => {
                this.w = w;
                this.h = h;
                this._layoutHit();
                onSize?.(w, h, child);
                // a new size repaints every layer, without moving the block to the live one
                this.surface?.wake();
            },
        };
    }

    /** A spring this block steps and waits for. Default stiffness 420 and damping 30: quick, without overshoot. */
    protected spring(value = 0, stiffness = 420, damping = 30): Spring {
        const s = new Spring(value, stiffness, damping);

        this._springs.push(s);

        return s;
    }

    /** Repaints when any of `sources` changes. Stops following them when the block is destroyed. */
    protected watch(...sources: readonly Value<unknown>[]): this {
        for (const s of sources) if (isSignal(s)) this._offs.push(s.subscribe(() => this.onChange()));

        return this;
    }

    /** Called when a watched signal changes. Wakes the surface. Override to start an animation first. */
    protected onChange(): void {
        this.wake();
    }

    /**
     * Makes the block (or `options.target`) take pointer input: hover and press springs, and
     * `onPress` on a release inside. Returns the springs for {@link Block.paint} to read.
     */
    protected pressable(options: PressableOptions): PressState {
        const hover = this.spring();
        const press = this.spring();
        const target = options.target ?? this;
        const enabled = options.enabled ?? true;
        let down = false;
        const set = (h: number, p: number) => {
            hover.target = h;
            press.target = p;
            this.wake();
        };

        this.watch(enabled);
        target.eventMode = 'static';
        target.cursor = 'pointer';
        this._hit = { target, shape: options.hitArea ?? 'rect' };
        this._layoutHit();
        target.on('pointerover', () => set(read(enabled) ? 1 : 0, press.target));
        target.on('pointerout', () => {
            down = false;
            set(0, 0);
        });
        target.on('pointerdown', () => {
            if (!read(enabled)) return;
            down = true;
            set(hover.target, 1);
        });
        target.on('pointerup', () => {
            const fire = down && read(enabled);

            down = false;
            set(hover.target, 0);
            if (fire) options.onPress();
        });
        target.on('pointerupoutside', () => {
            down = false;
            set(0, 0);
        });

        return { hover, press };
    }

    private _hit: { target: Container; shape: 'rect' | 'circle' | IHitArea } | null = null;

    private _layoutHit(): void {
        const hit = this._hit;

        if (!hit || hit.target !== this) return;
        if (hit.shape === 'rect') this.hitArea = new Rectangle(0, 0, this.w, this.h);
        else if (hit.shape === 'circle')
            this.hitArea = new Circle(this.w / 2, this.h / 2, Math.min(this.w, this.h) / 2);
        else this.hitArea = hit.shape;
    }

    /** Stops following watched signals. */
    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        for (const off of this._offs) off();
        this._offs.length = 0;
        super.destroy(options);
    }
}

/** Options of a {@link BlockSurface}. */
export interface BlockSurfaceOptions extends SmartContainerOptions {
    /**
     * Cache each layer as a texture between changes, so at rest the surface draws textured quads
     * and runs no distance field. Default true. Turn it off for a surface that moves every frame.
     */
    cache?: boolean;
    /**
     * The cheap look for weak devices: flat buttons, panels without corner smoothing, and repaints
     * at most 30 times a second. Default on after `enableLowEnd()` from `pixi-silk`, else off.
     */
    lowEnd?: boolean;
    /**
     * Most repaints per second while something moves. 0 repaints every frame. Default 30 with
     * `lowEnd`, else 0.
     */
    maxFps?: number;
    /**
     * Device pixels per CSS pixel for the cache. Default the viewport's renderer resolution, else
     * `devicePixelRatio`. The surface multiplies it by its own scale.
     */
    resolution?: number;
    /** Settings of both layers (dither, AA width, hairlines). */
    painter?: SilkGraphicsOptions;
}

/** What a {@link BlockSurface} has done: for a debug overlay. */
export interface BlockSurfaceStats {
    /** Frames that repainted a layer, since it was created. */
    repaints: number;
    /** Repaints of the still layer. Each one runs the distance field of every still block once. */
    stillPaints: number;
    /** Blocks in the live layer. */
    liveBlocks: number;
    /** True while the repaint loop runs. */
    awake: boolean;
}

/**
 * A SmartContainer that paints every {@link Block} inside it into two SilkGraphics layers.
 * Blocks that never change (plates, panels, captions) go into the still layer, which is painted
 * once and cached as a texture. A block moves to the live layer the first time it animates or
 * changes (see {@link BlockOptions.layer}). While something moves, only the live layer draws
 * shapes, in one instanced draw on top of the still texture. At rest both layers are textures.
 * A block drawn over a live one goes live with it, so the order on screen stays the tree order.
 * Lay blocks out with `add(block, block.layout())` or {@link stack}.
 *
 * Pass `ticker: app.ticker` so layout, repaint and render run in that order in one frame.
 *
 * @example
 * ```ts
 * import { signal } from 'pixi-silk/signal';
 * import { BlockSurface, ButtonBlock, PanelBlock, stack, TextBlock } from 'pixi-silk/ui/blocks';
 *
 * const coins = signal(0);
 * const bar = new BlockSurface({
 *     viewport: app,
 *     ticker: app.ticker,
 *     layout: { direction: 'row', alignItems: 'center', gap: 24, padding: [0, 32] },
 *     landscapeData: { valign: 'bottom', width: 1920, height: 160, extendWidth: true },
 * });
 * const panel = new PanelBlock({ radius: 32, fill: 0x14161f });
 *
 * bar.add(panel, panel.layout({ position: 'absolute', inset: 0 }));
 * stack(bar, [
 *     new TextBlock({ text: 'COINS', style: { fontSize: 18, fontWeight: 700 }, fill: 0x8e93a6 }),
 *     new ButtonBlock({ width: 96, height: 96, shape: 'circle', label: '+1', onPress: () => coins.value++ }),
 * ]);
 * app.stage.addChild(bar);
 * ```
 */
export class BlockSurface extends SmartContainer {
    /** The live layer: blocks that animate or change paint here, every frame while they move. */
    readonly painter: SilkGraphics;
    /** The still layer: blocks that do not change paint here once, then it is a cached texture. */
    readonly stillPainter: SilkGraphics;
    /** Repaints and loop state. */
    readonly stats: BlockSurfaceStats = { repaints: 0, stillPaints: 0, liveBlocks: 0, awake: false };
    /** Whether blocks use their cheap look. See {@link BlockSurfaceOptions.lowEnd}. */
    readonly lowEnd: boolean;
    /** Most repaints per second while something moves, 0 for every frame. */
    maxFps: number;
    private readonly _ticker: Ticker;
    private readonly _cache: boolean;
    private readonly _resolution: number | undefined;
    private readonly _viewport: unknown;
    private readonly _layers: { box: Container; g: SilkGraphics; moved: boolean; res: number }[];
    private _all = true;
    private _wait = 0;
    private readonly _blocks: Block[] = [];

    constructor(options: BlockSurfaceOptions = {}) {
        const user = options.onLayout;
        let self: BlockSurface | null = null;

        super({
            ...options,
            // every relayout moves slots: paint once
            onLayout: (c) => {
                self?.wake();
                user?.(c);
            },
        });
        self = this;
        this._ticker = options.ticker ?? Ticker.shared;
        this._cache = options.cache ?? true;
        this._resolution = options.resolution;
        this._viewport = options.viewport;
        this.lowEnd = options.lowEnd ?? silkFrames.lowEnd;
        this.maxFps = options.maxFps ?? (this.lowEnd ? 30 : 0);
        this.stillPainter = new SilkGraphics(options.painter);
        this.painter = new SilkGraphics(options.painter);
        this._layers = [this.stillPainter, this.painter].map((g) => {
            const box = new Container();

            box.addChild(g);
            // at the surface's origin, outside the flow
            this.add(box, { position: 'absolute', left: 0, top: 0, onSize: () => {} });

            return { box, g, moved: false, res: 0 };
        });
        this.wake();
    }

    /** Repaints every layer on the next frame. Blocks call {@link Block.wake} instead. */
    wake(): void {
        this._all = true;
        this._run();
    }

    /** @internal Starts the loop. */
    _run(): void {
        if (this.stats.awake || this.destroyed) return;
        this.stats.awake = true;
        // after the layout pass (normal priority), before Pixi renders (low priority)
        this._ticker.add(this._frame, this, UPDATE_PRIORITY.LOW + 1);
    }

    /** Steps every block, repaints both layers now, outside the loop, and caches them. Returns true while a block moves. */
    paintNow(dt = 0): boolean {
        const blocks = this._collect();
        let moving = false;

        for (const b of blocks) if (b.step(dt)) moving = true;
        for (let i = 0; i < 2; i++) {
            this._paint(i, blocks);
            this._bake(i);
        }
        for (const b of blocks) b._dirty = false;
        this._all = false;
        requestFrame();

        return moving;
    }

    /** Stops the loop and drops the caches. Pass `{ children: true }` to destroy the blocks too. */
    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        this._sleep();
        super.destroy(options);
    }

    private _sleep(): void {
        if (!this.stats.awake) return;
        this.stats.awake = false;
        this._ticker.remove(this._frame, this);
    }

    private _frame(t: Ticker): void {
        this._wait += Math.min(t.deltaMS / 1000, 0.1);
        if (this.maxFps > 0 && !this._all && this._wait < 1 / this.maxFps - 1e-4) return;
        const dt = Math.min(this._wait, 0.1);

        this._wait = 0;
        const blocks = this._collect();
        // per layer: something to repaint, something still moving
        const dirty = [this._all, this._all];
        const moving = [false, false];
        let promoted = false;

        for (const b of blocks) {
            const m = b.step(dt);

            if (!m && !b._dirty) continue;
            if (!b._live && b.layer === 'auto') {
                // first change: it leaves the still layer for good
                b._live = true;
                dirty[0] = true;
                promoted = true;
            }
            const i = b._live ? 1 : 0;

            dirty[i] = true;
            if (m) moving[i] = true;
        }
        // blocks drawn over a live one go live too, so the order on screen stays the tree order
        if (promoted) this._cover(blocks);
        let painted = false;

        for (let i = 0; i < 2; i++) {
            const layer = this._layers[i];

            if (moving[i]) {
                // moving: draw live (one instanced draw), not into the cache and out of it
                this._paint(i, blocks);
                if (layer.box.isCachedAsTexture) layer.box.cacheAsTexture(false);
                layer.moved = true;
                painted = true;
            } else if (dirty[i] || layer.moved) {
                // changed, or settled: paint the final state once and cache it
                this._paint(i, blocks);
                this._bake(i);
                layer.moved = false;
                painted = true;
            }
        }
        for (const b of blocks) b._dirty = false;
        this._all = false;
        if (painted) {
            this.stats.repaints++;
            requestFrame();
        }
        if (!moving[0] && !moving[1]) this._sleep();
    }

    /** Every visible block under the surface, in tree order (which is paint order). */
    private _collect(): Block[] {
        const out = this._blocks;

        out.length = 0;
        const walk = (c: Container) => {
            for (const child of c.children) {
                if (!child.visible) continue;
                if (child instanceof Block) out.push(child);
                if (child.children.length) walk(child);
            }
        };

        walk(this);

        return out;
    }

    /** Moves every `'auto'` block that comes after a live block and overlaps it to the live layer. */
    private _cover(blocks: readonly Block[]): void {
        const rects = blocks.map((b) => {
            const [x, y] = this._slotAt(b);

            return [x, y, x + b.w, y + b.h];
        });

        for (let i = 0; i < blocks.length; i++) {
            if (!blocks[i]._live) continue;
            const a = rects[i];

            for (let j = i + 1; j < blocks.length; j++) {
                const k = blocks[j];
                const r = rects[j];

                if (k._live || k.layer !== 'auto') continue;
                if (r[0] < a[2] && a[0] < r[2] && r[1] < a[3] && a[1] < r[3]) k._live = true;
            }
        }
    }

    /** Top-left of a block's slot in the surface's space, from local positions (world transforms may be stale). */
    private _slotAt(b: Block): [number, number] {
        let x = 0;
        let y = 0;
        let c: Container | null = b;

        while (c && c !== this) {
            x = c.x + x * c.scale.x;
            y = c.y + y * c.scale.y;
            c = c.parent;
        }

        return [x, y];
    }

    /** Paints layer `i` (0 still, 1 live) from the blocks that belong to it. */
    private _paint(i: number, blocks: readonly Block[]): void {
        const g = this._layers[i].g;
        const live = i === 1;
        let n = 0;

        g.clear();
        for (const b of blocks) {
            if (b._live !== live) continue;
            n++;
            const [x, y] = this._slotAt(b);

            b.paint(g, x, y);
        }
        if (live) this.stats.liveBlocks = n;
        else this.stats.stillPaints++;
    }

    /** Caches layer `i` as a texture at the resolution it shows at, or refreshes its cache. */
    private _bake(i: number): void {
        if (!this._cache) return;
        const layer = this._layers[i];
        const v = this._viewport as { renderer?: { resolution?: number }; resolution?: number } | undefined;
        const base =
            this._resolution ??
            v?.renderer?.resolution ??
            v?.resolution ??
            (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);
        let scale = 1;

        for (let c: Container | null = this; c; c = c.parent) scale *= Math.abs(c.scale.x);
        const res = base * scale;
        const box = layer.box;

        if (box.isCachedAsTexture && Math.abs(res - layer.res) < 1e-3) {
            box.updateCacheTexture();

            return;
        }
        layer.res = res;
        if (box.isCachedAsTexture) box.cacheAsTexture(false);
        box.cacheAsTexture({ resolution: res, antialias: false });
    }
}

/** An item of {@link stack} or {@link group}: a block (laid out with its own size), a container, or either with a style. */
export type StackItem = Container | readonly [Container, SmartLayout];

/**
 * Adds `items` to `parent` in order: blocks with {@link Block.layout}, other containers with the
 * given style or none. With `style`, the items go into a new {@link group} first, and the group
 * goes into `parent`. Returns the container the items went into.
 *
 * @example
 * ```ts
 * import { BlockSurface, ButtonBlock, stack } from 'pixi-silk/ui/blocks';
 *
 * const bar = new BlockSurface({ viewport: app, landscapeData: { width: 1920, height: 160, valign: 'bottom' } });
 * const a = new ButtonBlock({ width: 80, height: 80, shape: 'circle', label: 'A', onPress: () => {} });
 * const b = new ButtonBlock({ width: 80, height: 80, shape: 'circle', label: 'B', onPress: () => {} });
 *
 * // a column of two buttons inside the bar
 * stack(bar, [a, b], { direction: 'column', gap: 12 });
 * ```
 */
export function stack(parent: FlexContainer, items: readonly StackItem[], style?: SmartLayout): FlexContainer {
    if (style) {
        const g = group(items, style);

        parent.add(g);

        return g;
    }
    for (const item of items) {
        const [child, s] = Array.isArray(item) ? (item as [Container, SmartLayout]) : [item as Container, undefined];

        parent.add(child as ContainerChild, child instanceof Block ? child.layout(s) : (s ?? {}));
    }

    return parent;
}

/**
 * A FlexContainer laid out by `style` (a row, a column, a box with padding) holding `items`.
 * Put it in a surface or in another group: blocks inside it still paint into the surface. It has
 * no layout loop of its own, so on its own (as a root) it is laid out only by `updateLayout()`.
 *
 * @example
 * ```ts
 * import { CounterBlock, group, PanelBlock, TextBlock } from 'pixi-silk/ui/blocks';
 * import { signal } from 'pixi-silk/signal';
 *
 * const score = signal(0);
 * const card = group(
 *     [
 *         [new PanelBlock({ radius: 20 }), { position: 'absolute', inset: 0 }],
 *         new TextBlock({ text: 'SCORE', style: { fontSize: 16 } }),
 *         new CounterBlock({ value: score, width: 180, height: 40, style: { fontSize: 32 } }),
 *     ],
 *     { direction: 'column', padding: 16, width: 220 },
 * );
 * ```
 */
export function group(items: readonly StackItem[], style: SmartLayout = {}): FlexContainer {
    // no loop of its own: the surface (or the container it goes into) lays it out
    const g = new FlexContainer({ layout: style, ticker: null });

    stack(g, items);

    return g;
}

// ------------------------------------------------------------------------------------ built-ins

/** Options of a {@link PanelBlock}. */
export interface PanelBlockOptions extends BlockOptions {
    /** Corner radius, design units. Default 24. */
    radius?: number;
    /** Squircle smoothing, 0 to 1. Default 0.6, or 0 on a `lowEnd` surface (it costs more per pixel). */
    smoothing?: number;
    /** Fill. Default a dark grey. */
    fill?: Value<FillInput>;
    /** Optional border. */
    stroke?: Value<StrokeInput>;
}

/** A rounded panel: a background for a group or the whole surface (`{ position: 'absolute', inset: 0 }`). */
export class PanelBlock extends Block {
    private readonly _o: PanelBlockOptions;

    constructor(options: PanelBlockOptions = {}) {
        super(options);
        this._o = options;
        this.watch(options.fill, options.stroke);
    }

    paint(g: SilkGraphics, x: number, y: number): void {
        const o = this._o;
        const r = o.radius ?? 24;
        const s = o.smoothing ?? (this.lowEnd ? 0 : 0.6);

        // fill and border on one path: one instance, and the solid inside takes the fast path
        g.roundRect(x, y, this.w, this.h, r, s).fill(read(o.fill ?? 0x1c1f2a));
        if (o.stroke !== undefined) g.stroke(read(o.stroke));
    }
}

/** Options of a {@link TextBlock}. */
export interface TextBlockOptions extends BlockOptions {
    /** The text. A signal repaints the block when it changes. */
    text: Value<string>;
    /** Font and layout. */
    style?: DrawTextStyle;
    /** Paint of the letters. Default white. */
    fill?: Value<FillInput>;
    /** Where the text sits in the slot: 0 left or top, 0.5 centre, 1 right or bottom. Default `[0, 0.5]`. */
    align?: readonly [number, number];
}

/**
 * A line or paragraph of text, drawn with `drawText` into the painter. Without a width or
 * height it takes the size of its text when it is made.
 */
export class TextBlock extends Block {
    private readonly _o: TextBlockOptions;

    constructor(options: TextBlockOptions) {
        const m =
            options.width === undefined || options.height === undefined
                ? measureText(read(options.text), options.style)
                : null;

        super({ width: options.width ?? m?.width, height: options.height ?? m?.height });
        this._o = options;
        this.watch(options.text, options.fill);
    }

    paint(g: SilkGraphics, x: number, y: number): void {
        const o = this._o;
        const [ax, ay] = o.align ?? [0, 0.5];

        drawText(g, read(o.text), x + ax * this.w, y + ay * this.h, { ...o.style, anchor: [ax, ay] }).fill(
            read(o.fill ?? 0xffffff),
        );
    }
}

/** Options of a {@link CounterBlock}. */
export interface CounterBlockOptions extends BlockOptions {
    /** The number to show. Integers count without drift: hold money in minor units. */
    value: ReadSignal<number>;
    /** Turns the shown number into text. Default `String(Math.round(n))`. */
    format?: (n: number) => string;
    /** Seconds a rise takes to count up. Default 0.8. 0 jumps. */
    seconds?: number;
    /** Whether a drop counts down too. Default false: a drop (a bet taken) jumps. */
    countDown?: boolean;
    /** Font and layout. `tabularNumbers` is on unless you turn it off, so digits do not jitter. */
    style?: DrawTextStyle;
    /** Paint of the digits. Default white. */
    fill?: Value<FillInput>;
    /** Where the text sits in the slot. Default `[0, 0.5]`. */
    align?: readonly [number, number];
}

/**
 * A number that counts to its signal's value with an ease-out, a frame at a time, then lets the
 * surface sleep. Each value it shows is laid out once and cached.
 */
export class CounterBlock extends Block {
    /** The number shown now. */
    shown: number;
    private readonly _o: CounterBlockOptions;
    private _from: number;
    private _t = 1;

    constructor(options: CounterBlockOptions) {
        super(options);
        this._o = options;
        this.shown = this._from = options.value.value;
        this.watch(options.value, options.fill);
    }

    protected override onChange(): void {
        const target = this._o.value.value;
        const seconds = this._o.seconds ?? 0.8;

        if (seconds <= 0 || (target < this.shown && !this._o.countDown)) {
            this.shown = this._from = target;
            this._t = 1;
        } else if (target !== this.shown) {
            this._from = this.shown;
            this._t = 0;
        }
        this.wake();
    }

    override step(dt: number): boolean {
        let moving = super.step(dt);

        if (this._t < 1) {
            const target = this._o.value.value;

            this._t = Math.min(1, this._t + dt / (this._o.seconds ?? 0.8));
            const e = 1 - (1 - this._t) ** 3;
            const n = this._from + (target - this._from) * e;

            this.shown = this._t >= 1 ? target : Number.isInteger(target) ? Math.round(n) : n;
            moving = true;
        }

        return moving;
    }

    paint(g: SilkGraphics, x: number, y: number): void {
        const o = this._o;
        const [ax, ay] = o.align ?? [0, 0.5];
        const text = o.format ? o.format(this.shown) : String(Math.round(this.shown));

        drawText(g, text, x + ax * this.w, y + ay * this.h, {
            tabularNumbers: true,
            ...o.style,
            anchor: [ax, ay],
        }).fill(read(o.fill ?? 0xffffff));
    }
}

/** Colours of a {@link ButtonBlock}. */
export interface ButtonColors {
    /** Face. Default a dark grey. */
    fill?: FillInput;
    /** Face while `active`. Default a blue. */
    active?: FillInput;
    /** Label and icon. Default white. */
    content?: number;
    /** Label and icon while `active`. Default `content`. */
    contentActive?: number;
}

/** Draws a button's icon centred on `(cx, cy)`, about `size` across. `t` goes from 0 to 1 as the button turns active. */
export type IconPainter = (g: SilkGraphics, cx: number, cy: number, size: number, t: number, color: number) => void;

/** Options of a {@link ButtonBlock}. */
export interface ButtonBlockOptions extends BlockOptions {
    /** Called on a press. */
    onPress: () => void;
    /** Face shape. Default `'pill'`. */
    shape?: 'circle' | 'pill' | 'rect';
    /** Corner radius of `'rect'`, design units. Default 16. */
    radius?: number;
    /** Text on the face. */
    label?: Value<string>;
    /** Font of the label. Default 20 px bold. */
    labelStyle?: DrawTextStyle;
    /** Icon on the face, drawn with SilkGraphics shapes. */
    icon?: IconPainter;
    /** Toggled look (a lit face). */
    active?: Value<boolean>;
    /** Whether it takes input. A disabled button dims. Default true. */
    enabled?: Value<boolean>;
    /** Colours. */
    colors?: ButtonColors;
    /** Scale while pressed. Default 0.92. */
    pressScale?: number;
    /** Soft shadow under the face: blur in design units, 0 for none. Default 0. Free at rest when the surface caches. */
    shadow?: number;
    /**
     * The cheap look: the face is one shape with its border, its colour mixed on the CPU from the
     * base, active, hover and disabled states, and no blurred shadow. A full button stacks up to
     * six layers over its face while it animates. Default on for a `lowEnd` surface, else off.
     */
    flat?: boolean;
}

/**
 * A button: a face that squishes on press, lights on hover, crossfades to its active colour and
 * dims when disabled. Label and icon draw in the same call as the face.
 */
export class ButtonBlock extends Block {
    private readonly _o: ButtonBlockOptions;
    private readonly _state: PressState;
    private readonly _active: Spring;
    private readonly _dim: Spring;
    private readonly _kick: Spring;

    constructor(options: ButtonBlockOptions) {
        super(options);
        this._o = options;
        this._state = this.pressable({
            onPress: options.onPress,
            enabled: options.enabled,
            hitArea: options.shape === 'circle' ? 'circle' : 'rect',
        });
        this._active = this.spring(read(options.active ?? false) ? 1 : 0);
        this._dim = this.spring(read(options.enabled ?? true) ? 0 : 1);
        this._kick = this.spring(1, 600, 22);
        this.watch(options.active, options.label);
    }

    protected override onChange(): void {
        const o = this._o;
        const active = read(o.active ?? false) ? 1 : 0;

        if (active !== this._active.target) this._kick.value = 0.9;
        this._active.target = active;
        this._dim.target = read(o.enabled ?? true) ? 0 : 1;
        if (this._dim.target > 0) this._state.hover.target = 0;
        this.wake();
    }

    paint(g: SilkGraphics, x: number, y: number): void {
        const o = this._o;
        const { hover, press } = this._state;
        const c = o.colors ?? {};
        const shape = o.shape ?? 'pill';
        const s = (1 - (1 - (o.pressScale ?? 0.92)) * press.value) * this._kick.value * (1 + 0.03 * hover.value);
        const w = this.w * s;
        const h = this.h * s;
        const cx = x + this.w / 2;
        const cy = y + this.h / 2;
        const face = (gg: SilkGraphics) => {
            if (shape === 'circle') return gg.circle(cx, cy, Math.min(w, h) / 2);
            const r = shape === 'pill' ? Math.min(w, h) / 2 : (o.radius ?? 16) * s;

            return gg.roundRect(cx - w / 2, cy - h / 2, w, h, r, this.lowEnd ? 0 : 0.6);
        };
        const a = this._active.value;
        const dim = 1 - 0.55 * this._dim.value;

        if (o.flat ?? this.lowEnd) {
            this._paintFlat(g, face, cx, cy, Math.min(w, h), s);

            return;
        }
        if (o.shadow) {
            g.save();
            g.translateTransform(0, o.shadow * 0.4);
            face(g).fill({ color: 0x000000, alpha: 0.45 * dim, blur: o.shadow });
            g.restore();
        }
        face(g).fill(c.fill ?? 0x262a38);
        if (a > 0.005) face(g).fill({ color: 0x0a84ff, alpha: a, ...asStyle(c.active) });
        if (hover.value > 0.005) face(g).fill({ color: 0xffffff, alpha: 0.1 * hover.value });
        face(g).stroke({ width: 1.5, color: 0xffffff, alpha: 0.1 + 0.15 * hover.value, alignment: 'inside' });
        const content = mixColor(c.content ?? 0xffffff, c.contentActive ?? c.content ?? 0xffffff, a);
        const size = Math.min(w, h) * 0.42;

        if (o.icon) o.icon(g, cx, cy, size, a, content);
        if (o.label !== undefined) {
            const style = { fontSize: 20, fontWeight: 700, ...o.labelStyle };

            drawText(g, read(o.label), cx, cy, { ...style, fontSize: (style.fontSize ?? 20) * s, anchor: 0.5 }).fill(
                content,
            );
        }
        if (this._dim.value > 0.005) face(g).fill({ color: 0x000000, alpha: 0.4 * this._dim.value });
    }

    /** The flat look: one face with its border, then the content. */
    private _paintFlat(
        g: SilkGraphics,
        face: (g: SilkGraphics) => SilkGraphics,
        cx: number,
        cy: number,
        size: number,
        s: number,
    ): void {
        const o = this._o;
        const c = o.colors ?? {};
        const a = this._active.value;
        const hover = this._state.hover.value;
        const dim = this._dim.value;
        const base = asStyle(c.fill ?? 0x262a38) as { color?: unknown; alpha?: number; gradient?: unknown };
        const lit = asStyle(c.active ?? 0x0a84ff) as { color?: unknown; alpha?: number; gradient?: unknown };
        const mixable =
            !base.gradient && !lit.gradient && typeof base.color === 'number' && typeof lit.color === 'number';
        let fill: object;

        if (mixable) {
            let col = mixColor(base.color as number, lit.color as number, a);

            col = mixColor(col, 0xffffff, 0.1 * hover);
            col = mixColor(col, 0x000000, 0.4 * dim);
            fill = { color: col, alpha: (base.alpha ?? 1) + ((lit.alpha ?? 1) - (base.alpha ?? 1)) * a };
        } else {
            // gradients do not mix: switch half way
            fill = a > 0.5 ? lit : base;
        }
        face(g)
            .fill(fill as FillInput)
            .stroke({ width: 1.5, color: 0xffffff, alpha: 0.1 + 0.15 * hover, alignment: 'inside' });
        let content = mixColor(c.content ?? 0xffffff, c.contentActive ?? c.content ?? 0xffffff, a);

        content = mixColor(content, 0x000000, 0.45 * dim);
        if (o.icon) o.icon(g, cx, cy, size * 0.42, a, content);
        if (o.label !== undefined) {
            const style = { fontSize: 20, fontWeight: 700, ...o.labelStyle };

            drawText(g, read(o.label), cx, cy, { ...style, fontSize: (style.fontSize ?? 20) * s, anchor: 0.5 }).fill(
                content,
            );
        }
    }
}

function asStyle(fill: FillInput | undefined): object {
    if (fill === undefined) return {};
    if (typeof fill === 'number' || typeof fill === 'string') return { color: fill };
    if (typeof fill === 'object' && 'kind' in (fill as object)) return { gradient: fill, color: 0xffffff };

    return fill as object;
}

function mixColor(a: number, b: number, t: number): number {
    if (t <= 0) return a;
    if (t >= 1) return b;
    const ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t) << s;

    return ch(16) | ch(8) | ch(0);
}
