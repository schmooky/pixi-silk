import { sdfFromAlpha } from '../text/edt';

/** What {@link rasterizeRun} draws. Sizes in bitmap pixels. */
export interface RunRequest {
    /** The value. */
    value: string;
    /** CSS font shorthand at bitmap size. */
    font: string;
    /** Bidi base direction of the value. */
    direction: 'ltr' | 'rtl';
    /** Room around the text for the distance field. */
    pad: number;
    /** Baseline from the top of the text box. */
    ascent: number;
    /** Height of the text box. */
    height: number;
    /** Distance range. */
    range: number;
}

/** What {@link rasterizeRun} returns: an SDF of the text and the colour pixels of emoji. */
export interface RunRaster {
    /** Width in pixels, a multiple of 4. */
    width: number;
    /** Height in pixels. */
    height: number;
    /** One byte per pixel, 0.5 on the edge. */
    pixels: Uint8Array;
    /** RGBA of colour glyphs, or undefined. */
    color?: Uint8Array;
}

type Context2D = Pick<
    CanvasRenderingContext2D,
    | 'font'
    | 'direction'
    | 'textAlign'
    | 'textBaseline'
    | 'fillStyle'
    | 'measureText'
    | 'fillText'
    | 'clearRect'
    | 'getImageData'
> & { canvas: { width: number; height: number } };

/** True when a pixel is coloured, not a grey of the white text: an emoji. */
function colored(px: Uint8ClampedArray, i: number): boolean {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];

    return px[i + 3] > 16 && Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b)) > 24;
}

/**
 * @internal Draws a value with Canvas2D and turns it into a single-channel SDF. Runs on the main
 * thread or in the canvas worker (any 2D context, OffscreenCanvas included). No Pixi.
 */
export function rasterizeRun(ctx: Context2D, req: RunRequest): RunRaster {
    ctx.font = req.font;
    // a multiple of 4: WebGL uploads single-byte rows with 4-byte alignment
    const width = Math.ceil(Math.max(1, ctx.measureText(req.value).width + 2 * req.pad) / 4) * 4;
    const height = Math.max(1, Math.ceil(req.height + 2 * req.pad));

    ctx.canvas.width = width;
    ctx.canvas.height = height;
    ctx.font = req.font;
    ctx.direction = req.direction;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#fff';
    ctx.clearRect(0, 0, width, height);
    ctx.fillText(req.value, req.pad, req.pad + req.ascent);
    const px = ctx.getImageData(0, 0, width, height).data;
    const alpha = new Uint8Array(width * height);
    let color: Uint8Array | undefined;

    for (let i = 0; i < alpha.length; i++) {
        if (colored(px, i * 4)) {
            color ??= new Uint8Array(width * height * 4);
            color.set(px.subarray(i * 4, i * 4 + 4), i * 4);
        } else alpha[i] = px[i * 4 + 3];
    }

    return { width, height, pixels: sdfFromAlpha(alpha, width, height, req.range, 0.5, 1), color };
}
