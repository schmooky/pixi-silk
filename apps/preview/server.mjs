#!/usr/bin/env node
/**
 * The pixi-silk/i18n preview (brief sec. 2.1, M7). Compiles the sheet in memory on start and on
 * every save of the sheet, the theme or the config, and serves a page that renders every message
 * with pixi-silk, lists lint errors by cell, and edits the theme live (paint properties) with a
 * button that writes theme.json back.
 *
 *   pnpm --filter @pixi-silk/compiler build && pnpm --filter pixi-silk build
 *   node apps/preview/server.mjs --config silk.config.json --strings strings.xlsx --theme theme.json [--port 5179]
 */
import { readFileSync, watch, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { compileProject, formatDiagnostic, loadProject } from '@pixi-silk/compiler';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, '../../packages/compiler/fixtures');
const { values: o } = parseArgs({
    options: {
        config: { type: 'string', default: join(fixtures, 'silk.config.json') },
        strings: { type: 'string', default: join(fixtures, 'strings.xlsx') },
        theme: { type: 'string', default: join(fixtures, 'theme.json') },
        port: { type: 'string', default: '5179' },
    },
});
const silkDist = resolve(here, 'node_modules/pixi-silk/dist');
const pixiDist = resolve(here, 'node_modules/pixi-silk/node_modules/pixi.js/dist');
let state = { version: 0, files: new Map(), json: '{}' };

async function compile() {
    const t0 = performance.now();
    const project = await loadProject({ config: o.config, strings: o.strings, theme: o.theme });
    const result = compileProject(project);
    const files = new Map();

    for (const [name, bytes] of result.bundles) files.set(`/i18n/${name}.silk`, bytes);
    for (const page of result.atlas.pages) files.set(`/i18n/atlas/${page.file}`, page.png);
    files.set('/i18n/theme.json', readFileSync(o.theme));
    const messages = [...project.catalog.messages.values()].map((m) => ({
        key: m.key,
        context: m.context,
        slots: m.slots.map((s) => ({ name: s.name, type: s.type })),
        locales: Object.keys(m.locales),
    }));
    const diagnostics = result.diagnostics.map((d) => ({ ...d, line: formatDiagnostic(d) }));

    state = {
        version: state.version + 1,
        files,
        json: JSON.stringify({
            version: state.version + 1,
            locales: Object.keys(project.config.locales),
            bundles: [...result.bundles.keys()],
            messages,
            diagnostics,
            ms: Math.round(performance.now() - t0),
        }),
    };
    console.log(`preview: compiled in ${Math.round(performance.now() - t0)} ms, ${diagnostics.length} diagnostics`);
}

await compile();
let timer = null;

for (const file of [o.config, o.strings, o.theme]) {
    watch(file, () => {
        clearTimeout(timer);
        timer = setTimeout(() => compile().catch((e) => console.error(`preview: ${e.message}`)), 150);
    });
}
const types = {
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.html': 'text/html',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
};
const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const send = (body, type) => {
        res.setHeader('content-type', type);
        res.setHeader('cache-control', 'no-store');
        res.end(body);
    };

    try {
        if (url.pathname === '/state.json') return send(state.json, 'application/json');
        if (url.pathname === '/theme.json' && req.method === 'POST') {
            let body = '';

            req.on('data', (c) => (body += c));
            req.on('end', () => {
                JSON.parse(body);
                writeFileSync(o.theme, `${JSON.stringify(JSON.parse(body), null, 2)}\n`);
                send('{"ok":true}', 'application/json');
            });
            return;
        }
        const file = state.files.get(url.pathname);

        if (file) return send(file, types[extname(url.pathname)] ?? 'application/octet-stream');
        const roots = [
            ['/lib/pixi-silk/', silkDist],
            ['/lib/pixi/', pixiDist],
            ['/', join(here, 'public')],
        ];
        for (const [prefix, dir] of roots) {
            if (!url.pathname.startsWith(prefix)) continue;
            const path = join(dir, decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html');

            if (!path.startsWith(dir)) break;
            return send(readFileSync(path), types[extname(path)] ?? 'application/octet-stream');
        }
        res.statusCode = 404;
        res.end();
    } catch {
        res.statusCode = 404;
        res.end();
    }
});

server.listen(Number(o.port), '127.0.0.1', () => console.log(`preview: http://127.0.0.1:${o.port}/`));
