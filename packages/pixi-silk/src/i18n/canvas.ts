import { DOMAdapter } from 'pixi.js';
import { sdfFromAlpha } from '../text/edt';
import type { RunSprite } from './backend';
import type { TextSlotRender } from './pixi/silk';
import type { ThemeStyle } from './theme';

/** A font to download for text slots, instead of the system font. */
export interface CanvasFont {
    /** CSS family name to register it under. */
    family: string;
    /** URL of the font file. Prefer a subset with the scripts the slot needs. */
    source: string;
    /** CSS weight of the file. Default 400. */
    weight?: number;
}

/** Options of {@link createCanvasText}. */
export interface CanvasTextOptions {
    /**
     * `system` uses the platform's fonts: nothing to download, but the look may differ from the
     * baked text. A {@link CanvasFont} downloads one font file first. Default `system`.
     */
    font?: 'system' | CanvasFont;
    /** Atlas pixels per local pixel of the run sprites. Default 2. */
    scale?: number;
    /** Distance range of the run sprites in atlas pixels. Effects reach half of it. Default 12. */
    range?: number;
}

/** The fonts `system` stands for. */
export const SYSTEM_FONTS =
    'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Arabic", "Noto Sans Hebrew", sans-serif';

const RTL_START = /^[^A-Za-zÀ-ɏͰ-ϿЀ-ӿ]*?[֐-ࣿיִ-﷿ﹰ-\ufeff]/;

/** `rtl` when the first strong letter of `value` is Hebrew or Arabic. Enough for a name. */
export function slotDirection(value: string): 'ltr' | 'rtl' {
    return RTL_START.test(value) ? 'rtl' : 'ltr';
}

/** True when a pixel is coloured, not a grey of the white text: an emoji. */
function colored(px: Uint8ClampedArray, i: number): boolean {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];

    return px[i + 3] > 16 && Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b)) > 24;
}

/**
 * The canvas path for text slots (brief sec. 6.5). The browser shapes and orders the value with
 * Canvas2D `fillText`. A distance transform turns it into a single-channel SDF "run sprite", which a
 * `SilkBackend` draws as one glyph, so outline, glow and shadow of the slot's style apply.
 * Colour emoji cannot be distance fields: they are drawn as a bitmap sprite on top, without
 * outline or glow. One style per slot.
 *
 * Pass the result as `dynamicText` to `Silk.create`, or pass `{ mode: 'canvas' }` there to load this
 * module only when a message has a text slot.
 */
export async function createCanvasText(options: CanvasTextOptions = {}): Promise<CanvasTextProvider> {
    const font = options.font ?? 'system';
    let family = SYSTEM_FONTS;

    if (font !== 'system') {
        const face = new FontFace(font.family, `url(${font.source})`, { weight: String(font.weight ?? 400) });

        await face.load();
        (globalThis.document?.fonts as FontFaceSet | undefined)?.add(face);
        family = `"${font.family}", ${SYSTEM_FONTS}`;
    }

    return new CanvasTextProvider(family, options.scale ?? 2, options.range ?? 12);
}

/** The text slot provider {@link createCanvasText} returns. */
export class CanvasTextProvider {
    /** CSS font family list. */
    readonly family: string;
    /** Atlas pixels per local pixel. */
    readonly scale: number;
    /** Distance range in atlas pixels. */
    readonly range: number;
    private _ctx: CanvasRenderingContext2D | null = null;

    constructor(family: string, scale: number, range: number) {
        this.family = family;
        this.scale = scale;
        this.range = range;
    }

    /** CSS font shorthand for a style at a size. */
    font(style: ThemeStyle, size: number): string {
        return `${style.weight ?? 400} ${size}px ${this.family}`;
    }

    private _context(): CanvasRenderingContext2D {
        if (!this._ctx) {
            const canvas = DOMAdapter.get().createCanvas(1, 1);

            this._ctx = canvas.getContext('2d', { willReadFrequently: true }) as unknown as CanvasRenderingContext2D;
        }
        return this._ctx;
    }

    /** Readies the canvas and the font (measuring loads a system font's glyphs) before the first slot draws. */
    prewarm(values: readonly string[], size: number): void {
        for (const value of values.length ? values : ['Aa']) this.measure(value, size, {});
    }

    /** Width of a value in local pixels. */
    measure(value: string, size: number, style: ThemeStyle): number {
        const ctx = this._context();

        ctx.font = this.font(style, size);
        ctx.direction = slotDirection(value);

        return ctx.measureText(value).width;
    }

    /** Draws a value as a run sprite. See {@link createCanvasText}. */
    draw(slot: TextSlotRender): RunSprite {
        const { value, size, style } = slot;
        const ctx = this._context();
        const s = this.scale;
        const pad = Math.ceil(this.range / 2) + 1;
        const font = this.font(style, size * s);

        ctx.font = font;
        // a multiple of 4: WebGL uploads single-byte rows with 4-byte alignment
        const width = Math.ceil(Math.max(1, ctx.measureText(value).width + 2 * pad) / 4) * 4;
        const ascent = Math.ceil(slot.baseline * s);
        const height = Math.max(1, Math.ceil(slot.height * s + 2 * pad));
        const canvas = ctx.canvas;

        canvas.width = width;
        canvas.height = height;
        ctx.font = font;
        ctx.direction = slotDirection(value);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#fff';
        ctx.clearRect(0, 0, width, height);
        ctx.fillText(value, pad, pad + ascent);
        const px = ctx.getImageData(0, 0, width, height).data;
        const alpha = new Uint8Array(width * height);
        let color: Uint8Array | undefined;

        for (let i = 0; i < alpha.length; i++) {
            if (colored(px, i * 4)) {
                color ??= new Uint8Array(width * height * 4);
                color.set(px.subarray(i * 4, i * 4 + 4), i * 4);
            } else alpha[i] = px[i * 4 + 3];
        }

        return {
            width,
            height,
            pixels: sdfFromAlpha(alpha, width, height, this.range, 0.5, 1),
            range: this.range,
            scale: s,
            left: -pad / s,
            top: (pad + ascent) / s,
            row: slot.row,
            size,
            color,
        };
    }
}
