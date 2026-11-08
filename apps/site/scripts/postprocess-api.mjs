#!/usr/bin/env node
/**
 * Turns TypeDoc's markdown output (src/pages/api) into Astro pages.
 *
 * - Moves the files to their URLs (scripts/api-paths.mjs): the root import's symbols stay at
 *   `/api/<kind>/<Name>/`, a subpath's at `/api/<subpath>/<kind>/<Name>/`, its overview at
 *   `/api/<subpath>/`. `/api/` lists the entry points, then the root import.
 * - Shows the import line at the top of every symbol page and the import path on every overview.
 * - Rewrites relative `.md` links to absolute URLs (Astro serves `x.md` at `x/`).
 * - Adds frontmatter: Docs layout, title, description, kind, entry point. `description` is the
 *   meta description and may carry a suffix for search engines (unique, long enough). `summary` is
 *   the JSDoc sentence alone: llms.txt and the Markdown endpoint use it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ENTRY_POINTS } from '../src/content/facts.mjs';
import { ENTRIES, FOLDER_KINDS, PKG } from './api-paths.mjs';

const ROOT = path.resolve('src/pages/api');
const LAYOUT = path.resolve('src/layouts/Docs.astro');
const TYPE_KINDS = new Set(['interfaces', 'types']);

function walk(dir) {
    return fs
        .readdirSync(dir, { withFileTypes: true })
        .flatMap((e) =>
            e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.md') ? [path.join(dir, e.name)] : [],
        );
}

/** TypeDoc's path (relative to ROOT) to ours: the root module's folder is dropped, type-aliases becomes types. */
const target = (rel) =>
    rel
        .replace(new RegExp(`^${PKG.name}/`), '')
        .split('/')
        .map((part) => (part === 'type-aliases' ? 'types' : part))
        .join('/');

function urlOf(rel) {
    const clean = target(rel)
        .replace(/\.md$/, '')
        .replace(/(^|\/)index$/, '');

    return clean ? `/api/${clean}/` : '/api/';
}

/** What a page documents: its entry point, kind folder and name. */
function pageInfo(rel) {
    const parts = target(rel).replace(/\.md$/, '').split('/');
    const base = parts[parts.length - 1];

    if (base === 'index') return { subpath: parts.slice(0, -1).join('/'), folder: null, name: null };

    return { subpath: parts.slice(0, -2).join('/'), folder: parts[parts.length - 2], name: base };
}

const specifierOf = (subpath) => (subpath ? `${PKG.name}/${subpath}` : PKG.name);
const entryInfo = (subpath) => ENTRY_POINTS[subpath ? `./${subpath}` : '.'];

function rewriteLinks(content, file) {
    return content.replace(/\]\(([^)\s]+?\.md)(#[^)\s]*)?\)/g, (match, url, hash) => {
        if (/^(?:https?:|mailto:|\/\/)/i.test(url)) return match;
        const abs = path.resolve(path.dirname(file), url);

        return `](${urlOf(path.relative(ROOT, abs).replace(/\\/g, '/'))}${hash ?? ''})`;
    });
}

/** The first prose paragraph, flattened. */
function summaryOf(content) {
    for (const block of content.split(/\n{2,}/)) {
        const t = block.trim();

        // skip headings, code, tables, quotes, rules, lists and raw HTML: the first prose paragraph wins
        if (!t || /^(#|```|\||>|\*\*\*|Defined in|\[|<|[-*] |\d+\. |Re-exports)/.test(t)) continue;

        return t
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/\s+/g, ' ')
            .replace(/[`*_\\]/g, '')
            .trim()
            .replace(/:$/, '.');
    }

    return '';
}

function describe(summary, kind, title, specifier) {
    let flat = summary;

    // short summaries get context, so every API page has a meta description of its own
    if (flat.length < 70) {
        const what = title === specifier ? `${kind} ${title} of pixi-silk` : `${kind} ${title} from ${specifier}`;

        flat = `${flat ? `${flat.replace(/\.?$/, '.')} ` : ''}${what}, smooth anti-aliased graphics for PixiJS v8.`;
    }
    if (flat.length <= 158) return flat;
    // cut after the last whole sentence that fits, else at a word boundary
    const cut = flat.slice(0, 158);
    const end = cut.lastIndexOf('. ');

    return end >= 60 ? cut.slice(0, end + 1) : `${cut.slice(0, 155).replace(/\s+\S*$/, '')}...`;
}

/** The first runtime exports an overview lists (classes, functions, variables), for its import line. */
function valueNames(content) {
    const names = [];

    for (const section of content.split(/^## /m)) {
        if (!/^(Classes|Functions|Variables)\n/.test(section)) continue;
        for (const m of section.matchAll(/^\| \[([A-Za-z_$][\w$]*)\]/gm)) names.push(m[1]);
    }

    return names.length ? names.slice(0, 4) : ['...'];
}

/** The `pixi-silk/ui` barrel lists hundreds of re-exports: one line each. */
const compactReferences = (content) =>
    content.replace(/^### (\S+)\n\nRe-exports (\[[^\]]+\]\([^)]+\))\n\n(?:\*\*\*\n\n?)?/gm, '- $2\n');

function entryTable() {
    const rows = ENTRIES.map((e) => {
        const info = entryInfo(e.subpath);

        return `| [\`${e.specifier}\`](${e.subpath ? `/api/${e.subpath}/` : '#the-root-import'}) | ${info?.description ?? ''} |`;
    });

    return [
        'Each entry point is its own module: import only what you use. The root import holds the core.',
        '',
        '| Import | What it holds |',
        '| ------ | ------ |',
        ...rows,
        '',
        '## The root import',
        '',
        '```ts',
        `import { SilkGraphics, createSilkApp } from '${PKG.name}';`,
        '```',
        '',
    ].join('\n');
}

const yamlString = (s) => `'${s.replace(/'/g, "''")}'`;
const files = walk(ROOT).filter((f) => !fs.readFileSync(f, 'utf8').startsWith('---\n'));
const pages = files.map((file) => {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');

    return { file, rel, out: path.join(ROOT, target(rel)), ...pageInfo(rel) };
});

// names used by more than one entry point get the entry point in their title
const nameCount = new Map();

for (const p of pages) if (p.name) nameCount.set(p.name, (nameCount.get(p.name) ?? 0) + 1);

const written = [];

for (const p of pages) {
    let content = fs.readFileSync(p.file, 'utf8');
    const isIndex = p.rel === 'index.md';
    const specifier = specifierOf(p.subpath);
    const kind = p.folder ? (FOLDER_KINDS[p.folder] ?? 'Symbol') : isIndex ? 'Reference' : 'Entry point';

    // "Defined in: file.ts:123" has no link without a git remote; it is noise for readers and LLMs
    content = rewriteLinks(content, p.file).replace(/^Defined in: .*\n\n?/gm, '');
    const summary = isIndex
        ? 'Every export of pixi-silk, grouped by entry point and generated from the source JSDoc.'
        : p.name
          ? summaryOf(content)
          : (entryInfo(p.subpath)?.description ?? '');
    let title;
    let eyebrow = kind;
    let head = '';

    if (isIndex) {
        title = 'API reference';
        head = entryTable();
        content = content.replace(/^## /gm, '### ');
    } else if (p.name) {
        title = p.name;
        if ((nameCount.get(p.name) ?? 0) > 1) eyebrow = `${kind} in ${specifier}`;
        head = [
            '```ts',
            `import ${TYPE_KINDS.has(p.folder) ? 'type ' : ''}{ ${p.name} } from '${specifier}';`,
            '```',
            '',
        ].join('\n');
    } else {
        title = specifier;
        head = [
            summary,
            '',
            '```ts',
            `import { ${(p.subpath === 'ui' ? ['SilkButton', 'TransformGizmo', 'Camera'] : valueNames(content)).join(', ')} } from '${specifier}';`,
            '```',
            '',
        ].join('\n');
        if (p.subpath === 'ui') content = compactReferences(content);
    }
    const description = isIndex
        ? 'Every export of pixi-silk by entry point: SilkGraphics, createSilkApp, gradients, text, layout, UI widgets and editor tools, generated from the source.'
        : describe(summary, kind, title, specifier);
    const fm = [
        '---',
        `layout: ${yamlString(path.relative(path.dirname(p.out), LAYOUT).replace(/\\/g, '/'))}`,
        `title: ${yamlString(title)}`,
        `description: ${yamlString(description)}`,
        `summary: ${yamlString(summary)}`,
        `eyebrow: ${yamlString(eyebrow)}`,
        `entry: ${yamlString(specifier)}`,
        'section: api',
        '---',
        '',
    ];

    written.push({ out: p.out, text: `${fm.join('\n')}${head}\n${content}` });
}

for (const p of pages) fs.rmSync(p.file);
for (const w of written) {
    fs.mkdirSync(path.dirname(w.out), { recursive: true });
    fs.writeFileSync(w.out, w.text);
}
// TypeDoc's folder for the root import is empty now
fs.rmSync(path.join(ROOT, PKG.name), { recursive: true, force: true });
console.log(`postprocess-api: ${written.length} pages, ${ENTRIES.length} entry points`);
