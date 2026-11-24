/**
 * Compares the runtime shaper candidates (docs/v2/DECISIONS.md D10): kb_text_shape built to WASM
 * (packages/shaper-kb/wasm) and HarfBuzz (the harfbuzzjs WASM): compressed size, agreement on the
 * shaping corpus (Arabic with and without marks, Hebrew, Latin), and speed.
 *
 *   node scripts/measure-shapers.ts
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { brotliCompressSync, constants } from 'node:zlib';
import * as hb from 'harfbuzzjs';

const fonts = new URL('../fixtures/fonts/', import.meta.url);
const kbWasm = readFileSync(new URL('../../shaper-kb/wasm/kb.wasm', import.meta.url));
const hbWasm = readFileSync(createRequire(import.meta.url).resolve('harfbuzzjs/dist/harfbuzz.wasm'));
const br = (b: Uint8Array) =>
    (brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length / 1024).toFixed(1);

console.log(`size: kb_text_shape ${br(kbWasm)} kB brotli, HarfBuzz (harfbuzzjs) ${br(hbWasm)} kB brotli`);

interface Kb {
    memory: WebAssembly.Memory;
    kb_alloc(n: number): number;
    kb_init(font: number, size: number): number;
    kb_shape(cps: number, count: number, dir: number, out: number, max: number): number;
}

function kbShaper(file: string) {
    const e = new WebAssembly.Instance(new WebAssembly.Module(kbWasm), {}).exports as unknown as Kb;
    const bytes = new Uint8Array(readFileSync(new URL(file, fonts)));
    const font = e.kb_alloc(bytes.length);

    new Uint8Array(e.memory.buffer, font, bytes.length).set(bytes);
    if (!e.kb_init(font, bytes.length)) throw new Error(`kb_init failed for ${file}`);
    const cps = e.kb_alloc(4096 * 4);
    const out = e.kb_alloc(4096 * 6 * 4);

    return (text: string, dir: number) => {
        const points = [...text].map((c) => c.codePointAt(0) ?? 0);

        new Int32Array(e.memory.buffer, cps, points.length).set(points);
        const n = e.kb_shape(cps, points.length, dir, out, 4096);
        const o = new Int32Array(e.memory.buffer, out, n * 6);

        return Array.from({ length: n }, (_, i) => [o[i * 6], o[i * 6 + 2]] as [number, number]);
    };
}

function hbShaper(file: string) {
    const font = new hb.Font(new hb.Face(new hb.Blob(readFileSync(new URL(file, fonts)))));

    return (text: string, dir: number) => {
        const b = new hb.Buffer();

        b.addText(text);
        b.guessSegmentProperties();
        b.setDirection(dir === 2 ? hb.Direction.RTL : hb.Direction.LTR);
        hb.shape(font, b);
        return b.getGlyphInfosAndPositions().map((g) => [g.codepoint, g.xAdvance ?? 0] as [number, number]);
    };
}

const corpus: [string, string, number][] = [
    ['NotoSans-Regular.ttf', 'Hello, world! Office fit', 1],
    ['NotoSansArabic-Regular.ttf', 'مرحبا بالعالم', 2],
    ['NotoSansArabic-Regular.ttf', 'مَرْحَبًا بِكُمْ', 2],
    ['NotoSansArabic-Regular.ttf', 'لديك عملات ذهبية لا لأ', 2],
    ['NotoSansHebrew-Regular.ttf', 'שלום עולם', 2],
];

for (const [file, text, dir] of corpus) {
    const k = kbShaper(file)(text, dir);
    const h = hbShaper(file)(text, dir);
    const same = JSON.stringify(k) === JSON.stringify(h);

    console.log(`${same ? 'same     ' : 'DIFFERENT'} ${file.replace('-Regular.ttf', '')}: ${text}`);
    if (!same) console.log(`  kb ${JSON.stringify(k)}\n  hb ${JSON.stringify(h)}`);
}
// speed: a 40-character Arabic name, many times
const name = 'محمد بن عبد الله العربي';
const kb = kbShaper('NotoSansArabic-Regular.ttf');
const hbs = hbShaper('NotoSansArabic-Regular.ttf');

for (const [label, fn] of [
    ['kb_text_shape', kb],
    ['HarfBuzz', hbs],
] as const) {
    for (let i = 0; i < 200; i++) fn(name, 2);
    const t0 = performance.now();

    for (let i = 0; i < 2000; i++) fn(name, 2);
    console.log(`speed: ${label} ${(((performance.now() - t0) * 1000) / 2000).toFixed(1)} us per name`);
}
