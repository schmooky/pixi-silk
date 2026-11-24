/**
 * Themes for baked text (brief sec. 3.3): a base style plus named styles that tags select. Designers
 * edit them. Strings never carry styling. Paint properties are packed into style rows that the
 * shader reads, so changing one at runtime uploads a few floats and moves no glyph. Shape-relevant
 * properties need a recompile (or a runtime shaper).
 */

/** A line around the glyphs. */
export interface ThemeOutline {
    /** Width in pixels at scale 1. */
    width: number;
    /** CSS hex colour. Default `#000`. */
    color?: string;
    /** Opacity, 0 to 1. Default 1. */
    alpha?: number;
}

/** A soft halo around the glyphs. */
export interface ThemeGlow {
    /** CSS hex colour. */
    color: string;
    /** Opacity at the glyph edge, 0 to 1. Default 0.5. */
    strength?: number;
    /** How far it reaches, in pixels at scale 1. Default 4. */
    width?: number;
}

/** A blurred copy under the glyphs, moved by an offset. */
export interface ThemeShadow {
    /** CSS hex colour. Default `#000`. */
    color?: string;
    /** Opacity, 0 to 1. Default 0.5. */
    alpha?: number;
    /** `[x, y]` in pixels at scale 1. Default `[0, 2]`. */
    offset?: [number, number];
    /** Blur, 0 (hard) to 1 (4 pixels at scale 1). Default 0.5. */
    softness?: number;
}

/** A line under or through the glyphs. */
export interface ThemeLine {
    /** Thickness in em. Default 0.06. */
    thickness?: number;
    /** Distance below the baseline (underline) or above it (strike), in em. Default 0.12 and 0.3. */
    offset?: number;
    /** CSS hex colour. Default the fill. */
    color?: string;
}

/** One style. Every field is optional: a tag's style overrides only what it sets. */
export interface ThemeStyle {
    /** Fill colour, CSS hex. Paint. */
    fill?: string;
    /** Opacity of the whole style, 0 to 1. Paint. */
    alpha?: number;
    /** Outline. Paint. */
    outline?: ThemeOutline | null;
    /** Glow. Paint. */
    glow?: ThemeGlow | null;
    /** Drop shadow. Paint. */
    shadow?: ThemeShadow | null;
    /** Underline. Paint. */
    underline?: ThemeLine | null;
    /** Strike-through. Paint. */
    strike?: ThemeLine | null;
    /** Small weight change as a shader threshold shift, in em, -0.05 to 0.05. Paint. */
    weightBias?: number;
    /** CSS weight, which picks another face. Shape-relevant. */
    weight?: number;
    /** Size as a factor of the message size. Shape-relevant. */
    size?: number;
    /** Font family. Shape-relevant. */
    family?: string;
    /** Extra space after each glyph, in em. Shape-relevant. */
    letterSpacing?: number;
    /** OpenType features, such as `smcp`. Shape-relevant. */
    features?: string[];
    /** Spans with this style report taps (`tagtap`). Behaviour. */
    interactive?: boolean;
}

/** A theme file, `$silk: 2`. */
export interface ThemeData {
    /** Format version, 2. */
    $silk: 2;
    /** Style of untagged text. */
    base?: ThemeStyle;
    /** Styles by tag name. */
    styles?: Record<string, ThemeStyle>;
}

/** Properties that change only paint: live-editable at runtime. */
export const PAINT_PROPERTIES = [
    'fill',
    'alpha',
    'outline',
    'glow',
    'shadow',
    'underline',
    'strike',
    'weightBias',
] as const;
/** Properties that change shaping or advances: they need a recompile or a runtime shaper. */
export const SHAPE_PROPERTIES = ['weight', 'size', 'family', 'letterSpacing', 'features'] as const;

/** `paint`, `shape` or `behaviour` for a style property. The compiler and the runtime both use this table. */
export function propertyClass(name: string): 'paint' | 'shape' | 'behaviour' | 'unknown' {
    if ((PAINT_PROPERTIES as readonly string[]).includes(name)) return 'paint';
    if ((SHAPE_PROPERTIES as readonly string[]).includes(name)) return 'shape';
    if (name === 'interactive') return 'behaviour';

    return 'unknown';
}

/** Shape-relevant fields of a style, the part that decides how text is shaped. */
export function shapeKey(style: ThemeStyle): string {
    return JSON.stringify([
        style.weight ?? null,
        style.size ?? null,
        style.family ?? null,
        style.letterSpacing ?? null,
        style.features ?? null,
    ]);
}

/** Merges styles left to right: later ones override the fields they set. `null` removes an effect. */
export function mergeStyles(...styles: (ThemeStyle | undefined)[]): ThemeStyle {
    const out: ThemeStyle = {};

    for (const s of styles) {
        if (!s) continue;
        for (const [k, v] of Object.entries(s)) {
            if (v !== undefined) (out as Record<string, unknown>)[k] = v;
        }
    }

    return out;
}

/**
 * Checks a parsed theme file. Returns problems as sentences. An empty list means the theme is valid.
 */
export function validateTheme(data: unknown): string[] {
    const errors: string[] = [];

    if (!data || typeof data !== 'object') return ['theme must be a JSON object'];
    const t = data as ThemeData;

    if (t.$silk !== 2) errors.push('theme needs "$silk": 2');
    const check = (name: string, s: unknown) => {
        if (!s || typeof s !== 'object') {
            errors.push(`style "${name}" must be an object`);
            return;
        }
        for (const [k, v] of Object.entries(s)) {
            if (propertyClass(k) === 'unknown') errors.push(`style "${name}": unknown property "${k}"`);
            if ((k === 'fill' || k === 'color') && typeof v === 'string' && parseHex(v) === null) {
                errors.push(`style "${name}": "${v}" is not a hex colour`);
            }
        }
    };

    if (t.base) check('base', t.base);
    for (const [name, s] of Object.entries(t.styles ?? {})) check(name, s);

    return errors;
}

/** `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa` as linear-free 0 to 1 RGBA, or null. */
export function parseHex(hex: string): [number, number, number, number] | null {
    const m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex);

    if (!m) return null;
    let h = m[1];

    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = (i: number) => Number.parseInt(h.slice(i, i + 2), 16) / 255;

    return [n(0), n(2), n(4), h.length === 8 ? n(6) : 1];
}

/** Shadow blur at `softness: 1`, in pixels at scale 1. */
export const SHADOW_MAX_BLUR = 4;

/** RGBA32F texels per style row. */
export const STYLE_TEXELS = 8;
/** Floats per style row. */
export const STYLE_FLOATS: number = STYLE_TEXELS * 4;

/** Style row flags (texel 7, z). */
export const StyleFlag = {
    Underline: 1,
    Strike: 2,
    Interactive: 4,
} as const;

/**
 * Packs a resolved style into one style row of {@link STYLE_FLOATS} floats at `offset`:
 *
 * | texel | x | y | z | w |
 * |---|---|---|---|---|
 * | 0 | fill r | g | b | a |
 * | 1 | outline r | g | b | a |
 * | 2 | glow r | g | b | a |
 * | 3 | shadow r | g | b | a |
 * | 4 | outline width (px) | glow width (px) | shadow softness (0 to 1) | weight bias (em) |
 * | 5 | shadow offset x (px) | y (px) | underline thickness (em) | underline offset (em) |
 * | 6 | line r | g | b | a |
 * | 7 | strike thickness (em) | strike offset (em) | flags | 0 |
 *
 * Colours are straight (not premultiplied), with the style's alpha multiplied in.
 */
export function packStyle(style: ThemeStyle, out: Float32Array, offset = 0): void {
    const fill = parseHex(style.fill ?? '#ffffff') ?? [1, 1, 1, 1];
    const alpha = style.alpha ?? 1;
    const put = (texel: number, v: readonly number[]) => {
        for (let i = 0; i < 4; i++) out[offset + texel * 4 + i] = v[i] ?? 0;
    };
    const color = (hex: string | undefined, a: number, fallback = fill): number[] => {
        const c = (hex ? parseHex(hex) : null) ?? fallback;

        return [c[0], c[1], c[2], c[3] * a * alpha];
    };

    put(0, [fill[0], fill[1], fill[2], fill[3] * alpha]);
    put(1, style.outline ? color(style.outline.color ?? '#000', style.outline.alpha ?? 1) : [0, 0, 0, 0]);
    put(2, style.glow ? color(style.glow.color, style.glow.strength ?? 0.5) : [0, 0, 0, 0]);
    put(3, style.shadow ? color(style.shadow.color ?? '#000', style.shadow.alpha ?? 0.5) : [0, 0, 0, 0]);
    put(4, [
        style.outline?.width ?? 0,
        style.glow ? (style.glow.width ?? 4) : 0,
        style.shadow?.softness ?? 0.5,
        style.weightBias ?? 0,
    ]);
    put(5, [
        style.shadow?.offset?.[0] ?? 0,
        style.shadow ? (style.shadow.offset?.[1] ?? 2) : 0,
        style.underline ? (style.underline.thickness ?? 0.06) : 0,
        style.underline?.offset ?? 0.12,
    ]);
    const line = style.underline ?? style.strike;

    put(6, line ? color(line.color, 1) : [0, 0, 0, 0]);
    const flags =
        (style.underline ? StyleFlag.Underline : 0) |
        (style.strike ? StyleFlag.Strike : 0) |
        (style.interactive ? StyleFlag.Interactive : 0);

    put(7, [style.strike ? (style.strike.thickness ?? 0.06) : 0, style.strike?.offset ?? 0.3, flags, 0]);
}

/**
 * How far the paint effects of a style reach past the glyph edge, in pixels at scale 1: the
 * largest of the outline width, the glow width and the shadow blur. The compiler sizes the atlas
 * distance range from it.
 */
export function effectReach(
    style: ThemeStyle,
    maxBlur: number = SHADOW_MAX_BLUR,
): { outline: number; glow: number; shadow: number } {
    return {
        outline: style.outline?.width ?? 0,
        glow: style.glow ? (style.glow.width ?? 4) : 0,
        shadow: style.shadow ? (style.shadow.softness ?? 0.5) * maxBlur : 0,
    };
}
