import { type LoadedFace, pageName } from '../shape/fonts';
import { type GlyphBitmap, generateGlyph, type PathCommand } from './msdf';
import { encodePng } from './png';

/** A glyph to put in the atlas. */
export interface GlyphRequest {
    /** Face id. */
    face: number;
    /** Glyph id. */
    gid: number;
    /**
     * ISO 15924 script of the character the glyph was shaped from. It picks the page group (with
     * its em size). Common characters such as digits leave it out and go with their face's group.
     */
    script?: string;
}

/** Where a glyph landed. */
export interface PlacedGlyph {
    /** Global page index. */
    page: number;
    /** Left in page pixels. */
    x: number;
    /** Top in page pixels. */
    y: number;
    /** Width in pixels. */
    w: number;
    /** Height in pixels. */
    h: number;
    /** Plane bounds in font units. */
    planeL: number;
    /** Bottom, font units. */
    planeB: number;
    /** Right, font units. */
    planeR: number;
    /** Top, font units. */
    planeT: number;
}

/** One atlas page. */
export interface AtlasPage {
    /** File name, such as `latin-0.png`. */
    file: string;
    /** Script group. */
    script: string;
    /** Glyph kind. */
    kind: 'msdf' | 'sdf' | 'mtsdf';
    /** Width in pixels. */
    width: number;
    /** Height in pixels. */
    height: number;
    /** Lossless PNG of the page, whatever `file`'s format (see {@link encodeAtlasPages}). */
    png: Uint8Array;
    /** Glyphs on the page. */
    glyphs: number;
    /** Atlas pixels per em on this page. */
    emSize: number;
    /** Distance range in pixels on this page. */
    distanceRange: number;
}

/** Atlas pixels per em of a page group. */
export function emSizeOf(options: AtlasOptions, script: string): number {
    return options.emSizeByScript?.[script] ?? options.emSize;
}

/** Distance range of a page group: the configured range, scaled with its em size. */
export function rangeOf(options: AtlasOptions, script: string): number {
    return Math.ceil((options.distanceRange * emSizeOf(options, script)) / options.emSize);
}

/** The atlas: pages and where every glyph is. Glyphs without ink are absent. */
export interface Atlas {
    /** Pages, sorted by script then index. */
    pages: AtlasPage[];
    /** Placement by `face:gid`. */
    glyphs: Map<string, PlacedGlyph>;
    /** Atlas pixels per em. */
    emSize: number;
    /** Distance range in pixels. */
    distanceRange: number;
}

/** Atlas options. */
export interface AtlasOptions {
    /** Glyph kind. */
    kind: 'msdf' | 'sdf' | 'mtsdf';
    /** Atlas pixels per em. */
    emSize: number;
    /** Distance range in pixels. */
    distanceRange: number;
    /** Largest page side. */
    maxPageSize: number;
    /**
     * Atlas pixels per em by page group (`han`, `hangul`, `thai`...), for scripts whose glyphs need
     * more detail than `emSize` gives. The distance range grows with it, so effects keep their reach.
     */
    emSizeByScript?: Record<string, number>;
    /** File format the pages will be written in: sets the file extension. Default `png`. */
    format?: 'png' | 'webp';
}

const GAP = 1;

/**
 * Generates every requested glyph and packs them into pages grouped by script (brief sec. 4.4):
 * shelves, tallest glyphs first, ties by face and glyph id, so the same glyphs always give the same
 * pages. A page is the smallest power of two square, or 2:1 rectangle, that holds its glyphs.
 */
export function buildAtlas(
    requests: Iterable<GlyphRequest>,
    faces: readonly LoadedFace[],
    options: AtlasOptions,
): Atlas {
    const unique = new Map<string, GlyphRequest>();

    // the first request of a glyph decides its group; a later one only fills in a missing script
    for (const r of requests) {
        if (r.gid <= 0) continue;
        const key = `${r.face}:${r.gid}`;
        const known = unique.get(key);

        if (!known || (!known.script && r.script)) unique.set(key, r);
    }
    const bitmaps: { key: string; script: string; bitmap: GlyphBitmap }[] = [];

    for (const [key, r] of [...unique].sort((a, b) => a[1].face - b[1].face || a[1].gid - b[1].gid)) {
        const face = faces[r.face];
        const commands = face.font.glyphToJson(r.gid) as PathCommand[];
        const group = r.script && r.script !== 'Zyyy' && r.script !== 'Zinh' ? pageName(r.script) : face.script;
        const em = emSizeOf(options, group);
        const bitmap = generateGlyph(commands, em / face.upem, rangeOf(options, group), options.kind);

        if (bitmap) bitmaps.push({ key, script: group, bitmap });
    }
    const pages: AtlasPage[] = [];
    const glyphs = new Map<string, PlacedGlyph>();
    const scripts = [...new Set(bitmaps.map((b) => b.script))].sort();
    const channels = options.kind === 'sdf' ? 1 : options.kind === 'mtsdf' ? 4 : 3;

    for (const script of scripts) {
        let todo = bitmaps
            .filter((b) => b.script === script)
            .sort((a, b) => b.bitmap.height - a.bitmap.height || (a.key < b.key ? -1 : 1));
        let index = 0;

        while (todo.length) {
            const { placed, rest, width, height } = packPage(todo, options.maxPageSize);
            const pixels = new Uint8Array(width * height * channels);
            const pageIndex = pages.length;

            for (const { item, x, y } of placed) {
                const b = item.bitmap;

                for (let row = 0; row < b.height; row++) {
                    pixels.set(
                        b.pixels.subarray(row * b.width * channels, (row + 1) * b.width * channels),
                        ((y + row) * width + x) * channels,
                    );
                }
                glyphs.set(item.key, {
                    page: pageIndex,
                    x,
                    y,
                    w: b.width,
                    h: b.height,
                    planeL: Math.round(b.planeL),
                    planeB: Math.round(b.planeB),
                    planeR: Math.round(b.planeR),
                    planeT: Math.round(b.planeT),
                });
            }
            pages.push({
                file: `${script}-${index++}.${options.format ?? 'png'}`,
                script,
                kind: options.kind,
                emSize: emSizeOf(options, script),
                distanceRange: rangeOf(options, script),
                width,
                height,
                png: encodePng(pixels, width, height, channels),
                glyphs: placed.length,
            });
            todo = rest;
        }
    }

    return { pages, glyphs, emSize: options.emSize, distanceRange: options.distanceRange };
}

type Item = { key: string; script: string; bitmap: GlyphBitmap };

function shelves(
    items: Item[],
    width: number,
    height: number,
): { placed: { item: Item; x: number; y: number }[]; rest: Item[] } {
    const placed: { item: Item; x: number; y: number }[] = [];
    const rest: Item[] = [];
    let x = GAP;
    let y = GAP;
    let shelf = 0;

    for (const item of items) {
        const { width: w, height: h } = item.bitmap;

        if (x + w + GAP > width) {
            x = GAP;
            y += shelf + GAP;
            shelf = 0;
        }
        if (w + 2 * GAP > width || y + h + GAP > height) {
            rest.push(item);
            continue;
        }
        placed.push({ item, x, y });
        x += w + GAP;
        shelf = Math.max(shelf, h);
    }

    return { placed, rest };
}

function packPage(items: Item[], max: number) {
    for (let side = 64; side <= max; side *= 2) {
        for (const [width, height] of [
            [side, side / 2],
            [side, side],
        ]) {
            const r = shelves(items, width, height);

            if (r.rest.length === 0) return { ...r, width, height };
        }
    }
    const r = shelves(items, max, max);

    if (r.placed.length === 0) throw new Error(`a glyph is larger than the ${max} px page`);

    return { ...r, width: max, height: max };
}

/**
 * The bytes of every page in the format its file name says: the PNG as is, or lossless WebP made
 * from it with the optional `sharp` package. Pixels are identical either way.
 */
export async function encodeAtlasPages(atlas: Atlas): Promise<Map<string, Uint8Array>> {
    const out = new Map<string, Uint8Array>();

    for (const page of atlas.pages) {
        if (!page.file.endsWith('.webp')) {
            out.set(page.file, page.png);
            continue;
        }
        let sharp: (input: Uint8Array) => { webp(o: object): { toBuffer(): Promise<Uint8Array> } };

        try {
            sharp = (await import('sharp' as string)).default;
        } catch {
            throw new Error('atlas.format "webp" needs the sharp package: npm install sharp, or use "png"');
        }
        out.set(page.file, new Uint8Array(await sharp(page.png).webp({ lossless: true, effort: 6 }).toBuffer()));
    }

    return out;
}
