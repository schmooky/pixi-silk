#!/usr/bin/env node
/**
 * Generates public/llms.txt (an index, llmstxt.org format) and public/llms-full.txt (every guide
 * with its live demos' source, the API reference and the FAQ) from the same sources as the site.
 *
 * Output is deterministic (sorted, no timestamps): both files are committed, and CI fails when they
 * are stale. Runs after `api:gen`, because the API pages are part of the output.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { FAQ } from '../src/content/faq.mjs';
import { GLOSSARY } from '../src/content/glossary.mjs';
import { DOCS_NAV, VISIBLE_AREAS } from '../src/content/nav.mjs';
import { LAB_SECTIONS } from '../src/lab/catalog.mjs';
import { mdxToMarkdown } from '../src/lib/mdx-to-md.mjs';
import { SITE_URL } from '../src/lib/site-url.mjs';

const DOCS = path.resolve('src/content/docs');
const DEMOS = path.resolve('src/demos');
const API = path.resolve('src/pages/api');
const PKG = path.resolve('../../packages/pixi-silk/package.json');

if (!fs.existsSync(API)) throw new Error('build-llms: src/pages/api is missing. Run `pnpm api:gen` first.');

const version = JSON.parse(fs.readFileSync(PKG, 'utf8')).version;
const url = (p) => `${SITE_URL}${p}`;
const slugify = (s) =>
    s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

function splitFrontmatter(text) {
    const m = text.match(/^---\n([\s\S]*?)\n---\n?/);

    return m ? { data: parseYaml(m[1]) ?? {}, body: text.slice(m[0].length) } : { data: {}, body: text };
}

const demoSource = (name) => {
    const file = path.join(DEMOS, `${name}.demo.ts`);

    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined;
};

// ---------------------------------------------------------------------------------- docs

const docs = DOCS_NAV.flatMap((section) =>
    section.items.map((id) => {
        const { data, body } = splitFrontmatter(fs.readFileSync(path.join(DOCS, `${id}.mdx`), 'utf8'));

        return { id, area: section.id, section: section.title, title: data.title, description: data.description, body };
    }),
);

// ---------------------------------------------------------------------------------- API

function walk(dir) {
    return fs
        .readdirSync(dir, { withFileTypes: true })
        .flatMap((e) =>
            e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.md') ? [path.join(dir, e.name)] : [],
        )
        .sort();
}

const api = walk(API)
    .map((file) => {
        const rel = path.relative(API, file).replace(/\\/g, '/').replace(/\.md$/, '');
        const { data, body } = splitFrontmatter(fs.readFileSync(file, 'utf8'));

        return {
            rel,
            title: data.title,
            kind: data.eyebrow,
            description: data.description,
            href: rel === 'index' ? '/api/' : `/api/${rel}/`,
            body,
        };
    })
    .filter((p) => p.rel !== 'index');

// ---------------------------------------------------------------------------------- llms.txt

const quickStart = `\`\`\`bash
npm install pixi-silk pixi.js
\`\`\`

\`\`\`ts
import { createSilkApp, SilkGraphics, conic, vertical } from 'pixi-silk';

const { app } = await createSilkApp({ parent: document.getElementById('stage')!, background: 0x000000 });
const g = new SilkGraphics();

g.roundRect(10, 10, 340, 140, 22, 0.6).fill(0x1c1c1e);                        // squircle card
g.arcSweep(80, 80, 44, -Math.PI / 2, Math.PI * 1.5)
    .stroke({ width: 12, cap: 'round', gradient: conic([0x30d158, 0xffd60a, 0xff453a]) });
g.area([120, 100, 170, 80, 220, 92, 270, 60, 320, 70], 130, { smooth: 'monotone' })
    .fill(vertical([[0, 0xff9f0a, 0.8], [1, 0xff9f0a, 0]]))
    .stroke({ width: 2, color: 0xff9f0a, cap: 'round' });
app.stage.addChild(g);
\`\`\``;

const header = `# pixi-silk

> Smooth vector graphics for PixiJS v8. pixi-silk draws shapes as exact signed distance fields, so every edge is anti-aliased per pixel. Edges stay smooth at any zoom, rotation and device pixel ratio, without MSAA, and each object is one draw call.

pixi-silk ${version} is an MIT-licensed TypeScript library. It needs pixi.js ^8 (peer dependency) and WebGL2.
- \`SilkGraphics\` is a display object with a Graphics-like API. It draws rects and squircles (per-corner radii), circles, ellipses, arcs, sectors, lines, polylines (smoothed or tapered), Bezier paths (stroke only), chart areas, hearts, stars, polygons and rounded triangles.
- Paint: colours, gradients (linear, radial, conic, along the path), a gaussian \`blur\` for glows and soft shadows, dashes and dots. Gradients mix in OKLab and are dithered. Strokes align inside, center or outside.
- \`createSilkApp\` creates a Pixi Application whose canvas maps 1:1 to device pixels, even at fractional ratios. It follows DPR changes, uses no MSAA and renders filters at screen resolution.
- Also: transforms (save, restore, translate, rotate, scale), hit testing against the real shapes, and motion helpers (damp, Spring, ease).
- Limits: WebGL2 only, no WebGPU yet. Free-form paths are stroke-only. Joins are always round.

Site: ${SITE_URL}
Repository: https://github.com/schmooky/pixi-silk
Package: https://www.npmjs.com/package/pixi-silk`;

const lines = [
    header,
    '',
    '## Quick start',
    '',
    quickStart,
    '',
    '## Key terms',
    '',
    ...[
        'Anti-aliasing',
        'Analytic anti-aliasing',
        'MSAA',
        'Signed distance field',
        'Device pixel ratio',
        'Squircle',
        'Gradient banding',
    ]
        .map((term) => GLOSSARY.find((t) => t.term === term))
        .map((t) => `- ${t.term}: ${t.definition}`),
    '',
    '## Docs',
    '',
    'The docs are grouped into areas. Each area has an overview page that lists its pages in reading order.',
    '',
    ...VISIBLE_AREAS.flatMap((a) => [
        `### ${a.title}`,
        '',
        `- [${a.title} overview](${url(`/docs/${a.id}/`)}): ${a.summary}`,
        ...docs
            .filter((d) => d.area === a.id)
            .map(
                (d) =>
                    `- [${d.title}](${url(`/docs/${d.id}/`)}): ${d.description} (Markdown: ${url(`/docs/${d.id}.md`)})`,
            ),
        '',
    ]),
    '## API reference',
    '',
    `- [Overview](${url('/api/')}): every export, generated from the source JSDoc.`,
    ...api.map((p) => `- [${p.title}](${url(p.href)}): ${p.kind}. ${p.description}`),
    '',
    '## Lab and showcase',
    '',
    `- [Showcase](${url('/showcase/')}): five design reference sheets rebuilt 1:1 (81 widgets).`,
    ...LAB_SECTIONS.flatMap(([, items]) =>
        items.map(([slug, name, description]) => `- [${name}](${url(`/lab/${slug}/`)}): ${description}`),
    ),
    '',
    '## FAQ',
    '',
    ...FAQ.map((f) => `- [${f.q}](${url(`/faq/#${slugify(f.q)}`)})`),
    '',
    '## Optional',
    '',
    `- [llms-full.txt](${url('/llms-full.txt')}): all guides with the source of every live demo, the full API reference and the FAQ, as one plain-text file.`,
    '',
];

fs.writeFileSync('public/llms.txt', lines.join('\n'));

// ---------------------------------------------------------------------------------- llms-full.txt

const stripApi = (body) =>
    body
        .replace(/<a id="[^"]*"><\/a>\n?/g, '')
        .replace(/\]\((\/api\/[^)]*)\)/g, (_, p) => `](${url(p)})`)
        .replace(/\n{3,}/g, '\n\n')
        .trim();

const full = [
    header,
    '',
    'This file contains the complete documentation: every guide (live demos are inlined as their TypeScript source), the API reference and the FAQ.',
    '',
    '## Quick start',
    '',
    quickStart,
    '',
    ...docs.flatMap((d) => [
        '---',
        '',
        `# ${d.title}`,
        '',
        `URL: ${url(`/docs/${d.id}/`)}`,
        `Section: ${d.section}`,
        '',
        `> ${d.description}`,
        '',
        mdxToMarkdown(d.body, demoSource).replace(/\]\((\/[^)]*)\)/g, (_, p) => `](${url(p)})`),
        '',
    ]),
    '---',
    '',
    '# API reference',
    '',
    ...api.flatMap((p) => [`## ${p.title} (${p.kind})`, '', `URL: ${url(p.href)}`, '', stripApi(p.body), '']),
    '---',
    '',
    '# FAQ',
    '',
    ...FAQ.flatMap((f) => [`## ${f.q}`, '', f.a, '']),
];

fs.writeFileSync(
    'public/llms-full.txt',
    `${full
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()}\n`,
);
console.log(
    `build-llms: llms.txt (${docs.length} docs, ${api.length} API pages), llms-full.txt (${(fs.statSync('public/llms-full.txt').size / 1024).toFixed(0)} kB)`,
);
