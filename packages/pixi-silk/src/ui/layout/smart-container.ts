import type { Application } from 'pixi.js';
import { Spring } from '../../motion';
import { FlexContainer, type FlexContainerOptions, type SmartLayout } from './flex-container';

/**
 * Where a SmartContainer sits on screen and how it scales, for one breakpoint. The names match
 * the SmartContainer many slot games use, so a game can bring its layout records over as they are.
 */
export interface LayoutData {
    /** Horizontal anchor of the design box in the window. Default `center`. */
    align?: 'left' | 'center' | 'right';
    /** Vertical anchor of the design box in the window. Default `center`. */
    valign?: 'top' | 'center' | 'bottom';
    /** Width of the design box, in design units. Default 0. */
    width?: number;
    /** Height of the design box, in design units. Default 0. */
    height?: number;
    /** Reference resolution width. Default 1080 in portrait, 1920 in landscape. */
    viewportWidth?: number;
    /** Reference resolution height. Default 1920 in portrait, 1080 in landscape. */
    viewportHeight?: number;
    /** Scale the x axis so the box spans the window width. Distorts the content. Default false. */
    stretchWidth?: boolean;
    /** Scale the y axis so the box spans the window height. Distorts the content. Default false. */
    stretchHeight?: boolean;
    /** Keep the uniform scale and widen the box to the window instead. Flex children spread out. Default false. */
    extendWidth?: boolean;
    /** Keep the uniform scale and make the box as tall as the window. Default false. */
    extendHeight?: boolean;
    /** Multiplies the x scale. Default 1. */
    correctionScaleX?: number;
    /** Multiplies the y scale. Default 1. */
    correctionScaleY?: number;
    /** Moves the box, in design units (multiplied by the scale). Default 0. */
    correctionOffsetX?: number;
    /** Moves the box, in design units (multiplied by the scale). Default 0. */
    correctionOffsetY?: number;
    /** Scale to cover the window (the larger ratio) instead of fitting inside it. Default false. */
    fitCover?: boolean;
    /** Place the box in the whole window, under notches and home bars. Default false. */
    ignoreSafeArea?: boolean;
    /** Flex style for the children inside the design box. Default the container's `layout`. */
    layout?: SmartLayout;
}

/** A named layout record that applies when `when` returns true for the window size. */
export interface Breakpoint {
    name: string;
    /** Tested in order with the full window size. The first match wins. */
    when: (width: number, height: number) => boolean;
    data: LayoutData;
}

/** A window rectangle in screen pixels. */
export interface ViewportRect {
    x?: number;
    y?: number;
    width: number;
    height: number;
}

/**
 * What a SmartContainer follows: an Application or a renderer (it updates on their `resize`), a
 * signal of a rectangle (it updates on change), or a plain rectangle (call `updateContainer()`).
 */
export type ViewportSource =
    | Application
    | {
          screen: ViewportRect;
          on(event: 'resize', fn: () => void, context?: unknown): unknown;
          off(event: 'resize', fn: () => void, context?: unknown): unknown;
      }
    | { readonly value: ViewportRect; subscribe(fn: () => void): () => void }
    | ViewportRect;

/** Distances from the window edges, in screen pixels: notches, rounded corners, home bars. */
export interface Insets {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
}

/** Options of {@link SmartContainer}. */
export interface SmartContainerOptions extends FlexContainerOptions {
    /** The record for a window taller than wide. */
    portraitData?: LayoutData;
    /** The record for any other window. */
    landscapeData?: LayoutData;
    /** Named records tested before portrait and landscape. */
    breakpoints?: readonly Breakpoint[];
    /** The window to follow. */
    viewport?: ViewportSource;
    /** Keeps boxes clear of these window insets, unless a record sets `ignoreSafeArea`. */
    safeArea?: Insets;
    /** Glide to the new place and scale when the breakpoint changes. Default false. */
    switchTransition?: boolean | { stiffness?: number; damping?: number };
    /** Default true. */
    visible?: boolean;
}

type Resolved = Required<Omit<LayoutData, 'layout'>> & { layout: SmartLayout | undefined };

const DEFAULTS: Resolved = {
    align: 'center',
    valign: 'center',
    width: 0,
    height: 0,
    viewportWidth: 0,
    viewportHeight: 0,
    stretchWidth: false,
    stretchHeight: false,
    extendWidth: false,
    extendHeight: false,
    correctionScaleX: 1,
    correctionScaleY: 1,
    correctionOffsetX: 0,
    correctionOffsetY: 0,
    fitCover: false,
    ignoreSafeArea: false,
    layout: undefined,
};

const resolveData = (data: LayoutData | undefined, viewportWidth: number, viewportHeight: number): Resolved => ({
    ...DEFAULTS,
    viewportWidth,
    viewportHeight,
    ...data,
});

/** Where {@link placeBox} put a design box: position and scale in the window's space, and the box size. */
export interface Placement {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    /** The design box after `extend`, in design units. */
    width: number;
    height: number;
}

/**
 * Where a record puts its box in a window: the fit scale of the window to the reference
 * resolution, then stretch per axis, then the corrections, then the alignment. Pure, so you can
 * check a layout record without a renderer.
 */
export function placeBox(data: LayoutData, window: ViewportRect, out?: Placement): Placement {
    const d = data as Resolved;
    const W = window.width;
    const H = window.height;
    const cover = d.fitCover === true;
    const kw = W / (d.viewportWidth || 1920);
    const kh = H / (d.viewportHeight || 1080);
    const fit = cover ? Math.max(kw, kh) : Math.min(kw, kh);
    let sx = fit;
    let sy = fit;
    let w = d.width ?? 0;
    let h = d.height ?? 0;

    if (d.stretchWidth) sx = W / w;
    if (d.stretchHeight) sy = H / h;
    if (d.extendWidth) w = W / sx;
    if (d.extendHeight) h = H / sy;
    sx *= d.correctionScaleX ?? 1;
    sy *= d.correctionScaleY ?? 1;
    const ax = d.align === 'left' ? 0 : d.align === 'right' ? 1 : 0.5;
    const ay = d.valign === 'top' ? 0 : d.valign === 'bottom' ? 1 : 0.5;
    const p = out ?? { x: 0, y: 0, scaleX: 1, scaleY: 1, width: 0, height: 0 };

    p.x = (window.x ?? 0) + (W - w * sx) * ax + (d.correctionOffsetX ?? 0) * sx;
    p.y = (window.y ?? 0) + (H - h * sy) * ay + (d.correctionOffsetY ?? 0) * sy;
    p.scaleX = sx;
    p.scaleY = sy;
    p.width = w;
    p.height = h;

    return p;
}

/**
 * A container that places and scales itself in the window from layout records, the way slot
 * games lay out a HUD. A record has a design box, a reference resolution it fits or covers, an
 * alignment, and optional stretch and corrections. It picks `portraitData` when the window is taller than wide,
 * `landscapeData` otherwise, or the first matching named breakpoint.
 *
 * Inside the box its children stay where you put them, in design units. Give it a `layout` (on
 * the options or a record) and the box becomes a flex container: children get styles, fit modes
 * and text shrink-to-fit, as in a {@link FlexContainer}.
 *
 * It follows a viewport source, not the global window, and keeps clear of safe-area insets.
 */
export class SmartContainer extends FlexContainer {
    /** @internal */
    protected override readonly _screenRoot: boolean = true;
    private _portrait: Resolved;
    private _landscape: Resolved;
    private _named: { name: string; when: Breakpoint['when']; data: Resolved }[] = [];
    private _source: ViewportSource | null = null;
    private _unsubscribe: (() => void) | null = null;
    private _safe: Insets;
    private readonly _layoutAll: SmartLayout | undefined;
    private readonly _switch: SmartContainerOptions['switchTransition'];
    private _active = '';
    private _springs: Spring[] | null = null;
    private readonly _place: Placement = { x: 0, y: 0, scaleX: 1, scaleY: 1, width: 0, height: 0 };
    private readonly _window: Required<ViewportRect> = { x: 0, y: 0, width: 0, height: 0 };
    private readonly _full: Required<ViewportRect> = { x: 0, y: 0, width: 0, height: 0 };
    private _data: Resolved;

    constructor(options: SmartContainerOptions = {}) {
        super(options);
        this.label = 'SmartContainer';
        this._layoutAll = options.layout;
        this._switch = options.switchTransition;
        this._safe = { ...options.safeArea };
        this._portrait = resolveData(options.portraitData, 1080, 1920);
        this._landscape = resolveData(options.landscapeData, 1920, 1080);
        this._data = this._landscape;
        this.breakpoints = options.breakpoints ?? [];
        this.visible = options.visible ?? true;
        if (options.viewport) this.setViewport(options.viewport);
    }

    /** The effective portrait record (defaults merged with yours). Setting it updates the container. */
    get portraitData(): LayoutData {
        return this._portrait;
    }

    set portraitData(data: LayoutData | undefined) {
        this._portrait = resolveData(data, 1080, 1920);
        this.updateContainer();
    }

    /** The effective landscape record (defaults merged with yours). Setting it updates the container. */
    get landscapeData(): LayoutData {
        return this._landscape;
    }

    set landscapeData(data: LayoutData | undefined) {
        this._landscape = resolveData(data, 1920, 1080);
        this.updateContainer();
    }

    /** Named records, tested in order before portrait and landscape. Missing values default as landscape. */
    get breakpoints(): readonly Breakpoint[] {
        return this._named.map((b) => ({ name: b.name, when: b.when, data: b.data }));
    }

    set breakpoints(list: readonly Breakpoint[]) {
        this._named = list.map((b) => ({ name: b.name, when: b.when, data: resolveData(b.data, 1920, 1080) }));
        this.updateContainer();
    }

    /** The active record's name: a breakpoint name, `portrait` or `landscape`. */
    get breakpoint(): string {
        return this._active;
    }

    /** The design box of the active record, in design units, after `extendWidth` and `extendHeight`. */
    get box(): { width: number; height: number } {
        return { width: this._place.width, height: this._place.height };
    }

    /** Follows a new window source. */
    setViewport(source: ViewportSource | null): this {
        this._unsubscribe?.();
        this._unsubscribe = null;
        this._source = source;
        const update = () => this.updateContainer();

        if (source && 'renderer' in source) {
            source.renderer.on('resize', update);
            this._unsubscribe = () => source.renderer.off('resize', update);
        } else if (source && 'screen' in source) {
            source.on('resize', update);
            this._unsubscribe = () => source.off('resize', update);
        } else if (source && 'subscribe' in source) {
            this._unsubscribe = source.subscribe(update);
        }
        this.updateContainer();

        return this;
    }

    /** Keeps boxes clear of these window insets, in screen pixels. */
    setSafeArea(insets: Insets): this {
        this._safe = { ...insets };
        this.updateContainer();

        return this;
    }

    /**
     * Places and scales the container for the current window. It runs on every viewport change.
     * Call it yourself after changing a plain rectangle source.
     */
    updateContainer(): void {
        const src = this._source;

        if (!src) return;
        const rect: ViewportRect =
            'renderer' in src ? src.screen : 'screen' in src ? src.screen : 'value' in src ? src.value : src;
        const W = rect.width;
        const H = rect.height;
        let name = H > W ? 'portrait' : 'landscape';
        let data = H > W ? this._portrait : this._landscape;

        for (const b of this._named) {
            if (b.when(W, H)) {
                name = b.name;
                data = b.data;
                break;
            }
        }
        this._data = data;
        this._full.x = rect.x ?? 0;
        this._full.y = rect.y ?? 0;
        this._full.width = W;
        this._full.height = H;
        // the window, less the safe-area insets
        const win = this._window;
        const s = this._safe;
        const keep = !data.ignoreSafeArea;
        const top = keep ? (s.top ?? 0) : 0;
        const left = keep ? (s.left ?? 0) : 0;

        win.x = (rect.x ?? 0) + left;
        win.y = (rect.y ?? 0) + top;
        win.width = W - left - (keep ? (s.right ?? 0) : 0);
        win.height = H - top - (keep ? (s.bottom ?? 0) : 0);
        const p = placeBox(data, win, this._place);
        const switched = this._active !== '' && this._active !== name;

        this._active = name;
        this._moveTo(p, switched);

        // the inner flex layout: on with a `layout`, sized to the design box
        const layout = data.layout ?? this._layoutAll;

        this._flexChildren = layout !== undefined;
        if (layout !== this.layoutStyle) this.setStyle(layout ?? {});
        this.resize(p.width, p.height);
        if (switched) this.invalidate();
    }

    override destroy(options?: Parameters<FlexContainer['destroy']>[0]): void {
        this._unsubscribe?.();
        this._unsubscribe = null;
        super.destroy(options);
    }

    // ------------------------------------------------------------------------------- internals

    /** @internal */
    protected override _breakpoint(): string | null {
        return this._active || null;
    }

    /**
     * @internal What `layoutDebug` draws: the whole window and the safe one (in the parent's
     * space), the active record and where it put the box.
     */
    _debugScreen(): {
        full: Required<ViewportRect>;
        window: Required<ViewportRect>;
        data: LayoutData;
        breakpoint: string;
        place: Readonly<Placement>;
    } {
        return {
            full: this._full,
            window: this._window,
            data: this._data,
            breakpoint: this._active,
            place: this._place,
        };
    }

    /** @internal */
    protected override _step(dt: number): boolean {
        const busy = super._step(dt);
        const springs = this._springs;

        if (!springs || springs.every((s) => s.settled)) return busy;
        for (const s of springs) s.step(dt);
        this.position.set(springs[0].value, springs[1].value);
        this.scale.set(springs[2].value, springs[3].value);

        return true;
    }

    /** Snaps to a placement, or glides there after a breakpoint switch. */
    private _moveTo(p: Placement, switched: boolean): void {
        const t = this._switch;
        const gliding = this._springs !== null && !this._springs.every((s) => s.settled);

        if (t && (switched || gliding)) {
            const { stiffness = 170, damping = 26 } = typeof t === 'object' ? t : {};

            if (!this._springs) {
                this._springs = [this.x, this.y, this.scale.x, this.scale.y].map(
                    (v) => new Spring(v, stiffness, damping),
                );
            }
            const sp = this._springs;

            sp[0].target = p.x;
            sp[1].target = p.y;
            sp[2].target = p.scaleX;
            sp[3].target = p.scaleY;
            this._driver.wake();

            return;
        }
        this.position.set(p.x, p.y);
        this.scale.set(p.scaleX, p.scaleY);
        if (this._springs) {
            const sp = this._springs;

            sp[0].value = sp[0].target = p.x;
            sp[1].value = sp[1].target = p.y;
            sp[2].value = sp[2].target = p.scaleX;
            sp[3].value = sp[3].target = p.scaleY;
            for (const s of sp) s.velocity = 0;
        }
    }
}
