import { DOMAdapter } from 'pixi.js';
import type { RunSprite } from './backend';
import { type RunRaster, type RunRequest, rasterizeRun } from './canvas-raster';
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
    /**
     * Draw run sprites in a worker on an OffscreenCanvas, so the main thread does no drawing or
     * distance transform. Ignored where the platform has neither. Default true.
     */
    worker?: boolean;
}

/** The fonts `system` stands for. */
export const SYSTEM_FONTS =
    'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Arabic", "Noto Sans Hebrew", sans-serif';

const RTL_START = /^[^A-Za-zÀ-ɏͰ-ϿЀ-ӿ]*?[֐-ࣿיִ-﷿ﹰ-\ufeff]/;

/** `rtl` when the first strong letter of `value` is Hebrew or Arabic. Enough for a name. */
export function slotDirection(value: string): 'ltr' | 'rtl' {
    return RTL_START.test(value) ? 'rtl' : 'ltr';
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

    // run sprites in a worker where the platform can, else on the main thread
    let worker: Worker | null = null;

    if (options.worker !== false && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
        try {
            worker = new Worker(new URL('./canvas-worker.js', import.meta.url), { type: 'module' });
        } catch {
            worker = null;
        }
    }

    return new CanvasTextProvider(
        family,
        options.scale ?? 2,
        options.range ?? 12,
        worker,
        font === 'system' ? undefined : font,
    );
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

    private _worker: Worker | null = null;
    private readonly _pending = new Map<number, { resolve: (raster: RunRaster) => void; request: RunRequest }>();
    private _nextId = 1;

    constructor(family: string, scale: number, range: number, worker: Worker | null = null, font?: CanvasFont) {
        this.family = family;
        this.scale = scale;
        this.range = range;
        if (worker) {
            this._worker = worker;
            worker.onmessage = (e: MessageEvent) => {
                const { id, raster } = e.data as { id: number; raster: RunRaster };

                this._pending.get(id)?.resolve(raster);
                this._pending.delete(id);
            };
            // a worker that cannot start (a bundler that did not ship its file): draw here instead
            worker.onerror = () => {
                this.destroy();
                for (const { resolve, request } of this._pending.values())
                    resolve(rasterizeRun(this._context(), request));
                this._pending.clear();
            };
            if (font) worker.postMessage({ font });
        }
    }

    /** True when run sprites are drawn in a worker. */
    get usesWorker(): boolean {
        return this._worker !== null;
    }

    /** Stops the worker. Later slots draw on the main thread. */
    destroy(): void {
        this._worker?.terminate();
        this._worker = null;
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

    /** The request for a slot: bitmap sizes for this provider's scale and range. */
    private _request(slot: TextSlotRender): RunRequest {
        const s = this.scale;

        return {
            value: slot.value,
            font: this.font(slot.style, slot.size * s),
            direction: slotDirection(slot.value),
            pad: Math.ceil(this.range / 2) + 1,
            ascent: Math.ceil(slot.baseline * s),
            height: slot.height * s,
            range: this.range,
        };
    }

    private _sprite(slot: TextSlotRender, req: RunRequest, raster: RunRaster): RunSprite {
        return {
            ...raster,
            range: this.range,
            scale: this.scale,
            left: -req.pad / this.scale,
            top: (req.pad + req.ascent) / this.scale,
            row: slot.row,
            size: slot.size,
        };
    }

    /**
     * Draws a value as a run sprite. With a worker (the default where `OffscreenCanvas` and
     * `Worker` exist) the result is a promise and the main thread does no drawing. See
     * {@link createCanvasText}.
     */
    draw(slot: TextSlotRender): RunSprite | Promise<RunSprite> {
        const req = this._request(slot);

        if (this._worker) {
            const id = this._nextId++;

            return new Promise<RunRaster>((resolve) => {
                this._pending.set(id, { resolve, request: req });
                this._worker?.postMessage({ id, request: req });
            }).then((raster) => this._sprite(slot, req, raster));
        }
        return this._sprite(slot, req, rasterizeRun(this._context(), req));
    }
}
