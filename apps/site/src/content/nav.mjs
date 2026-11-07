/**
 * The docs, grouped into areas. This file is the one place that says what the site knows and in
 * which order a reader meets it.
 *
 * Each area gets a hub page at `/docs/<id>/` (an introduction, its pages in reading order, the
 * lab experiments that go deeper and links out), a block on the `/docs/` index and its own sidebar
 * in the docs layout. Its pages keep their URLs at `/docs/<page>/`.
 *
 * Every page in src/content/docs must appear in exactly one area (checked at build time), so the
 * sidebar, hubs, sitemap, llms.txt and prev/next links can never drift apart.
 *
 * To add a page: drop `<page>.mdx` in src/content/docs and list its id under one area.
 * To add an area: add an entry below. Its id becomes the hub URL and must not match a page id.
 * An area with no pages and no links yet is left out of the site until it has some.
 *
 * @typedef {{ label: string, href: string, description: string }} AreaLink
 * @typedef {{
 *   id: string,
 *   title: string,
 *   summary: string,
 *   intro: string[],
 *   items: string[],
 *   lab?: string[],
 *   links?: AreaLink[],
 *   aliases?: string[],
 * }} DocsArea
 * @type {DocsArea[]}
 */
export const DOCS_AREAS = [
    {
        id: 'start',
        title: 'Get started',
        summary: 'Install pixi-silk, draw a first scene and move code over from PixiJS Graphics.',
        intro: [
            'Start here if pixi-silk is new to you. The introduction says what it is and when it helps.',
            'Installation and the quick start get a smooth scene on screen in a few minutes. The migration page maps Graphics calls to SilkGraphics.',
        ],
        items: ['introduction', 'installation', 'quick-start', 'migrating-from-graphics'],
        lab: ['01-primitives', '02-versus'],
        aliases: ['getting-started'],
    },
    {
        id: 'drawing',
        title: 'Drawing',
        summary: 'Shapes, arcs, lines and paths, fills and strokes, dashes and transforms.',
        intro: [
            'Everything SilkGraphics can draw, one primitive family per page. Each page opens with a live demo and its source.',
            'Read shapes first. The other pages build on its fill and stroke calls, and transforms apply to all of them.',
        ],
        items: ['shapes', 'arcs-and-rings', 'lines-and-paths', 'fills-and-strokes', 'dashes', 'transforms'],
        lab: ['07-rounded-rects', '08-activity-rings', '09-lines', '10-dashes', '11-icons'],
    },
    {
        id: 'paint',
        title: 'Paint',
        summary: 'Gradients in OKLab without banding, glows, soft shadows and motion blur.',
        intro: [
            'What goes inside a shape once it is drawn. Gradients cover linear, radial, conic and along-the-path ramps.',
            'Blur turns the same distance field into glows and shadows without a filter pass.',
        ],
        items: ['gradients', 'blur-and-shadows'],
        lab: ['12-gradients', '13-banding', '14-glow'],
    },
    {
        id: 'ui',
        title: 'UI widgets',
        summary: 'Charts, pointer input and animation for interfaces drawn on the canvas.',
        intro: [
            'Pages for building interface pieces out of the drawing primitives. Charts show smoothed series and fills.',
            'Hit testing and animation cover how a widget reacts to the pointer and how it moves.',
        ],
        items: ['charts', 'hit-testing', 'animation'],
        lab: ['15-area-chart', '16-bar-charts', '18-ranges', '20-gauges', '21-sparklines'],
        aliases: ['building-ui'],
    },
    {
        id: 'editor-ui',
        title: 'Editor UI',
        summary: 'Tools for editors and design apps built on the pixi-silk/ui widgets.',
        intro: [
            'Widgets for editors and design tools, built from the UI building blocks.',
            'Each page shows one tool live, then its options and events.',
        ],
        items: [],
    },
    {
        id: 'examples',
        title: 'Examples',
        summary: 'Whole screens built with pixi-silk, from reference sheets rebuilt 1:1 to a live dashboard.',
        intro: [
            'Complete scenes that combine the other areas. They are examples on the site, not library code.',
            'The showcase compares five design sheets with their live rebuild. The widget viewer opens any of its widgets up close.',
        ],
        items: [],
        lab: ['26-dashboard', '30-sheet-health', '33-sheet-live-activities', '35-widget-viewer'],
        links: [
            {
                label: 'Showcase',
                href: '/showcase/',
                description: 'Five design reference sheets next to their live rebuild, 81 widgets in all.',
            },
            {
                label: 'Widget viewer',
                href: '/lab/35-widget-viewer/',
                description: 'Any showcase widget, large, next to its crop of the reference or laid over it.',
            },
        ],
    },
    {
        id: 'rendering',
        title: 'Rendering',
        summary: 'How the anti-aliasing works, crisp canvases on any screen and what it costs.',
        intro: [
            'The ideas under the API. The first three pages compare pixi-silk with the other ways to smooth PixiJS graphics.',
            'Resolution and performance cover canvas setup and cost. How it works walks through the shader.',
        ],
        items: [
            'smooth-graphics-pixijs',
            'antialiasing-in-pixijs',
            'graphics-smooth-v8',
            'resolution',
            'performance',
            'how-it-works',
        ],
        lab: ['03-zoom', '04-subpixel', '05-resolution', '06-render-texture', '27-stress'],
        aliases: ['smooth-graphics'],
    },
    {
        id: 'reference',
        title: 'Reference',
        summary: 'The generated API reference, the glossary, the FAQ, the changelog and plain-text docs.',
        intro: [
            'Look things up here once you know what you need. The API reference lists every export with its JSDoc.',
            'The glossary defines the terms the guides use.',
        ],
        items: ['glossary'],
        links: [
            {
                label: 'API reference',
                href: '/api/',
                description: 'Every export, generated from the source JSDoc.',
            },
            { label: 'FAQ', href: '/faq/', description: 'Short answers to the usual questions.' },
            { label: 'Changelog', href: '/changelog/', description: 'What changed in each release.' },
            {
                label: 'llms-full.txt',
                href: '/llms-full.txt',
                description: 'All docs and demo sources as one plain-text file for AI assistants.',
            },
        ],
    },
];

/** Areas the site shows: those with at least one page or link. */
export const VISIBLE_AREAS = DOCS_AREAS.filter((a) => a.items.length > 0 || (a.links?.length ?? 0) > 0);

/** Docs pages in reading order, grouped by area. Derived from DOCS_AREAS. */
export const DOCS_NAV = DOCS_AREAS.filter((a) => a.items.length > 0).map((a) => ({
    id: a.id,
    title: a.title,
    items: a.items,
}));

/** Extra links under the sidebar. */
export const DOCS_LINKS = [
    { label: 'API reference', href: '/api/' },
    { label: 'FAQ', href: '/faq/' },
    { label: 'Changelog', href: '/changelog/' },
];
