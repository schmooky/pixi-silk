import { type CollectionEntry, getCollection } from 'astro:content';
import { type AreaLink, DOCS_AREAS, DOCS_NAV, itemLab, itemPage, VISIBLE_AREAS } from '@/content/nav.mjs';
import { LAB_SECTIONS } from '@/lab/catalog.mjs';

export interface DocLink {
    slug: string;
    title: string;
    description: string;
    href: string;
    /** Area title, used as the page's section label. */
    section: string;
    /** Area id: the hub lives at `/docs/<area>/`. */
    area: string;
    /** Lab experiments that go deeper on this page. */
    lab: LabLink[];
    /** The page's first live demo, shown with its pitch on the area hub. */
    demo?: { name: string; height: number; caption?: string };
    /** Every live demo on the page, in order. */
    demos: string[];
}

export interface LabLink {
    slug: string;
    name: string;
    description: string;
    href: string;
    /** The docs page this experiment deepens, and its area. */
    page: string;
    pageTitle: string;
    pageHref: string;
    area: string;
    areaTitle: string;
}

export interface Area {
    id: string;
    title: string;
    summary: string;
    intro: string[];
    href: string;
    pages: DocLink[];
    /** Every lab experiment in the area, in page order. */
    lab: LabLink[];
    links: AreaLink[];
    aliases: string[];
}

let cache: DocLink[] | null = null;
let areaCache: Area[] | null = null;

/** Docs pages in reading order. Throws when the nav and the collection disagree. */
export async function docsInOrder(): Promise<DocLink[]> {
    if (cache) return cache;
    const entries = await getCollection('docs');
    const byId = new Map<string, CollectionEntry<'docs'>>(entries.map((e) => [e.id, e]));
    const listed = DOCS_NAV.flatMap((s) => s.items);
    const missing = entries.filter((e) => !listed.includes(e.id)).map((e) => e.id);
    const unknown = listed.filter((id) => !byId.has(id));
    const twice = listed.filter((id, i) => listed.indexOf(id) !== i);
    const clash = DOCS_AREAS.map((a) => a.id).filter((id) => byId.has(id));

    if (missing.length || unknown.length || twice.length || clash.length) {
        throw new Error(
            `src/content/nav.mjs is out of sync. Not in nav: [${missing.join(', ')}]. No such page: [${unknown.join(', ')}]. ` +
                `Listed twice: [${twice.join(', ')}]. Area id equals a page id: [${clash.join(', ')}].`,
        );
    }
    const catalog = new Map(
        LAB_SECTIONS.flatMap(([, items]) => items).map(([slug, name, description]) => [slug, { name, description }]),
    );
    const placed = DOCS_AREAS.flatMap((a) => a.items.flatMap(itemLab));
    const unknownLab = placed.filter((slug) => !catalog.has(slug));
    const labTwice = placed.filter((slug, i) => placed.indexOf(slug) !== i);
    const homeless = [...catalog.keys()].filter((slug) => !placed.includes(slug));

    if (unknownLab.length || labTwice.length || homeless.length) {
        throw new Error(
            `src/content/nav.mjs: every lab experiment belongs to one page. Unknown: [${unknownLab.join(', ')}]. ` +
                `Listed twice: [${labTwice.join(', ')}]. Not attached to a page: [${homeless.join(', ')}].`,
        );
    }
    cache = DOCS_AREAS.filter((a) => a.items.length > 0).flatMap((area) =>
        area.items.map((item) => {
            const id = itemPage(item);
            const entry = byId.get(id)!;
            const { title, description } = entry.data;
            const href = `/docs/${id}/`;
            const lab = itemLab(item).map((slug) => ({
                slug,
                ...catalog.get(slug)!,
                href: `/lab/${slug}/`,
                page: id,
                pageTitle: title,
                pageHref: href,
                area: area.id,
                areaTitle: area.title,
            }));

            return {
                slug: id,
                title,
                description,
                href,
                section: area.title,
                area: area.id,
                lab,
                demo: firstDemo(entry.body ?? ''),
                demos: [...new Set([...(entry.body ?? '').matchAll(/<Demo\b[^>]*\bname="([^"]+)"/g)].map((m) => m[1]))],
            };
        }),
    );

    return cache;
}

/** The first `<Demo name="..." height={...} caption="..." />` in a page's MDX source. */
function firstDemo(body: string): DocLink['demo'] {
    const tag = body.match(/<Demo\b[^>]*\/>/)?.[0];
    const name = tag?.match(/name="([^"]+)"/)?.[1];

    if (!tag || !name) return undefined;

    return {
        name,
        height: Number(tag.match(/height=\{(\d+)\}/)?.[1] ?? 280),
        caption: tag.match(/caption="([^"]*)"/)?.[1],
    };
}

/** Where each lab experiment lives: its page and area. */
export async function labHomes(): Promise<Map<string, LabLink>> {
    const docs = await docsInOrder();

    return new Map(docs.flatMap((d) => d.lab.map((l) => [l.slug, l] as const)));
}

/** The areas the site shows, with their pages and lab experiments resolved. */
export async function docsAreas(): Promise<Area[]> {
    if (areaCache) return areaCache;
    const docs = await docsInOrder();

    areaCache = VISIBLE_AREAS.map((a) => {
        const pages = docs.filter((d) => d.area === a.id);

        return {
            id: a.id,
            title: a.title,
            summary: a.summary,
            intro: a.intro,
            href: `/docs/${a.id}/`,
            pages,
            lab: pages.flatMap((p) => p.lab),
            links: a.links ?? [],
            aliases: a.aliases ?? [],
        };
    });

    return areaCache;
}
