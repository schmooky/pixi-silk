import { getImage } from 'astro:assets';
import { getCollection } from 'astro:content';
import type { APIRoute } from 'astro';
import { LAB_SECTIONS } from '@/lab/catalog.mjs';
import { apiPages } from '@/lib/api';
import { docsAreas, docsInOrder } from '@/lib/docs';
import { canonical, imageUrl, isoDate } from '@/lib/seo';
import { SHEETS } from '@/lib/showcase';
import { SITE } from '@/lib/site';

interface Entry {
    path: string;
    priority: string;
    lastmod?: string;
    images?: { loc: string; title: string }[];
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** Every route family is listed on purpose; lastmod only where content dates are known. */
export const GET: APIRoute = async () => {
    const docs = await docsInOrder();
    const areas = await docsAreas();
    const updated = new Map((await getCollection('docs')).map((e) => [e.id, isoDate(e.data.updated)]));
    const newest = [...updated.values()].sort().at(-1);
    const showcaseImages = await Promise.all(
        SHEETS.map(async (s) => ({
            loc: imageUrl((await getImage({ src: s.image, format: 'jpg' })).src),
            title: s.alt,
        })),
    );
    const entries: Entry[] = [
        {
            path: '/',
            priority: '1.0',
            lastmod: newest,
            images: [{ loc: imageUrl('/og/home.png'), title: SITE.tagline }],
        },
        { path: '/docs/', priority: '0.9', lastmod: newest },
        ...areas.map((a) => ({
            path: a.href,
            priority: '0.85',
            lastmod:
                a.pages
                    .map((d) => updated.get(d.slug))
                    .sort()
                    .at(-1) ?? newest,
            images: [{ loc: imageUrl(`/og/docs/${a.id}.png`), title: a.title }],
        })),
        ...docs.map((d) => ({
            path: d.href,
            priority: '0.85',
            lastmod: updated.get(d.slug),
            images: [{ loc: imageUrl(`/og/docs/${d.slug}.png`), title: d.title }],
        })),
        { path: '/api/', priority: '0.8' },
        ...apiPages()
            .filter((p) => p.href !== '/api/')
            .map((p) => ({ path: p.href, priority: '0.6' })),
        { path: '/faq/', priority: '0.8', lastmod: newest },
        { path: '/showcase/', priority: '0.7', images: showcaseImages },
        { path: '/lab/', priority: '0.6' },
        ...LAB_SECTIONS.flatMap(([, items]) => items.map(([slug]) => ({ path: `/lab/${slug}/`, priority: '0.4' }))),
        { path: '/changelog/', priority: '0.4' },
    ];
    const seen = new Set<string>();
    const urls = entries
        .filter((e) => !seen.has(e.path) && seen.add(e.path))
        .map((e) =>
            [
                '  <url>',
                `    <loc>${canonical(e.path)}</loc>`,
                e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : '',
                `    <priority>${e.priority}</priority>`,
                ...(e.images ?? []).map(
                    (i) =>
                        `    <image:image><image:loc>${xml(i.loc)}</image:loc><image:title>${xml(i.title)}</image:title></image:image>`,
                ),
                '  </url>',
            ]
                .filter(Boolean)
                .join('\n'),
        );
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls.join('\n')}\n</urlset>\n`;

    return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
