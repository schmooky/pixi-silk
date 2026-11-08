#!/usr/bin/env node
/**
 * House style for everything people read: docs, FAQ, UI text, JSDoc, READMEs, changesets.
 *
 * - Punctuation is plain ASCII. No em or en dashes, ellipsis characters, middle dots, bullets, curly
 *   quotes, arrows or the multiplication sign: write a period or comma, "to", "1200x900".
 * - No hype or filler words (seamless, robust, leverage, simply, just, very ...).
 * - Docs prose (Markdown outside code, FAQ answers, glossary definitions): no semicolons, at most one
 *   colon per sentence and at most 32 words per sentence. Short sentences, one idea each.
 *
 * Symbols that are content stay allowed: letters with accents, Greek letters, degree, plus-minus,
 * pound, the Mac command key and emoji. The lab's reference-sheet widgets reproduce design text
 * verbatim and are skipped. A line containing `prose-ignore` is skipped too.
 *
 * usage: node scripts/check-prose.mjs [files...]   (default: every doc and source file in scope)
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const SCOPE = [
    'README.md',
    'CONTRIBUTING.md',
    '.changeset',
    '.github',
    'scripts',
    'packages/pixi-silk/src',
    'packages/pixi-silk/build',
    'packages/pixi-silk/tests',
    'packages/pixi-silk/CHANGELOG.md',
    'apps/site/src',
    'apps/site/scripts',
    'apps/site/public/search.js',
    'apps/site/astro.config.mjs',
];
const SKIP = [
    /(^|\/)node_modules\//,
    /(^|\/)dist\//,
    /^apps\/site\/src\/pages\/api\//,
    /^apps\/site\/src\/generated\//,
    /^apps\/site\/src\/lab\/_(sheets|widgets|cards)\//,
    /^apps\/site\/src\/og\/fonts\//,
    /^scripts\/check-prose\.mjs$/,
];
const EXTENSIONS = new Set(['.md', '.mdx', '.ts', '.tsx', '.mjs', '.js', '.astro', '.css', '.yml']);

/** character -> what to write instead */
const TYPOGRAPHY = {
    '\u2014': 'a period, comma or colon (em dash)',
    '\u2013': 'a hyphen or "to" (en dash)',
    '\u2026': 'a full sentence, or "..." in code (ellipsis character)',
    '\u00b7': 'a comma or a new sentence (middle dot)',
    '\u2022': 'a Markdown or HTML list (bullet)',
    '\u2018': "' (curly quote)",
    '\u2019': "' (curly quote)",
    '\u201c': '" (curly quote)',
    '\u201d': '" (curly quote)',
    '\u2192': '"to" (arrow)',
    '\u2190': 'words (arrow)',
    '\u2191': 'words (arrow)',
    '\u2193': 'words (arrow)',
    '\u21d2': 'words (arrow)',
    '\u00d7': '"x", as in 1200x900 (multiplication sign)',
    '\u2248': '"about" (almost equal)',
    '\u00a0': 'a normal space (no-break space)',
    '\u202f': 'a normal space (narrow no-break space)',
    '\u200b': 'nothing (zero-width space)',
    '\ufeff': 'nothing (byte order mark)',
};

const HYPE = [
    'seamless(ly)?',
    'robust',
    'leverag(e|es|ed|ing)',
    'delv(e|es|ing)',
    'crucial',
    'effortless(ly)?',
    'powerful',
    'elevat(e|es|ing)',
    'unlock(s|ing)?',
    'harness(es|ing)?',
    'empower(s|ing)?',
    'cutting-edge',
    'state-of-the-art',
    'game-?chang(er|ing)',
    'comprehensive',
    'meticulous(ly)?',
    'vibrant',
    'pivotal',
    'streamlin(e|es|ed|ing)',
    'supercharg(e|es|ed|ing)',
    'blazing(ly)?',
    'lightning-fast',
    'stunning',
    'gorgeous',
    'beautiful(ly)?',
    'buttery',
    'world-class',
    'best-in-class',
    'next-level',
    'revolutionary',
    'transformative',
    'boasts?',
    'tapestry',
    'testament',
    'foster(s|ing)?',
    'bespoke',
    'utiliz(e|es|ed|ing)',
    'facilitat(e|es|ed|ing)',
    'plethora',
    'myriad',
    'dive into',
    'deep dive',
    "in today's",
    "whether you're",
    "it's worth noting",
    'needless to say',
    'look no further',
    'in conclusion',
    'moreover',
    'furthermore',
    'additionally',
    'simply',
    'just',
    'easily',
    'basically',
    'actually',
    'really',
    'very',
    'obviously',
    'of course',
];
const HYPE_RE = new RegExp(`\\b(${HYPE.join('|')})\\b`, 'gi');
const MAX_WORDS = 32;

function walk(path) {
    const rel = relative(root, path);

    if (SKIP.some((re) => re.test(`${rel}/`) || re.test(rel))) return [];
    if (!existsSync(path)) return [];
    if (statSync(path).isDirectory()) return readdirSync(path).flatMap((name) => walk(join(path, name)));

    return EXTENSIONS.has(extname(path)) ? [path] : [];
}

/** Markdown prose fragments (paragraphs, list items, table cells) with their line numbers; code removed. */
function markdownProse(text) {
    const lines = text.split('\n');
    const out = [];
    let fence = false;
    let frontmatter = lines[0] === '---';
    let buffer = [];
    let start = 0;
    const flush = () => {
        if (buffer.length) out.push({ line: start + 1, text: buffer.join(' ') });
        buffer = [];
    };

    lines.forEach((raw, i) => {
        const line = raw.trim();

        if (frontmatter) {
            if (i > 0 && line === '---') frontmatter = false;
            // titles and descriptions are read in search results: check them like prose
            const field = line.match(/^(title|seoTitle|description):\s*['"]?(.*?)['"]?$/);

            if (field) out.push({ line: i + 1, text: field[2] });

            return;
        }
        if (line.startsWith('```')) {
            fence = !fence;
            flush();

            return;
        }
        if (fence || line === '' || /^(import|export) /.test(line) || /^#/.test(line) || /^<[^>]*>$/.test(line)) {
            flush();

            return;
        }
        if (line.startsWith('|')) {
            flush();
            for (const cell of line.split('|'))
                if (cell.trim() && !/^[-: ]+$/.test(cell)) out.push({ line: i + 1, text: cell });

            return;
        }
        if (/^([-*+]|\d+\.)\s/.test(line)) {
            flush();
            start = i;
            buffer.push(line.replace(/^([-*+]|\d+\.)\s/, ''));

            return;
        }
        if (!buffer.length) start = i;
        buffer.push(line);
    });
    flush();

    return out;
}

/** Text a reader sees in a prose fragment: no code, tags, link targets or emphasis markers. */
const readable = (text) =>
    text
        .replace(/`[^`]*`/g, 'CODE')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[*_]{1,2}/g, '');

const sentences = (text) => text.split(/(?<=[.!?])\s+(?=["'([A-Z0-9])/);
const words = (s) => s.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;

/** Comments, string literals and (in .astro / .tsx) template text of source files, for the wording check. */
function sourceText(text, markup) {
    const parts = [];

    for (const m of text.matchAll(
        /\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g,
    )) {
        parts.push({ index: m.index, text: m[0] });
    }
    if (markup)
        for (const m of text.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)) parts.push({ index: m.index, text: m[1] });

    return parts;
}

const lineAt = (text, index) => text.slice(0, index).split('\n').length;
/** A JSDoc block as Markdown: comment markers and `@example` sections removed, other tags kept as text. */
const jsdocMarkdown = (comment) =>
    comment
        .replace(/^\/\*\*|\*\/$/g, '')
        .split('\n')
        .map((l) => l.replace(/^\s*\* ?/, ''))
        .join('\n')
        .replace(/@example[\s\S]*?(?=\n@|$)/g, '');
const files =
    process.argv.length > 2
        ? process.argv.slice(2).map((f) => join(process.cwd(), f))
        : SCOPE.flatMap((p) => walk(join(root, p)));
const problems = [];
const report = (file, line, message) => problems.push(`${relative(root, file)}:${line}  ${message}`);

for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');
    const ignored = new Set(lines.flatMap((l, i) => (l.includes('prose-ignore') ? [i + 1] : [])));
    const ext = extname(file);
    const isDoc = ext === '.md' || ext === '.mdx';
    const isProseModule = /content\/(faq|glossary)\.mjs$|lab\/catalog\.mjs$/.test(file);
    // the library's JSDoc is the API reference
    const isLibrary = /packages\/pixi-silk\/src\//.test(file);

    lines.forEach((l, i) => {
        if (ignored.has(i + 1)) return;
        for (const ch of l) if (TYPOGRAPHY[ch]) report(file, i + 1, `"${ch}": use ${TYPOGRAPHY[ch]}`);
    });

    const fragments = isDoc
        ? markdownProse(text).map((f) => ({ ...f, text: readable(f.text), prose: true }))
        : sourceText(text, ext === '.astro' || ext === '.tsx').flatMap((p) => {
              const line = lineAt(text, p.index);

              // the library's JSDoc is the API reference: check it like Markdown, examples excluded
              if (isLibrary && p.text.startsWith('/**')) {
                  return markdownProse(jsdocMarkdown(p.text)).map((f) => ({
                      line: line + f.line - 1,
                      text: readable(f.text),
                      prose: true,
                  }));
              }
              // UI prose inside code: FAQ and glossary entries, and subtitle / description / caption / body strings
              const key = /\b(subtitle|description|caption|body)\s*:\s*$/.test(
                  text.slice(Math.max(0, p.index - 40), p.index),
              );

              const prose = !p.text.startsWith('/') && (isProseModule || key);

              // code spans inside prose strings (`g.fill({ ... })`) are not prose
              return [{ line, text: prose ? readable(p.text) : p.text, prose }];
          });

    for (const { line, text: fragment, prose } of fragments) {
        if (ignored.has(line)) continue;
        for (const m of fragment.matchAll(HYPE_RE)) report(file, line, `"${m[0]}": cut it or say what it means`);
        if (!prose || /^https?:/.test(fragment)) continue;
        for (const s of sentences(fragment.replace(/^['"`]|['"`],?$/g, ''))) {
            if (s.includes('; ')) report(file, line, `semicolon: split into two sentences ("${s.slice(0, 60)}")`);
            if ((s.match(/:\s/g) ?? []).length > 1)
                report(file, line, `two colons in one sentence ("${s.slice(0, 60)}")`);
            if (words(s) > MAX_WORDS) report(file, line, `${words(s)} words: split it ("${s.slice(0, 60)}")`);
        }
    }
}

for (const p of problems) console.log(p);
console.log(`check-prose: ${files.length} files, ${problems.length} problems`);
process.exit(problems.length ? 1 : 0);
