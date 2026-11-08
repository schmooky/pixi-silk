#!/usr/bin/env node
/**
 * Checks the agent skills in packages/pixi-silk/skills and the facts file they share with the
 * llms files (apps/site/src/content/facts.mjs).
 *
 * - Every subpath export in package.json has an entry in the facts file's ENTRY_POINTS, and the
 *   router skill (skills/pixi-silk/SKILL.md) and AGENTS.md list it. No stale extras.
 * - Every skill has frontmatter (name = folder, description with "Triggers on:", license MIT), the
 *   sections Quick Start, Core Patterns (the router has a Skill router instead), Common Mistakes
 *   with [CRITICAL], [HIGH] or [MEDIUM] entries that each name a symptom, and API Reference.
 * - Links resolve: other skills, docs pages (/docs/<slug>.md) and, once `pnpm api:gen` has run,
 *   API pages (/api/<path>.md).
 * - Every ```ts block type-checks against the library source, like the docs samples
 *   (apps/site/scripts/check-snippets.mjs). Blocks are whole modules with their imports. `app`
 *   (a Pixi Application) is the one global. Mark a deliberate wrong example ```ts nocheck.
 * - The package's `files` ships the skills.
 *
 * usage: node scripts/check-skills.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PKG_DIR = join(ROOT, 'packages/pixi-silk');
const SKILLS = join(PKG_DIR, 'skills');
const SITE = join(ROOT, 'apps/site');
const OUT = join(SITE, 'node_modules/.cache/skills');
const SITE_URL = 'https://pixi-silk.schmooky.dev';
const pkg = JSON.parse(readFileSync(join(PKG_DIR, 'package.json'), 'utf8'));
const { ENTRY_POINTS } = await import(join(SITE, 'src/content/facts.mjs'));
const errors = [];
const fail = (where, msg) => errors.push(`${where}: ${msg}`);

// ---------------------------------------------------------------------------------- entry points

const entries = Object.entries(pkg.exports)
    .filter(([key, target]) => key !== './package.json' && typeof target === 'object')
    .map(([key, target]) => ({
        key,
        specifier: key === '.' ? pkg.name : `${pkg.name}/${key.slice(2)}`,
        source: join(PKG_DIR, 'src', target.default.replace(/^\.\/dist\//, '').replace(/\.js$/, '.ts')),
    }));
const router = readFileSync(join(SKILLS, 'pixi-silk/SKILL.md'), 'utf8');
const routerTable = router.split(/^## Entry points$/m)[1]?.split(/^## /m)[0] ?? '';
const listed = new Set([...routerTable.matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1]));

for (const e of entries) {
    if (!ENTRY_POINTS[e.key]) fail('apps/site/src/content/facts.mjs', `ENTRY_POINTS has no entry for "${e.key}"`);
    if (!listed.has(e.specifier))
        fail('skills/pixi-silk/SKILL.md', `the Entry points table does not list \`${e.specifier}\``);
}
for (const key of Object.keys(ENTRY_POINTS))
    if (!entries.some((e) => e.key === key))
        fail('apps/site/src/content/facts.mjs', `"${key}" is not in package.json exports`);
for (const s of listed)
    if (!entries.some((e) => e.specifier === s)) fail('skills/pixi-silk/SKILL.md', `\`${s}\` is not an entry point`);
const agents = readFileSync(join(ROOT, 'AGENTS.md'), 'utf8');

for (const e of entries)
    if (!agents.includes(`\`${e.specifier}\``))
        fail('AGENTS.md', `the entry point table does not list \`${e.specifier}\``);
if (!pkg.files?.includes('skills')) fail('packages/pixi-silk/package.json', '`files` does not ship "skills"');

// ---------------------------------------------------------------------------------- skills

const skills = readdirSync(SKILLS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
const docs = new Set(
    readdirSync(join(SITE, 'src/content/docs'))
        .filter((f) => f.endsWith('.mdx'))
        .map((f) => f.replace(/\.mdx$/, '')),
);
const apiDir = join(SITE, 'src/pages/api');
const hasApi = existsSync(apiDir);
const blocks = [];

for (const name of skills) {
    const where = `skills/${name}/SKILL.md`;
    const file = join(SKILLS, name, 'SKILL.md');

    if (!existsSync(file)) {
        fail(`skills/${name}`, 'no SKILL.md');
        continue;
    }
    const text = readFileSync(file, 'utf8');
    const fm = text.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '';

    if (fm.match(/^name: (.+)$/m)?.[1] !== name) fail(where, `frontmatter name must be "${name}"`);
    if (!/^description: ".*Triggers on: .+"$/m.test(fm)) fail(where, 'description needs a "Triggers on:" list');
    if (!/^license: MIT$/m.test(fm)) fail(where, 'license must be MIT');
    const sections = [
        'Quick Start',
        name === 'pixi-silk' ? 'Skill router' : 'Core Patterns',
        'Common Mistakes',
        'API Reference',
    ];

    for (const s of sections) if (!new RegExp(`^## ${s}$`, 'm').test(text)) fail(where, `missing "## ${s}"`);
    const mistakes = text.split(/^## Common Mistakes$/m)[1]?.split(/^## (?!#)/m)[0] ?? '';
    const items = mistakes.split(/^### /m).slice(1);

    if (!items.length) fail(where, 'Common Mistakes has no entries');
    for (const item of items) {
        const title = item.split('\n')[0];

        if (!/^\[(CRITICAL|HIGH|MEDIUM)\] /.test(title))
            fail(where, `"${title}" needs a [CRITICAL], [HIGH] or [MEDIUM] tag`);
        if (!/Symptom:/.test(item)) fail(where, `"${title}" does not name its symptom`);
    }

    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
        const link = m[1];

        if (link.startsWith('../')) {
            if (!existsSync(join(SKILLS, name, link))) fail(where, `broken link ${link}`);
        } else if (link.startsWith(`${SITE_URL}/docs/`)) {
            const slug = link.slice(`${SITE_URL}/docs/`.length).replace(/\.md$|\/$/, '');

            if (!docs.has(slug)) fail(where, `no docs page "${slug}" (${link})`);
        } else if (link.startsWith(`${SITE_URL}/api`) && hasApi) {
            const rel = link.slice(`${SITE_URL}/api`.length).replace(/^\//, '').replace(/\.md$/, '');
            const page = rel ? [join(apiDir, `${rel}.md`), join(apiDir, rel, 'index.md')] : [join(apiDir, 'index.md')];

            if (!page.some(existsSync)) fail(where, `no API page for ${link}`);
        }
    }

    let n = 0;

    for (const m of text.matchAll(/^```(ts|typescript)([^\n]*)\n([\s\S]*?)^```/gm)) {
        n++;
        if (/\bnocheck\b/.test(m[2])) continue;
        const line = text.slice(0, m.index).split('\n').length + 1;

        blocks.push({ file: `${name}-${n}.ts`, where: `${where}:${line}`, code: m[3] });
    }
}

// ---------------------------------------------------------------------------------- samples

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const b of blocks) writeFileSync(join(OUT, b.file), `${b.code}\nexport {};\n`);
writeFileSync(
    join(OUT, 'globals.d.ts'),
    `import type * as Pixi from 'pixi.js';

declare global {
    /** The one global a skill sample may use: the Pixi application. */
    const app: Pixi.Application;
}
`,
);
writeFileSync(
    join(OUT, 'tsconfig.json'),
    JSON.stringify({
        compilerOptions: {
            target: 'ES2022',
            module: 'ESNext',
            moduleResolution: 'bundler',
            lib: ['ES2023', 'DOM', 'DOM.Iterable'],
            types: [],
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            paths: Object.fromEntries(entries.map((e) => [e.specifier, [e.source]])),
        },
        include: ['*.ts'],
    }),
);

if (blocks.length) {
    try {
        execFileSync(join(SITE, 'node_modules/.bin/tsc'), ['-p', OUT], { encoding: 'utf8' });
    } catch (e) {
        const origin = new Map(blocks.map((b) => [b.file, b.where]));

        for (const line of String(e.stdout ?? e)
            .split('\n')
            .filter(Boolean))
            errors.push(
                line.replace(
                    /^(?:.*[\\/])?([\w-]+\.ts)\((\d+),(\d+)\)/,
                    (_, f, l) => `${origin.get(f) ?? f} (sample line ${l})`,
                ),
            );
    }
}

if (errors.length) {
    for (const e of errors) console.log(`ERROR ${e}`);
    console.log('check-skills: fix the skills (mark a deliberate wrong example ```ts nocheck)');
    process.exit(1);
}
console.log(
    `check-skills: ${skills.length} skills, ${entries.length} entry points, ${blocks.length} samples type-check`,
);
