#!/usr/bin/env node
/**
 * Renders a set of hard cases to pixels in headless Chrome and checks them. Unit tests run in node
 * without a GPU, so this is where the shader output itself is measured.
 *
 * usage: pnpm build && node scripts/check-render.mjs [--renderer=webgl|webgpu|both] [--out=dir] [--only=name]
 *
 * Each case draws one scene into a 1x render texture and reads it back. The checks:
 *  - `maxAlpha`: a translucent stroke or fill must never be darker than its own alpha, so any place
 *    it is painted twice (double blending) fails.
 *  - `interior`: pixels a full pixel inside the shape (by the CPU hit test, which follows the same
 *    geometry) must be fully opaque, and pixels a full pixel outside must be empty. Dim pixels fail.
 *  - `same`: two scenes that draw the same geometry in different ways must match.
 * With both renderers, every case is also compared between WebGL2 and WebGPU.
 *
 * Runs the installed Google Chrome (CHROME_PATH overrides) with WebGPU on. CHROME_ARGS replaces
 * the launch flags, which the Windows workflow uses to run WebGL2 on ANGLE's Direct3D 11 backend.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
        const [k, v = 'true'] = a.replace(/^--/, '').split('=');

        return [k, v];
    }),
);
const renderers = args.renderer === 'webgl' ? ['webgl'] : args.renderer === 'webgpu' ? ['webgpu'] : ['webgl', 'webgpu'];
const out = args.out ? resolve(args.out) : null;

const page = /* html */ `<!doctype html>
<meta charset="utf-8">
<title>render check</title>
<script type="importmap">
{ "imports": {
    "pixi.js": "/packages/pixi-silk/node_modules/pixi.js/dist/pixi.mjs",
    "pixi-silk": "/packages/pixi-silk/dist/index.js",
    "pixi-silk/webgpu": "/packages/pixi-silk/dist/webgpu.js"
} }
</script>
<script type="module" src="/scripts/render-cases.js"></script>`;

const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.map': 'application/json' };
const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');

    if (url.pathname === '/') {
        res.setHeader('content-type', 'text/html');
        res.end(page);

        return;
    }
    try {
        const file = join(root, decodeURIComponent(url.pathname));

        if (!file.startsWith(root)) throw new Error('outside');
        res.setHeader('content-type', types[extname(file)] ?? 'application/octet-stream');
        res.end(readFileSync(file));
    } catch {
        res.statusCode = 404;
        res.end();
    }
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const { port } = server.address();
const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    // CHROME_ARGS replaces the flags, for example `--use-angle=d3d11-warp` on Windows CI
    args: process.env.CHROME_ARGS
        ? process.env.CHROME_ARGS.split(/\s+/).filter(Boolean)
        : ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'],
});
const results = {};
let failed = 0;

for (const renderer of renderers) {
    const tab = await browser.newPage();
    const errors = [];

    tab.on('pageerror', (e) => errors.push(e.message));
    tab.on('console', (m) => {
        // a lost context logs as a warning, and the GL errors before it carry the compiler's reason
        if (/CONTEXT_LOST|GL_INVALID|not present in the shader/.test(m.text())) errors.push(m.text());
        else if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(m.text());
    });
    await tab.goto(`http://127.0.0.1:${port}/?renderer=${renderer}`);
    await tab.waitForFunction(() => window.renderCases, null, { timeout: 20000 });
    const report = await tab.evaluate(({ only, png }) => window.renderCases({ only, png }), {
        only: args.only ?? null,
        png: out !== null,
    });

    results[renderer] = report;
    console.log(`check-render: ${renderer} (${report.renderer})`);
    for (const e of errors) console.log(`  error ${e}`);
    if (errors.length) failed++;
    for (const c of report.cases) {
        const ok = c.failures.length === 0;

        if (!ok) failed++;
        console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${c.name}${c.note ? `  ${c.note}` : ''}`);
        for (const f of c.failures) console.log(`       ${f}`);
        if (out && c.png) {
            mkdirSync(out, { recursive: true });
            writeFileSync(join(out, `${c.name}-${renderer}.png`), Buffer.from(c.png, 'base64'));
        }
    }
    await tab.close();
}

if (results.webgl && results.webgpu) {
    console.log('check-render: WebGL2 vs WebGPU');
    for (const a of results.webgl.cases) {
        const b = results.webgpu.cases.find((c) => c.name === a.name);

        if (!b) continue;
        const pa = Buffer.from(a.raw, 'base64');
        const pb = Buffer.from(b.raw, 'base64');
        let max = 0;
        let over = 0;

        for (let i = 0; i < pa.length; i++) {
            const d = Math.abs(pa[i] - pb[i]);

            max = Math.max(max, d);
            if (d > 2) over++;
        }
        const ok = max <= 8 && over <= pa.length * 1e-4;

        if (!ok) failed++;
        console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${a.name}  max diff ${max}, ${over} channels over 2`);
    }
}
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
