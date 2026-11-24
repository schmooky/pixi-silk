/**
 * @internal The canvas worker of `pixi-silk/i18n/canvas`: draws run sprites on an OffscreenCanvas
 * and computes their distance fields off the main thread. Messages: `{ font }` to load a font file
 * first, then `{ id, request }`, answered with `{ id, raster }` (pixels transferred, not copied).
 */
import { type RunRequest, rasterizeRun } from './canvas-raster';

interface WorkerScope {
    onmessage: ((e: MessageEvent) => void) | null;
    postMessage(message: unknown, transfer: Transferable[]): void;
    fonts?: FontFaceSet;
}

const scope = globalThis as unknown as WorkerScope;
const ctx = new OffscreenCanvas(1, 1).getContext('2d', {
    willReadFrequently: true,
}) as OffscreenCanvasRenderingContext2D;
let fontReady: Promise<unknown> = Promise.resolve();

scope.onmessage = (e: MessageEvent) => {
    const data = e.data as {
        font?: { family: string; source: string; weight?: number };
        id?: number;
        request?: RunRequest;
    };

    if (data.font) {
        const face = new FontFace(data.font.family, `url(${data.font.source})`, {
            weight: String(data.font.weight ?? 400),
        });

        fontReady = face.load().then((f) => scope.fonts?.add(f));
        return;
    }
    if (data.id === undefined || !data.request) return;
    const { id, request } = data;

    void fontReady.then(() => {
        const raster = rasterizeRun(ctx, request);
        const transfer: Transferable[] = [raster.pixels.buffer as ArrayBuffer];

        if (raster.color) transfer.push(raster.color.buffer as ArrayBuffer);
        scope.postMessage({ id, raster }, transfer);
    });
};
