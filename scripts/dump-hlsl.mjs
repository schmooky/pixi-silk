#!/usr/bin/env node
/**
 * Diagnostic for the Windows workflow. Compiles the SilkGraphics GLSL program in Chrome and writes
 * what ANGLE translated it to (HLSL on the Direct3D backends) into the output folder, with the
 * compile and link logs and how long a first draw took. FXC can then compile the HLSL on its own and
 * print the error that Chrome only reports as "Error compiling dynamic pixel executable".
 *
 * usage: pnpm --filter pixi-silk build && node scripts/dump-hlsl.mjs [--out=hlsl] [--no-draw]
 * Takes CHROME_PATH and CHROME_ARGS like check-render.mjs.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outArg = process.argv.find((a) => a.startsWith('--out='));
const out = resolve(outArg ? outArg.slice(6) : 'hlsl');

const draw = !process.argv.includes('--no-draw');
const page = /* html */ `<!doctype html>
<meta charset="utf-8">
<script type="importmap">
{ "imports": { "pixi.js": "/packages/pixi-silk/node_modules/pixi.js/dist/pixi.mjs" } }
</script>
<script type="module">
import { fragment, vertex } from '/packages/pixi-silk/dist/shader.js';
const DRAW = ${draw};

const canvas = document.createElement('canvas');
const gl = canvas.getContext('webgl2');
const dbg = gl.getExtension('WEBGL_debug_shaders');
const report = { renderer: gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) };
// Pixi adds the precision lines after #version, as GlProgram does with preferred precision highp
const withPrecision = (src) =>
    src.replace('#version 300 es', '#version 300 es\\nprecision highp float;\\nprecision highp int;\\nprecision highp sampler2D;');
const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, withPrecision(src));
    gl.compileShader(s);
    return s;
};
let t = performance.now();
const vs = compile(gl.VERTEX_SHADER, vertex);
const fs = compile(gl.FRAGMENT_SHADER, fragment);
const prog = gl.createProgram();
gl.attachShader(prog, vs);
gl.attachShader(prog, fs);
gl.linkProgram(prog);
report.linked = gl.getProgramParameter(prog, gl.LINK_STATUS);
report.linkMs = Math.round(performance.now() - t);
report.vertexLog = gl.getShaderInfoLog(vs);
report.fragmentLog = gl.getShaderInfoLog(fs);
report.programLog = gl.getProgramInfoLog(prog);
report.vertexHlsl = dbg?.getTranslatedShaderSource(vs) ?? null;
report.fragmentHlsl = dbg?.getTranslatedShaderSource(fs) ?? null;
// the pixel shader is only compiled at the first draw on Direct3D 11
t = performance.now();
if (DRAW && report.linked) {
    // three vertices with every attribute at 0: a degenerate triangle, so no fragment runs
    gl.useProgram(prog);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.finish();
}
report.drawMs = Math.round(performance.now() - t);
report.glError = gl.getError();
report.contextLost = gl.isContextLost();
window.report = report;
</script>`;

const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html' };
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
const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
    args: process.env.CHROME_ARGS ? process.env.CHROME_ARGS.split(/\s+/).filter(Boolean) : [],
});
const tab = await browser.newPage();

tab.on('console', (m) => console.log(`console: ${m.text().slice(0, 400)}`));
await tab.goto(`http://127.0.0.1:${server.address().port}/`);
await tab.waitForFunction(() => window.report, null, { timeout: 180000 });
const report = await tab.evaluate(() => window.report);

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'fragment.hlsl'), report.fragmentHlsl ?? '');
writeFileSync(join(out, 'vertex.hlsl'), report.vertexHlsl ?? '');
const { fragmentHlsl, vertexHlsl, ...summary } = report;

console.log(JSON.stringify(summary, null, 1));
console.log(
    `dump-hlsl: fragment ${fragmentHlsl?.length ?? 0} chars, vertex ${vertexHlsl?.length ?? 0} chars, in ${out}`,
);
await browser.close();
server.close();
