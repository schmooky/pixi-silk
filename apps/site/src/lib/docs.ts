import { type CollectionEntry, getCollection } from 'astro:content';
import { type AreaLink, DOCS_AREAS, DOCS_NAV, VISIBLE_AREAS } from '@/content/nav.mjs';
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
}

export interface LabLink {
    slug: string;
    name: string;
    description: string;
    href: string;
}

export interface Area {
    id: string;
    title: string;
    summary: string;
    intro: string[];
    href: string;
    pages: DocLink[];
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
    cache = DOCS_NAV.flatMap((section) =>
        section.items.map((id) => {
            const { title, description } = byId.get(id)!.data;

            return { slug: id, title, description, href: `/docs/${id}/`, section: section.title, area: section.id };
        }),
    );

    return cache;
}

/** The areas the site shows, with their pages and lab experiments resolved. */
export async function docsAreas(): Promise<Area[]> {
    if (areaCache) return areaCache;
    const docs = await docsInOrder();
    const lab = new Map(
        LAB_SECTIONS.flatMap(([, items]) => items).map(([slug, name, description]) => [
            slug,
            { slug, name, description, href: `/lab/${slug}/` },
        ]),
    );

    areaCache = VISIBLE_AREAS.map((a) => {
        const unknownLab = (a.lab ?? []).filter((slug) => !lab.has(slug));

        if (unknownLab.length) {
            throw new Error(`src/content/nav.mjs: area "${a.id}" lists unknown lab pages [${unknownLab.join(', ')}].`);
        }

        return {
            id: a.id,
            title: a.title,
            summary: a.summary,
            intro: a.intro,
            href: `/docs/${a.id}/`,
            pages: docs.filter((d) => d.area === a.id),
            lab: (a.lab ?? []).map((slug) => lab.get(slug)!),
            links: a.links ?? [],
            aliases: a.aliases ?? [],
        };
    });

    return areaCache;
}
