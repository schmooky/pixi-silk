#!/usr/bin/env node
/**
 * The v2 text definition of done (brief sec. 11): the example shop screen (English and Arabic,
 * counter, player name, terms link, coin icon) runs from baked data, with no font file and no
 * shaper downloaded. Loads it in headless Chrome on WebGL2 and WebGPU, then checks the network log
 * and that every message drew something.
 *
 * usage: pnpm build && node scripts/check-i18n.mjs [--out=dir]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv.find((a) => a.startsWith('--out='))?.slice(6);
const page = /* html */ `<!doctype html>
<meta charset="utf-8">
<title>i18n check</title>
<body style="margin:0;background:#111">
<script type="importmap">
{ "imports": { "pixi.js": "/packages/pixi-silk/node_modules/pixi.js/dist/pixi.mjs" } }
</script>
<script type="module">
import { Application, Assets, extensions, Graphics } from 'pixi.js';
import { Silk, SilkMessage, silkBundleLoader } from '/packages/pixi-silk/dist/i18n-pixi.js';
import { enableWebGPU } from '/packages/pixi-silk/dist/webgpu.js';

const preference = new URLSearchParams(location.search).get('renderer') ?? 'webgl';

if (preference === 'webgpu') enableWebGPU();
const app = new Application();

await app.init({ preference, width: 720, height: 360, background: 0x111113, antialias: false, resolution: 1 });
document.body.appendChild(app.canvas);
extensions.add(silkBundleLoader);
const silk = await Silk.create({ renderer: app.renderer, dynamicText: { mode: 'canvas' } });
const base = '/apps/site/public/i18n';
const [en, ar, theme] = await Promise.all([
    Assets.load(base + '/en.silk'),
    Assets.load(base + '/ar.silk'),
    fetch(base + '/theme.json').then((r) => r.json()),
]);

await silk.addBundle(en);
await silk.addBundle(ar);
const coin = new Graphics().circle(32, 32, 30).fill('#FFC53D');

silk.registerInline({ coin: { texture: app.renderer.generateTexture(coin), size: '1.1em' } });
const t = silk.createTheme(theme);
const drawn = [];

for (const [i, locale] of ['en', 'ar'].entries()) {
    const set = await silk.prepare({
        locale,
        theme: t,
        defaults: { size: 24, maxWidth: 320 },
        messages: {
            title: { key: 'shop.title', size: 40 },
            greeting: { key: 'player.greeting', values: { name: locale === 'ar' ? 'Alex' : '\\u0644\\u064a\\u0644\\u0649' } },
            coins: { key: 'shop.coins', values: { count: 1250 } },
            terms: { key: 'shop.terms', size: 18 },
        },
    });

    for (const [j, name] of ['title', 'greeting', 'coins', 'terms'].entries()) {
        const m = new SilkMessage(set.get(name));

        m.position.set(24 + i * 352, 24 + j * 80);
        app.stage.addChild(m);
        drawn.push({ locale, name, instances: m.instanceCount, text: m.accessibleText });
    }
}
app.render();
await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 50)));
app.render();
window.result = { renderer: app.renderer.name, drawn, png: app.canvas.toDataURL('image/png') };
</script>`;

const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
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
    args: process.env.CHROME_ARGS
        ? process.env.CHROME_ARGS.split(/\s+/).filter(Boolean)
        : ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'],
});
const FORBIDDEN = /\.(ttf|otf|woff2?|wasm)(\?|$)/i;
let failed = 0;

for (const renderer of ['webgl', 'webgpu']) {
    const tab = await browser.newPage();
    const requests = [];
    const errors = [];

    tab.on('request', (r) => requests.push(r.url()));
    tab.on('pageerror', (e) => errors.push(e.message));
    // failed loads are reported by URL below; the console line does not name the file
    tab.on(
        'console',
        (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()),
    );
    tab.on('response', (r) => {
        if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) errors.push(`HTTP ${r.status()} ${r.url()}`);
    });
    await tab.goto(`http://127.0.0.1:${port}/?renderer=${renderer}`);
    const result = await tab.waitForFunction(() => window.result, null, { timeout: 30000 }).then((h) => h.jsonValue());
    const fonts = requests.filter((u) => FORBIDDEN.test(u));
    const empty = result.drawn.filter((d) => d.instances === 0);
    const problems = [
        ...fonts.map((u) => `downloaded ${u.replace(`http://127.0.0.1:${port}`, '')}`),
        ...empty.map((d) => `${d.locale} ${d.name} drew nothing`),
        ...errors,
    ];

    const worker = requests.some((u) => u.endsWith('/canvas-worker.js'));

    console.log(
        `check-i18n: ${renderer} (${result.renderer}), ${requests.length} requests, ${result.drawn.length} messages, name sprites ${worker ? 'in a worker' : 'on the main thread'}`,
    );
    for (const d of result.drawn)
        console.log(`  ${d.locale} ${d.name.padEnd(8)} ${String(d.instances).padStart(3)} instances  ${d.text}`);
    for (const p of problems) console.log(`  FAIL ${p}`);
    if (!problems.length) console.log('  ok   no font file and no shaper downloaded');
    failed += problems.length;
    if (out) writeFileSync(join(out, `i18n-shop-${renderer}.png`), Buffer.from(result.png.split(',')[1], 'base64'));
    await tab.close();
}
await browser.close();
server.close();
process.exitCode = failed ? 1 : 0;
