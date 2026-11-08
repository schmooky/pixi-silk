import { Container, type FederatedPointerEvent, Graphics, type PointData, Rectangle, type Ticker } from 'pixi.js';
import { Spring } from '../../motion';
import { SilkGraphics } from '../../SilkGraphics';
import { type ReadSignal, type Signal, signal } from '../../signal';
import type { SdfAtlas } from '../../text/atlas';
import type { SilkText } from '../../text/SilkText';
import { Driver } from '../driver';
import { FlexContainer, type SmartLayout } from '../layout/flex-container';
import { drawChevron } from './icons';
import { ScrollView } from './ScrollView';
import { type PanelTheme, panelText, resolvePanelTheme } from './theme';

/** A screen edge or corner a panel docks to. */
export type PanelDock = 'left' | 'right' | 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** Space kept free along each screen edge, such as a toolbar or another docked panel. */
export interface PanelInsets {
    /** Free space below the top edge. Default 0. */
    top?: number;
    /** Free space left of the right edge. Default 0. */
    right?: number;
    /** Free space above the bottom edge. Default 0. */
    bottom?: number;
    /** Free space right of the left edge. Default 0. */
    left?: number;
}

/** A rectangle in the panel's parent space. */
export interface PanelRect {
    /** Left edge. */
    x: number;
    /** Top edge. */
    y: number;
    /** Width, at least 0. */
    width: number;
    /** Height, at least 0. */
    height: number;
}

/** The screen a panel docks in: numbers, or signals such as `camera.state.width` and `height`. */
export interface PanelViewport {
    /** Screen width in the panel's parent units. A signal re-docks the panel when it changes. */
    width: number | ReadSignal<number>;
    /** Screen height in the panel's parent units. A signal re-docks the panel when it changes. */
    height: number | ReadSignal<number>;
}

/** Options of {@link Panel}. */
export interface PanelOptions {
    /** Text of the title bar. */
    title?: string;
    /** Width in the parent's units. Default 260. */
    width?: number;
    /** Height when floating or docked to a corner. Default 360. */
    height?: number;
    /** Left edge when floating. Default 0. */
    x?: number;
    /** Top edge when floating. Default 0. */
    y?: number;
    /** Smallest width a resize leaves. Default 160. */
    minWidth?: number;
    /** Smallest height a resize leaves. Default 96. */
    minHeight?: number;
    /** Largest width a resize allows. Default no limit. */
    maxWidth?: number;
    /** Largest height a resize allows. Default no limit. */
    maxHeight?: number;
    /**
     * Docks the panel to a screen edge or corner. Left and right panels span the screen height, top
     * and bottom ones its width. Needs `viewport`. Default floating.
     */
    dock?: PanelDock | null;
    /** The screen the panel docks in. Without it the panel only floats. */
    viewport?: PanelViewport;
    /** Gap between a docked panel and the screen edge. Default 8. */
    margin?: number;
    /** Space kept free along the screen edges. */
    insets?: PanelInsets;
    /** Dock when a drag ends near an edge, with a preview while it is near. Default true. */
    dockable?: boolean;
    /** How near an edge a drag docks, in the parent's units. Default 28. */
    snapDistance?: number;
    /** A chevron in the title bar folds the body away. Default true. */
    collapsible?: boolean;
    /** Start folded. Default false. */
    collapsed?: boolean;
    /** Drag the title bar to move. Default true. */
    draggable?: boolean;
    /** Drag the edges and corners to resize. Default true. */
    resizable?: boolean;
    /**
     * The body scrolls `content` when it is taller than the panel. Default true. With false, the
     * body is a flex container as tall as the panel, for widgets that scroll themselves.
     */
    scroll?: boolean;
    /** Flex style of {@link Panel.content}. Default a column with a gap of 8 and a padding of 10. */
    layout?: SmartLayout;
    /** Title bar height. Default 34. */
    headerHeight?: number;
    /** Colours, radius and font. Default the dark theme. */
    theme?: Partial<PanelTheme>;
    /** Glyph atlas of the title. Default the shared one. */
    atlas?: SdfAtlas;
    /** Ticker driving the motion. Default `Ticker.shared`. `null` for manual {@link Panel.tick}. */
    ticker?: Ticker | null;
}

/** The reactive state of a {@link Panel}. */
export interface PanelState {
    /** Folded to its title bar. Write it to fold or unfold. */
    collapsed: Signal<boolean>;
    /** The edge or corner it is docked to, or null when floating. Write it to dock. */
    dock: Signal<PanelDock | null>;
    /** True while the title bar is dragged. */
    dragging: ReadSignal<boolean>;
    /** True while an edge is dragged. */
    resizing: ReadSignal<boolean>;
    /** Where the panel is heading, in its parent's space, while unfolded. */
    rect: ReadSignal<PanelRect>;
}

/** An edge or corner a pointer resizes from: `n`, `ne`, `e` and so on. Empty for none. */
type Edge = '' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const CURSORS: Record<Edge, string> = {
    '': 'default',
    n: 'ns-resize',
    s: 'ns-resize',
    e: 'ew-resize',
    w: 'ew-resize',
    ne: 'nesw-resize',
    sw: 'nesw-resize',
    nw: 'nwse-resize',
    se: 'nwse-resize',
};

/** The edges a docked panel resizes from: the ones facing the screen. */
const DOCK_EDGES: Record<PanelDock, string> = {
    left: 'e',
    right: 'w',
    top: 's',
    bottom: 'n',
    'top-left': 'se',
    'top-right': 'sw',
    'bottom-left': 'ne',
    'bottom-right': 'nw',
};

const read = (v: number | ReadSignal<number>): number => (typeof v === 'number' ? v : v.value);

/**
 * Where a panel of `size` sits when docked to `dock` in a screen of `viewport`. Left and right
 * panels span the height between the insets, top and bottom ones the width.
 */
export function dockRect(
    dock: PanelDock,
    viewport: { width: number; height: number },
    size: { width: number; height: number },
    margin = 8,
    insets: PanelInsets = {},
): PanelRect {
    const l = margin + (insets.left ?? 0);
    const r = viewport.width - margin - (insets.right ?? 0);
    const t = margin + (insets.top ?? 0);
    const b = viewport.height - margin - (insets.bottom ?? 0);
    const w = Math.max(0, Math.min(size.width, r - l));
    const h = Math.max(0, Math.min(size.height, b - t));

    switch (dock) {
        case 'left':
            return { x: l, y: t, width: w, height: Math.max(0, b - t) };
        case 'right':
            return { x: r - w, y: t, width: w, height: Math.max(0, b - t) };
        case 'top':
            return { x: l, y: t, width: Math.max(0, r - l), height: h };
        case 'bottom':
            return { x: l, y: b - h, width: Math.max(0, r - l), height: h };
        case 'top-left':
            return { x: l, y: t, width: w, height: h };
        case 'top-right':
            return { x: r - w, y: t, width: w, height: h };
        case 'bottom-left':
            return { x: l, y: b - h, width: w, height: h };
        default:
            return { x: r - w, y: b - h, width: w, height: h };
    }
}

/**
 * The dock a drag points at: an edge or corner within `distance` of the pointer, or null. Corners
 * win when both edges are near.
 */
export function dockAt(
    point: PointData,
    viewport: { width: number; height: number },
    distance = 28,
    insets: PanelInsets = {},
): PanelDock | null {
    const left = point.x <= distance + (insets.left ?? 0);
    const right = point.x >= viewport.width - distance - (insets.right ?? 0);
    const top = point.y <= distance + (insets.top ?? 0);
    const bottom = point.y >= viewport.height - distance - (insets.bottom ?? 0);

    if (top && left) return 'top-left';
    if (top && right) return 'top-right';
    if (bottom && left) return 'bottom-left';
    if (bottom && right) return 'bottom-right';
    if (left) return 'left';
    if (right) return 'right';
    if (top) return 'top';
    if (bottom) return 'bottom';

    return null;
}

/**
 * A test for the camera's `ignore` option: true for a point (in the stage's space) over any of
 * `targets`, so wheels and pans over panels stay with the panels.
 *
 * @example
 * ```ts
 * const camera = new Camera({ world, element: app.canvas, ignore: panelHitTest([layers, inspector]) });
 * ```
 */
export function panelHitTest(
    targets: readonly Container[] | (() => readonly Container[]),
): (point: PointData) => boolean {
    return (point) => {
        for (const t of typeof targets === 'function' ? targets() : targets) {
            if (!t.visible || !t.parent) continue;
            if (t instanceof Panel ? t.hitTest(point) : t.getBounds().containsPoint(point.x, point.y)) return true;
        }

        return false;
    };
}

/**
 * A panel drawn on the canvas, with no DOM: a title bar, a body that scrolls, edges to resize and a
 * chevron that folds it. Drag the title bar to move it, and drop it near a screen edge to dock it
 * there. Size, position and folding glide on springs. Text is SilkText.
 *
 * The body is {@link Panel.content}, a flex column. Add rows, fields or a widget to it. With
 * `scroll: false` it fills the body instead, for widgets that scroll on their own like the layer tree.
 *
 * @example
 * ```ts
 * const panel = new Panel({ title: 'Layers', dock: 'left', width: 240, viewport: camera.state });
 *
 * panel.content.add(tree, { grow: 1, onSize: (w, h) => tree.resize(w, h) });
 * app.stage.addChild(panel);
 * ```
 *
 * Panels do not stack or tab into each other: two panels docked to the same edge overlap unless
 * you set `insets`.
 *
 * Experimental: the API may change in a minor release.
 *
 * @experimental
 */
export class Panel extends Container {
    /** Folding, docking and drag state, as signals. */
    readonly state: PanelState;
    /** Colours, radius and font, resolved from the `theme` option. */
    readonly theme: PanelTheme;
    /** The body: a flex column. With `scroll`, it scrolls inside {@link Panel.scroll}. */
    readonly content: FlexContainer;
    /** The scroller around `content`, or null with `scroll: false`. */
    readonly scroll: ScrollView | null;
    /** The title bar, a flex row. */
    readonly header: FlexContainer;
    /** A flex row at the right of the title bar for buttons of your own. */
    readonly actions: FlexContainer;
    /** The title text. */
    readonly titleText: SilkText;
    /** Smallest width a resize leaves. Applies from the next resize. */
    minWidth: number;
    /** Smallest height a resize leaves. Applies from the next resize. */
    minHeight: number;
    /** Largest width a resize allows. `Infinity` for no limit. */
    maxWidth: number;
    /** Largest height a resize allows. `Infinity` for no limit. */
    maxHeight: number;
    /** Gap to the screen edge when docked. Applies from the next layout. */
    margin: number;
    /** Space kept free along the screen edges. Applies from the next layout. */
    insets: PanelInsets;

    private readonly _opts: PanelOptions;
    private readonly _driver: Driver;
    private readonly _frame = new SilkGraphics();
    private readonly _preview = new SilkGraphics();
    private readonly _chevron = new SilkGraphics();
    private readonly _layout: FlexContainer;
    private readonly _body = new Container({ label: 'PanelBody' });
    private readonly _bodyClip = new Graphics();
    private readonly _headerH: number;
    private readonly _collapsed: Signal<boolean>;
    private readonly _dock: Signal<PanelDock | null>;
    private readonly _dragging = signal(false);
    private readonly _resizing = signal(false);
    private readonly _rect: Signal<PanelRect>;
    private readonly _springs: { x: Spring; y: Spring; w: Spring; h: Spring; open: Spring };
    private readonly _stops: (() => void)[] = [];
    private _float: PanelRect;
    private _vw = 0;
    private _vh = 0;
    private _press: {
        id: number;
        kind: 'drag' | 'resize' | 'fold';
        edge: Edge;
        start: PointData;
        rect: PanelRect;
        moved: boolean;
    } | null = null;
    private _preDock: PanelDock | null = null;
    private _previewA = 0;
    private _previewRect: PanelRect | null = null;
    private _bodyW = -1;
    private _bodyH = -1;
    private _shown: PanelRect = { x: 0, y: 0, width: 0, height: 0 };

    constructor(options: PanelOptions = {}) {
        super({ label: 'Panel' });
        this._opts = options;
        this.theme = resolvePanelTheme(options.theme);
        this.minWidth = options.minWidth ?? 160;
        this.minHeight = options.minHeight ?? 96;
        this.maxWidth = options.maxWidth ?? Number.POSITIVE_INFINITY;
        this.maxHeight = options.maxHeight ?? Number.POSITIVE_INFINITY;
        this.margin = options.margin ?? 8;
        this.insets = { ...options.insets };
        this._headerH = options.headerHeight ?? 34;
        this._float = {
            x: options.x ?? 0,
            y: options.y ?? 0,
            width: options.width ?? 260,
            height: options.height ?? 360,
        };
        this._collapsed = signal(options.collapsed ?? false);
        this._dock = signal<PanelDock | null>(options.dock ?? null);
        this._rect = signal<PanelRect>({ ...this._float }, (a, b) => JSON.stringify(a) === JSON.stringify(b));
        this.state = {
            collapsed: this._collapsed,
            dock: this._dock,
            dragging: this._dragging,
            resizing: this._resizing,
            rect: this._rect,
        };
        const ticker = options.ticker;
        const open = this._collapsed.value ? 0 : 1;

        this._springs = {
            x: new Spring(this._float.x, 380, 34),
            y: new Spring(this._float.y, 380, 34),
            w: new Spring(this._float.width, 380, 34),
            h: new Spring(this._float.height, 380, 34),
            open: new Spring(open, 320, 28),
        };

        // title bar: chevron, title, a spacer and the actions, laid out with flex
        this.titleText = panelText(this.theme, { text: options.title ?? '', weight: 600, atlas: options.atlas });
        this.header = new FlexContainer({
            layout: { direction: 'row', alignItems: 'center', gap: 6, paddingLeft: 8, paddingRight: 8 },
            ticker,
        });
        this.actions = new FlexContainer({ layout: { direction: 'row', alignItems: 'center', gap: 2 }, ticker });
        this._chevron.eventMode = 'none';
        this._chevron.boundsArea = new Rectangle(0, 0, 16, 16);
        this.titleText.eventMode = 'none';
        if (options.collapsible ?? true) this.header.add(this._chevron, { width: 16, height: 16 });
        else this.header.setStyle({ ...this.header.layoutStyle, paddingLeft: 12 });
        this.header.add(this.titleText, { shrink: 1 });
        this.header.add(new Container(), { grow: 1 });
        this.header.add(this.actions);

        // body: a scroller around a flex column, or the column alone
        const layout: SmartLayout = options.layout ?? { direction: 'column', gap: 8, padding: 10 };

        this.content = new FlexContainer({
            layout,
            transition: true,
            ticker,
            onLayout: (c) => {
                if (this.scroll) this.scroll.contentHeight = c.node.layout.height;
            },
        });
        if (options.scroll ?? true) {
            this.scroll = new ScrollView({ theme: options.theme, ticker });
            this.scroll.content.addChild(this.content);
            this._body.addChild(this.scroll);
        } else {
            this.scroll = null;
            this._body.addChild(this.content);
        }
        this._body.mask = this._bodyClip;
        this._body.addChild(this._bodyClip);

        this._layout = new FlexContainer({ layout: { direction: 'column' }, ticker });
        this._layout.add(this.header, { height: this._headerH });
        this._layout.add(this._body, { grow: 1, onSize: (w, h) => this._sizeBody(w, h) });

        this._preview.eventMode = 'none';
        this.addChild(this._preview, this._frame, this._layout);
        this._driver = new Driver((dt) => this._step(dt), ticker);

        this.eventMode = 'static';
        this.hitArea = { contains: (x: number, y: number) => this._contains(x, y, 6) };
        this.on('pointerdown', this._onDown, this);
        this.on('pointermove', this._onHover, this);
        this.on('pointerout', () => {
            if (!this._press) this.cursor = 'default';
        });
        this.on('globalpointermove', this._onMove, this);
        this.on('pointerup', this._onUp, this);
        this.on('pointerupoutside', this._onUp, this);

        this._collapsed.subscribe((c) => {
            this._springs.open.target = c ? 0 : 1;
            this._driver.wake();
        });
        this._dock.subscribe(() => this._aim(true));
        if (options.viewport) {
            const vp = options.viewport;

            this._vw = read(vp.width);
            this._vh = read(vp.height);
            const sync = () => this.setViewport(read(vp.width), read(vp.height));

            if (typeof vp.width !== 'number') this._stops.push(vp.width.subscribe(sync));
            if (typeof vp.height !== 'number') this._stops.push(vp.height.subscribe(sync));
        }
        this._aim(false);
        this._apply();
        this._driver.wake();
    }

    /** True when docked to an edge or a corner. */
    get docked(): boolean {
        return this._dock.value !== null;
    }

    /** True while folded to the title bar. */
    get collapsed(): boolean {
        return this._collapsed.value;
    }

    /** Title bar height. */
    get headerHeight(): number {
        return this._headerH;
    }

    /** The rectangle drawn now, in the parent's space: position, width and the folded or unfolded height. */
    get shownRect(): PanelRect {
        return { ...this._shown };
    }

    /** The title text. */
    get title(): string {
        return this.titleText.text;
    }

    /** Sets {@link Panel.title}. */
    set title(text: string) {
        this.titleText.text = text;
        this.header.invalidate(this.titleText);
    }

    /** Sets the screen size the panel docks in, for apps that track the size themselves instead of passing signals. */
    setViewport(width: number, height: number): this {
        if (width === this._vw && height === this._vh) return this;
        this._vw = width;
        this._vh = height;
        // a resized window moves docked panels at once, and keeps floating ones on screen
        this._aim(false);

        return this;
    }

    /** Docks to an edge or a corner, or floats with null. */
    dockTo(dock: PanelDock | null): this {
        this._dock.set(dock);

        return this;
    }

    /** Floats at (`x`, `y`) in the parent's space. Undocks a docked panel. `animate: false` jumps there. */
    moveTo(x: number, y: number, animate = true): this {
        this._float = { ...this._float, x, y };
        if (this._dock.value) this._dock.set(null);
        else this._aim(animate);

        return this;
    }

    /** Sets the floating size, within the limits. A panel docked to an edge keeps spanning it. `animate: false` jumps. */
    resizeTo(width: number, height: number, animate = true): this {
        this._float = { ...this._float, width: this._clampW(width), height: this._clampH(height) };
        this._aim(animate);

        return this;
    }

    /** Folds the body away. */
    collapse(): this {
        this._collapsed.set(true);

        return this;
    }

    /** Unfolds the body. */
    expand(): this {
        this._collapsed.set(false);

        return this;
    }

    /** Folds or unfolds. */
    toggle(): this {
        this._collapsed.set(!this._collapsed.value);

        return this;
    }

    /** True when a point in the stage's space is over the panel as drawn. */
    hitTest(global: PointData): boolean {
        if (!this.visible) return false;
        const p = this.toLocal(global);

        return this._contains(p.x, p.y, 0);
    }

    /** Advances the motion by `dt` seconds (only needed with `ticker: null`). Returns true while moving. */
    tick(dt: number): boolean {
        const a = this._driver.tick(dt);
        const b = this._layout.tick(dt);
        const c = this.content.tick(dt);
        const d = this.scroll?.tick(dt) ?? false;

        return a || b || c || d;
    }

    /** Stops the motion and signal subscriptions. Destroys children unless `options` says otherwise. */
    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        for (const stop of this._stops) stop();
        this._driver.sleep();
        super.destroy(options ?? { children: true });
    }

    // ------------------------------------------------------------------------------- geometry

    private _clampW(w: number): number {
        return Math.round(Math.max(this.minWidth, Math.min(this.maxWidth, w)));
    }

    private _clampH(h: number): number {
        return Math.round(Math.max(this.minHeight, Math.min(this.maxHeight, h)));
    }

    /** The rectangle the panel heads for: its dock, or its floating place kept on screen. */
    private _goal(): PanelRect {
        const dock = this._dock.value;
        const vp = { width: this._vw, height: this._vh };

        if (dock && this._vw > 0 && this._vh > 0) {
            const r = dockRect(dock, vp, this._float, this.margin, this.insets);

            return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
        }
        const f = this._float;
        let { x, y } = f;

        if (this._vw > 0 && this._vh > 0) {
            // keep the title bar reachable
            x = Math.min(Math.max(x, 40 - f.width), this._vw - 40);
            y = Math.min(Math.max(y, 0), this._vh - this._headerH);
        }

        return { x: Math.round(x), y: Math.round(y), width: f.width, height: f.height };
    }

    private _aim(animate: boolean): void {
        const goal = this._goal();
        const s = this._springs;

        s.x.target = goal.x;
        s.y.target = goal.y;
        s.w.target = goal.width;
        s.h.target = goal.height;
        if (!animate) {
            for (const k of ['x', 'y', 'w', 'h'] as const) {
                s[k].value = s[k].target;
                s[k].velocity = 0;
            }
        }
        this._rect.set(goal);
        this._driver.wake();
    }

    private _contains(x: number, y: number, slop: number): boolean {
        const r = this._shown;

        return x >= -slop && y >= -slop && x <= r.width + slop && y <= r.height + slop;
    }

    /** The edge under a local point, among the ones this panel resizes from. */
    private _edgeAt(x: number, y: number): Edge {
        if (!(this._opts.resizable ?? true) || this._collapsed.value) return '';
        const { width: w, height: h } = this._shown;
        const k = 6;
        let edge = '';

        if (y <= k && y >= -k) edge += 'n';
        else if (y >= h - k && y <= h + k) edge += 's';
        if (x >= w - k && x <= w + k) edge += 'e';
        else if (x <= k && x >= -k) edge += 'w';
        const dock = this._dock.value;

        if (dock) edge = [...edge].filter((c) => DOCK_EDGES[dock].includes(c)).join('');

        return edge as Edge;
    }

    private _sizeBody(w: number, h: number): void {
        if (w === this._bodyW && h === this._bodyH) return;
        this._bodyW = w;
        this._bodyH = h;
        this._bodyClip.clear().rect(0, 0, w, Math.max(0, h)).fill(0xffffff);
        if (this.scroll) {
            this.scroll.resize(w, Math.max(0, h));
            const style = this.content.layoutStyle;

            if (style.width !== w) this.content.setStyle({ ...style, width: w }).updateLayout();
        } else this.content.resize(w, Math.max(0, h)).updateLayout();
    }

    // ------------------------------------------------------------------------------- input

    private _onHover(e: FederatedPointerEvent): void {
        if (this._press) return;
        const p = this.toLocal(e.global);
        const edge = e.target === this || e.target === this.scroll ? this._edgeAt(p.x, p.y) : '';

        this.cursor = edge ? CURSORS[edge] : 'default';
    }

    private _onDown(e: FederatedPointerEvent): void {
        if (this._press || e.button > 0) return;
        const p = this.toLocal(e.global);
        const edge = this._edgeAt(p.x, p.y);
        const inHeader = p.y >= 0 && p.y <= this._headerH;
        // presses on the content and on buttons belong to them
        const own = e.target === this || e.target === this.scroll;

        if (!own && !edge) return;
        let kind: 'drag' | 'resize' | 'fold' | null = null;

        if (edge) kind = 'resize';
        else if (inHeader && (this._opts.collapsible ?? true) && p.x <= 28) kind = 'fold';
        else if (inHeader && (this._opts.draggable ?? true)) kind = 'drag';
        if (!kind) return;
        e.stopPropagation();
        this._press = {
            id: e.pointerId,
            kind,
            edge,
            start: { x: e.global.x, y: e.global.y },
            rect: { ...this._goal() },
            moved: false,
        };
        if (kind === 'resize') this._resizing.set(true);
    }

    private _onMove(e: FederatedPointerEvent): void {
        const press = this._press;

        if (!press || e.pointerId !== press.id) return;
        const parent = this.parent;
        const a = parent ? parent.toLocal(press.start) : press.start;
        const b = parent ? parent.toLocal(e.global) : e.global;

        this.dragBy(b.x - a.x, b.y - a.y, b);
    }

    /**
     * Moves or resizes as a press dragged by (`dx`, `dy`) in the parent's space does. `pointer` is
     * where the pointer is now, for docking. Pointer moves call this.
     */
    dragBy(dx: number, dy: number, pointer?: PointData): void {
        const press = this._press;

        if (!press) return;
        if (!press.moved && Math.hypot(dx, dy) < 4) return;
        press.moved = true;
        const r = press.rect;

        if (press.kind === 'fold') press.kind = (this._opts.draggable ?? true) ? 'drag' : 'fold';
        if (press.kind === 'drag') {
            if (!this._dragging.value) {
                this._dragging.set(true);
                if (this._dock.value) {
                    // tear off: float at the floating size, under the pointer where it was grabbed
                    const pressX = (pointer?.x ?? r.x + dx) - dx;
                    const fx = (pressX - r.x) / Math.max(1, r.width);
                    const { width, height } = this._float;

                    press.rect = { x: pressX - fx * width, y: r.y, width, height };
                    this._float = { ...press.rect };
                    this._dock.set(null);
                }
            }
            const nr = press.rect;

            this._float = { ...this._float, x: nr.x + dx, y: nr.y + dy };
            const goal = this._goal();
            const s = this._springs;

            // the panel follows the pointer exactly, only the size glides
            s.x.value = s.x.target = goal.x;
            s.y.value = s.y.target = goal.y;
            s.x.velocity = s.y.velocity = 0;
            s.w.target = goal.width;
            s.h.target = goal.height;
            this._rect.set(goal);
            const dock =
                (this._opts.dockable ?? true) && pointer && this._vw > 0
                    ? dockAt(pointer, { width: this._vw, height: this._vh }, this._opts.snapDistance ?? 28, this.insets)
                    : null;

            this._preDock = dock;
            if (dock)
                this._previewRect = dockRect(
                    dock,
                    { width: this._vw, height: this._vh },
                    this._float,
                    this.margin,
                    this.insets,
                );
            this._driver.wake();
        } else if (press.kind === 'resize') {
            const e = press.edge;
            let { x, y, width: w, height: h } = r;

            if (e.includes('e')) w = this._clampW(r.width + dx);
            if (e.includes('s')) h = this._clampH(r.height + dy);
            if (e.includes('w')) {
                w = this._clampW(r.width - dx);
                x = r.x + r.width - w;
            }
            if (e.includes('n')) {
                h = this._clampH(r.height - dy);
                y = r.y + r.height - h;
            }
            const dock = this._dock.value;

            // a panel docked to an edge keeps its place and spans the edge: only its depth changes
            this._float = dock
                ? {
                      ...this._float,
                      width: dock === 'top' || dock === 'bottom' ? this._float.width : w,
                      height: dock === 'left' || dock === 'right' ? this._float.height : h,
                  }
                : { x, y, width: w, height: h };
            this._aim(false);
        }
        // draw now: the panel tracks the pointer without a frame of lag
        this._apply();
    }

    private _onUp(e: FederatedPointerEvent): void {
        const press = this._press;

        if (!press || e.pointerId !== press.id) return;
        this.release();
    }

    /** Ends a press: a tap on the chevron folds, a drag that ends near an edge docks there. */
    release(): void {
        const press = this._press;

        this._press = null;
        if (!press) return;
        if (press.kind === 'fold' && !press.moved) this.toggle();
        if (this._dragging.value) {
            this._dragging.set(false);
            const dock = this._preDock;

            this._preDock = null;
            if (dock) this._dock.set(dock);
            else this._aim(true);
        }
        this._resizing.set(false);
        this._driver.wake();
    }

    // ------------------------------------------------------------------------------- frame

    private _step(dt: number): boolean {
        const s = this._springs;
        let busy = this._press !== null;

        for (const k of ['x', 'y', 'w', 'h', 'open'] as const) {
            const spring = s[k];

            if (spring.settled) {
                spring.value = spring.target;
                continue;
            }
            spring.step(dt);
            busy = true;
        }
        const previewT = this._preDock ? 1 : 0;

        this._previewA += (previewT - this._previewA) * (1 - Math.exp(-18 * dt));
        if (Math.abs(this._previewA - previewT) > 0.01) busy = true;
        else this._previewA = previewT;
        this._apply();

        return busy;
    }

    private _apply(): void {
        const s = this._springs;
        const open = Math.min(1.04, Math.max(0, s.open.value));
        const hh = this._headerH;
        const w = Math.max(0, Math.round(s.w.value));
        const fullH = Math.max(hh, s.h.value);
        const h = Math.round(hh + (fullH - hh) * Math.min(1, open));
        const x = Math.round(s.x.value);
        const y = Math.round(s.y.value);

        this._shown = { x, y, width: w, height: h };
        this.position.set(x, y);
        this._layout.resize(w, h).updateLayout();
        this._body.alpha = Math.min(1, open);
        this._body.visible = open > 0.01;

        const t = this.theme;
        const g = this._frame;
        const r = Math.min(t.radius, h / 2, w / 2);

        g.clear();
        if (t.shadowAlpha > 0) {
            g.roundRect(0, 6, w, h, r, 0.6).fill({ color: t.shadow, alpha: t.shadowAlpha * 0.6, blur: 14 });
            g.roundRect(0, 1, w, h, r, 0.6).fill({ color: t.shadow, alpha: t.shadowAlpha * 0.5, blur: 2 });
        }
        g.roundRect(0, 0, w, h, r, 0.6).fill({ color: t.background, alpha: t.backgroundAlpha });
        if (open > 0.01) g.rect(0, hh - 0.5, w, 1).fill({ color: t.border, alpha: Math.min(1, open) });
        g.roundRect(0, 0, w, h, r, 0.6).stroke({ width: 1, color: t.border, alignment: 'inside' });

        const c = this._chevron;

        c.clear();
        drawChevron(c, 8, 8, 16, t.textDim, 1, Math.min(1, open));

        const pg = this._preview;

        pg.clear();
        if (this._previewA > 0.01 && this._previewRect) {
            const pr = this._previewRect;
            const a = this._previewA;

            pg.roundRect(pr.x - x, pr.y - y, pr.width, pr.height, t.radius, 0.6).fill({
                color: t.accent,
                alpha: 0.12 * a,
            });
            pg.roundRect(pr.x - x, pr.y - y, pr.width, pr.height, t.radius, 0.6).stroke({
                width: 1.5,
                color: t.accent,
                alpha: 0.7 * a,
                alignment: 'inside',
            });
        }
    }
}
