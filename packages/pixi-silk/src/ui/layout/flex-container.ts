import { Container, type ContainerChild, type Ticker } from 'pixi.js';
import { LayoutNode } from '../../layout/node';
import type { ComputedLayout, LayoutStyle, Size } from '../../layout/style';
import { Spring } from '../../motion';
import { Driver } from '../driver';

/**
 * How a child scales into its slot, as CSS `object-fit`. `none` keeps its size, `contain` fits
 * inside, `cover` fills and overflows, `scale-down` is `contain` that never enlarges, `fill`
 * stretches both axes.
 */
export type FitMode = 'none' | 'contain' | 'cover' | 'scale-down' | 'fill';

/** A flex style plus how a child sits in its slot. */
export interface SmartStyle extends LayoutStyle {
    /** How the child scales into its slot. Default `none`. */
    fit?: FitMode;
    /** Where the child sits in its slot, 0 to 1 per axis. Default `[0.5, 0.5]`, the centre. */
    fitAlign?: readonly [number, number];
    /** Smallest fit scale. With `fit: 'scale-down'` it is the text shrink-to-fit floor. Default 0. */
    minScale?: number;
    /** Largest fit scale. Default no limit. */
    maxScale?: number;
    /** Measures the child for the space offered. Default its local bounds, whatever the space. */
    measure?: (child: Container, availableWidth: number, availableHeight: number) => Size;
    /**
     * Called with the slot size whenever it changes, so the child can redraw at that size (a
     * panel background, a bar). A child with `onSize` and no `measure` measures as 0 by 0, so
     * give it a size, `grow` or `inset`.
     */
    onSize?: (width: number, height: number, child: Container) => void;
    /** Glide this child to new slots. Default the container's `transition`. */
    animate?: boolean;
}

/** A style that applies when the root's layout area, or the root SmartContainer's breakpoint, matches. */
export interface MediaRule {
    /** Matches a portrait (taller than wide) or a landscape area. */
    orientation?: 'portrait' | 'landscape';
    /** Matches the root SmartContainer's active breakpoint, such as `portrait` or a name of your own. */
    breakpoint?: string;
    /** Matches an area at least this wide, in design units. */
    minWidth?: number;
    /** Matches an area at most this wide, in design units. */
    maxWidth?: number;
    /** Values that replace the base ones. */
    style: SmartStyle;
}

/**
 * A responsive style: base values, then `portrait` or `landscape`, then each matching `media`
 * rule in order. Rules test the root container's layout area.
 */
export interface SmartLayout extends SmartStyle {
    /** Values for a portrait area. */
    portrait?: SmartStyle;
    /** Values for a landscape area. */
    landscape?: SmartStyle;
    /** Width, orientation and breakpoint rules. */
    media?: readonly MediaRule[];
}

/** Options of {@link FlexContainer}. */
export interface FlexContainerOptions {
    /** The container's own flex style: direction, gap, padding and so on. */
    layout?: SmartLayout;
    /** Glide children to new slots on a spring. `true` uses stiffness 170 and damping 26. Default false. */
    transition?: boolean | { stiffness?: number; damping?: number };
    /** Checks the children's bounds every frame and lays out again when they change. Default false. */
    watch?: boolean;
    /** Called after every layout pass, on the container that ran it. */
    onLayout?: (container: FlexContainer) => void;
    /** `ticker` defaults to `Ticker.shared`. Pass `null` to call {@link FlexContainer.tick} yourself. */
    ticker?: Ticker | null;
}

/** How a leaf child is measured. */
type Measuring = 'bounds' | 'custom' | 'zero';

interface Entry {
    child: Container;
    style: SmartLayout;
    node: LayoutNode<Container>;
    nested: FlexContainer | null;
    measuring: Measuring | null;
    bounds: { x: number; y: number; width: number; height: number };
    springs: Spring[] | null;
    hidden: boolean;
    slot: Size;
    resolved: SmartStyle;
}

const FIT_KEYS = ['fit', 'fitAlign', 'minScale', 'maxScale', 'measure', 'onSize', 'animate'] as const;

/** Applies the responsive parts of `style` for an area and a breakpoint. */
function resolve(style: SmartLayout | undefined, area: Size, breakpoint: string | null): SmartStyle {
    if (!style) return {};
    const { portrait, landscape, media, ...base } = style;
    const tall = area.height > area.width;
    const out: SmartStyle = { ...base, ...(tall ? portrait : landscape) };

    for (const rule of media ?? []) {
        if (rule.orientation && (rule.orientation === 'portrait') !== tall) continue;
        if (rule.breakpoint !== undefined && rule.breakpoint !== breakpoint) continue;
        if (rule.minWidth !== undefined && area.width < rule.minWidth) continue;
        if (rule.maxWidth !== undefined && area.width > rule.maxWidth) continue;
        Object.assign(out, rule.style);
    }

    return out;
}

/** The flex part of a style, without the fit options. */
function flexOf(style: SmartStyle): LayoutStyle {
    const out: Record<string, unknown> = { ...style };

    for (const k of FIT_KEYS) delete out[k];

    return out as LayoutStyle;
}

/** Padding as `[top, right, bottom, left]`, single sides over the shorthand. Percents stay as they are. */
export function paddingOf(s: LayoutStyle): (number | `${number}%` | undefined)[] {
    const p = s.padding;
    const all = !Array.isArray(p)
        ? [p, p, p, p]
        : p.length === 2
          ? [p[0], p[1], p[0], p[1]]
          : p.length === 3
            ? [p[0], p[1], p[2], p[1]]
            : [...p];

    return [s.paddingTop ?? all[0], s.paddingRight ?? all[1], s.paddingBottom ?? all[2], s.paddingLeft ?? all[3]];
}

const same = (a: object, b: object): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The [x, y] scale of a child of natural size `w` by `h` in a slot, for a fit mode. [1, 1] for `none` or an empty child. */
export function fitScale(fit: FitMode, w: number, h: number, slotWidth: number, slotHeight: number): [number, number] {
    if (fit === 'none' || w <= 0 || h <= 0) return [1, 1];
    const kx = slotWidth / w;
    const ky = slotHeight / h;

    if (fit === 'fill') return [kx, ky];
    const k = fit === 'cover' ? Math.max(kx, ky) : fit === 'scale-down' ? Math.min(1, kx, ky) : Math.min(kx, ky);

    return [k, k];
}

/**
 * A `measure` that wraps a text child to the width offered: Pixi `Text` (through its style) or
 * `SilkText`. Long copy then breaks into lines instead of overflowing its slot. It turns on the
 * child's `wordWrap` and sets `wordWrapWidth`. Other children are measured by their bounds.
 */
export function wrapText(child: Container, availableWidth: number): Size {
    type Wrappable = { wordWrap?: boolean; wordWrapWidth?: number };
    const t = child as Container & Wrappable & { style?: Wrappable };
    const width = Number.isFinite(availableWidth) ? Math.max(1, availableWidth) : 1e6;
    const target = typeof t.wordWrapWidth === 'number' ? t : t.style;

    if (target && target.wordWrapWidth !== width) {
        target.wordWrap = true;
        target.wordWrapWidth = width;
    }
    const b = child.getLocalBounds();

    return { width: b.width, height: b.height };
}

/**
 * A container that lays out its children with flexbox. Give a child a style with
 * {@link FlexContainer.setLayout} (or add it with {@link FlexContainer.add}). The container
 * places it in its slot once per frame, and only after something changed: a child added,
 * removed or restyled, a new size, or {@link FlexContainer.invalidate}.
 *
 * Children are measured by their local bounds, or by a style's `measure`. A FlexContainer inside
 * another one joins its parent's layout tree as a nested flex container. With `transition`,
 * children glide to new slots on springs. An idle container costs nothing per frame.
 */
export class FlexContainer extends Container {
    /** The layout node of this container. A nested FlexContainer's node sits in its parent's tree. */
    readonly node: LayoutNode<Container>;
    /** @internal the layout area of a root, in its own units */
    protected _area: Size | null = null;
    /** @internal a container placed on screen by itself (a SmartContainer), never nested */
    protected readonly _screenRoot: boolean = false;
    /** @internal false leaves the children where they are and only sizes the box */
    protected _flexChildren = true;
    /** @internal */
    protected readonly _driver: Driver;
    private _style: SmartLayout;
    private readonly _opts: FlexContainerOptions;
    private readonly _entries = new Map<Container, Entry>();
    private _host: FlexContainer | null = null;
    private _needs = true;

    constructor(options: FlexContainerOptions = {}) {
        super({ label: 'FlexContainer' });
        this._opts = options;
        this._style = options.layout ?? {};
        this.node = new LayoutNode<Container>();
        this.node.data = this;
        this._driver = new Driver((dt) => this._step(dt), options.ticker);
        this.on('childAdded', this._onChild, this);
        this.on('childRemoved', this._onChild, this);
        this._wake();
    }

    /** The container's own flex style. */
    get layoutStyle(): SmartLayout {
        return this._style;
    }

    /** Replaces the container's own flex style and lays out on the next frame. */
    setStyle(style: SmartLayout): this {
        this._style = style;

        return this.invalidate();
    }

    /** Gives `child` a layout style, replacing the old one. It need not be a child yet. */
    setLayout(child: Container, style: SmartLayout): this {
        this._entry(child).style = style;

        return this.invalidate();
    }

    /** The layout style of `child`, or `{}` when it has none. */
    getLayout(child: Container): SmartLayout {
        return this._entries.get(child)?.style ?? {};
    }

    /** Adds `child` with a layout style. Returns the child. */
    add<T extends ContainerChild>(child: T, style: SmartLayout = {}): T {
        this.setLayout(child, style);
        this.addChild(child);

        return child;
    }

    /** A copy of the slot `child` got in the last pass, in this container's space. Undefined for a child without a style. */
    slotOf(child: Container): { x: number; y: number; width: number; height: number } | undefined {
        const e = this._entries.get(child);

        return e ? { ...e.node.layout } : undefined;
    }

    /**
     * Lays out again on the next frame. Pass a child whose content changed (new text, a new
     * texture) so it is measured again.
     */
    invalidate(child?: Container): this {
        if (child) this._entries.get(child)?.node.markDirty();
        this._root()._needs = true;
        this._wake();

        return this;
    }

    /** Root only: lays out in an area of this size, in local units. Without it the root sizes to its content. */
    resize(width: number, height: number): this {
        if (this._area && this._area.width === width && this._area.height === height) return this;
        this._area = { width, height };

        return this.invalidate();
    }

    /** The root's layout area, from the last pass when it has no fixed size. */
    get area(): Size {
        const root = this._root();

        return root._area ?? { width: root.node.layout.width, height: root.node.layout.height };
    }

    /** The orientation of the root's layout area. A square counts as landscape. */
    get orientation(): 'portrait' | 'landscape' {
        const a = this.area;

        return a.height > a.width ? 'portrait' : 'landscape';
    }

    /**
     * @internal What `layoutDebug` draws: the box, the style, and each laid out child's slot in
     * this container's space.
     */
    _debugSnapshot(): {
        box: Size;
        style: LayoutStyle;
        flex: boolean;
        slots: { child: Container; slot: ComputedLayout; nested: boolean; absolute: boolean }[];
    } {
        const slots: { child: Container; slot: ComputedLayout; nested: boolean; absolute: boolean }[] = [];

        for (const e of this._entries.values()) {
            if (e.child.parent === this && !e.hidden)
                slots.push({
                    child: e.child,
                    slot: e.node.layout,
                    nested: e.nested !== null,
                    absolute: e.node.style.position === 'absolute',
                });
        }

        return {
            box: { width: this.node.layout.width, height: this.node.layout.height },
            style: this.node.style,
            flex: this._flexChildren,
            slots,
        };
    }

    /** Lays out the whole tree now, from its root, instead of on the next frame. */
    updateLayout(): this {
        const root = this._root();

        root._relayout();
        root._wake();

        return this;
    }

    /** Advances layout and transitions by `dt` seconds (only needed with `ticker: null`). Returns true while busy. */
    tick(dt: number): boolean {
        return this._driver.tick(dt);
    }

    /** Stops the layout loop. Pass `{ children: true }` to destroy the children too. */
    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        this._driver.sleep();
        this.off('childAdded', this._onChild, this);
        this.off('childRemoved', this._onChild, this);
        super.destroy(options);
    }

    // ------------------------------------------------------------------------------- internals

    /** @internal the name of the root's active breakpoint, for `media` rules */
    protected _breakpoint(): string | null {
        return null;
    }

    /** @internal one frame: layout when needed, then transitions. True while busy. */
    protected _step(dt: number): boolean {
        if (this._host) return false;
        if (this._needs || this.node.dirty || (this._opts.watch && this._changed())) this._relayout();

        return this._stepSprings(dt) || this._opts.watch === true;
    }

    private _entry(child: Container): Entry {
        let e = this._entries.get(child);

        if (!e) {
            const nested = child instanceof FlexContainer && !child._screenRoot ? child : null;
            const node = nested ? nested.node : new LayoutNode<Container>();

            node.data = child;
            e = {
                child,
                style: {},
                node,
                nested,
                measuring: null,
                bounds: { x: 0, y: 0, width: 0, height: 0 },
                springs: null,
                hidden: false,
                slot: { width: -1, height: -1 },
                resolved: {},
            };
            this._entries.set(child, e);
        }

        return e;
    }

    private _onChild(child: Container): void {
        if (child.parent !== this) {
            const e = this._entries.get(child);

            if (e?.nested) e.nested._host = null;
            if (e?.hidden) child.visible = true;
            this._entries.delete(child);
        }
        this.invalidate();
    }

    private _root(): FlexContainer {
        let c: FlexContainer = this;

        while (c._host) c = c._host;

        return c;
    }

    private _wake(): void {
        this._root()._driver.wake();
    }

    private _relayout(): void {
        this._sync(this.area, this._breakpoint(), true);
        this.node.calculate(this._area?.width, this._area?.height);
        this._needs = false;
        this._apply();
        this._opts.onLayout?.(this);
    }

    /** Resolves styles for the area and mirrors the children into the node tree. */
    private _sync(area: Size, breakpoint: string | null, root: boolean): void {
        if (root) {
            const style = flexOf(resolve(this._style, area, breakpoint));

            if (!same(style, this.node.style)) this.node.setStyle(style);
        }
        const nodes: LayoutNode<Container>[] = [];

        for (const child of this._flexChildren ? this.children : []) {
            // a SmartContainer places itself in the window
            if (child instanceof FlexContainer && child._screenRoot) continue;
            const e = this._entry(child);
            const resolved = resolve(e.style, area, breakpoint);
            let flex = flexOf(resolved);

            e.resolved = resolved;
            if (e.nested) {
                e.nested._host = this;
                e.nested._sync(area, breakpoint, false);
                // the nested container's own style, with this container's item style over it
                flex = { ...flexOf(resolve(e.nested._style, area, breakpoint)), ...flex };
            } else this._measure(e, resolved);
            if (!same(flex, e.node.style)) e.node.setStyle(flex);
            // display none hides the child too
            const none = flex.display === 'none';

            if (none !== e.hidden) {
                e.hidden = none;
                child.visible = !none;
            }
            nodes.push(e.node);
        }
        const kids = this.node.children;

        if (kids.length !== nodes.length || kids.some((n, i) => n !== nodes[i])) {
            this.node.clear();
            for (const n of nodes) this.node.add(n);
        }
    }

    /** Sets up how a leaf child is measured, and measures it again when its bounds changed. */
    private _measure(e: Entry, style: SmartStyle): void {
        const mode: Measuring = style.measure ? 'custom' : style.onSize ? 'zero' : 'bounds';

        if (mode === 'bounds') {
            const b = e.child.getLocalBounds();
            const was = e.bounds;

            e.bounds = { x: b.minX, y: b.minY, width: b.width, height: b.height };
            if (e.measuring === 'bounds' && (was.width !== b.width || was.height !== b.height)) e.node.markDirty();
        }
        if (e.measuring === mode) return;
        e.measuring = mode;
        e.node.measure =
            mode === 'custom'
                ? (w, h) => e.resolved.measure?.(e.child, w, h) ?? { width: 0, height: 0 }
                : mode === 'zero'
                  ? () => ({ width: 0, height: 0 })
                  : () => ({ width: e.bounds.width, height: e.bounds.height });
    }

    /** Moves every child to its slot, or aims its springs there. */
    private _apply(): void {
        const t = this._opts.transition;
        const { stiffness = 170, damping = 26 } = typeof t === 'object' ? t : {};

        for (const e of this._entries.values()) {
            if (e.child.parent !== this) continue;
            if (e.hidden) {
                // a hidden child jumps to its slot when it shows again
                e.springs = null;
                continue;
            }
            const slot = e.node.layout;
            const r = e.resolved;
            let target = [slot.x, slot.y, 1, 1];

            if (e.nested) e.nested._apply();
            else if (!r.onSize) {
                const b = e.bounds;
                const [ax, ay] = r.fitAlign ?? [0.5, 0.5];
                const fit = r.fit ?? 'none';
                const [sx, sy] = fitScale(fit, b.width, b.height, slot.width, slot.height).map((k) =>
                    fit === 'none' ? k : Math.max(r.minScale ?? 0, Math.min(k, r.maxScale ?? Number.POSITIVE_INFINITY)),
                );
                const p = e.child.pivot;

                target = [
                    slot.x + (slot.width - b.width * sx) * ax - (b.x - p.x) * sx,
                    slot.y + (slot.height - b.height * sy) * ay - (b.y - p.y) * sy,
                    sx,
                    sy,
                ];
            }
            if (r.onSize && (slot.width !== e.slot.width || slot.height !== e.slot.height)) {
                r.onSize(slot.width, slot.height, e.child);
            }
            e.slot = { width: slot.width, height: slot.height };
            // the first placement jumps, later ones glide when transitions are on
            const animate = e.springs !== null && (r.animate ?? (t !== undefined && t !== false));

            e.springs ??= target.map((v) => new Spring(v, stiffness, damping));
            e.springs.forEach((s, i) => {
                s.target = target[i];
                if (!animate) {
                    s.value = target[i];
                    s.velocity = 0;
                }
            });
            this._show(e);
        }
    }

    private _show(e: Entry): void {
        const [x, y, sx, sy] = (e.springs as Spring[]).map((s) => s.value);

        e.child.position.set(x, y);
        e.child.scale.set(sx, sy);
    }

    private _stepSprings(dt: number): boolean {
        let moving = false;

        for (const e of this._entries.values()) {
            if (e.nested) moving = e.nested._stepSprings(dt) || moving;
            if (!e.springs || e.springs.every((s) => s.settled)) continue;
            for (const s of e.springs) {
                s.step(dt);
                if (s.settled) {
                    s.value = s.target;
                    s.velocity = 0;
                }
            }
            this._show(e);
            moving = true;
        }

        return moving;
    }

    /** True when a child measured by its bounds changed size. */
    private _changed(): boolean {
        for (const e of this._entries.values()) {
            if (e.nested) {
                if (e.nested._changed()) return true;
            } else if (e.measuring === 'bounds') {
                const b = e.child.getLocalBounds();

                if (b.width !== e.bounds.width || b.height !== e.bounds.height) return true;
            }
        }

        return false;
    }
}
