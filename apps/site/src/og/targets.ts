import { getCollection } from 'astro:content';
import { DOCS_AREAS, DOCS_NAV, itemLab, itemPage, VISIBLE_AREAS } from '@/content/nav.mjs';
import { LAB_SECTIONS } from '@/lab/catalog.mjs';
import type { OgTarget } from './render';

/** One card per route family; ids match `ogUrlForPath()` in src/lib/seo.ts. */
export async function ogTargets(): Promise<OgTarget[]> {
    const docs = await getCollection('docs');
    // each experiment's card names the area and page it belongs to
    const titles = new Map(docs.map((d) => [d.id, d.data.title]));
    const labArea = new Map(
        DOCS_AREAS.flatMap((a) =>
            a.items.flatMap((item) => itemLab(item).map((slug) => [slug, `${a.title}: ${titles.get(itemPage(item))}`])),
        ),
    );
    const home = {
        eyebrow: 'PixiJS v8, WebGL2',
        title: 'Vector graphics, smooth as silk',
        subtitle:
            'Exact anti-aliasing at any zoom and DPR. Squircles, arcs, dashes, OKLab gradients and glows, one draw call per object.',
    };

    return [
        { id: 'home', ...home },
        { id: 'default', ...home },
        {
            id: 'section/docs',
            eyebrow: 'Documentation',
            title: 'Guides with live demos',
            subtitle: 'Shapes, strokes, dashes, gradients, glows, charts, transforms, hit testing and rendering.',
        },
        {
            id: 'section/api',
            eyebrow: 'API reference',
            title: 'Every export, from the source',
            subtitle: 'SilkGraphics, createSilkApp, gradients, curves and motion helpers.',
        },
        {
            id: 'section/faq',
            eyebrow: 'FAQ',
            title: 'Questions & answers',
            subtitle: 'Smooth PixiJS graphics, squircles, gradients without banding, retina canvases.',
        },
        {
            id: 'section/studio',
            eyebrow: 'Studio',
            title: 'Code next to canvas',
            subtitle: 'Every demo and experiment, editable, running as you type.',
        },
        { id: 'section/changelog', eyebrow: 'Changelog', title: 'Release notes' },
        {
            id: 'section/search',
            eyebrow: 'Search',
            title: 'Search the docs',
            subtitle: 'Anti-aliasing, smooth shapes, gradients, charts and the full API.',
        },
        ...docs.map((d) => ({
            id: `docs/${d.id}`,
            eyebrow: DOCS_NAV.find((a) => a.items.includes(d.id))?.title ?? 'Docs',
            title: d.data.title,
            subtitle: d.data.description,
        })),
        ...VISIBLE_AREAS.map((a) => ({
            id: `docs/${a.id}`,
            eyebrow: 'Docs area',
            title: a.title,
            subtitle: a.summary,
        })),
        ...LAB_SECTIONS.flatMap(([, items]) =>
            items.map(([slug, name, description]) => ({
                id: `lab/${slug}`,
                eyebrow: labArea.get(slug) ?? 'Docs',
                title: name,
                subtitle: description,
            })),
        ),
    ];
}
