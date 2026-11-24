import { GLYPH_STRIDE, PAGE_STRIDE, PageKind } from './format';
import { INSTANCE_FLOATS, InstanceKind, type MessageLayout } from './layout';
import type { SilkBundle } from './messages';
import type { StyleTable } from './styles';
import { STYLE_FLOATS } from './theme';

/** A text buffer a backend made. */
export interface TextBufferHandle {
    /** Backend-defined id. */
    readonly id: number;
}

/** A text slot drawn by the dynamic path: a single-channel SDF bitmap. */
export interface RunSprite {
    /** Width in pixels. */
    width: number;
    /** Height in pixels. */
    height: number;
    /** One byte per pixel, 0.5 on the edge. */
    pixels: Uint8Array;
    /** Distance range in pixels. */
    range: number;
}

/**
 * What a renderer implements to draw baked text (brief sec. 2.3). The core lays out and writes
 * instances (`INSTANCE_FLOATS` floats each) and style rows (`STYLE_FLOATS` floats each). A backend
 * stores and draws them. `pixi-silk/i18n/pixi` is the PixiJS one, {@link HeadlessBackend} a
 * software reference.
 */
export interface SilkBackend {
    /** Stores an atlas page: RGBA pixels (or a decoded image) of a page id. */
    uploadAtlasPage(
        page: number,
        source: Uint8Array | ImageBitmap,
        width: number,
        height: number,
        kind: 'msdf' | 'sdf' | 'mtsdf',
    ): void;
    /** Stores style rows from `firstRow` on. */
    writeStyleRows(firstRow: number, rows: Float32Array): void;
    /** Makes a buffer for up to `capacityGlyphs` instances. */
    createTextBuffer(capacityGlyphs: number): TextBufferHandle;
    /** Writes instances from `firstGlyph` on. */
    writeInstances(handle: TextBufferHandle, firstGlyph: number, data: Float32Array): void;
    /** Sets or clears the run sprite of a text slot. */
    setRunSprite(handle: TextBufferHandle, slot: number, sprite: RunSprite | null): void;
    /** Frees a buffer. */
    destroyTextBuffer(handle: TextBufferHandle): void;
}

/**
 * Drives any {@link SilkBackend} from the core: uploads a laid out message and its style rows. It
 * is all the glue a renderer needs besides drawing.
 */
export function submitLayout(
    backend: SilkBackend,
    layout: MessageLayout,
    styles: StyleTable,
    handle?: TextBufferHandle,
): TextBufferHandle {
    const h = handle ?? backend.createTextBuffer(layout.count);

    backend.writeStyleRows(0, styles.data.subarray(0, styles.count * STYLE_FLOATS));
    backend.writeInstances(h, 0, layout.instances.subarray(0, layout.count * INSTANCE_FLOATS));
    styles.clean();

    return h;
}

/** An atlas page as {@link HeadlessBackend} stores it. */
export interface StoredPage {
    /** RGBA pixels. */
    pixels: Uint8Array;
    /** Width in pixels. */
    width: number;
    /** Height in pixels. */
    height: number;
    /** Glyph kind. */
    kind: string;
}

/**
 * A reference backend with no GPU: it keeps everything in arrays and rasterizes the fill of every
 * glyph and line into an RGBA buffer on the CPU (bilinear distance samples, one-pixel ramp). Slow,
 * and with no outline, glow or shadow: it exists to prove the core needs no renderer, and for tests.
 */
export class HeadlessBackend implements SilkBackend {
    /** Pages by id. */
    readonly pages: Map<number, StoredPage> = new Map();
    /** Style rows as last written. */
    styles: Float32Array = new Float32Array(0);
    /** Buffers by id. */
    readonly buffers: Map<number, Float32Array> = new Map();
    /** Run sprites by buffer id and slot. */
    readonly sprites: Map<string, RunSprite> = new Map();
    private _next = 1;

    uploadAtlasPage(
        page: number,
        source: Uint8Array | ImageBitmap,
        width: number,
        height: number,
        kind: 'msdf' | 'sdf' | 'mtsdf',
    ): void {
        if (!(source instanceof Uint8Array)) throw new Error('HeadlessBackend takes RGBA bytes');
        this.pages.set(page, { pixels: source, width, height, kind });
    }

    writeStyleRows(firstRow: number, rows: Float32Array): void {
        const need = firstRow * STYLE_FLOATS + rows.length;

        if (this.styles.length < need) {
            const grown = new Float32Array(need);

            grown.set(this.styles);
            this.styles = grown;
        }
        this.styles.set(rows, firstRow * STYLE_FLOATS);
    }

    createTextBuffer(capacityGlyphs: number): TextBufferHandle {
        const id = this._next++;

        this.buffers.set(id, new Float32Array(capacityGlyphs * INSTANCE_FLOATS));
        return { id };
    }

    writeInstances(handle: TextBufferHandle, firstGlyph: number, data: Float32Array): void {
        let b = this.buffers.get(handle.id) ?? new Float32Array(0);
        const need = firstGlyph * INSTANCE_FLOATS + data.length;

        if (b.length < need) {
            const grown = new Float32Array(need);

            grown.set(b);
            b = grown;
        }
        b.set(data, firstGlyph * INSTANCE_FLOATS);
        this.buffers.set(handle.id, b);
    }

    setRunSprite(handle: TextBufferHandle, slot: number, sprite: RunSprite | null): void {
        if (sprite) this.sprites.set(`${handle.id}:${slot}`, sprite);
        else this.sprites.delete(`${handle.id}:${slot}`);
    }

    destroyTextBuffer(handle: TextBufferHandle): void {
        this.buffers.delete(handle.id);
        for (const k of [...this.sprites.keys()]) if (k.startsWith(`${handle.id}:`)) this.sprites.delete(k);
    }

    /**
     * Rasterizes a buffer's fills into straight RGBA (`width` by `height`, local pixels at scale 1,
     * offset by `x`, `y`). Glyph metrics come from the bundle the instances were laid out from.
     */
    rasterize(handle: TextBufferHandle, bundle: SilkBundle, width: number, height: number, x = 0, y = 0): Uint8Array {
        const out = new Float32Array(width * height * 4);
        const inst = this.buffers.get(handle.id) ?? new Float32Array(0);
        const d = bundle.data;
        const pageIds: number[] = [];

        for (let i = 0; i < d.pages.length; i += PAGE_STRIDE) pageIds.push(d.pages[i]);
        const pageInfo = (slot: number) => ({
            id: d.pages[slot * PAGE_STRIDE],
            range: d.pages[slot * PAGE_STRIDE + 5],
            em: d.pages[slot * PAGE_STRIDE + 6],
            kind: d.pages[slot * PAGE_STRIDE + 2],
        });
        const blend = (px: number, py: number, rgba: ArrayLike<number>, cov: number) => {
            if (px < 0 || py < 0 || px >= width || py >= height || cov <= 0) return;
            const o = (py * width + px) * 4;
            const a = rgba[3] * cov;

            for (let c = 0; c < 3; c++) out[o + c] = rgba[c] * a + out[o + c] * (1 - a);
            out[o + 3] = a + out[o + 3] * (1 - a);
        };

        for (let i = 0; i + INSTANCE_FLOATS <= inst.length; i += INSTANCE_FLOATS) {
            const kind = inst[i + 5] % 4;
            const row = inst[i + 4];
            const fill = this.styles.subarray(row * STYLE_FLOATS, row * STYLE_FLOATS + 4);

            if (kind !== InstanceKind.Glyph) {
                const s = this.styles.subarray(row * STYLE_FLOATS, (row + 1) * STYLE_FLOATS);
                const size = inst[i + 6];
                const thick = (kind === InstanceKind.Underline ? s[22] : s[28]) * size;
                const centre =
                    kind === InstanceKind.Underline ? inst[i + 1] + s[23] * size : inst[i + 1] - s[29] * size;

                for (let py = Math.floor(centre - thick / 2 - y); py <= Math.ceil(centre + thick / 2 - y); py++) {
                    for (let px = Math.floor(inst[i] - x); px < Math.ceil(inst[i] + inst[i + 7] - x); px++) {
                        const cov = Math.min(1, Math.max(0, thick / 2 - Math.abs(py + 0.5 + y - centre) + 0.5));

                        blend(px, py, s[27] > 0 ? s.subarray(24, 28) : fill, cov);
                    }
                }
                continue;
            }
            const glyph = inst[i + 3];

            if (!glyph) continue;
            const g = glyph * GLYPH_STRIDE;
            const slot = pageIds.indexOf(d.glyphs[g]);
            const info = pageInfo(slot);
            const page = this.pages.get(info.id);

            if (!page) continue;
            const scale = inst[i + 2];
            const upem = bundle.face(d.glyphs[g + 9]).unitsPerEm;
            const k = info.em / upem / scale; // atlas pixels per local pixel
            const left = inst[i] + d.glyphs[g + 5] * scale;
            const top = inst[i + 1] - d.glyphs[g + 8] * scale;
            const w = d.glyphs[g + 3] / k;
            const h = d.glyphs[g + 4] / k;

            for (let py = Math.floor(top - y); py < Math.ceil(top + h - y); py++) {
                for (let px = Math.floor(left - x); px < Math.ceil(left + w - x); px++) {
                    const u = d.glyphs[g + 1] + (px + 0.5 + x - left) * k;
                    const v = d.glyphs[g + 2] + (py + 0.5 + y - top) * k;
                    const m = sampleMedian(
                        page,
                        u,
                        v,
                        d.glyphs[g + 1],
                        d.glyphs[g + 2],
                        d.glyphs[g + 3],
                        d.glyphs[g + 4],
                        info.kind === PageKind.Sdf,
                    );
                    const sd = ((m - 0.5) * info.range) / k;

                    blend(px, py, fill, Math.min(1, Math.max(0, sd + 0.5)));
                }
            }
        }
        const bytes = new Uint8Array(out.length);

        for (let i = 0; i < out.length; i++) bytes[i] = Math.round(Math.min(1, Math.max(0, out[i])) * 255);

        return bytes;
    }
}

function sampleMedian(
    page: StoredPage,
    u: number,
    v: number,
    cx: number,
    cy: number,
    cw: number,
    ch: number,
    single: boolean,
): number {
    const fx = Math.min(Math.max(u - 0.5, cx), cx + cw - 1);
    const fy = Math.min(Math.max(v - 0.5, cy), cy + ch - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const at = (x: number, y: number, c: number) =>
        page.pixels[(Math.min(y, page.height - 1) * page.width + Math.min(x, page.width - 1)) * 4 + c] / 255;
    const channel = (c: number) =>
        (at(x0, y0, c) * (1 - tx) + at(x0 + 1, y0, c) * tx) * (1 - ty) +
        (at(x0, y0 + 1, c) * (1 - tx) + at(x0 + 1, y0 + 1, c) * tx) * ty;
    const r = channel(0);

    if (single) return r;
    const g = channel(1);
    const b = channel(2);

    return Math.max(Math.min(r, g), Math.min(Math.max(r, g), b));
}
