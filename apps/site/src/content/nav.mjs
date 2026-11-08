/**
 * The docs, grouped into areas. This file is the one place that says what the site knows and in
 * which order a reader meets it.
 *
 * An area is a self-contained module: a hub page at `/docs/<id>/` (introduction, pages in reading
 * order, each page with the lab experiments that go deeper on it, links out and the questions on
 * its topic), a block on the `/docs/` index and its own sidebar. Pages keep their URLs at
 * `/docs/<page>/`, lab experiments at `/lab/<slug>/`.
 *
 * Every docs page and every lab experiment belongs to exactly one place (checked at build time),
 * so the sidebar, hubs, sitemap, llms.txt and prev/next links can never drift apart.
 *
 * To add a page: drop `<page>.mdx` in src/content/docs and list its id under one area.
 * To attach a lab experiment: list its slug under the page it deepens (`{ page, lab: [...] }`).
 * To add an area: add an entry below. Its id becomes the hub URL and must not match a page id.
 * An area with no pages and no links yet is left out of the site until it has some.
 *
 * @typedef {{ label: string, href: string, description: string }} AreaLink
 * @typedef {string | { page: string, lab: string[] }} AreaItem
 * @typedef {{
 *   id: string,
 *   title: string,
 *   summary: string,
 *   intro: string[],
 *   items: AreaItem[],
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
        items: [
            { page: 'introduction', lab: ['01-primitives'] },
            'installation',
            'quick-start',
            { page: 'migrating-from-graphics', lab: ['02-versus'] },
        ],
        aliases: ['getting-started'],
    },
    {
        id: 'drawing',
        title: 'Drawing',
        summary: 'Every shape SilkGraphics can draw, and how to fill, stroke and move it.',
        intro: [
            'Everything SilkGraphics can draw, one primitive family per page. Each page opens with a live demo and its source.',
            'Read shapes first. The other pages build on its fill and stroke calls, and transforms apply to all of them.',
        ],
        items: [
            { page: 'shapes', lab: ['07-rounded-rects', '11-icons'] },
            { page: 'arcs-and-rings', lab: ['08-activity-rings'] },
            { page: 'lines-and-paths', lab: ['09-lines'] },
            'fills-and-strokes',
            { page: 'dashes', lab: ['10-dashes'] },
            'transforms',
        ],
    },
    {
        id: 'paint',
        title: 'Paint',
        summary: 'Gradients that do not band, and blur that turns any shape into a glow or a shadow.',
        intro: [
            'What goes inside a shape once it is drawn. Gradients cover linear, radial, conic and along-the-path ramps.',
            'Blur turns the same distance field into glows and shadows without a filter pass.',
        ],
        items: [
            { page: 'gradients', lab: ['12-gradients', '13-banding'] },
            { page: 'blur-and-shadows', lab: ['14-glow'] },
            'effects',
            'glass-and-glow',
        ],
    },
    {
        id: 'ui',
        title: 'UI widgets',
        summary: 'Charts and sharp text, plus the first ready-made widgets and how they react to input.',
        intro: [
            'Pages for building interface pieces out of the drawing primitives. Charts show smoothed series and fills.',
            'Sharp text draws labels and readouts from distance fields, so they stay crisp under a zooming camera. Editing text makes them clickable and typeable, like a design tool text layer.',
            'Hit testing and animation cover how a widget reacts to the pointer and how it moves.',
            'Radial menus and buttons are the first ready-made widgets. Each lives under its own pixi-silk/ui entry point.',
        ],
        items: [
            { page: 'charts', lab: ['15-area-chart', '16-bar-charts', '18-ranges', '20-gauges', '21-sparklines'] },
            'text',
            'editing-text',
            'hit-testing',
            { page: 'animation', lab: ['23-timers'] },
            'radial-menus-and-buttons',
        ],
        aliases: ['building-ui'],
    },
    {
        id: 'editor-ui',
        title: 'Editor UI',
        summary: 'Everything a design tool draws on its canvas, from the camera and rulers to gizmos and undo.',
        intro: [
            'Widgets for editors and design tools, built from the UI building blocks. Each one is its own pixi-silk/ui entry point.',
            'Start with the camera and measurements, then the grid, rulers, guides and marquee around them. Transform gizmos move things. A selection store and an undo history tie them together, and the path gizmo edits vector shapes. Colour pickers, editor tools and dials add the controls.',
        ],
        items: [
            'canvas-and-measurements',
            'canvas-tools',
            'transform-gizmos',
            'selection-and-history',
            'path-editing',
            'color-pickers',
            'editor-tools',
            'dials-and-timeline',
        ],
    },
    {
        id: 'examples',
        title: 'Examples',
        summary: 'Whole screens built with pixi-silk, from reference sheets rebuilt 1:1 to a live dashboard.',
        intro: [
            'Complete scenes that combine the other areas. They are examples on the site, not library code.',
            'The showcase compares five design sheets with their live rebuild, and every sheet and widget opens full screen. The slot HUD page has game controls to copy.',
        ],
        items: [
            {
                page: 'showcase',
                lab: [
                    '30-sheet-health',
                    '31-sheet-complications',
                    '32-sheet-fitness',
                    '33-sheet-live-activities',
                    '34-sheet-watch',
                    '35-widget-viewer',
                    '17-pills-waves',
                    '19-health-cards',
                    '22-sleep',
                    '24-journeys',
                    '25-sky',
                    '26-dashboard',
                ],
            },
            'gallery',
            'slot-hud',
        ],
    },
    {
        id: 'rendering',
        title: 'Rendering',
        summary: 'How the anti-aliasing works, crisp canvases on any screen and what it costs.',
        intro: [
            'The ideas under the API. The first three pages compare pixi-silk with the other ways to smooth PixiJS graphics.',
            'Resolution, renderers and performance cover canvas setup and cost. How it works walks through the shader.',
        ],
        items: [
            'smooth-graphics-pixijs',
            { page: 'antialiasing-in-pixijs', lab: ['03-zoom', '04-subpixel'] },
            'graphics-smooth-v8',
            { page: 'resolution', lab: ['05-resolution', '06-render-texture'] },
            'webgpu',
            { page: 'performance', lab: ['27-stress'] },
            'how-it-works',
        ],
        aliases: ['smooth-graphics'],
    },
    {
        id: 'reference',
        title: 'Reference',
        summary: 'The API reference lists every export with its JSDoc. The other pages here are for looking things up.',
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
            { label: 'FAQ', href: '/faq/', description: 'Short answers to the usual questions, grouped by area.' },
            { label: 'Changelog', href: '/changelog/', description: 'What changed in each release.' },
            {
                label: 'llms-full.txt',
                href: '/llms-full.txt',
                description: 'All docs and demo sources as one plain-text file for AI assistants.',
            },
        ],
    },
];

/** Page id of an area item. */
export const itemPage = (/** @type {AreaItem} */ item) => (typeof item === 'string' ? item : item.page);

/** Lab experiments attached to an area item. */
export const itemLab = (/** @type {AreaItem} */ item) => (typeof item === 'string' ? [] : item.lab);

/** Areas the site shows: those with at least one page or link. */
export const VISIBLE_AREAS = DOCS_AREAS.filter((a) => a.items.length > 0 || (a.links?.length ?? 0) > 0);

/** Docs pages in reading order, grouped by area. Derived from DOCS_AREAS. */
export const DOCS_NAV = DOCS_AREAS.filter((a) => a.items.length > 0).map((a) => ({
    id: a.id,
    title: a.title,
    items: a.items.map(itemPage),
}));

/** Extra links under the sidebar. */
export const DOCS_LINKS = [
    { label: 'API reference', href: '/api/' },
    { label: 'FAQ', href: '/faq/' },
    { label: 'Changelog', href: '/changelog/' },
];
