/**
 * Measures the open format questions of docs/v2/DECISIONS.md:
 *
 * - D11, atlas pages: PNG (what ships) against lossless WebP and KTX2-style raw pixels with Zstd
 *   supercompression, each as the browser downloads it.
 * - D12, the RUNS columns: plain i16 clusters against delta-encoded ones, after brotli.
 *
 * Uses the shop example and fixtures/world (31 locales, every script group).
 *
 *   pnpm --filter @pixi-silk/compiler build && node scripts/measure-formats.ts
 */
import { createRequire } from 'node:module';
import { brotliCompressSync, constants, zstdCompressSync } from 'node:zlib';
import { compileProject, loadProject } from '@pixi-silk/compiler';

const fixtures = new URL('../fixtures/', import.meta.url).pathname;
// sharp is a dependency of the docs site, used here only to encode lossless WebP
const sharp = createRequire(new URL('../../../apps/site/package.json', import.meta.url))('sharp');
const kb = (n: number) => `${(n / 1024).toFixed(1)} kB`;
const brotli = (b: Uint8Array) => brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;

for (const [name, config, strings] of [
    ['shop', 'silk.config.json', 'strings.xlsx'],
    ['world', 'world/silk.config.json', 'world/strings.xlsx'],
] as const) {
    const project = await loadProject({
        config: fixtures + config,
        strings: fixtures + strings,
        theme: `${fixtures}theme.json`,
    });
    const result = compileProject(project);
    let png = 0;
    let webp = 0;
    let ktx2 = 0;

    for (const page of result.atlas.pages) {
        const raw = await sharp(Buffer.from(page.png)).raw().toBuffer();

        png += page.png.length;
        webp += (await sharp(Buffer.from(page.png)).webp({ lossless: true, effort: 6 }).toBuffer()).length;
        // KTX2 header and level index are about 100 bytes; the payload is the raw RGB(A) with Zstd level 19
        ktx2 += 100 + zstdCompressSync(raw, { params: { [constants.ZSTD_c_compressionLevel]: 19 } }).length;
    }
    console.log(
        `${name}: ${result.atlas.pages.length} pages  PNG ${kb(png)}  WebP lossless ${kb(webp)}  KTX2 raw+Zstd ${kb(ktx2)}`,
    );

    // D12: the cluster column of every bundle, plain and delta-encoded, inside the whole bundle
    let plain = 0;
    let delta = 0;

    for (const bytes of result.bundles.values()) {
        const { readBundle } = await import('pixi-silk/i18n');
        const data = readBundle(bytes.slice().buffer as ArrayBuffer);
        const clusters = data.runs.cluster;
        const d = new Uint16Array(clusters.length);

        for (let i = 0; i < clusters.length; i++) d[i] = (clusters[i] - (i ? clusters[i - 1] : 0)) & 0xffff;
        const swap = new Uint8Array(bytes.length);

        swap.set(bytes);
        swap.set(new Uint8Array(d.buffer), clusters.byteOffset);
        plain += brotli(bytes);
        delta += brotli(swap);
    }
    console.log(`${name}: bundles after brotli  plain clusters ${kb(plain)}  delta clusters ${kb(delta)}`);
}
