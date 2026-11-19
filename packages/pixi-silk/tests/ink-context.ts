import type { GlyphContext } from '../src/text/atlas';

const MARK = /[\p{Mn}\p{Me}\u200c\u200d]/u;

/** Where a string's ink is, relative to the pen and the baseline, in em. */
export interface InkBox {
    left: number;
    right: number;
    ascent: number;
    descent: number;
}

/**
 * A fake 2D context that paints real pixels. Every code point but marks and joiners is half an em
 * wide. Ink fills that width from 0.7 em above the baseline to 0.2 em below, unless `ink` says
 * otherwise. `measureText` reports the default box even when `ink` differs, like Canvas does for
 * stacked marks, so tests can check that the atlas finds the ink in the pixels.
 */
export function paintContext(
    ink?: (s: string) => InkBox | null,
    color?: (s: string) => boolean,
): GlyphContext & { drawn: string[] } {
    let size = 48;
    let font = '';
    const canvas = { width: 64, height: 64 };
    let pixels = new Uint8ClampedArray(canvas.width * canvas.height * 4);
    const width = (s: string) => Array.from(s).filter((c) => !MARK.test(c)).length * 0.5;
    const box = (s: string): InkBox => ink?.(s) ?? { left: 0, right: width(s), ascent: 0.7, descent: 0.2 };
    const ctx = {
        drawn: [] as string[],
        get font() {
            return font;
        },
        set font(v: string) {
            font = v;
            size = Number(/(\d+(?:\.\d+)?)px/.exec(v)?.[1] ?? 48);
        },
        fillStyle: '#000' as unknown,
        textBaseline: 'alphabetic',
        textAlign: 'left',
        direction: 'inherit',
        canvas,
        measureText(s: string) {
            const has = s.trim() !== '';

            return {
                width: width(s) * size,
                actualBoundingBoxLeft: 0,
                actualBoundingBoxRight: has ? width(s) * size : 0,
                actualBoundingBoxAscent: has ? 0.7 * size : 0,
                actualBoundingBoxDescent: has ? 0.2 * size : 0,
            };
        },
        clearRect() {
            if (pixels.length !== canvas.width * canvas.height * 4) {
                pixels = new Uint8ClampedArray(canvas.width * canvas.height * 4);
            }
            pixels.fill(0);
        },
        fillText(s: string, x: number, y: number) {
            ctx.drawn.push(s);
            if (s.trim() === '') return;
            const b = box(s);
            // a colour font paints its own colours, whatever the fill
            const red = color?.(s) ? 255 : 0;

            for (let py = Math.round(y - b.ascent * size); py < Math.round(y + b.descent * size); py++) {
                for (let px = Math.round(x - b.left * size); px < Math.round(x + b.right * size); px++) {
                    if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
                    pixels[(py * canvas.width + px) * 4] = red;
                    pixels[(py * canvas.width + px) * 4 + 3] = 255;
                }
            }
        },
        getImageData(x: number, y: number, w: number, h: number) {
            const data = new Uint8ClampedArray(w * h * 4);

            for (let row = 0; row < h; row++) {
                data.set(
                    pixels.subarray(((y + row) * canvas.width + x) * 4, ((y + row) * canvas.width + x + w) * 4),
                    row * w * 4,
                );
            }

            return { data };
        },
    };

    return ctx;
}
