import {
    Bounds,
    Buffer,
    BufferUsage,
    type ColorSource,
    type DestroyOptions,
    Geometry,
    Mesh,
    ObservablePoint,
    type PointData,
    type Shader,
    type UniformGroup,
} from 'pixi.js';
import { GradientAtlas } from '../atlas';
import { parseColor } from '../color';
import { Gradient } from '../gradient';
import { type FontSpec, SdfAtlas } from './atlas';
import {
    type CaretHit,
    type CaretRect,
    caretAtPoint,
    caretRect,
    type LayoutLine,
    layoutText,
    rangeRects,
    type TextAlign,
    type TextLayout,
    type TextRect,
} from './layout';
import { createTextShader } from './shader';

/** Floats per glyph instance: rect, atlas cell, meta. */
const STRIDE = 12;

/** A line drawn around the glyphs, outside their edge. */
export interface TextOutline {
    /** Width in local units (pixels at scale 1). */
    width: number;
    /** Default black. */
    color?: ColorSource;
    /** Default 1. */
    alpha?: number;
}

/** A soft copy of the glyphs under them: a drop shadow with an offset, a glow without one. */
export interface TextShadow {
    /** Default black. */
    color?: ColorSource;
    /** Default 1. */
    alpha?: number;
    /** Softness in local units. Reaches up to about a quarter of the font size with the default atlas. Default 4. */
    blur?: number;
    /** Horizontal offset in local units. Default 0. */
    offsetX?: number;
    /** Vertical offset in local units. Default 0. */
    offsetY?: number;
}

/** The look of a {@link SilkText}. Every field can change later through its setter or {@link SilkText.set}. */
export interface SilkTextStyle {
    /** CSS font family list. Default `system-ui, -apple-system, Segoe UI, Roboto, sans-serif`. */
    fontFamily?: string;
    /** Font size in local units. Default 16. */
    fontSize?: number;
    /** CSS font weight. Default `400`. */
    fontWeight?: string | number;
    /** `normal`, `italic` or `oblique`. Default `normal`. */
    fontStyle?: 'normal' | 'italic' | 'oblique';
    /** A colour, or a pixi-silk gradient over the text box (linear, radial and conic). Default white. */
    fill?: ColorSource | Gradient;
    /** Extra space after each character, in local units. Default 0. */
    letterSpacing?: number;
    /** Distance between baselines. 0 uses the font's ascent plus descent, like PixiJS `Text`. Default 0. */
    lineHeight?: number;
    /** Alignment of the lines. Default `left`. */
    align?: TextAlign;
    /** Breaks lines at spaces to fit `wordWrapWidth`. Default false. */
    wordWrap?: boolean;
    /** Width that `wordWrap` breaks lines at, in local units. Default 100. */
    wordWrapWidth?: number;
    /** Breaks words that are wider than a line on their own. Default false. */
    breakWords?: boolean;
    /** Gives the digits one width, like `font-variant-numeric: tabular-nums`, for readouts. Default false. */
    tabularNumbers?: boolean;
    /** Applies the font's kerning (measured from Canvas). Default true. */
    kerning?: boolean;
    /** A line around the glyphs. `null` for none. */
    outline?: TextOutline | null;
    /** A drop shadow or glow under the glyphs. `null` for none. */
    shadow?: TextShadow | null;
    /** Grows (positive) or thins (negative) the glyphs, in local units. Default 0. */
    dilate?: number;
    /** Width of the anti-aliasing ramp in device pixels. Larger is softer. Default 1. */
    aaWidth?: number;
}

/** Options of a {@link SilkText}: the style plus the text, anchor and atlas. */
export interface SilkTextOptions extends SilkTextStyle {
    /** The text. `\n` starts a new line. Default empty. */
    text?: string | number;
    /** Point of the text box at the position: 0 is the top left, 1 the bottom right. Default 0. */
    anchor?: number | PointData;
    /** Atlas to bake glyphs into. Default {@link SdfAtlas.shared}. */
    atlas?: SdfAtlas;
    /** Label of the display object. Default `SilkText`. */
    label?: string;
}

/** A {@link SilkTextStyle} with every field set, as {@link SilkText.defaults} holds it. */
export type ResolvedTextStyle = Required<Omit<SilkTextStyle, 'outline' | 'shadow'>> & {
    /** A line around the glyphs, or `null`. */
    outline: TextOutline | null;
    /** A drop shadow or glow, or `null`. */
    shadow: TextShadow | null;
};

/**
 * Geometry behind every {@link SilkText}: one unit quad plus one instance per glyph. You rarely need it directly.
 */
export class SilkTextGeometry extends Geometry {
    /** Per-glyph data, grown on demand. */
    readonly instanceBuffer: Buffer;
    /** The text box in local units. */
    readonly localBounds: Bounds = new Bounds();

    constructor() {
        const instanceBuffer = new Buffer({
            data: new Float32Array(STRIDE * 16),
            usage: BufferUsage.VERTEX | BufferUsage.COPY_DST,
            label: 'silk-text-instances',
            shrinkToFit: false,
        });
        const inst = (offset: number) => ({
            buffer: instanceBuffer,
            format: 'float32x4' as const,
            stride: STRIDE * 4,
            offset,
            instance: true,
        });

        super({
            attributes: {
                aCorner: {
                    buffer: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
                    format: 'float32x2',
                    stride: 8,
                    offset: 0,
                },
                aRect: inst(0),
                aUv: inst(16),
                aMeta: inst(32),
            },
            indexBuffer: new Uint16Array([0, 1, 2, 0, 2, 3]),
            instanceCount: 0,
        });
        this.instanceBuffer = instanceBuffer;
    }

    override get bounds(): Bounds {
        return this.localBounds;
    }
}

const EXTEND = { pad: 0, repeat: 1, reflect: 2 } as const;
const premultiply = (out: Float32Array, color: ColorSource, alpha: number): void => {
    const [r, g, b, a] = parseColor(color, alpha);

    out[0] = r * a;
    out[1] = g * a;
    out[2] = b * a;
    out[3] = a;
};

/**
 * Text that stays sharp at any zoom. Glyphs come from any CSS font, baked once into a shared
 * signed distance field atlas ({@link SdfAtlas}), and drawn with the same per-pixel anti-aliasing
 * as SilkGraphics. A text is one instanced draw call however long it is.
 *
 * Outlines, shadows, glows and weight changes read the same distance field, so they cost nothing
 * extra. Layout uses Canvas `measureText`, so line breaks and widths match PixiJS `Text`.
 *
 * Works with Pixi's WebGL2 and WebGPU renderers.
 *
 * @example
 * ```ts
 * const label = new SilkText({ text: 'Zoom me', fontSize: 14, fontWeight: 600, fill: 0xffffff });
 * label.anchor.set(0.5);
 * app.stage.addChild(label);
 * ```
 */
export class SilkText extends Mesh<SilkTextGeometry, Shader> {
    /** Style of new texts where options leave a field out. Change it before you create any SilkText. */
    static defaults: ResolvedTextStyle = {
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        fontSize: 16,
        fontWeight: 400,
        fontStyle: 'normal',
        fill: 0xffffff,
        letterSpacing: 0,
        lineHeight: 0,
        align: 'left',
        wordWrap: false,
        wordWrapWidth: 100,
        breakWords: false,
        tabularNumbers: false,
        kerning: true,
        outline: null,
        shadow: null,
        dilate: 0,
        aaWidth: 1,
    };

    /** Point of the text box at the position: (0, 0) top left, (0.5, 0.5) centre, (1, 1) bottom right. */
    readonly anchor: ObservablePoint;
    /** The atlas this text's glyphs live in. */
    readonly atlas: SdfAtlas;

    private _text = '';
    private readonly _style: ResolvedTextStyle;
    private _layout: TextLayout | null = null;
    private _dirty = true;
    private _version = -1;
    private _f: Float32Array;
    private _count = 0;
    private readonly _uniforms: UniformGroup;
    private _gradKey: string | null = null;
    private readonly _scratch = new Float32Array(4);
    private _ox = 0;
    private _oy = 0;

    constructor(options: SilkTextOptions | string = {}) {
        const opts = typeof options === 'string' ? { text: options } : options;
        const atlas = opts.atlas ?? SdfAtlas.shared;
        const geometry = new SilkTextGeometry();
        const shader = createTextShader(atlas.source);

        super({ geometry, shader, label: opts.label ?? 'SilkText' });
        this.atlas = atlas;
        this._f = geometry.instanceBuffer.data as Float32Array;
        this._uniforms = shader.resources.textUniforms as UniformGroup;
        const { text, anchor } = opts;
        const style: Record<string, unknown> = { ...SilkText.defaults };

        for (const key of Object.keys(style)) {
            const value = (opts as Record<string, unknown>)[key];

            if (value !== undefined) style[key] = value;
        }
        this._style = style as ResolvedTextStyle;
        this._text = text === undefined ? '' : String(text);
        this.anchor = new ObservablePoint({ _onUpdate: () => this._invalidate() });
        if (anchor !== undefined) {
            if (typeof anchor === 'number') this.anchor.set(anchor);
            else this.anchor.set(anchor.x, anchor.y);
        }
    }

    /** The text. `\n` starts a new line. */
    get text(): string {
        return this._text;
    }

    /** Sets {@link SilkText.text}. */
    set text(value: string | number) {
        const s = String(value);

        if (s === this._text) return;
        this._text = s;
        this._invalidate();
    }

    /** The current style. Change it through the setters or {@link SilkText.set}. */
    get style(): Readonly<SilkTextStyle> {
        return this._style;
    }

    /** Changes several style fields (and the text) at once. */
    set(options: SilkTextStyle & { text?: string | number }): this {
        const { text, ...style } = options;

        if (text !== undefined) this.text = text;
        for (const [key, value] of Object.entries(style)) {
            if (value !== undefined) this._set(key as keyof ResolvedTextStyle, value as never);
        }

        return this;
    }

    /** CSS font family list. */
    get fontFamily(): string {
        return this._style.fontFamily;
    }

    /** Sets {@link SilkText.fontFamily}. */
    set fontFamily(v: string) {
        this._set('fontFamily', v);
    }

    /** Font size in local units. */
    get fontSize(): number {
        return this._style.fontSize;
    }

    /** Sets {@link SilkText.fontSize}. */
    set fontSize(v: number) {
        this._set('fontSize', v);
    }

    /** CSS font weight. */
    get fontWeight(): string | number {
        return this._style.fontWeight;
    }

    /** Sets {@link SilkText.fontWeight}. */
    set fontWeight(v: string | number) {
        this._set('fontWeight', v);
    }

    /** `normal`, `italic` or `oblique`. */
    get fontStyle(): 'normal' | 'italic' | 'oblique' {
        return this._style.fontStyle;
    }

    /** Sets {@link SilkText.fontStyle}. */
    set fontStyle(v: 'normal' | 'italic' | 'oblique') {
        this._set('fontStyle', v);
    }

    /** A colour or a gradient over the text box. */
    get fill(): ColorSource | Gradient {
        return this._style.fill;
    }

    /** Sets {@link SilkText.fill}. */
    set fill(v: ColorSource | Gradient) {
        this._set('fill', v);
    }

    /** Extra space after each character. */
    get letterSpacing(): number {
        return this._style.letterSpacing;
    }

    /** Sets {@link SilkText.letterSpacing}. */
    set letterSpacing(v: number) {
        this._set('letterSpacing', v);
    }

    /** Distance between baselines, 0 for the font's own. */
    get lineHeight(): number {
        return this._style.lineHeight;
    }

    /** Sets {@link SilkText.lineHeight}. */
    set lineHeight(v: number) {
        this._set('lineHeight', v);
    }

    /** Alignment of the lines. */
    get align(): TextAlign {
        return this._style.align;
    }

    /** Sets {@link SilkText.align}. */
    set align(v: TextAlign) {
        this._set('align', v);
    }

    /** Breaks lines at spaces to fit {@link SilkText.wordWrapWidth}. */
    get wordWrap(): boolean {
        return this._style.wordWrap;
    }

    /** Sets {@link SilkText.wordWrap}. */
    set wordWrap(v: boolean) {
        this._set('wordWrap', v);
    }

    /** Width that word wrap breaks lines at. */
    get wordWrapWidth(): number {
        return this._style.wordWrapWidth;
    }

    /** Sets {@link SilkText.wordWrapWidth}. */
    set wordWrapWidth(v: number) {
        this._set('wordWrapWidth', v);
    }

    /** Breaks words wider than a line. */
    get breakWords(): boolean {
        return this._style.breakWords;
    }

    /** Sets {@link SilkText.breakWords}. */
    set breakWords(v: boolean) {
        this._set('breakWords', v);
    }

    /** Digits share one width. */
    get tabularNumbers(): boolean {
        return this._style.tabularNumbers;
    }

    /** Sets {@link SilkText.tabularNumbers}. */
    set tabularNumbers(v: boolean) {
        this._set('tabularNumbers', v);
    }

    /** Applies the font's kerning. */
    get kerning(): boolean {
        return this._style.kerning;
    }

    /** Sets {@link SilkText.kerning}. */
    set kerning(v: boolean) {
        this._set('kerning', v);
    }

    /** A line around the glyphs, or `null`. */
    get outline(): TextOutline | null {
        return this._style.outline;
    }

    /** Sets {@link SilkText.outline}. */
    set outline(v: TextOutline | null) {
        this._set('outline', v);
    }

    /** A drop shadow or glow, or `null`. */
    get shadow(): TextShadow | null {
        return this._style.shadow;
    }

    /** Sets {@link SilkText.shadow}. */
    set shadow(v: TextShadow | null) {
        this._set('shadow', v);
    }

    /** Grows (positive) or thins (negative) the glyphs, in local units. */
    get dilate(): number {
        return this._style.dilate;
    }

    /** Sets {@link SilkText.dilate}. */
    set dilate(v: number) {
        this._set('dilate', v);
    }

    /** Width of the anti-aliasing ramp in device pixels. */
    get aaWidth(): number {
        return this._style.aaWidth;
    }

    /** Sets {@link SilkText.aaWidth}. */
    set aaWidth(v: number) {
        this._set('aaWidth', v);
    }

    /**
     * The whole layout: glyphs, lines and the caret stops of each line. Its units are local, but its
     * origin is the top left of the text box. Add {@link SilkText.layoutOffset} to place it.
     */
    get layout(): TextLayout {
        this.updateText();

        return this._layout as TextLayout;
    }

    /** Where the anchor puts the top left of the text box, in local units. */
    get layoutOffset(): PointData {
        this.updateText();

        return { x: this._ox, y: this._oy };
    }

    /**
     * The caret position nearest to a local point, for clicks. `isStop` limits the offsets a caret may
     * take, for example to grapheme cluster boundaries.
     */
    caretAt(point: PointData, isStop?: (index: number) => boolean): CaretHit {
        const layout = this.layout;

        return caretAtPoint(layout, point.x - this._ox, point.y - this._oy, isStop);
    }

    /** Where a caret at `index` sits, in local units. `upstream` picks the end of a wrapped line. */
    caretRect(index: number, upstream = false): CaretRect {
        const r = caretRect(this.layout, index, upstream);

        return { x: r.x + this._ox, top: r.top + this._oy, bottom: r.bottom + this._oy, line: r.line };
    }

    /** Highlight boxes of the text from `from` to `to`, one per line, in local units. */
    rangeRects(from: number, to: number): TextRect[] {
        const rects = rangeRects(this.layout, from, to);

        for (const r of rects) {
            r.x += this._ox;
            r.y += this._oy;
        }

        return rects;
    }

    /** The laid-out lines: text, width and baseline of each. */
    get lines(): readonly LayoutLine[] {
        this.updateText();

        return (this._layout as TextLayout).lines;
    }

    /** Glyphs drawn: characters with ink, shadows not counted. */
    get glyphCount(): number {
        this.updateText();

        return this._style.shadow ? this._count / 2 : this._count;
    }

    override get bounds(): Bounds {
        this.updateText();

        return super.bounds;
    }

    /** @internal Pixi reads this right before drawing: the moment to lay out a changed text. */
    override get isRenderable(): boolean {
        this.updateText();

        return super.isRenderable;
    }

    /** Hit test against the text box (local coordinates). */
    override containsPoint(point: PointData): boolean {
        this.updateText();

        return this.geometry.localBounds.containsPoint(point.x, point.y);
    }

    /**
     * Lays the text out and bakes missing glyphs now. Happens on its own before the next frame and
     * whenever you read the size, so you rarely need to call it.
     */
    updateText(): void {
        const atlas = this.atlas;

        if (!this._dirty && this._version === atlas.version) return;
        // a full atlas starts over mid-layout: the glyphs placed before that moved, so lay out again
        for (let attempt = 0; attempt < 2; attempt++) {
            const version = atlas.version;

            this._build();
            if (atlas.version === version) break;
        }
        this._dirty = false;
        this._version = atlas.version;
        atlas.flush();
    }

    override destroy(options?: DestroyOptions): void {
        if (this._gradKey) GradientAtlas.shared.release(this._gradKey);
        this._gradKey = null;
        const geometry = this.geometry;
        const shader = this.shader;

        super.destroy(options);
        geometry.destroy(true);
        shader?.destroy();
    }

    // ------------------------------------------------------------------------------ internals

    private _set<K extends keyof ResolvedTextStyle>(key: K, value: ResolvedTextStyle[K]): void {
        if (this._style[key] === value) return;
        this._style[key] = value;
        this._invalidate();
    }

    private _invalidate(): void {
        if (this._dirty) return;
        this._dirty = true;
        this.onViewUpdate();
    }

    private _build(): void {
        const s = this._style;
        const atlas = this.atlas;
        const font: FontSpec = { family: s.fontFamily, weight: s.fontWeight, style: s.fontStyle };
        const k = s.fontSize / atlas.size;
        const fm = atlas.metrics(font);
        const layout = layoutText(
            this._text,
            {
                ascent: fm.ascent * k,
                descent: fm.descent * k,
                letterSpacing: s.letterSpacing,
                lineHeight: s.lineHeight > 0 ? s.lineHeight : undefined,
                align: s.align,
                wordWrap: s.wordWrap,
                wordWrapWidth: s.wordWrapWidth,
                breakWords: s.breakWords,
                tabularNumbers: s.tabularNumbers,
                kerning: s.kerning,
            },
            {
                advance: (c) => atlas.advance(font, c) * k,
                kerning: (a, b) => atlas.kerning(font, a, b) * k,
            },
        );
        const ox = -this.anchor.x * layout.width;
        const oy = -this.anchor.y * layout.height;
        const shadow = s.shadow && (s.shadow.alpha ?? 1) > 0 ? s.shadow : null;
        const glyphs = layout.glyphs;
        const layers = shadow ? 2 : 1;

        this._layout = layout;
        this._ox = ox;
        this._oy = oy;
        this._ensure(glyphs.length * layers);
        const f = this._f;
        let n = 0;

        for (let layer = layers - 1; layer >= 0; layer--) {
            const dx = layer ? (shadow?.offsetX ?? 0) : 0;
            const dy = layer ? (shadow?.offsetY ?? 0) : 0;

            for (const pg of glyphs) {
                const g = atlas.glyph(font, pg.char);

                if (g.w === 0) continue;
                const o = n * STRIDE;
                const x0 = ox + pg.x + g.left * k + dx;
                const y0 = oy + pg.y + g.top * k + dy;

                f[o] = x0;
                f[o + 1] = y0;
                f[o + 2] = x0 + g.w * k;
                f[o + 3] = y0 + g.h * k;
                f[o + 4] = g.x;
                f[o + 5] = g.y;
                f[o + 6] = g.x + g.w;
                f[o + 7] = g.y + g.h;
                f[o + 8] = layer;
                f[o + 9] = 0;
                f[o + 10] = 0;
                f[o + 11] = 0;
                n++;
            }
        }
        this._count = n;
        const geometry = this.geometry;

        geometry.localBounds.clear();
        geometry.localBounds.addFrame(ox, oy, ox + layout.width, oy + layout.height);
        geometry.instanceCount = n;
        geometry.instanceBuffer.update(Math.max(n, 1) * STRIDE * 4);
        this._paint(s, k, ox, oy, layout);
    }

    private _paint(s: ResolvedTextStyle, k: number, ox: number, oy: number, layout: TextLayout): void {
        const u = this._uniforms.uniforms as Record<string, Float32Array>;
        const atlas = this.atlas;
        const fill = s.fill;
        const paint = u.uPaint;

        paint.fill(0);
        if (fill instanceof Gradient) {
            u.uFill.set([1, 1, 1, 1]);
            const row = GradientAtlas.shared.acquire(fill);

            if (this._gradKey) GradientAtlas.shared.release(this._gradKey);
            this._gradKey = fill.key;
            const g = this._scratch;
            const frame = { x: ox, y: oy, w: layout.width, h: layout.height };

            // linear, radial and conic; other kinds run left to right across the box
            if (fill.kind >= 1 && fill.kind <= 3) {
                fill.resolve(frame, g, 0);
                paint[0] = fill.kind;
            } else {
                g.set([ox, oy, ox + layout.width, oy]);
                paint[0] = 1;
            }
            u.uGrad.set(g);
            paint[1] = row;
            paint[2] = EXTEND[fill.extend];
        } else {
            if (this._gradKey) GradientAtlas.shared.release(this._gradKey);
            this._gradKey = null;
            premultiply(u.uFill, fill, 1);
        }
        const outline = s.outline;
        const shadow = s.shadow;

        premultiply(u.uOutline, outline?.color ?? 0x000000, outline ? (outline.alpha ?? 1) : 0);
        premultiply(u.uShadow, shadow?.color ?? 0x000000, shadow ? (shadow.alpha ?? 1) : 0);
        u.uParams.set([atlas.radius, atlas.cutoff, k, s.fontSize]);
        u.uFx.set([s.dilate, outline ? Math.max(0, outline.width) : 0, shadow ? (shadow.blur ?? 4) : 0, s.aaWidth]);
        this._uniforms.update();
    }

    private _ensure(instances: number): void {
        const need = instances * STRIDE;

        if (need <= this._f.length) return;
        const bigger = new Float32Array(Math.max(this._f.length * 2, need));

        this._f = bigger;
        this.geometry.instanceBuffer.data = bigger;
    }
}
