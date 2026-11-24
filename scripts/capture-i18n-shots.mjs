// Screenshots for the localized text guides: the i18n preview app with the shop sheet (Arabic) and
// with the Excel pitfalls sheet (lint problems by cell). Writes apps/site/public/docs-img/i18n/*.png.
//   pnpm build && pnpm --filter @pixi-silk/compiler build && node scripts/capture-i18n-shots.mjs
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const fixtures = new URL('../packages/compiler/fixtures/', import.meta.url).pathname;
const out = new URL('../apps/site/public/docs-img/i18n/', import.meta.url).pathname;
const server = (strings, port) =>
    spawn(
        'node',
        [
            new URL('../packages/compiler/dist/cli.mjs', import.meta.url).pathname,
            'preview',
            '--config',
            `${fixtures}silk.config.json`,
            '--theme',
            `${fixtures}theme.json`,
            '--strings',
            `${fixtures}${strings}`,
            '--port',
            String(port),
        ],
        {
            stdio: ['ignore', 'pipe', 'inherit'],
        },
    );

mkdirSync(out, { recursive: true });
const shop = server('strings.xlsx', 5191);
const pitfalls = server('pitfalls.xlsx', 5192);

await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
});
const page = await browser.newPage({ viewport: { width: 1180, height: 620 }, deviceScaleFactor: 2 });

await page.goto('http://127.0.0.1:5191/?locale=ar');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}preview-ar.png` });
await page.goto('http://127.0.0.1:5192/?locale=en');
await page.waitForTimeout(2500);
await page.locator('aside').screenshot({ path: `${out}lint-by-cell.png` });
await browser.close();
shop.kill();
pitfalls.kill();
console.log(`capture-i18n-shots: wrote ${out}`);
