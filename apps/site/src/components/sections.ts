import fs from 'node:fs';
import path from 'node:path';
import * as nav from '@/content/nav.mjs';
import { type Area, type DocLink, docsAreas } from '@/lib/docs';

/*
 * The site's top level: Learn, Features, Examples and Reference. Each section holds docs areas,
 * and each area holds pages. nav.mjs names the section of every area (`section`). Areas without
 * one fall back to the table below, so the chrome reads the same before and after that field.
 */

export type SectionId = 'learn' | 'features' | 'examples' | 'reference';

export interface SectionArea extends Area {
    section: SectionId;
    experimental: boolean;
}

export interface Section {
    id: SectionId;
    title: string;
    /** One line for cards and hub headers. */
    summary: string;
    /** The section's landing page: its own area hub when one shares its id, else `/docs/<id>/`. */
    href: string;
    areas: SectionArea[];
    /** True when no area owns the section's URL, so `/docs/<id>/` is a section hub page. */
    hub: boolean;
}

const ORDER: { id: SectionId; title: string; summary: string }[] = [
    {
        id: 'learn',
        title: 'Learn',
        summary: 'Install pixi-silk, draw a first scene and build a widget and an editor canvas.',
    },
    {
        id: 'features',
        title: 'Features',
        summary: 'Everything pixi-silk draws, paints and lays out, one page per feature.',
    },
    {
        id: 'examples',
        title: 'Examples',
        summary: 'Whole screens built with pixi-silk, with the source next to each one.',
    },
    {
        id: 'reference',
        title: 'Reference',
        summary: 'The API, renderers, resolution, performance and how the shader works.',
    },
];

// the areas before nav.mjs named sections
const LEGACY: Record<string, SectionId> = {
    start: 'learn',
    drawing: 'features',
    paint: 'features',
    ui: 'features',
    'editor-ui': 'features',
    examples: 'examples',
    rendering: 'reference',
    reference: 'reference',
};

interface RawArea {
    id: string;
    section?: SectionId;
    experimental?: boolean;
}

const raw = new Map((nav.DOCS_AREAS as RawArea[]).map((a) => [a.id, a]));
const titles = (nav as { DOCS_SECTIONS?: { id: SectionId; title: string }[] }).DOCS_SECTIONS;

let cache: Section[] | null = null;

/** The four sections in order, each with its areas. Sections with no areas are left out. */
export async function docsSections(): Promise<Section[]> {
    if (cache) return cache;
    const areas: SectionArea[] = (await docsAreas()).map((a) => ({
        ...a,
        section: raw.get(a.id)?.section ?? LEGACY[a.id] ?? 'features',
        experimental: raw.get(a.id)?.experimental ?? false,
    }));

    cache = ORDER.map((s) => {
        const own = areas.filter((a) => a.section === s.id);
        const lead = own.find((a) => a.id === s.id);

        return {
            ...s,
            title: titles?.find((t) => t.id === s.id)?.title ?? s.title,
            href: lead ? lead.href : `/docs/${s.id}/`,
            hub: !lead,
            areas: own,
        };
    }).filter((s) => s.areas.length > 0);

    return cache;
}

/** The section an area sits in. */
export async function sectionOfArea(areaId: string | undefined): Promise<Section | undefined> {
    return (await docsSections()).find((s) => s.areas.some((a) => a.id === areaId));
}

// ---------------------------------------------------------------------------------- thumbnails

const THUMBS = path.join(process.cwd(), 'public/thumbs');
const have = (file: string) => fs.existsSync(path.join(THUMBS, file));

/**
 * The thumbnail of a docs page: its first demo, else its first lab experiment, else none
 * (the card then draws a neutral tile). `scripts/capture-thumbs.mjs` writes the images.
 */
export function pageThumb(page: Pick<DocLink, 'slug' | 'demo' | 'demos' | 'lab'>): string | undefined {
    const files = [
        `page-${page.slug}.webp`,
        ...(page.demo ? [`${page.demo.name}.webp`] : []),
        ...page.demos.map((d) => `${d}.webp`),
        ...page.lab.map((l) => `lab-${l.slug}.webp`),
    ];
    const hit = files.find(have);

    return hit ? `/thumbs/${hit}` : undefined;
}

/** A named thumbnail of a site page (`studio`), if one was captured. */
export function siteThumb(name: string): string | undefined {
    return have(`${name}.webp`) ? `/thumbs/${name}.webp` : undefined;
}

/** The thumbnail of a lab experiment, if one was captured. */
export function labThumb(slug: string): string | undefined {
    return have(`lab-${slug}.webp`) ? `/thumbs/lab-${slug}.webp` : undefined;
}

/** The thumbnail of an area: the first of its pages that has one. */
export function areaThumb(area: Pick<Area, 'pages'>): string | undefined {
    for (const p of area.pages) {
        const t = pageThumb(p);

        if (t) return t;
    }

    return undefined;
}
