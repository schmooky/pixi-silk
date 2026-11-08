#!/usr/bin/env node
/**
 * Captures the card thumbnails of the hubs, the docs index and the home page into public/thumbs/.
 *
 * - `<demo>.webp`: every live demo, from the first docs page that runs it. A page's card shows the
 *   thumbnail of its first demo, so moving a page or renaming its slug keeps its picture.
 * - `lab-<slug>.webp`: every lab experiment, full screen.
 * - `studio.webp`: Studio with its default entry.
 *
 * Needs a built site (`pnpm build`) and Google Chrome: WebGL in headless Chromium without a GPU
 * is too slow or missing, so it drives the installed Chrome (`channel: 'chrome'`).
 *
 * usage: node scripts/capture-thumbs.mjs [--base http://127.0.0.1:4321] [--only name,name] [--skip-lab]
 *        Without --base it serves dist/ itself.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// biome-ignore lint/correctness/noUndeclaredDependencies: a dev tool, playwright-core comes from the workspace root
import { chromium } from 'playwright-core';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(here, '../dist');
const OUT = path.resolve(here, '../public/thumbs');
const WIDTH = 640;
const HEIGHT = 400;

const args = process.argv.slice(2);
const flag = (name) => {
    const i = args.indexOf(name);

    return i >= 0 ? args[i + 1] : undefined;
};
const only = flag('--only')?.split(',');
const skipLab = args.includes('--skip-lab');

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.error('capture-thumbs: no dist/. Run `pnpm --filter @pixi-silk/site build` first.');
    process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });

// --------------------------------------------------------------------------- a static server for dist/

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.jpg': 'image/jpeg',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.wasm': 'application/wasm',
    '.txt': 'text/plain',
};

function serve() {
    const server = http.createServer((req, res) => {
        const url = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
        let file = path.join(DIST, url);

        if (!file.startsWith(DIST)) {
            res.writeHead(403).end();

            return;
        }
        if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
        if (!fs.existsSync(file)) {
            res.writeHead(404).end();

            return;
        }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
        fs.createReadStream(file).pipe(res);
    });

    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const server = flag('--base') ? null : await serve();
const BASE = flag('--base') ?? `http://127.0.0.1:${server.address().port}`;

// --------------------------------------------------------------------------- what to capture

const docsDir = path.join(DIST, 'docs');
/** demo name -> the first docs page that runs it */
const demoHome = new Map();

for (const slug of fs.readdirSync(docsDir).sort()) {
    const file = path.join(docsDir, slug, 'index.html');

    if (!fs.existsSync(file)) continue;
    for (const m of fs.readFileSync(file, 'utf8').matchAll(/<figure[^>]*\bdata-demo="([^"]+)"/g)) {
        if (!demoHome.has(m[1])) demoHome.set(m[1], `/docs/${slug}/`);
    }
}
const labs = fs.existsSync(path.join(DIST, 'lab'))
    ? fs.readdirSync(path.join(DIST, 'lab')).filter((s) => {
          const file = path.join(DIST, 'lab', s, 'index.html');

          // a removed experiment leaves a redirect page behind
          return fs.existsSync(file) && !/<meta http-equiv="refresh"/i.test(fs.readFileSync(file, 'utf8'));
      })
    : [];
const wanted = (name) => !only || only.includes(name);

async function save(png, name) {
    await sharp(png)
        .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'centre' })
        .webp({ quality: 80 })
        .toFile(path.join(OUT, name));
}

// --------------------------------------------------------------------------- capture

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    colorScheme: 'dark',
});
const page = await context.newPage();
const failed = [];
let done = 0;

// demos, grouped by the page that runs them, in a 16:10 frame so the card crops nothing
const byPage = new Map();

for (const [demo, href] of demoHome) if (wanted(demo)) byPage.set(href, [...(byPage.get(href) ?? []), demo]);

for (const [href, demos] of byPage) {
    await page.goto(BASE + href, { waitUntil: 'load' });
    // a widened frame can reach under the sticky header and the on-this-page column
    await page.addStyleTag({ content: 'header, aside { visibility: hidden !important; }' });
    for (const demo of demos) {
        try {
            const figure = page.locator(`figure[data-demo="${demo}"]`).first();
            const host = figure.locator('[role="img"]').first();

            await figure.evaluate((el) => {
                const frame = el.querySelector('[role="img"]');
                const h = frame?.getBoundingClientRect().height ?? 280;

                el.style.width = `${Math.round(h * 1.6)}px`;
                el.style.maxWidth = 'none';
                // the Studio chip is chrome, not part of the picture
                for (const chip of el.querySelectorAll('.demo-chip')) chip.style.display = 'none';
            });
            await figure.scrollIntoViewIfNeeded();
            await host.locator('canvas').first().waitFor({ timeout: 20000 });
            await page.waitForFunction((el) => el?.hasAttribute('data-live'), await host.elementHandle(), {
                timeout: 20000,
            });
            await page.waitForTimeout(1800);
            await save(await host.screenshot(), `${demo}.webp`);
            done++;
            console.log(`demo  ${demo}`);
        } catch (e) {
            failed.push(`${demo} (${href}): ${String(e).split('\n')[0]}`);
        }
    }
}

if (!skipLab) {
    for (const slug of labs) {
        if (!wanted(slug)) continue;
        try {
            await page.goto(`${BASE}/lab/${slug}/`, { waitUntil: 'load' });
            await page.waitForTimeout(3000);
            await save(await page.screenshot(), `lab-${slug}.webp`);
            done++;
            console.log(`lab   ${slug}`);
        } catch (e) {
            failed.push(`lab ${slug}: ${String(e).split('\n')[0]}`);
        }
    }
}

if (wanted('studio')) {
    try {
        await page.goto(`${BASE}/studio/`, { waitUntil: 'load' });
        await page.waitForTimeout(4000);
        await save(await page.screenshot(), 'studio.webp');
        done++;
        console.log('studio');
    } catch (e) {
        failed.push(`studio: ${String(e).split('\n')[0]}`);
    }
}

await browser.close();
server?.close();
console.log(`capture-thumbs: ${done} thumbnails in public/thumbs/`);
if (failed.length) {
    console.log(`capture-thumbs: ${failed.length} failed\n  ${failed.join('\n  ')}`);
    process.exitCode = 1;
}
