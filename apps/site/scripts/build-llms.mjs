#!/usr/bin/env node
/**
 * Generates the files for AI assistants in public/ (llmstxt.org format):
 *
 * - llms.txt           the index: facts, entry points, gotchas, every docs page.
 * - llms-full.txt      core, paint and rendering: SilkGraphics, createSilkApp, FillStyle and
 *                      StrokeStyle first, the guides, the rest of the API of those entry points, the FAQ.
 * - llms-ui.txt        text, layout, UI widgets and the editor kit: guides and their API.
 * - llms-examples.txt  whole screens: the example guides with every demo's source.
 *
 * Everything comes from the same sources as the site: nav.mjs (areas and pages, in reading
 * order), the docs collection, the demos, the TypeDoc pages and facts.mjs. Nothing names a page:
 * a page goes to llms-ui.txt when most of its code imports UI, text or layout entry points, and
 * to llms-examples.txt when its area is an examples area.
 *
 * Output is deterministic (sorted, no timestamps): the files are committed, and CI fails when
 * they are stale. Runs after `api:gen`, because the API pages are part of the output.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { ENTRY_AREAS, ENTRY_POINTS, FACTS, LLMS_SKIP_API, REQUIRES, SUMMARY } from '../src/content/facts.mjs';
import { FAQ } from '../src/content/faq.mjs';
import { DOCS_NAV, VISIBLE_AREAS } from '../src/content/nav.mjs';
import { apiBody, apiFrontmatter } from '../src/lib/api-md.mjs';
import { mdxToMarkdown } from '../src/lib/mdx-to-md.mjs';
import { SITE_URL } from '../src/lib/site-url.mjs';
import { ENTRIES, PKG } from './api-paths.mjs';

const DOCS = path.resolve('src/content/docs');
const DEMOS = path.resolve('src/demos');
const API = path.resolve('src/pages/api');
const REPO = 'https://github.com/schmooky/pixi-silk';
/** Demos longer than this are linked, not inlined, in llms-full.txt (its budget is about 60k tokens). */
const FULL_DEMO_LIMIT = 2200;

if (!fs.existsSync(API)) throw new Error('build-llms: src/pages/api is missing. Run `pnpm api:gen` first.');

const version = PKG.version;
const url = (p) => `${SITE_URL}${p}`;
const tokens = (text) => Math.round(text.length / 4);

function splitFrontmatter(text) {
    const m = text.match(/^---\n([\s\S]*?)\n---\n?/);

    return m ? { data: parseYaml(m[1]) ?? {}, body: text.slice(m[0].length) } : { data: {}, body: text };
}

const demoSource = (name) => {
    const file = path.join(DEMOS, `${name}.demo.ts`);

    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined;
};
const demoLink = (name) => `${REPO}/blob/main/apps/site/src/demos/${name}.demo.ts`;

// ---------------------------------------------------------------------------------- entry points

/** Which file an entry point's API goes to. */
const UI_AREAS = new Set(['text', 'layout', 'widgets', 'editor']);
const entryFile = (subpath) => (UI_AREAS.has(ENTRY_POINTS[subpath ? `./${subpath}` : '.']?.area) ? 'ui' : 'full');
const UI_SPECIFIERS = new Set(ENTRIES.filter((e) => entryFile(e.subpath) === 'ui').map((e) => e.specifier));

// ---------------------------------------------------------------------------------- docs

const areaOf = new Map(VISIBLE_AREAS.map((a) => [a.id, a]));
const docs = DOCS_NAV.flatMap((section) =>
    section.items.map((id) => {
        const { data, body } = splitFrontmatter(fs.readFileSync(path.join(DOCS, `${id}.mdx`), 'utf8'));
        const area = areaOf.get(section.id) ?? { id: section.id, title: section.title, summary: '' };

        return { id, area, title: data.title, description: data.description, body, file: bucket(area, body) };
    }),
);

/** `full`, `ui` or `examples`, from the page's area and the entry points its code imports. */
function bucket(area, body) {
    if (/example|showcase|gallery/i.test(`${area.id} ${area.title}`)) return 'examples';
    const code = mdxToMarkdown(body, demoSource);
    const imports = [...code.matchAll(/from '(pixi-silk(?:\/[\w/-]+)?)'/g)].map((m) => m[1]);
    const ui = imports.filter((s) => UI_SPECIFIERS.has(s)).length;

    return ui > 0 && ui >= imports.length - ui ? 'ui' : 'full';
}

/** A page as Markdown. `inlineLimit` links the demos longer than it instead of inlining them. */
function pageMarkdown(d, inlineLimit = Infinity) {
    const source = (name) => {
        const code = demoSource(name);

        return code && code.length > inlineLimit ? undefined : code;
    };
    const body = mdxToMarkdown(d.body, source, { demoLink })
        .replace(/\]\((\/[^)]*)\)/g, (_, p) => `](${url(p)})`)
        .replace(/^(#{1,5}) /gm, '#$1 ');

    return [
        '---',
        '',
        `# ${d.title}`,
        '',
        `URL: ${url(`/docs/${d.id}/`)}`,
        `Area: ${d.area.title}`,
        '',
        `> ${d.description}`,
        '',
        body,
        '',
    ];
}

// ---------------------------------------------------------------------------------- API

function walk(dir) {
    return fs
        .readdirSync(dir, { withFileTypes: true })
        .flatMap((e) =>
            e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.md') ? [path.join(dir, e.name)] : [],
        )
        .sort();
}

const api = walk(API).map((file) => {
    const rel = path.relative(API, file).replace(/\\/g, '/').replace(/\.md$/, '');
    const { data, body } = apiFrontmatter(fs.readFileSync(file, 'utf8'));
    const href = rel === 'index' ? '/api/' : `/api/${rel.replace(/(^|\/)index$/, '')}/`;
    const entry = data.entry ?? PKG.name;
    const subpath = entry === PKG.name ? '' : entry.slice(PKG.name.length + 1);

    return {
        rel,
        href,
        title: data.title,
        kind: data.eyebrow,
        summary: data.summary,
        entry,
        file: entryFile(subpath),
        overview: rel === 'index' || rel.endsWith('/index'),
        body,
    };
});

function apiMarkdown(p) {
    // the import line opens every page: keep it, drop the overview tables the symbols repeat
    const body = apiBody(p.body, SITE_URL).replace(/^(#{1,4}) /gm, '#$1 ');

    return [`## ${p.title} (${p.kind}, \`${p.entry}\`)`, '', `URL: ${url(p.href)}`, '', body, ''];
}

function apiOverview(p) {
    const body = apiBody(p.body, SITE_URL, { markdownLinks: true }).replace(/^(#{1,4}) /gm, '##$1 ');

    return [`## \`${p.entry}\``, '', `URL: ${url(p.href)}`, '', body, ''];
}

const TOP = ['SilkGraphics', 'createSilkApp', 'FillStyle', 'StrokeStyle'];
const rootApi = (name) => api.find((p) => p.entry === PKG.name && p.title === name && !p.overview);

// ---------------------------------------------------------------------------------- shared blocks

const quickStart = `\`\`\`bash
npm install pixi-silk pixi.js
\`\`\`

\`\`\`ts
import { createSilkApp, SilkGraphics, conic, vertical } from 'pixi-silk';

const { app } = await createSilkApp({ parent: document.getElementById('stage')!, background: 0x000000 });
const g = new SilkGraphics();

g.roundRect(10, 10, 340, 140, 22, 0.6).fill(0x1c1c1e); // squircle card
g.arcSweep(80, 80, 44, -Math.PI / 2, Math.PI * 1.5)
    .stroke({ width: 12, cap: 'round', gradient: conic([0x30d158, 0xffd60a, 0xff453a]) });
g.area([120, 100, 170, 80, 220, 92, 270, 60, 320, 70], 130, { smooth: 'monotone' })
    .fill(vertical([[0, 0xff9f0a, 0.8], [1, 0xff9f0a, 0]]))
    .stroke({ width: 2, color: 0xff9f0a, cap: 'round' });
app.stage.addChild(g);
\`\`\``;

const FILES = {
    full: { name: 'llms-full.txt', what: 'core, paint and rendering: guides and API, SilkGraphics first' },
    ui: { name: 'llms-ui.txt', what: 'text, layout, UI widgets and the editor kit: guides and API' },
    examples: { name: 'llms-examples.txt', what: 'whole screens with the source of every demo' },
};

const header = (title = 'pixi-silk') => `# ${title}

> ${SUMMARY}

pixi-silk ${version} is an MIT-licensed TypeScript library. It needs ${REQUIRES}.

Site: ${SITE_URL}
Repository: ${REPO}
Package: https://www.npmjs.com/package/pixi-silk`;

const gotchas = ['## Gotchas', '', ...FACTS.map((f) => `- ${f.text}`), ''];

const entryTable = [
    '## Entry points',
    '',
    'Import each from its own path. The root import does not re-export the others.',
    '',
    '| Import | Area | What it holds |',
    '| --- | --- | --- |',
    ...ENTRY_AREAS.flatMap(([area, title]) =>
        ENTRIES.filter((e) => ENTRY_POINTS[e.key]?.area === area).map(
            (e) =>
                `| [\`${e.specifier}\`](${url(e.subpath ? `/api/${e.subpath}.md` : '/api.md')}) | ${title} | ${ENTRY_POINTS[e.key].description} |`,
        ),
    ),
    '',
];

const filesBlock = [
    '## Files for AI assistants',
    '',
    ...Object.values(FILES).map((f) => `- [${f.name}](${url(`/${f.name}`)}): ${f.what}.`),
    '- Every docs and API page has a Markdown twin: replace the trailing slash with `.md` (`/docs/shapes.md`, `/api/classes/SilkGraphics.md`).',
    '- Agent skills ship in the npm package: `node_modules/pixi-silk/skills/pixi-silk/SKILL.md` routes to the rest.',
    '',
];

// ---------------------------------------------------------------------------------- llms.txt

const llms = [
    header(),
    '',
    ...filesBlock,
    '## Quick start',
    '',
    quickStart,
    '',
    ...entryTable,
    ...gotchas,
    '## Docs',
    '',
    'The docs are grouped into areas. Each area overview tours its pages.',
    '',
    ...VISIBLE_AREAS.flatMap((a) => {
        const pages = docs.filter((d) => d.area.id === a.id);

        return [
            `### ${a.title}`,
            '',
            `- [${a.title} overview](${url(`/docs/${a.id}/`)}): ${a.summary}`,
            ...pages.map(
                (d) =>
                    `- [${d.title}](${url(`/docs/${d.id}/`)}): ${d.description} (Markdown: ${url(`/docs/${d.id}.md`)})`,
            ),
            '',
        ];
    }),
    '## API reference',
    '',
    `- [Overview](${url('/api/')}): every export by entry point, generated from the source JSDoc (Markdown: ${url('/api.md')}).`,
    ...TOP.map(rootApi)
        .filter(Boolean)
        .map((p) => `- [${p.title}](${url(p.href)}): ${p.kind}. ${p.summary}`),
    `- [FAQ](${url('/faq/')}): short answers, grouped by area.`,
    '',
];

write('llms.txt', llms);

// ---------------------------------------------------------------------------------- llms-full / -ui / -examples

const faqFor = (file) => {
    const areaFile = new Map(
        VISIBLE_AREAS.map((a) => {
            const files = docs.filter((d) => d.area.id === a.id).map((d) => d.file);
            const ui = files.filter((f) => f === 'ui').length;
            const ex = files.filter((f) => f === 'examples').length;

            return [a.id, ex > files.length / 2 ? 'examples' : ui > files.length / 2 ? 'ui' : 'full'];
        }),
    );
    const items = FAQ.filter((f) => (areaFile.get(f.area) ?? 'full') === file);

    return items.length ? ['---', '', '# FAQ', '', ...items.flatMap((f) => [`## ${f.q}`, '', f.a, ''])] : [];
};

const others = (file) =>
    Object.entries(FILES)
        .filter(([key]) => key !== file)
        .map(([, f]) => `- [${f.name}](${url(`/${f.name}`)}): ${f.what}.`);

const full = [
    header(),
    '',
    'This file holds the core of pixi-silk: the API of SilkGraphics, createSilkApp, FillStyle and StrokeStyle, the guides on drawing, paint and rendering, then the rest of the API of those entry points. Long demo sources are linked, not inlined.',
    '',
    ...others('full'),
    '',
    ...gotchas,
    ...entryTable,
    '## Quick start',
    '',
    quickStart,
    '',
    '---',
    '',
    '# API: the four types you use most',
    '',
    ...TOP.map(rootApi).filter(Boolean).flatMap(apiMarkdown),
    ...docs.filter((d) => d.file === 'full').flatMap((d) => pageMarkdown(d, FULL_DEMO_LIMIT)),
    '---',
    '',
    '# API reference',
    '',
    ...api
        .filter((p) => p.file === 'full' && !p.overview && !TOP.includes(p.title) && !LLMS_SKIP_API.includes(p.title))
        .flatMap(apiMarkdown),
    ...faqFor('full'),
];

write('llms-full.txt', full);

const ui = [
    header('pixi-silk: text, layout, UI widgets and the editor kit'),
    '',
    'This file holds the guides on text, layout, UI widgets and the editor kit, with the source of their live demos, then the API of their entry points. Each lives under its own import path.',
    '',
    ...others('ui'),
    '',
    ...gotchas,
    ...entryTable,
    ...docs.filter((d) => d.file === 'ui').flatMap((d) => pageMarkdown(d)),
    '---',
    '',
    '# API reference',
    '',
    'One overview per entry point, with every export and its summary. Each link opens the Markdown page of that export.',
    '',
    ...api.filter((p) => p.file === 'ui' && p.overview && p.entry !== `${PKG.name}/ui`).flatMap(apiOverview),
    ...faqFor('ui'),
];

write('llms-ui.txt', ui);

const examples = [
    header('pixi-silk: examples'),
    '',
    'This file holds whole screens built with pixi-silk, with the full source of every demo. The demos run in the docs harness: `defineDemo({ setup({ stage, params, tick }) })`. In your app, `stage` is `app.stage` (or a container on it), `params` are your own values and `tick(fn)` is `app.ticker.add`.',
    '',
    ...others('examples'),
    '',
    ...docs.filter((d) => d.file === 'examples').flatMap((d) => pageMarkdown(d)),
    ...faqFor('examples'),
];

write('llms-examples.txt', examples);

function write(name, lines) {
    const text = `${lines
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()}\n`;

    fs.writeFileSync(path.join('public', name), text);
    console.log(
        `build-llms: ${name.padEnd(17)} ${(text.length / 1024).toFixed(0).padStart(4)} kB, about ${tokens(text)} tokens`,
    );
}

console.log(
    `build-llms: ${docs.length} docs (${['full', 'ui', 'examples'].map((f) => `${docs.filter((d) => d.file === f).length} ${f}`).join(', ')}), ${api.length} API pages`,
);
