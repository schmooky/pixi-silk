/**
 * The contract of a runtime shaper plugin (brief sec. 6.5, `shaper` mode): glyph-level shaping for
 * apps with lots of user text, loaded lazily. `pixi-silk/i18n/shaper` implements it with kb_text_shape
 * in WebAssembly (see docs/v2/DECISIONS.md D10). The font hash check keeps
 * it from mixing with baked data of another font.
 */

/** One shaped glyph, in visual order, font units. */
export interface ShapedGlyphOut {
    /** Glyph id in the font. */
    glyph: number;
    /** UTF-16 offset of its cluster in the text. */
    cluster: number;
    /** Advance. */
    advance: number;
    /** Offset. */
    dx: number;
    /** Offset. */
    dy: number;
}

/** A runtime shaper for one font file. */
export interface RuntimeShaper {
    /** 64-bit FNV-1a hash of the font file, 16 hex digits, as {@link fontHash} computes it. */
    readonly fontHash: string;
    /** Units per em of the font. */
    readonly unitsPerEm: number;
    /** Shapes a run of one direction and script. */
    shape(
        text: string,
        options: { direction: 'ltr' | 'rtl'; script?: string; language?: string; features?: string[] },
    ): ShapedGlyphOut[];
}

/**
 * 64-bit FNV-1a of font bytes as 16 hex digits: the hash the compiler stores per face. Compare it
 * with `SilkBundle.faces.get(id).hash` before shaping with a font at runtime.
 */
export function fontHash(bytes: Uint8Array): string {
    // two 32-bit halves, so it runs without BigInt
    let lo = 0x84222325;
    let hi = 0xcbf29ce4;

    for (let i = 0; i < bytes.length; i++) {
        lo ^= bytes[i];
        // multiply the 64-bit value by the FNV prime 0x100000001b3
        const a = lo & 0xffff;
        const b = lo >>> 16;
        const lo0 = a * 0x1b3;
        const lo1 = b * 0x1b3 + (lo0 >>> 16);
        const hiMul = Math.imul(hi, 0x1b3) + Math.imul(lo, 0x100) + (lo1 >>> 16);

        lo = ((lo1 & 0xffff) << 16) | (lo0 & 0xffff);
        hi = hiMul >>> 0;
        lo >>>= 0;
    }

    return hi.toString(16).padStart(8, '0') + lo.toString(16).padStart(8, '0');
}

/**
 * True when a shaper's font is the one a bundle face was baked from. When it is not, the brief's
 * rule applies: warn, and keep the baked data for static text.
 */
export function sameFont(shaper: Pick<RuntimeShaper, 'fontHash'>, face: { hash: string }): boolean {
    return shaper.fontHash === face.hash;
}
