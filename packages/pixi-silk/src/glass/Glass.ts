import { Container, Rectangle, type Renderer } from 'pixi.js';
import { SilkGraphics } from '../SilkGraphics';
import { GlassFilter } from './GlassFilter';
import { type GlassStyle, lightVector, type ResolvedGlass, resolveGlass } from './options';

/** Options of {@link Glass}: its size plus a {@link GlassStyle}. */
export interface GlassOptions extends GlassStyle {
    /** Default 240. */
    width?: number;
    /** Default 160. */
    height?: number;
}

/**
 * A pane of frosted glass. It blurs and bends whatever is drawn behind it, splits colours at its
 * curved rim, and catches light on the edge that faces the light.
 *
 * Put labels and icons in {@link Glass.content}: they sit on top of the glass, sharp. The pane's
 * top-left corner is at (0, 0). It reads the canvas behind it, so on WebGL it turns on the
 * renderer's back buffer the first time it draws. Pass `useBackBuffer: true` to the application
 * to have it from the first frame. WebGPU reads the backdrop without a back buffer. On any other
 * renderer it draws a plain frosted fill instead.
 */
export class Glass extends Container {
    /** Children drawn on top of the glass. */
    readonly content: Container = new Container({ label: 'GlassContent' });
    private readonly _shadow = new SilkGraphics({ label: 'GlassShadow' });
    private readonly _body = new Container({ label: 'GlassBody' });
    private readonly _fill = new SilkGraphics({ label: 'GlassFill' });
    private readonly _filter: GlassFilter | null;
    private _style: GlassStyle;
    private _r: ResolvedGlass;
    private _w: number;
    private _h: number;
    private _fallback = false;

    constructor(options: GlassOptions = {}) {
        super({ label: 'Glass' });
        const { width = 240, height = 160, ...style } = options;

        this._w = width;
        this._h = height;
        this._style = style;
        this._r = resolveGlass(style);
        this._filter = new GlassFilter();
        this._body.filters = [this._filter];
        this._body.addChild(this._fill);
        this.addChild(this._shadow, this._body, this.content);
        this.onRender = (renderer) => this._sync(renderer as Renderer);
        this._redraw();
    }

    /** Pane width in local units. */
    get paneWidth(): number {
        return this._w;
    }

    /** Pane height in local units. */
    get paneHeight(): number {
        return this._h;
    }

    /** The current style, as given. */
    get style(): Readonly<GlassStyle> {
        return this._style;
    }

    /** Resizes the pane. */
    resize(width: number, height: number): this {
        this._w = width;
        this._h = height;
        this._redraw();

        return this;
    }

    /** Changes any part of the style. Fields left out keep their value. */
    set(style: GlassStyle): this {
        const before = this._r;

        this._style = { ...this._style, ...style };
        this._r = resolveGlass(this._style);
        // optics go to the filter every frame anyway; only the outline and the shadow need repainting
        const r = this._r;
        const outline =
            r.radius !== before.radius ||
            r.smoothing !== before.smoothing ||
            r.shadow !== before.shadow ||
            r.opacity !== before.opacity ||
            (this._fallback && (r.frost !== before.frost || r.tint.some((v, i) => v !== before.tint[i])));

        if (outline) this._redraw();

        return this;
    }

    private _redraw(): void {
        const r = this._r;
        const w = this._w;
        const h = this._h;

        this._body.filterArea = new Rectangle(0, 0, w, h);
        this._fill.clear().roundRect(0, 0, w, h, r.radius, r.smoothing);
        // the filter replaces this fill with the glass; it only shows where there is no back buffer
        this._fill.fill(this._fallback ? { color: r.tint, alpha: 0.18 + r.frost } : { color: 0xffffff, alpha: 0.002 });
        this._shadow.clear();
        if (r.shadow > 0) {
            this._shadow
                .roundRect(4, 14, w - 8, h - 6, r.radius, r.smoothing)
                .fill({ color: 0x000000, alpha: r.shadow * r.opacity, blur: Math.max(8, Math.min(w, h) * 0.12) });
        }
    }

    private _sync(renderer: Renderer): void {
        const filter = this._filter;
        const backBuffer = (renderer as { backBuffer?: { useBackBuffer: boolean } }).backBuffer;
        // WebGL reads the backdrop from its back buffer, WebGPU copies it from the render target
        const supported = !!filter && (backBuffer !== undefined || renderer.name === 'webgpu');

        if (!supported && !this._fallback) {
            // a renderer without backdrop access: keep a frosted fill instead of a broken filter
            this._fallback = true;
            this._body.filters = [];
            this._redraw();

            return;
        }
        if (!filter || this._fallback) return;
        if (backBuffer && !backBuffer.useBackBuffer) backBuffer.useBackBuffer = true;
        // The back buffer takes effect from the next frame. Until then the frame draws straight to the
        // canvas, and an opaque canvas has no alpha channel: copying its backdrop into the filter's RGBA
        // texture fails with GL_INVALID_OPERATION. Skip the filter for that frame.
        filter.enabled = !(backBuffer && renderer.renderTarget.rootRenderTarget?.isRoot);
        const m = this._body.worldTransform;
        const k = Math.hypot(m.a, m.b);
        const r = this._r;
        const [lx, ly] = lightVector(r.lightAngle);

        filter.setShape((this._w * k) / 2, (this._h * k) / 2, r.radius * k, r.smoothing);
        filter.setOptics(r.blur * k, r.refraction * k, r.dispersion, r.bevel * k);
        filter.setTint(r.tint[0], r.tint[1], r.tint[2], r.tintAmount);
        filter.setLight(lx, ly, r.light, r.grain);
        filter.setSurface(r.frost, r.opacity, r.saturation, 0);
    }
}
