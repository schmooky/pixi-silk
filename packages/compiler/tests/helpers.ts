import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import type { ThemeData } from 'pixi-silk/i18n';
import { lintRows, type SheetRow } from '../src/author/lint';
import type { SilkConfig } from '../src/config';

export const fixtures = fileURLToPath(new URL('../fixtures/', import.meta.url));
export const config = JSON.parse(readFileSync(`${fixtures}silk.config.json`, 'utf8')) as SilkConfig;
export const theme = JSON.parse(readFileSync(`${fixtures}theme.json`, 'utf8')) as ThemeData;

/** A project from inline rows: `{ key: { 'ar.other': 'text' } }`, with slots per key. */
export function project(
    rows: Record<string, Record<string, string>>,
    slots: Record<string, string> = {},
    extra: Partial<SilkConfig> = {},
) {
    const sheet: SheetRow[] = Object.entries(rows).map(([key, cells], i) => ({
        sheet: 'test',
        row: i + 2,
        key,
        context: '',
        slots: slots[key] ?? '',
        maxLen: 0,
        cells: Object.entries(cells).map(([h, value]) => {
            const [locale, category] = h.split('.') as [string, 'other'];

            return { locale, category, value, column: 'E' };
        }),
    }));
    const locales = [...new Set(sheet.flatMap((r) => r.cells.map((c) => c.locale)))];
    const cfg: SilkConfig = {
        ...config,
        sourceLocale: locales[0],
        locales: Object.fromEntries(locales.map((l) => [l, config.locales[l] ?? {}])),
        ...extra,
        tags: ['b', 'strong'],
    };
    const styled: ThemeData = { ...theme, styles: { ...theme.styles, strong: { weight: 700 } } };

    return {
        config: cfg,
        root: fixtures,
        theme: styled,
        catalog: lintRows(sheet, cfg, Object.keys(styled.styles ?? {})),
    };
}

/** Decodes an 8-bit PNG (grey, RGB or RGBA, any filter) to RGBA. Enough for the atlas pages. */
export function decodePng(png: Uint8Array): { width: number; height: number; rgba: Uint8Array } {
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    const idat: Uint8Array[] = [];
    let width = 0;
    let height = 0;
    let channels = 4;

    for (let at = 8; at < png.length; ) {
        const len = view.getUint32(at);
        const type = String.fromCharCode(...png.subarray(at + 4, at + 8));

        if (type === 'IHDR') {
            width = view.getUint32(at + 8);
            height = view.getUint32(at + 12);
            channels = { 0: 1, 2: 3, 6: 4 }[png[at + 17]] ?? 4;
        }
        if (type === 'IDAT') idat.push(png.subarray(at + 8, at + 8 + len));
        at += 12 + len;
    }
    const raw = inflateSync(Buffer.concat(idat));
    const stride = width * channels;
    const px = new Uint8Array(stride * height);

    for (let y = 0; y < height; y++) {
        const f = raw[y * (stride + 1)];

        for (let i = 0; i < stride; i++) {
            const v = raw[y * (stride + 1) + 1 + i];
            const a = i >= channels ? px[y * stride + i - channels] : 0;
            const b = y ? px[(y - 1) * stride + i] : 0;
            const c = y && i >= channels ? px[(y - 1) * stride + i - channels] : 0;
            const p = a + b - c;
            const paeth =
                Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c)
                    ? a
                    : Math.abs(p - b) <= Math.abs(p - c)
                      ? b
                      : c;

            px[y * stride + i] = (v + [0, a, b, (a + b) >> 1, paeth][f]) & 255;
        }
    }
    const rgba = new Uint8Array(width * height * 4);

    for (let i = 0; i < width * height; i++) {
        for (let c = 0; c < 4; c++) rgba[i * 4 + c] = c < channels ? px[i * channels + c] : 255;
        if (channels === 1) rgba[i * 4 + 1] = rgba[i * 4 + 2] = px[i];
    }

    return { width, height, rgba };
}
