import { BufferImageSource, DOMAdapter, type Shader } from 'pixi.js';
import { sdfFromAlpha } from './edt';

/** The font of a glyph: CSS family list, weight and style. Size does not matter, glyphs are baked at one size. */
export interface FontSpec {
    /** CSS font family list, as in `font-family`. */
    family: string;
    /** CSS weight: `400`, `'600'`, `'bold'`. Default `400`. */
    weight?: string | number;
    /** `normal`, `italic` or `oblique`. Default `normal`. */
    style?: string;
}

/** A glyph baked into the atlas. Distances are in raster pixels, at {@link SdfAtlas.size}. */
export interface Glyph {
    /** Left edge of the glyph's cell in the atlas, in texels. */
    x: number;
    /** Top edge of the cell in the atlas, in texels. */
    y: number;
    /** Cell width in texels. 0 for glyphs with no ink (spaces). */
    w: number;
    /** Cell height in texels. */
    h: number;
    /** Left edge of the cell relative to the pen position. */
    left: number;
    /** Top edge of the cell relative to the baseline (negative is above it). */
    top: number;
}

/** Vertical metrics of a font at the atlas size, measured the way PixiJS `Text` measures them. */
export interface FontMetrics {
    /** Distance from the baseline up to the top of `|ÉqÅM`. */
    ascent: number;
    /** Distance from the baseline down to the bottom of `|ÉqÅM`. */
    descent: number;
}

/**
 * The slice of a 2D canvas context the atlas needs. Pass your own to {@link SdfAtlasOptions.context}
 * to bake glyphs somewhere else (a worker canvas, or a fake one in tests).
 */
export interface GlyphContext {
    /** CSS font shorthand used by `measureText` and `fillText`. */
    font: string;
    /** Fill colour of the glyph raster. */
    fillStyle: unknown;
    /** Vertical anchor of `fillText`. The atlas sets `alphabetic`. */
    textBaseline: string;
    /** Horizontal anchor of `fillText`. The atlas sets `left`. */
    textAlign: string;
    /** The canvas behind the context. The atlas grows it when a glyph does not fit. */
    readonly canvas: {
        /** Width in pixels. */
        width: number;
        /** Height in pixels. */
        height: number;
    };
    /** Measures a string in the current font. */
    measureText(
        text: string,
    ): Pick<
        TextMetrics,
        | 'width'
        | 'actualBoundingBoxLeft'
        | 'actualBoundingBoxRight'
        | 'actualBoundingBoxAscent'
        | 'actualBoundingBoxDescent'
    >;
    /** Clears a rectangle to transparent. */
    clearRect(x: number, y: number, w: number, h: number): void;
    /** Draws a string with its pen at (x, y). */
    fillText(text: string, x: number, y: number): void;
    /** Reads pixels back as RGBA bytes. */
    getImageData(
        x: number,
        y: number,
        w: number,
        h: number,
    ): {
        /** RGBA bytes, row by row. */
        data: ArrayLike<number>;
    };
}

/** Options of an {@link SdfAtlas}. */
export interface SdfAtlasOptions {
    /** Font size glyphs are baked at, in pixels. Larger is sharper on big text and uses more memory. Default 48. */
    size?: number;
    /** Distance in raster pixels the field covers. Outlines and glows can reach `0.75 * radius`. Default 16. */
    radius?: number;
    /** Fraction of the field spent inside glyphs. Default 0.25. */
    cutoff?: number;
    /** Atlas texture width in texels. Default 1024. */
    width?: number;
    /** Starting height in texels. The texture doubles in height as glyphs arrive. Default 256. */
    height?: number;
    /** Largest height the texture grows to. When it is full, the atlas starts over. Default 4096. */
    maxHeight?: number;
    /** Context to rasterise glyphs with. Default a new canvas from Pixi's DOM adapter. */
    context?: GlyphContext;
}

interface FontEntry {
    css: string;
    metrics: FontMetrics;
    glyphs: Map<string, Glyph>;
    advances: Map<string, number>;
    kerning: Map<string, number>;
    /** Baked before the web font finished loading: rebaked once it has. */
    provisional: boolean;
}

interface Shelf {
    y: number;
    h: number;
    x: number;
}

/** Pixi's metrics string: ascent and descent of these cover accents and descenders. */
const METRICS = '|ÉqÅM';
const NO_INK: Omit<Glyph, 'left' | 'top'> = { x: 0, y: 0, w: 0, h: 0 };

/** CSS `font` shorthand for a spec at a size. */
export function fontString(font: FontSpec, size: number): string {
    return `${font.style ?? 'normal'} ${font.weight ?? 400} ${size}px ${font.family}`;
}

/**
 * Glyphs of any CSS font, rasterised with Canvas2D and turned into signed distance fields, in one
 * 8-bit texture every {@link SilkText} shares.
 *
 * Glyphs are baked on first use at one size ({@link SdfAtlasOptions.size}) and drawn at any size from
 * there. The texture starts small and doubles in height when it fills up. Advances and kerning come
 * from `measureText`, so layout matches what Canvas would draw.
 *
 * Web fonts must be loaded before their glyphs are baked. Glyphs baked while a font was still
 * loading are rebaked when `document.fonts` reports it ready, and every text redraws.
 */
export class SdfAtlas {
    private static _shared: SdfAtlas | null = null;

    /** The atlas every {@link SilkText} uses unless given its own. */
    static get shared(): SdfAtlas {
        SdfAtlas._shared ??= new SdfAtlas();

        return SdfAtlas._shared;
    }

    /** Font size glyphs are baked at, in pixels. */
    readonly size: number;
    /** Distance in raster pixels the 0 to 255 range spans. */
    readonly radius: number;
    /** Fraction of the range spent inside glyphs. */
    readonly cutoff: number;
    /** Empty space around each glyph's ink, in texels. */
    readonly pad: number;
    /** Grows by one each time the atlas starts over. Texts compare it to know their glyphs moved. */
    version = 0;

    private _data: Uint8Array;
    private _source: BufferImageSource;
    private readonly _shaders = new Set<Shader>();
    private _height: number;
    private readonly _width: number;
    private readonly _maxHeight: number;
    private readonly _fonts = new Map<string, FontEntry>();
    private _shelves: Shelf[] = [];
    private _nextY = 0;
    private _dirty = false;
    private _ctx: GlyphContext | null;
    private _listening = false;

    constructor(options: SdfAtlasOptions = {}) {
        this.size = options.size ?? 48;
        this.radius = options.radius ?? 16;
        this.cutoff = options.cutoff ?? 0.25;
        this.pad = Math.ceil(this.radius * (1 - this.cutoff)) + 1;
        this._width = options.width ?? 1024;
        this._height = options.height ?? 256;
        this._maxHeight = Math.max(this._height, options.maxHeight ?? 4096);
        this._data = new Uint8Array(this._width * this._height);
        this._ctx = options.context ?? null;
        this._source = this._createSource();
    }

    /**
     * The R8 texture with every glyph. When the atlas grows it moves to a new, taller texture, and
     * the shaders it tracks follow. Read it again after {@link SdfAtlas.flush} rather than keeping it.
     */
    get source(): BufferImageSource {
        return this._source;
    }

    /**
     * @internal Points a shader's `uAtlas` at this atlas, now and whenever the texture is replaced.
     * {@link SilkText} calls it. Call {@link SdfAtlas.untrack} when the shader is destroyed.
     */
    track(shader: Shader): void {
        this._shaders.add(shader);
        shader.resources.uAtlas = this._source;
        shader.resources.uAtlasSampler = this._source.style;
    }

    /** @internal Stops updating a shader passed to {@link SdfAtlas.track}. */
    untrack(shader: Shader): void {
        this._shaders.delete(shader);
    }

    /** Texture size in texels. */
    get dimensions(): [width: number, height: number] {
        return [this._width, this._height];
    }

    /** Vertical metrics of a font at {@link SdfAtlas.size}. */
    metrics(font: FontSpec): FontMetrics {
        return this._font(font).metrics;
    }

    /** Advance width of one character at {@link SdfAtlas.size}, from `measureText`. */
    advance(font: FontSpec, char: string): number {
        const entry = this._font(font);
        let w = entry.advances.get(char);

        if (w === undefined) {
            const ctx = this._context(entry.css);

            w = ctx.measureText(char).width;
            entry.advances.set(char, w);
        }

        return w;
    }

    /** Kerning between two characters at {@link SdfAtlas.size}: how much closer (negative) Canvas puts them. */
    kerning(font: FontSpec, a: string, b: string): number {
        const entry = this._font(font);
        const key = a + b;
        let k = entry.kerning.get(key);

        if (k === undefined) {
            const ctx = this._context(entry.css);
            const pair = ctx.measureText(key).width;

            k = pair - this.advance(font, a) - this.advance(font, b);
            // measureText rounds on some platforms: ignore sub-pixel noise
            if (Math.abs(k) < 0.02) k = 0;
            entry.kerning.set(key, k);
        }

        return k;
    }

    /** The baked glyph of a character, baking it now if needed. Call {@link SdfAtlas.flush} to upload. */
    glyph(font: FontSpec, char: string): Glyph {
        const entry = this._font(font);
        let g = entry.glyphs.get(char);

        if (!g) {
            g = this._bake(entry, char);
            entry.glyphs.set(char, g);
        }

        return g;
    }

    /** Uploads the texture if glyphs were baked since the last call. */
    flush(): void {
        if (!this._dirty) return;
        this._dirty = false;
        if (this._source.resource !== this._data) {
            // Resizing the texture would free its GPU copy at once, but texts drawn earlier in this
            // frame may still use it: WebGPU then fails the submit. Move to a new texture and free
            // the old one after the current task, when every renderer has submitted its frame.
            const old = this._source;

            this._source = this._createSource();
            for (const shader of this._shaders) {
                shader.resources.uAtlas = this._source;
                shader.resources.uAtlasSampler = this._source.style;
            }
            setTimeout(() => old.destroy(), 0);

            return;
        }
        this._source.update();
    }

    /** Forgets every glyph and starts over. Texts rebake what they need on their next frame. */
    clear(): void {
        this._fonts.clear();
        this._shelves = [];
        this._nextY = 0;
        this._data.fill(0);
        this._dirty = true;
        this.version++;
    }

    /** Frees the texture. */
    destroy(): void {
        this._fonts.clear();
        this._shaders.clear();
        this._source.destroy();
        if (SdfAtlas._shared === this) SdfAtlas._shared = null;
    }

    // ------------------------------------------------------------------------------ internals

    private _createSource(): BufferImageSource {
        return new BufferImageSource({
            resource: this._data,
            width: this._width,
            height: this._height,
            format: 'r8unorm',
            // one channel of plain data: nothing to premultiply
            alphaMode: 'premultiplied-alpha',
            scaleMode: 'linear',
            addressMode: 'clamp-to-edge',
            autoGenerateMipmaps: false,
            label: 'silk-text-atlas',
        });
    }

    private _context(css: string): GlyphContext {
        if (!this._ctx) {
            const canvas = DOMAdapter.get().createCanvas(256, 256);
            const ctx = canvas.getContext('2d', { willReadFrequently: true }) as unknown as GlyphContext | null;

            if (!ctx) throw new Error('[pixi-silk] SilkText needs a 2D canvas to bake glyphs');
            this._ctx = ctx;
        }
        const ctx = this._ctx;

        if (ctx.font !== css) ctx.font = css;

        return ctx;
    }

    private _font(font: FontSpec): FontEntry {
        const css = fontString(font, this.size);
        let entry = this._fonts.get(css);

        if (!entry) {
            const ctx = this._context(css);
            const m = ctx.measureText(METRICS);

            entry = {
                css,
                metrics: { ascent: m.actualBoundingBoxAscent, descent: m.actualBoundingBoxDescent },
                glyphs: new Map(),
                advances: new Map(),
                kerning: new Map(),
                provisional: !fontReady(css),
            };
            if (entry.provisional) this._watchFonts();
            this._fonts.set(css, entry);
        }

        return entry;
    }

    private _bake(entry: FontEntry, char: string): Glyph {
        const ctx = this._context(entry.css);
        const m = ctx.measureText(char);
        const left = Math.ceil(m.actualBoundingBoxLeft);
        const right = Math.ceil(m.actualBoundingBoxRight);
        const ascent = Math.ceil(m.actualBoundingBoxAscent);
        const descent = Math.ceil(m.actualBoundingBoxDescent);
        const pad = this.pad;
        const inkW = left + right;
        const inkH = ascent + descent;

        if (inkW <= 0 || inkH <= 0 || char.trim() === '') return { ...NO_INK, left: 0, top: 0 };
        const w = inkW + 2 * pad;
        const h = inkH + 2 * pad;
        const canvas = ctx.canvas;

        if (canvas.width < w || canvas.height < h) {
            canvas.width = Math.max(canvas.width, w);
            canvas.height = Math.max(canvas.height, h);
            // resizing a canvas resets its state
            ctx.font = entry.css;
        }
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#000';
        ctx.clearRect(0, 0, w, h);
        ctx.fillText(char, pad + left, pad + ascent);
        const pixels = ctx.getImageData(0, 0, w, h).data;
        const field = sdfFromAlpha(pixels, w, h, this.radius, this.cutoff, 4);
        let at = this._place(w, h);

        if (!at) {
            // full: start over, keeping this font's measurements, and bake into the empty atlas
            console.warn('[pixi-silk] SilkText atlas is full; starting over with the glyphs in use');
            this.clear();
            entry.glyphs.clear();
            this._fonts.set(entry.css, entry);
            at = this._place(w, h);
            if (!at) return { ...NO_INK, left: 0, top: 0 };
        }
        const data = this._data;
        const W = this._width;

        for (let row = 0; row < h; row++) data.set(field.subarray(row * w, row * w + w), (at.y + row) * W + at.x);
        this._dirty = true;

        return { x: at.x, y: at.y, w, h, left: -(left + pad), top: -(ascent + pad) };
    }

    /** Shelf packing: rows of similar height, left to right. Grows the texture, or null when it cannot. */
    private _place(w: number, h: number): { x: number; y: number } | null {
        if (w > this._width) return null;
        for (const shelf of this._shelves) {
            if (h <= shelf.h && h >= shelf.h * 0.7 && shelf.x + w <= this._width) {
                const x = shelf.x;

                shelf.x += w + 1;

                return { x, y: shelf.y };
            }
        }
        while (this._nextY + h > this._height) {
            if (this._height >= this._maxHeight) return null;
            this._grow();
        }
        const shelf = { y: this._nextY, h, x: w + 1 };

        this._shelves.push(shelf);
        this._nextY += h + 1;

        return { x: 0, y: shelf.y };
    }

    private _grow(): void {
        const height = Math.min(this._maxHeight, this._height * 2);
        const data = new Uint8Array(this._width * height);

        data.set(this._data);
        this._data = data;
        this._height = height;
        this._dirty = true;
    }

    private _watchFonts(): void {
        const fonts = (globalThis as { document?: { fonts?: FontFaceSet } }).document?.fonts;

        if (this._listening || !fonts) return;
        this._listening = true;
        fonts.addEventListener('loadingdone', () => {
            let stale = false;

            for (const entry of this._fonts.values()) if (entry.provisional && fontReady(entry.css)) stale = true;
            if (stale) this.clear();
        });
    }
}

/** True when the font can be drawn now (always true outside a browser). */
function fontReady(css: string): boolean {
    const fonts = (globalThis as { document?: { fonts?: FontFaceSet } }).document?.fonts;

    try {
        return fonts ? fonts.check(css) : true;
    } catch {
        return true;
    }
}
