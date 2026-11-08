import { type Application, Container, type ContainerChild, Graphics, type Ticker } from 'pixi.js';
import { LayoutNode } from '../layout/node';
import type { LayoutStyle, Size } from '../layout/style';
import { Spring } from '../motion';
import { Driver } from './driver';

/**
 * How a child scales into its slot, as CSS `object-fit`. `none` keeps its size, `contain` fits
 * inside, `cover` fills and overflows, `scale-down` is `contain` that never enlarges, `fill`
 * stretches both axes.
 */
export type FitMode = 'none' | 'contain' | 'cover' | 'scale-down' | 'fill';

/** Distances from the screen edges, in screen pixels: notches, rounded corners, home bars. */
export interface Insets {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
}

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

/** A style that applies when the root's layout area matches. */
export interface MediaRule {
    /** Matches a portrait (taller than wide) or a landscape area. */
    orientation?: 'portrait' | 'landscape';
    /** Matches an area at least this wide, in design units. */
    minWidth?: number;
    /** Matches an area at most this wide, in design units. */
    maxWidth?: number;
    /** Values that replace the base ones. */
    style: SmartStyle;
}

/**
 * A responsive style: base values, then `portrait` or `landscape`, then each matching `media`
 * rule in order. Rules test the root container's layout area, the screen in design units.
 */
export interface SmartLayout extends SmartStyle {
    /** Values for a portrait area. */
    portrait?: SmartStyle;
    /** Values for a landscape area. */
    landscape?: SmartStyle;
    /** Width and orientation breakpoints. */
    media?: readonly MediaRule[];
}

/** A design resolution the root scales to the screen, the way slot games fit one layout to every device. */
export interface ReferenceResolution {
    width: number;
    height: number;
    /** Swap width and height on a portrait screen. Default true. */
    rotate?: boolean;
    /** `contain` keeps the whole design area on screen, `cover` fills the screen with it. Default `contain`. */
    mode?: 'contain' | 'cover';
}

/** Options of {@link SmartContainer}. */
export interface SmartContainerOptions {
    /** The container's own flex style: direction, gap, padding and so on. */
    layout?: SmartLayout;
    /** Glide children to new slots on a spring. `true` uses stiffness 170 and damping 26. Default false. */
    transition?: boolean | { stiffness?: number; damping?: number };
    /** Root only: keeps content clear of these screen insets. */
    safeArea?: Insets;
    /** Root only: lays out at a design size and scales it to the screen. */
    reference?: ReferenceResolution;
    /** Draws node boxes, padding and gaps. Default false. */
    debug?: boolean;
    /** Checks the children's bounds every frame and lays out again when they change. Default false. */
    watch?: boolean;
    /** Called after every layout pass. */
    onLayout?: (container: SmartContainer) => void;
    /** `ticker` defaults to `Ticker.shared`. Pass `null` to call {@link SmartContainer.tick} yourself. */
    ticker?: Ticker | null;
}

/** How a leaf child is measured. */
type Measuring = 'bounds' | 'custom' | 'zero';

interface Entry {
    child: Container;
    style: SmartLayout;
    node: LayoutNode<Container>;
    nested: SmartContainer | null;
    measuring: Measuring | null;
    bounds: { x: number; y: number; width: number; height: number };
    springs: Spring[] | null;
    hidden: boolean;
    slot: Size;
    resolved: SmartStyle;
}

const FIT_KEYS = ['fit', 'fitAlign', 'minScale', 'maxScale', 'measure', 'onSize', 'animate'] as const;

/** Applies the responsive parts of `style` for an area. */
function resolve(style: SmartLayout | undefined, area: Size): SmartStyle {
    if (!style) return {};
    const { portrait, landscape, media, ...base } = style;
    const tall = area.height > area.width;
    const out: SmartStyle = { ...base, ...(tall ? portrait : landscape) };

    for (const rule of media ?? []) {
        if (rule.orientation && (rule.orientation === 'portrait') !== tall) continue;
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
function paddingOf(s: LayoutStyle): (number | `${number}%` | undefined)[] {
    const p = s.padding;
    const all = Array.isArray(p) ? (p.length === 2 ? [p[0], p[1], p[0], p[1]] : [...p]) : [p, p, p, p];

    return [s.paddingTop ?? all[0], s.paddingRight ?? all[1], s.paddingBottom ?? all[2], s.paddingLeft ?? all[3]];
}

const same = (a: object, b: object): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The scale of a child of natural size `w` by `h` in a slot, for a fit mode. */
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
 * `SilkText`. Long copy then breaks into lines instead of overflowing its slot.
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
 * {@link SmartContainer.setLayout} (or add it with {@link SmartContainer.add}). The container
 * places it in its slot once per frame, and only after something changed: a child added,
 * removed or restyled, a new size, or {@link SmartContainer.invalidate}.
 *
 * Children are measured by their local bounds, or by a style's `measure`. A SmartContainer inside
 * another one joins its parent's layout tree as a nested flex container.
 *
 * The root can follow the screen with {@link SmartContainer.fitTo}, scale a design resolution to
 * it and keep clear of safe-area insets. With `transition`, children glide to new slots on
 * springs. An idle container costs nothing per frame.
 */
export class SmartContainer extends Container {
    /** The layout node of this container. A nested SmartContainer's node sits in its parent's tree. */
    readonly node: LayoutNode<Container>;
    private _style: SmartLayout;
    private readonly _opts: SmartContainerOptions;
    private readonly _entries = new Map<Container, Entry>();
    private readonly _driver: Driver;
    private _host: SmartContainer | null = null;
    private _overlay: Graphics | null = null;
    private _area: Size | null = null;
    private _app: Application | null = null;
    private _k = 1;
    private _safe: Insets;
    private _needs = true;

    constructor(options: SmartContainerOptions = {}) {
        super({ label: 'SmartContainer' });
        this._opts = options;
        this._style = options.layout ?? {};
        this._safe = options.safeArea ?? {};
        this.node = new LayoutNode<Container>();
        this.node.data = this;
        this._driver = new Driver((dt) => this._step(dt), options.ticker);
        this.on('childAdded', this._onChild, this);
        this.on('childRemoved', this._onChild, this);
        if (options.debug) this.debug = true;
        this._wake();
    }

    /** The container's own style. */
    get layoutStyle(): SmartLayout {
        return this._style;
    }

    /** Replaces the container's own style. */
    setStyle(style: SmartLayout): this {
        this._style = style;

        return this.invalidate();
    }

    /** Gives `child` a layout style. It need not be a child yet. */
    setLayout(child: Container, style: SmartLayout): this {
        this._entry(child).style = style;

        return this.invalidate();
    }

    /** The layout style of `child`. */
    getLayout(child: Container): SmartLayout {
        return this._entries.get(child)?.style ?? {};
    }

    /** Adds `child` with a layout style. Returns the child. */
    add<T extends ContainerChild>(child: T, style: SmartLayout = {}): T {
        this.setLayout(child, style);
        this.addChild(child);

        return child;
    }

    /** The slot `child` got in the last pass, in this container's space. */
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

    /** Root only: lays out in an area of this size, in design units, at scale 1. */
    resize(width: number, height: number): this {
        this._unfollow();
        this._k = 1;
        this._area = { width, height };
        this.scale.set(1);

        return this.invalidate();
    }

    /**
     * Root only: follows a screen size. Pass an Application to track its renderer's resizes, or a
     * size (such as `app.screen`) for one fit. With a `reference` resolution the container scales
     * the design to the screen and lays out in the screen's size in design units.
     */
    fitTo(target: Application | Size): this {
        this._unfollow();
        if ('renderer' in target) {
            this._app = target;
            target.renderer.on('resize', this._onResize, this);
            this._onResize();
        } else this._fitScreen(target.width, target.height);

        return this;
    }

    /** Root only: keeps content clear of these screen insets, in screen pixels. */
    setSafeArea(insets: Insets): this {
        this._safe = { ...insets };

        return this.invalidate();
    }

    /** The scale from design units to screen pixels: 1 without a reference resolution. */
    get designScale(): number {
        return this._k;
    }

    /** The root's layout area in design units, from the last pass when it has no fixed size. */
    get area(): Size {
        const root = this._root();

        return root._area ?? { width: root.node.layout.width, height: root.node.layout.height };
    }

    /** The orientation of the root's layout area. */
    get orientation(): 'portrait' | 'landscape' {
        const a = this.area;

        return a.height > a.width ? 'portrait' : 'landscape';
    }

    /** Draws node boxes (blue), padding (green) and gaps (pink) over the children. */
    get debug(): boolean {
        return this._overlay !== null;
    }

    set debug(on: boolean) {
        if (on === this.debug) return;
        if (on) {
            this._overlay = new Graphics({ label: 'SmartContainer debug' });
            this._overlay.eventMode = 'none';
            this.addChild(this._overlay);
        } else {
            this._overlay?.destroy();
            this._overlay = null;
        }
        this.invalidate();
    }

    /** Lays out now, instead of on the next frame. */
    updateLayout(): this {
        const root = this._root();

        root._relayout();
        root._wake();

        return this;
    }

    /** Advances transitions by `dt` seconds (only needed with `ticker: null`). */
    tick(dt: number): boolean {
        return this._driver.tick(dt);
    }

    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        this._driver.sleep();
        this._unfollow();
        this.off('childAdded', this._onChild, this);
        this.off('childRemoved', this._onChild, this);
        super.destroy(options);
    }

    // ------------------------------------------------------------------------------- internals

    private _entry(child: Container): Entry {
        let e = this._entries.get(child);

        if (!e) {
            const nested = child instanceof SmartContainer ? child : null;
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
        if (child === this._overlay) return;
        if (child.parent !== this) {
            const e = this._entries.get(child);

            if (e?.nested) e.nested._host = null;
            if (e?.hidden) child.visible = true;
            this._entries.delete(child);
        }
        this.invalidate();
    }

    private _root(): SmartContainer {
        let c: SmartContainer = this;

        while (c._host) c = c._host;

        return c;
    }

    private _wake(): void {
        this._root()._driver.wake();
    }

    private _onResize(): void {
        if (this._app) this._fitScreen(this._app.screen.width, this._app.screen.height);
    }

    private _unfollow(): void {
        this._app?.renderer?.off('resize', this._onResize, this);
        this._app = null;
    }

    private _fitScreen(width: number, height: number): void {
        const ref = this._opts.reference;
        let scale = 1;

        if (ref) {
            const swap = ref.rotate !== false && height > width;
            const rw = swap ? ref.height : ref.width;
            const rh = swap ? ref.width : ref.height;

            scale = ref.mode === 'cover' ? Math.max(width / rw, height / rh) : Math.min(width / rw, height / rh);
        }
        this._k = scale;
        this._area = { width: width / scale, height: height / scale };
        this.scale.set(scale);
        this.invalidate();
    }

    private _relayout(): void {
        this._sync(this.area, true);
        this.node.calculate(this._area?.width, this._area?.height);
        this._needs = false;
        this._apply();
        this._drawDebug();
        this._opts.onLayout?.(this);
    }

    private _step(dt: number): boolean {
        if (this._host) return false;
        if (this._needs || this.node.dirty || (this._opts.watch && this._changed())) this._relayout();

        return this._stepSprings(dt) || this._opts.watch === true;
    }

    /** Resolves styles for the area and mirrors the children into the node tree. */
    private _sync(area: Size, root: boolean): void {
        if (root) {
            const style = flexOf(resolve(this._style, area));
            // safe-area insets in design units, added to numeric padding
            const inset = [this._safe.top, this._safe.right, this._safe.bottom, this._safe.left];
            const [top, right, bottom, left] = paddingOf(style).map((v, i) =>
                typeof v === 'string' ? v : (v ?? 0) + (inset[i] ?? 0) / this._k,
            );

            delete style.padding;
            Object.assign(style, { paddingTop: top, paddingRight: right, paddingBottom: bottom, paddingLeft: left });
            if (!same(style, this.node.style)) this.node.setStyle(style);
        }
        const overlay = this._overlay;

        if (overlay && this.children[this.children.length - 1] !== overlay) {
            this.setChildIndex(overlay, this.children.length - 1);
        }
        const nodes: LayoutNode<Container>[] = [];

        for (const child of this.children) {
            if (child === overlay) continue;
            const e = this._entry(child);
            const resolved = resolve(e.style, area);
            let flex = flexOf(resolved);

            e.resolved = resolved;
            if (e.nested) {
                e.nested._host = this;
                e.nested._sync(area, false);
                // the nested container's own style, with this container's item style over it
                flex = { ...flexOf(resolve(e.nested._style, area)), ...flex };
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

    /** Draws boxes, padding and gaps of the whole tree under this root. */
    private _drawDebug(): void {
        const g = this._overlay;

        if (!g) return;
        const line = { width: 1 / this._k, color: 0x0a84ff, alpha: 0.9, alignment: 1 };
        const padding = { color: 0x30d158, alpha: 0.16 };
        const gap = { color: 0xff24bd, alpha: 0.3 };
        const walk = (n: LayoutNode<Container>, ox: number, oy: number) => {
            const { width: w, height: h } = n.layout;
            const x = ox + n.layout.x;
            const y = oy + n.layout.y;
            const s = n.style;
            const [t, r, b, l] = paddingOf(s).map((v) => (typeof v === 'number' ? v : 0));

            g.rect(x, y, w, h).stroke(line);
            if (t) g.rect(x, y, w, t).fill(padding);
            if (b) g.rect(x, y + h - b, w, b).fill(padding);
            if (l) g.rect(x, y + t, l, h - t - b).fill(padding);
            if (r) g.rect(x + w - r, y + t, r, h - t - b).fill(padding);
            const flow = n.children.filter((c) => c.style.display !== 'none' && c.style.position !== 'absolute');
            const row = (s.direction ?? 'row').startsWith('row');

            for (let i = 1; i < flow.length; i++) {
                const a = flow[i - 1].layout;
                const c = flow[i].layout;
                // [start, end] on the main axis, then on the cross axis
                const am = row ? [a.x, a.x + a.width, a.y, a.y + a.height] : [a.y, a.y + a.height, a.x, a.x + a.width];
                const cm = row ? [c.x, c.x + c.width, c.y, c.y + c.height] : [c.y, c.y + c.height, c.x, c.x + c.width];
                const lo = Math.min(am[1], cm[1]);
                const hi = Math.max(am[0], cm[0]);
                const c0 = Math.min(am[2], cm[2]);
                const c1 = Math.max(am[3], cm[3]);

                // neighbours on one line share the cross axis, a wrap starts a new line
                if (hi - lo < 0.5 || Math.max(am[2], cm[2]) >= Math.min(am[3], cm[3])) continue;
                if (row) g.rect(x + lo, y + c0, hi - lo, c1 - c0).fill(gap);
                else g.rect(x + c0, y + lo, c1 - c0, hi - lo).fill(gap);
            }
            for (const c of n.children) if (c.style.display !== 'none') walk(c, x, y);
        };

        g.clear();
        walk(this.node, -this.node.layout.x, -this.node.layout.y);
    }
}
