import { readFileSync } from 'node:fs';
import * as hb from 'harfbuzzjs';
import { fontHash } from 'pixi-silk/i18n';
import { describe, expect, it } from 'vitest';
import { createKbShaper, createShapedText, fillContours, readFont } from '../src/index';

const fonts = new URL('../../compiler/fixtures/fonts/', import.meta.url);
const wasm = readFileSync(new URL('../wasm/kb.wasm', import.meta.url));
const font = (file: string) => new Uint8Array(readFileSync(new URL(file, fonts)));

function harfbuzz(file: string, text: string, rtl: boolean) {
    const f = new hb.Font(new hb.Face(new hb.Blob(font(file))));
    const b = new hb.Buffer();

    b.addText(text);
    b.guessSegmentProperties();
    b.setDirection(rtl ? hb.Direction.RTL : hb.Direction.LTR);
    hb.shape(f, b);
    return b.getGlyphInfosAndPositions().map((g) => ({
        glyph: g.codepoint,
        cluster: g.cluster,
        advance: g.xAdvance ?? 0,
        dx: g.xOffset ?? 0,
        dy: g.yOffset ?? 0,
    }));
}

const CORPUS: [string, string, 'ltr' | 'rtl'][] = [
    ['NotoSans-Regular.ttf', 'Hello, world! Office fit', 'ltr'],
    ['NotoSans-Bold.ttf', 'Grand prize: 1,250 coins', 'ltr'],
    ['NotoSansArabic-Regular.ttf', 'مرحبا بالعالم', 'rtl'],
    ['NotoSansArabic-Regular.ttf', 'مَرْحَبًا بِكُمْ', 'rtl'],
    ['NotoSansArabic-Bold.ttf', 'لديك عملات ذهبية لا لأ', 'rtl'],
    ['NotoSansHebrew-Regular.ttf', 'שלום עולם', 'rtl'],
];

describe('KbShaper', () => {
    it.each(CORPUS)('shapes %s like HarfBuzz: %s', async (file, text, direction) => {
        const shaper = await createKbShaper(font(file), { wasm });

        const kb = shaper.shape(text, { direction });
        const ref = harfbuzz(file, text, direction === 'rtl');
        const drop = (g: { cluster: number }) => ({ ...g, cluster: 0 });

        expect(kb.map(drop)).toEqual(ref.map(drop));
        // HarfBuzz merges a mark into its base's cluster, kb_text_shape keeps the mark's own offset
        kb.forEach((g, i) => {
            expect(g.cluster).toBeGreaterThanOrEqual(ref[i].cluster);
            expect(text.slice(ref[i].cluster, g.cluster)).not.toMatch(/\s/);
        });
    });

    it('hashes the font as the compiler does', async () => {
        const bytes = font('NotoSans-Regular.ttf');
        const shaper = await createKbShaper(bytes, { wasm });

        expect(shaper.fontHash).toBe(fontHash(bytes));
        expect(shaper.unitsPerEm).toBe(1000);
    });

    it('gives clusters as UTF-16 offsets past astral characters', async () => {
        const shaper = await createKbShaper(font('NotoSans-Regular.ttf'), { wasm });
        const glyphs = shaper.shape('a\u{1d400}b', { direction: 'ltr' });

        expect(glyphs.map((g) => g.cluster)).toEqual([0, 1, 3]);
    });

    it('orders a mixed paragraph visually', async () => {
        const shaper = await createKbShaper(font('NotoSansHebrew-Regular.ttf'), { wasm });
        // "abc" then Hebrew: in an LTR paragraph the Hebrew run is reversed after the Latin one
        const glyphs = shaper.shape('ab אב', { direction: 'ltr' });

        expect(glyphs.map((g) => g.cluster)).toEqual([0, 1, 2, 4, 3]);
    });

    it('shapes many times without growing memory', async () => {
        const shaper = await createKbShaper(font('NotoSansArabic-Regular.ttf'), { wasm });
        const memory = (shaper as unknown as { _kb: { memory: WebAssembly.Memory } })._kb.memory;

        shaper.shape('مرحبا', { direction: 'rtl' });
        const before = memory.buffer.byteLength;

        for (let i = 0; i < 5000; i++) shaper.shape('مرحبا بالعالم', { direction: 'rtl' });
        expect(memory.buffer.byteLength).toBe(before);
    });
});

describe('outlines', () => {
    it('reads simple and composite glyphs', () => {
        const tables = readFont(font('NotoSans-Regular.ttf'));
        const shaperless = (cp: string) => {
            // cmap is not parsed here: take glyph ids from HarfBuzz
            return harfbuzz('NotoSans-Regular.ttf', cp, false)[0].glyph;
        };
        const o = tables.outline(shaperless('o'));
        const eacute = tables.outline(shaperless('é'));

        expect(o).toHaveLength(2);
        // e plus the acute accent as a composite
        expect(eacute.length).toBeGreaterThanOrEqual(3);
        expect(tables.outline(shaperless(' '))).toEqual([]);
    });

    it('fills a square with exact coverage', () => {
        const alpha = fillContours(
            [
                [
                    { x: 2, y: 2 },
                    { x: 6, y: 2 },
                    { x: 6, y: 6.5 },
                    { x: 2, y: 6.5 },
                ],
            ],
            8,
            8,
        );

        expect(alpha[3 * 8 + 3]).toBe(255);
        expect(alpha[1 * 8 + 3]).toBe(0);
        expect(alpha[6 * 8 + 3]).toBe(128);
        expect(alpha[3 * 8 + 7]).toBe(0);
    });

    it('throws on a font without glyf outlines', () => {
        const bytes = font('NotoSans-Regular.ttf').slice();
        const view = new DataView(bytes.buffer);

        // rename the glyf table entry in the directory
        for (let i = 0; i < view.getUint16(4); i++) {
            const at = 12 + i * 16;

            if (String.fromCharCode(...bytes.subarray(at, at + 4)) === 'glyf') bytes.set([67, 70, 70, 32], at);
        }
        expect(() => readFont(bytes)).toThrow(/glyf/);
    });
});

describe('ShapedTextProvider', () => {
    const slot = (value: string) => ({ value, size: 20, style: {}, row: 3, width: 0, height: 24, baseline: 19 });

    it('measures with the font advances', async () => {
        const text = await createShapedText({ font: font('NotoSans-Regular.ttf'), wasm });
        const advance = harfbuzz('NotoSans-Regular.ttf', 'Lena', false).reduce((a, g) => a + g.advance, 0);

        expect(text.measure('Lena', 20, {})).toBeCloseTo((advance * 20) / 1000, 6);
        expect(text.measure('Lena', 20, { letterSpacing: 0.1 })).toBeCloseTo((advance * 20) / 1000 + 8, 6);
    });

    it('draws a run sprite with ink inside and the edge at 0.5', async () => {
        const text = await createShapedText({ font: font('NotoSansArabic-Regular.ttf'), wasm });
        const sprite = await text.draw(slot('محمد'));

        expect(sprite.width % 4).toBe(0);
        expect(sprite.pixels).toHaveLength(sprite.width * sprite.height);
        expect(sprite.row).toBe(3);
        expect(sprite.scale).toBe(2);
        expect(Math.max(...sprite.pixels)).toBeGreaterThan(160);
        expect(sprite.pixels[0]).toBe(0);
        const edge = [...sprite.pixels].filter((p) => p > 100 && p < 155).length;

        expect(edge).toBeGreaterThan(20);
    });

    it('sends values with missing glyphs to the fallback', async () => {
        const calls: string[] = [];
        const fallback = {
            measure: (value: string) => {
                calls.push(`measure ${value}`);
                return 7;
            },
            draw: (s: { value: string }) => {
                calls.push(`draw ${s.value}`);
                return {
                    width: 4,
                    height: 1,
                    pixels: new Uint8Array(4),
                    range: 1,
                    scale: 1,
                    left: 0,
                    top: 0,
                    row: 0,
                    size: 1,
                };
            },
        };
        const text = await createShapedText({ font: font('NotoSans-Regular.ttf'), wasm, fallback });

        expect(text.covers('Lena')).toBe(true);
        expect(text.covers('Lena א')).toBe(false);
        expect(text.measure('א', 20, {})).toBe(7);
        text.draw(slot('א'));
        text.draw(slot('Lena'));
        expect(calls).toEqual(['measure א', 'draw א']);
    });

    it('finds the bundle face of its font, and warns when there is none', async () => {
        const text = await createShapedText({ font: font('NotoSans-Regular.ttf'), wasm });
        const hash = text.shaper.fontHash;
        const bundle = (h: string) =>
            ({ locale: 'en', faces: new Map([[0, { id: 0, hash: h }]]) }) as unknown as Parameters<
                typeof text.checkBundle
            >[0];
        const warn = console.warn;
        const warned: string[] = [];

        console.warn = (m: string) => warned.push(m);
        try {
            expect(text.checkBundle(bundle(hash))?.id).toBe(0);
            expect(text.checkBundle(bundle('0000000000000000'))).toBeUndefined();
        } finally {
            console.warn = warn;
        }
        expect(warned).toHaveLength(1);
    });
});
