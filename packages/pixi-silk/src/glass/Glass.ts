import { Container, Rectangle, type Renderer } from 'pixi.js';
import { SilkGraphics } from '../SilkGraphics';
import { GlassFilter } from './GlassFilter';
import { type GlassStyle, lightVector, type ResolvedGlass, resolveGlass } from './options';

/** Options of {@link Glass}: the pane size plus every {@link GlassStyle} field. */
export interface GlassOptions extends GlassStyle {
    /** Pane width in local units. Default 240. */
    width?: number;
    /** Pane height in local units. Default 160. */
    height?: number;
}

/**
 * A pane of frosted glass from `pixi-silk/glass`. It blurs and bends whatever is drawn behind it,
 * splits colours at its curved rim, and catches light on the edge that faces the light.
 *
 * Put labels and icons in {@link Glass.content}. They sit on top of the glass, unblurred. The pane's
 * top-left corner is at (0, 0). It only sees what was drawn before it in the same frame, so add it
 * after its backdrop. You can rotate and scale it. The light stays fixed on screen, and under an uneven
 * scale the corners keep the radius of the smaller scale. Skew is not supported.
 *
 * On WebGL the pane reads the canvas through the renderer's back buffer. It sets
 * `renderer.backBuffer.useBackBuffer = true` the first time it draws and shows no glass on that one
 * frame. Pass `useBackBuffer: true` to the application to have glass from the first frame. The back
 * buffer costs a full-screen copy each frame for the whole app. WebGPU reads the backdrop without a
 * back buffer. Any other renderer gets a plain frosted fill instead.
 *
 * ```ts
 * const pane = new Glass({ width: 320, height: 200, radius: 32 });
 * pane.content.addChild(label);
 * app.stage.addChild(backdrop, pane);
 * ```
 */
export class Glass extends Container {
    /** Children drawn on top of the glass, unfiltered, in the pane's local space. */
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

    /** Pane width in local units. Change it with {@link Glass.resize}. */
    get paneWidth(): number {
        return this._w;
    }

    /** Pane height in local units. Change it with {@link Glass.resize}. */
    get paneHeight(): number {
        return this._h;
    }

    /** The style as given, before defaults. Change it with {@link Glass.set}. */
    get style(): Readonly<GlassStyle> {
        return this._style;
    }

    /** Resizes the pane, in local units, and redraws its outline and shadow. Returns this. */
    resize(width: number, height: number): this {
        this._w = width;
        this._h = height;
        this._redraw();

        return this;
    }

    /**
     * Merges `style` into the current style. Fields left out keep their value. Only a change of
     * radius, smoothing, shadow or opacity redraws the outline (frost and tint too in the fallback fill).
     * The rest goes to the filter on the next frame. Returns this.
     */
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
        // scale along the pane's own axes, so an uneven scale sizes each side by its own factor
        const kx = Math.hypot(m.a, m.b);
        const ky = Math.hypot(m.c, m.d);
        const k = Math.min(kx, ky);
        const r = this._r;
        const [lx, ly] = lightVector(r.lightAngle);

        filter.setShape((this._w * kx) / 2, (this._h * ky) / 2, r.radius * k, r.smoothing);
        filter.setRotation(Math.atan2(m.b, m.a));
        filter.setOptics(r.blur * k, r.refraction * k, r.dispersion, r.bevel * k);
        filter.setTint(r.tint[0], r.tint[1], r.tint[2], r.tintAmount);
        filter.setLight(lx, ly, r.light, r.grain);
        filter.setSurface(r.frost, r.opacity, r.saturation, 0);
    }
}
