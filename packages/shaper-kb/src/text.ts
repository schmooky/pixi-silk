import type { BundleFace, RunSprite, SilkBundle } from 'pixi-silk/i18n';
import type { DynamicTextProvider, TextSlotRender } from 'pixi-silk/i18n/pixi';
import { sdfFromAlpha } from 'pixi-silk/text';
import type { Contour } from './font';
import { fillContours } from './raster';
import { createKbShaper, type KbShaper, type KbWasmSource } from './shaper';

/** Options of {@link createShapedText}. */
export interface ShapedTextOptions {
    /**
     * The TrueType font to shape and draw with: bytes or a URL. Use the file the bundle was baked
     * from, so slots match the baked text. CFF (`.otf`) fonts are not supported.
     */
    font: Uint8Array | ArrayBuffer | string | URL;
    /** The WebAssembly module. Default `kb.wasm` next to this module. */
    wasm?: KbWasmSource;
    /** Atlas pixels per local pixel of the run sprites. Default 2. */
    scale?: number;
    /** Distance range of the run sprites in atlas pixels. Effects reach half of it. Default 12. */
    range?: number;
    /**
     * Draws values the font has no glyph for (emoji, other scripts), such as the provider of
     * `createCanvasText` from `pixi-silk/i18n/canvas`. Without it they draw as the font's
     * missing-glyph box.
     */
    fallback?: DynamicTextProvider;
}

/**
 * The shaper path for text slots (brief sec. 6.5, `shaper` mode). kb_text_shape shapes the value
 * with the font the bundle was baked from, the outlines are filled in JavaScript and a distance
 * transform turns them into a run sprite. Slots then match the baked text in font, shaping and
 * metrics on every platform, with no canvas. Pass the result as `dynamicText` to `Silk.create`.
 */
export async function createShapedText(options: ShapedTextOptions): Promise<ShapedTextProvider> {
    let font = options.font;

    if (typeof font === 'string' || font instanceof URL) {
        const response = await fetch(font);

        if (!response.ok) throw new Error(`@pixi-silk/shaper-kb: cannot load ${String(font)} (${response.status})`);
        font = await response.arrayBuffer();
    }
    const shaper = await createKbShaper(font, { wasm: options.wasm });

    return new ShapedTextProvider(shaper, options.scale ?? 2, options.range ?? 12, options.fallback);
}

/** The text slot provider {@link createShapedText} returns. */
export class ShapedTextProvider implements DynamicTextProvider {
    /** The shaper, for direct use. */
    readonly shaper: KbShaper;
    /** Atlas pixels per local pixel. */
    readonly scale: number;
    /** Distance range in atlas pixels. */
    readonly range: number;
    /** The provider for values with missing glyphs, if any. */
    readonly fallback: DynamicTextProvider | undefined;

    constructor(shaper: KbShaper, scale: number, range: number, fallback?: DynamicTextProvider) {
        this.shaper = shaper;
        this.scale = scale;
        this.range = range;
        this.fallback = fallback;
    }

    /**
     * The face of `bundle` baked from this provider's font, by the 64-bit font hash. Logs a warning
     * and returns undefined when no face matches: slots then use another font than the baked text.
     */
    checkBundle(bundle: SilkBundle): BundleFace | undefined {
        for (const face of bundle.faces.values()) if (face.hash === this.shaper.fontHash) return face;
        console.warn(
            `@pixi-silk/shaper-kb: the font (hash ${this.shaper.fontHash}) is not a face of bundle ${bundle.locale}. Text slots will not match the baked text`,
        );
        return undefined;
    }

    /** True when the font has a glyph for every character of `value`. */
    covers(value: string): boolean {
        return this.shaper.shape(value, { direction: 'auto' }).every((g) => g.glyph !== 0);
    }

    private _useFallback(value: string): boolean {
        return this.fallback !== undefined && !this.covers(value);
    }

    measure(value: string, size: number, style: Parameters<DynamicTextProvider['measure']>[2]): number {
        if (this._useFallback(value)) return this.fallback?.measure(value, size, style) ?? 0;
        const glyphs = this.shaper.shape(value, { direction: 'auto' });
        const spacing = (style.letterSpacing ?? 0) * size;
        let advance = 0;

        for (const g of glyphs) advance += g.advance;

        return (advance * size) / this.shaper.unitsPerEm + spacing * glyphs.length;
    }

    prewarm(values: readonly string[], size: number): void {
        for (const value of values) this.measure(value, size, {});
    }

    draw(slot: TextSlotRender): RunSprite | Promise<RunSprite> {
        if (this.fallback && this._useFallback(slot.value)) return this.fallback.draw(slot);
        const s = this.scale;
        const k = (slot.size * s) / this.shaper.unitsPerEm;
        const spacing = (slot.style.letterSpacing ?? 0) * slot.size * s;
        const pad = Math.ceil(this.range / 2) + 1;
        const ascent = Math.ceil(slot.baseline * s);
        const glyphs = this.shaper.shape(slot.value, { direction: 'auto' });
        let advance = 0;

        for (const g of glyphs) advance += g.advance * k + spacing;
        // a multiple of 4: WebGL uploads single-byte rows with 4-byte alignment
        const width = Math.ceil(Math.max(1, advance + 2 * pad) / 4) * 4;
        const height = Math.max(1, Math.ceil(slot.height * s + 2 * pad));
        const contours: Contour[] = [];
        const baseline = pad + ascent;
        let pen = pad;

        for (const g of glyphs) {
            const ox = pen + g.dx * k;
            const oy = baseline - g.dy * k;

            for (const c of this.shaper.font.outline(g.glyph)) {
                contours.push(c.map((p) => ({ x: ox + p.x * k, y: oy - p.y * k })));
            }
            pen += g.advance * k + spacing;
        }
        const alpha = fillContours(contours, width, height);

        return {
            width,
            height,
            pixels: sdfFromAlpha(alpha, width, height, this.range, 0.5, 1),
            range: this.range,
            scale: s,
            left: -pad / s,
            top: baseline / s,
            row: slot.row,
            size: slot.size,
        };
    }
}
