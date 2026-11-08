#!/usr/bin/env node
/**
 * SEO / GEO audit of the built site (apps/site/dist). Fails on errors, prints warnings.
 *
 * Per page: one <h1>, a title and meta description of search-friendly length and unique across the
 * site, an absolute canonical on the production origin, an Open Graph image that exists, valid JSON-LD,
 * <html lang>, alt text on images, and internal links that resolve. Site-wide: robots.txt, sitemap
 * entries that exist and are indexable, llms.txt covering every docs page.
 *
 * usage: node scripts/check-seo.mjs        (after `pnpm build`)
 */
import fs from 'node:fs';
import path from 'node:path';
import { SITE_URL } from '../src/lib/site-url.mjs';

const DIST = path.resolve('dist');
const errors = [];
const warnings = [];
const err = (page, msg) => errors.push(`${page}: ${msg}`);
const warn = (page, msg) => warnings.push(`${page}: ${msg}`);

function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);

        return e.isDirectory() ? walk(p) : [p];
    });
}

const files = walk(DIST);
const html = files.filter((f) => f.endsWith('.html'));
const exists = (url) => {
    const clean = decodeURI(url.split(/[?#]/)[0]);
    const p = path.join(DIST, clean);

    return fs.existsSync(p) && (fs.statSync(p).isFile() || fs.existsSync(path.join(p, 'index.html')));
};
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const decode = (s) =>
    s
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
const titles = new Map();
const descriptions = new Map();
const noindexed = new Set();

for (const file of html) {
    const rel = `/${path
        .relative(DIST, file)
        .replace(/\\/g, '/')
        .replace(/index\.html$/, '')}`;
    const page = rel;
    const doc = fs.readFileSync(file, 'utf8');

    // redirect stubs for moved URLs (astro.config.mjs `redirects`) and Studio's preview frame are not pages
    if (/<meta http-equiv="refresh"/i.test(doc) || rel === '/studio/run/') {
        noindexed.add(rel);
        continue;
    }
    const isLab = /^\/lab\/\d/.test(rel);
    const robots = doc.match(/<meta name="robots" content="([^"]*)"/)?.[1] ?? '';
    const indexable = !/noindex/.test(robots) && rel !== '/404.html';

    if (!indexable) noindexed.add(rel);
    if (!/<html[^>]*\slang="[a-z-]+"/.test(doc)) err(page, 'missing <html lang>');

    const title = decode(doc.match(/<title>([^<]*)<\/title>/)?.[1] ?? '');
    const description = decode(doc.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '');

    if (!title) err(page, 'missing <title>');
    else if (indexable) {
        if (title.length > 65) warn(page, `title is ${title.length} chars (> 65): "${title}"`);
        if (title.length < 20) warn(page, `title is short (${title.length} chars): "${title}"`);
        titles.set(title, [...(titles.get(title) ?? []), page]);
    }
    if (!description) err(page, 'missing meta description');
    else if (indexable) {
        if (description.length > 165) warn(page, `description is ${description.length} chars (> 165)`);
        if (description.length < 60) warn(page, `description is short (${description.length} chars)`);
        descriptions.set(description, [...(descriptions.get(description) ?? []), page]);
    }

    const canonical = doc.match(/<link rel="canonical" href="([^"]*)"/)?.[1];

    if (!canonical) err(page, 'missing canonical');
    else if (!canonical.startsWith(`${SITE_URL}/`)) err(page, `canonical not on ${SITE_URL}: ${canonical}`);
    else if (indexable && new URL(canonical).pathname !== rel) err(page, `canonical points elsewhere: ${canonical}`);

    const og = doc.match(/<meta property="og:image" content="([^"]*)"/)?.[1];

    if (!og) err(page, 'missing og:image');
    else if (!exists(new URL(og).pathname)) err(page, `og:image does not exist: ${og}`);

    // lab pages draw their heading with JavaScript; everything else must ship exactly one <h1>
    const h1 = (doc.match(/<h1[\s>]/g) ?? []).length;

    if (!isLab && h1 !== 1) err(page, `${h1} <h1> elements`);

    for (const m of doc.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
        try {
            const data = JSON.parse(m[1]);

            if (!data['@context'] || !data['@type']) err(page, 'JSON-LD without @context/@type');
        } catch {
            err(page, 'invalid JSON-LD');
        }
    }

    for (const m of doc.matchAll(/<img\b[^>]*>/g)) {
        if (attr(m[0], 'alt') === undefined) err(page, `image without alt: ${m[0].slice(0, 80)}`);
        if (!attr(m[0], 'width') || !attr(m[0], 'height'))
            warn(page, `image without width/height (layout shift): ${attr(m[0], 'src')}`);
    }

    for (const m of doc.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)) {
        const href = decode(m[1]);

        if (!href.startsWith('/') || href.startsWith('//') || href.startsWith('/pagefind/')) continue;
        if (!exists(href)) err(page, `broken internal link: ${href}`);
        else if (!/\.[a-z0-9]+([?#]|$)/i.test(href) && !href.split(/[?#]/)[0].endsWith('/'))
            warn(page, `link without trailing slash (redirects): ${href}`);
    }
}

for (const [title, pages] of titles) if (pages.length > 1) err(pages.join(', '), `duplicate title "${title}"`);
for (const [description, pages] of descriptions)
    if (pages.length > 1) warn(pages.join(', '), `duplicate description "${description.slice(0, 60)}..."`);

// site-wide files
const robots = fs.existsSync(path.join(DIST, 'robots.txt'))
    ? fs.readFileSync(path.join(DIST, 'robots.txt'), 'utf8')
    : '';

if (!robots.includes(`Sitemap: ${SITE_URL}/sitemap.xml`)) err('/robots.txt', 'missing Sitemap line');
const sitemap = fs.existsSync(path.join(DIST, 'sitemap.xml'))
    ? fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8')
    : '';
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

if (!locs.length) err('/sitemap.xml', 'empty or missing');
for (const loc of locs) {
    const p = new URL(loc).pathname;

    if (!loc.startsWith(SITE_URL)) err('/sitemap.xml', `URL not on ${SITE_URL}: ${loc}`);
    else if (!exists(p)) err('/sitemap.xml', `lists a missing page: ${p}`);
    else if (noindexed.has(p)) err('/sitemap.xml', `lists a noindex page: ${p}`);
}
for (const img of sitemap.matchAll(/<image:loc>([^<]+)<\/image:loc>/g)) {
    if (!exists(new URL(decode(img[1])).pathname)) err('/sitemap.xml', `image does not exist: ${img[1]}`);
}
const llms = fs.readFileSync(path.join(DIST, 'llms.txt'), 'utf8');

for (const f of html.filter((f) => /[\\/]docs[\\/][^\\/]+[\\/]index\.html$/.test(f))) {
    const p = `/${path.relative(DIST, path.dirname(f)).replace(/\\/g, '/')}/`;

    if (!llms.includes(`${SITE_URL}${p}`)) err('/llms.txt', `missing ${p}`);
    if (!fs.existsSync(path.join(DIST, `${p.slice(0, -1)}.md`))) err(p, 'missing Markdown twin');
}

for (const w of warnings) console.log(`warn  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
console.log(
    `check-seo: ${html.length} pages, ${locs.length} sitemap URLs, ${errors.length} errors, ${warnings.length} warnings`,
);
process.exit(errors.length ? 1 : 0);
