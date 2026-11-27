import type { SilkGraphics } from '../SilkGraphics';
import { setGlyphSource } from '../shader-slot';
import { type FontSpec, SdfAtlas } from './atlas';
import type { TextDirection } from './bidi';
import { layoutText, type TextAlign, type TextLayout } from './layout';

/** Style of {@link drawText} and {@link measureText}. Every field is optional. */
export interface DrawTextStyle {
    /** CSS font family list. Default the system UI font. */
    fontFamily?: string;
    /** Font size in local units. Default 16. */
    fontSize?: number;
    /** CSS font weight. Default 400. */
    fontWeight?: string | number;
    /** Default `'normal'`. */
    fontStyle?: 'normal' | 'italic' | 'oblique';
    /** Extra space between letters, local units. Default 0. */
    letterSpacing?: number;
    /** Distance between baselines, local units. 0 (default) uses the font's. */
    lineHeight?: number;
    /** Alignment of the lines inside the text box. Default `'start'`. */
    align?: TextAlign;
    /** Default `'auto'`, from the first strong character. */
    direction?: TextDirection;
    /** Every digit takes the width of the widest one, so a changing number does not jitter. Default false. */
    tabularNumbers?: boolean;
    /** Default true. */
    kerning?: boolean;
    /** Wraps lines at `wordWrapWidth`. Default false. */
    wordWrap?: boolean;
    /** Width that lines wrap at, local units. Default 100. */
    wordWrapWidth?: number;
    /** Lines wider than this are cut and end in `ellipsis`. 0 (default) never cuts. */
    maxWidth?: number;
    /** At most this many lines, the last ending in `ellipsis`. 0 (default) for no limit. */
    maxLines?: number;
    /** What a cut line ends with. Default an ellipsis character. */
    ellipsis?: string | null;
    /**
     * Point of the text box placed at (x, y): 0 left or top, 0.5 centre, 1 right or bottom.
     * A number sets both axes. Default 0.
     */
    anchor?: number | readonly [number, number];
}

/** Size of a laid out text, from {@link measureText}. Local units. */
export interface TextMetrics {
    /** Width of the widest line. */
    width: number;
    /** Height of every line together. */
    height: number;
    /** Lines after wrapping and cutting. */
    lines: number;
}

const FAMILY = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

// Layouts of recent strings: a counter repainted every frame lays out each value once.
const cache = new Map<string, TextLayout>();
let cacheVersion = -1;
const CACHE_SIZE = 512;

function fontOf(style: DrawTextStyle): FontSpec {
    return { family: style.fontFamily ?? FAMILY, weight: style.fontWeight ?? 400, style: style.fontStyle ?? 'normal' };
}

function layout(text: string, style: DrawTextStyle, atlas: SdfAtlas): TextLayout {
    if (cacheVersion !== atlas.version) {
        cache.clear();
        cacheVersion = atlas.version;
    }
    const size = style.fontSize ?? 16;
    const key = `${size}|${style.fontFamily ?? ''}|${style.fontWeight ?? ''}|${style.fontStyle ?? ''}|${style.letterSpacing ?? 0}|${style.lineHeight ?? 0}|${style.align ?? ''}|${style.direction ?? ''}|${style.tabularNumbers ? 1 : 0}|${style.kerning === false ? 0 : 1}|${style.wordWrap ? (style.wordWrapWidth ?? 100) : 0}|${style.maxWidth ?? 0}|${style.maxLines ?? 0}|${style.ellipsis ?? ''}|${text}`;
    const hit = cache.get(key);

    if (hit) {
        // most recent last, so the oldest go first
        cache.delete(key);
        cache.set(key, hit);

        return hit;
    }
    const font = fontOf(style);
    const fm = atlas.metrics(font);
    const k = size / atlas.size;
    const out = layoutText(
        text,
        {
            ascent: fm.ascent * k,
            descent: fm.descent * k,
            letterSpacing: style.letterSpacing ?? 0,
            lineHeight: style.lineHeight ? style.lineHeight : undefined,
            align: style.align ?? 'start',
            direction: style.direction ?? 'auto',
            wordWrap: style.wordWrap ?? false,
            wordWrapWidth: style.wordWrapWidth ?? 100,
            tabularNumbers: style.tabularNumbers ?? false,
            kerning: style.kerning ?? true,
            maxLines: style.maxLines ?? 0,
            maxWidth: style.maxWidth ? style.maxWidth : undefined,
            ellipsis: style.ellipsis === undefined ? '\u2026' : style.ellipsis,
        },
        {
            advance: (c) => atlas.advance(font, c) * k,
            kerning: (a, b) => atlas.kerning(font, a, b) * k,
            ink: (c) => {
                const i = atlas.ink(font, c);

                return { ascent: i.ascent * k, descent: i.descent * k };
            },
        },
    );

    if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value as string);
    cache.set(key, out);

    return out;
}

/**
 * Measures `text` as {@link drawText} would lay it out, without drawing. Use it to size a box
 * around a label.
 *
 * @example
 * ```ts
 * import { measureText } from 'pixi-silk/text';
 *
 * const { width, height } = measureText('BALANCE', { fontSize: 14, fontWeight: 700 });
 * ```
 */
export function measureText(text: string, style: DrawTextStyle = {}): TextMetrics {
    const l = layout(text, style, SdfAtlas.shared);

    return { width: l.width, height: l.height, lines: l.lines.length };
}

/**
 * Starts a new path on `g`, lays out `text` and adds one glyph shape per character. It returns
 * `g`, so you paint the glyphs with `fill` and `stroke` like any shape. The whole string draws in
 * the same call as the rest of the object, and the object can batch with others. A stroke is an
 * outline. A fill with `blur` and an offset (`translateTransform`) is a shadow. A gradient runs
 * across each glyph.
 *
 * Glyphs come from `SdfAtlas.shared`. Their distance field reaches about a quarter of the font
 * size past the ink, so wider strokes and blurs are cut there. Colour glyphs (emoji) draw in one
 * colour: use `SilkText` for those. When the atlas fills up it starts over and its `version`
 * changes: graphics drawn before then show the wrong letters until you draw them again.
 *
 * @example
 * ```ts
 * import { SilkGraphics } from 'pixi-silk';
 * import { drawText } from 'pixi-silk/text';
 *
 * const g = new SilkGraphics();
 *
 * g.roundRect(0, 0, 220, 64, 16).fill(0x1c1c1e);
 * drawText(g, '$1,250.00', 110, 32, { fontSize: 28, fontWeight: 700, anchor: 0.5, tabularNumbers: true }).fill(0xffffff);
 * app.stage.addChild(g);
 * ```
 */
export function drawText(g: SilkGraphics, text: string, x: number, y: number, style: DrawTextStyle = {}): SilkGraphics {
    const atlas = SdfAtlas.shared;
    let l = layout(text, style, atlas);

    // rasterize every glyph first: a full atlas starts over, and then the layout runs again
    const font = fontOf(style);

    for (let attempt = 0; attempt < 2; attempt++) {
        const version = atlas.version;

        for (const pg of l.glyphs) if (!pg.inline) atlas.glyph(font, pg.char);
        if (atlas.version === version) break;
        l = layout(text, style, atlas);
    }
    atlas.flush();
    setGlyphSource(atlas.source);

    const k = (style.fontSize ?? 16) / atlas.size;
    const anchor = style.anchor ?? 0;
    const ax = typeof anchor === 'number' ? anchor : anchor[0];
    const ay = typeof anchor === 'number' ? anchor : anchor[1];
    const ox = x - ax * l.width;
    const oy = y - ay * l.height;

    // the text is a path of its own, as in Canvas: an empty string then paints nothing
    g.beginPath();

    for (const pg of l.glyphs) {
        if (pg.inline) continue;
        const gl = atlas.glyph(font, pg.char);

        if (gl.w === 0) continue;
        g.glyph(
            ox + pg.x + gl.left * k,
            oy + pg.y + gl.top * k,
            gl.w * k,
            gl.h * k,
            [gl.x, gl.y, gl.x + gl.w, gl.y + gl.h],
            atlas.radius,
            atlas.cutoff,
        );
    }

    return g;
}
