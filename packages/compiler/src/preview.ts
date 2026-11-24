import { readFileSync, watch, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeAtlasPages } from './atlas/pack';
import { formatDiagnostic } from './author/lint';
import { compileProject } from './compile';
import { loadProject } from './project';

/** Options of {@link startPreview}. */
export interface PreviewOptions {
    /** Path of silk.config.json. */
    config: string;
    /** Path of the strings sheet. */
    strings: string;
    /** Path of theme.json. Saving the theme in the page writes it back. */
    theme: string;
    /** Port on 127.0.0.1. Default 5179. */
    port?: number;
}

const TYPES: Record<string, string> = {
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.html': 'text/html',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.webp': 'image/webp',
};

/** The folder of an installed package, found from its resolved entry file. */
function packageDir(entry: string, name: string): string {
    let dir = dirname(entry);

    while (dir !== dirname(dir)) {
        try {
            if (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name === name) return dir;
        } catch {
            // not a package folder
        }
        dir = dirname(dir);
    }
    throw new Error(`silk preview: cannot find the ${name} package`);
}

/**
 * The preview (`silk preview`, brief sec. 2.1): compiles the sheet in memory on start and on every
 * save of the sheet, the theme or the config, and serves a page on 127.0.0.1 that renders every
 * message with pixi-silk, lists lint problems by cell, and edits the theme's paint properties live.
 * Needs `pixi-silk` and `pixi.js` installed next to the compiler.
 */
export async function startPreview(options: PreviewOptions): Promise<Server> {
    const pages = fileURLToPath(new URL('../preview/', import.meta.url));
    const silkEntry = fileURLToPath(import.meta.resolve('pixi-silk'));
    const silkDist = join(packageDir(silkEntry, 'pixi-silk'), 'dist');
    const pixiDist = join(packageDir(createRequire(silkEntry).resolve('pixi.js'), 'pixi.js'), 'dist');
    let state = { version: 0, files: new Map<string, Uint8Array>(), json: '{}' };

    const compile = async () => {
        const t0 = performance.now();
        const project = await loadProject(options);
        const result = compileProject(project);
        const files = new Map<string, Uint8Array>();

        for (const [name, bytes] of result.bundles) files.set(`/i18n/${name}.silk`, bytes);
        for (const [file, bytes] of await encodeAtlasPages(result.atlas)) files.set(`/i18n/atlas/${file}`, bytes);
        files.set('/i18n/theme.json', new Uint8Array(readFileSync(options.theme)));
        const version = state.version + 1;

        state = {
            version,
            files,
            json: JSON.stringify({
                version,
                locales: Object.keys(project.config.locales),
                bundles: [...result.bundles.keys()],
                messages: [...project.catalog.messages.values()].map((m) => ({
                    key: m.key,
                    context: m.context,
                    slots: m.slots.map((s) => ({ name: s.name, type: s.type })),
                    locales: Object.keys(m.locales),
                })),
                diagnostics: result.diagnostics.map((d) => ({ ...d, line: formatDiagnostic(d) })),
                ms: Math.round(performance.now() - t0),
            }),
        };
        console.log(
            `silk preview: compiled in ${Math.round(performance.now() - t0)} ms, ${result.diagnostics.length} diagnostics`,
        );
    };

    await compile();
    let timer: ReturnType<typeof setTimeout> | undefined;

    for (const file of [options.config, options.strings, options.theme]) {
        watch(file, () => {
            clearTimeout(timer);
            timer = setTimeout(
                () => compile().catch((e) => console.error(`silk preview: ${(e as Error).message}`)),
                150,
            );
        });
    }
    const server = createServer((req, res) => {
        const url = new URL(req.url ?? '/', 'http://x');
        const send = (body: string | Uint8Array, type: string) => {
            res.setHeader('content-type', type);
            res.setHeader('cache-control', 'no-store');
            res.end(body);
        };

        try {
            if (url.pathname === '/state.json') return send(state.json, 'application/json');
            if (url.pathname === '/theme.json' && req.method === 'POST') {
                let body = '';

                req.on('data', (c) => {
                    body += c;
                });
                req.on('end', () => {
                    writeFileSync(options.theme, `${JSON.stringify(JSON.parse(body), null, 2)}\n`);
                    send('{"ok":true}', 'application/json');
                });
                return;
            }
            const file = state.files.get(url.pathname);

            if (file) return send(file, TYPES[extname(url.pathname)] ?? 'application/octet-stream');
            for (const [prefix, dir] of [
                ['/lib/pixi-silk/', silkDist],
                ['/lib/pixi/', pixiDist],
                ['/', pages],
            ] as const) {
                if (!url.pathname.startsWith(prefix)) continue;
                const path = join(dir, decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html');

                if (!path.startsWith(dir)) break;
                return send(new Uint8Array(readFileSync(path)), TYPES[extname(path)] ?? 'application/octet-stream');
            }
            res.statusCode = 404;
            res.end();
        } catch {
            res.statusCode = 404;
            res.end();
        }
    });

    await new Promise<void>((done) => server.listen(options.port ?? 5179, '127.0.0.1', done));
    console.log(`silk preview: http://127.0.0.1:${options.port ?? 5179}/`);

    return server;
}
