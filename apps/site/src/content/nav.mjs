/**
 * The docs, grouped into areas. This file is the one place that says what the site knows and in
 * which order a reader meets it.
 *
 * An area is a self-contained module: a hub page at `/docs/<id>/` (introduction, pages in reading
 * order, each page with the lab experiments that go deeper on it, links out and the questions on
 * its topic), a block on the `/docs/` index and its own sidebar. Pages keep their URLs at
 * `/docs/<page>/`, lab experiments at `/lab/<slug>/`.
 *
 * Areas sit in four top-level sections (`section`): Learn, Features, Examples and Reference.
 * {@link DOCS_SECTIONS} lists them in order.
 *
 * Every docs page and every lab experiment belongs to exactly one place (checked at build time),
 * so the sidebar, hubs, sitemap, llms.txt and prev/next links can never drift apart.
 *
 * To add a page: drop `<page>.mdx` in src/content/docs and list its id under one area.
 * To attach a lab experiment: list its slug under the page it deepens (`{ page, lab: [...] }`).
 * To add an area: add an entry below. Its id becomes the hub URL and must not match a page id.
 * An area with no pages and no links yet is left out of the site until it has some.
 * A removed page or experiment needs a redirect in astro.config.mjs.
 *
 * @typedef {'learn' | 'features' | 'examples' | 'reference'} SectionId
 * @typedef {{ label: string, href: string, description: string }} AreaLink
 * @typedef {string | { page: string, lab: string[] }} AreaItem
 * @typedef {{
 *   id: string,
 *   title: string,
 *   section: SectionId,
 *   summary: string,
 *   intro: string[],
 *   items: AreaItem[],
 *   links?: AreaLink[],
 *   aliases?: string[],
 *   experimental?: boolean,
 * }} DocsArea
 * @type {DocsArea[]}
 */
export const DOCS_AREAS = [
    {
        id: 'learn',
        title: 'Learn',
        section: 'learn',
        summary:
            'Install pixi-silk, pick the entry points you need and build a first widget and a first editor canvas.',
        intro: [
            'Start here if pixi-silk is new to you. Getting started installs it and draws a first scene.',
            'The two tutorials build a button and an editor canvas from scratch. The migration page maps Graphics calls to SilkGraphics.',
        ],
        items: [
            'getting-started',
            'migrating-from-graphics',
            'choose-an-entry-point',
            'first-widget',
            'first-editor-canvas',
        ],
        aliases: ['start'],
    },
    {
        id: 'shapes-and-strokes',
        title: 'Shapes & strokes',
        section: 'features',
        summary: 'Every shape SilkGraphics draws, how to stroke and dash it, and how to combine shapes.',
        intro: [
            'One primitive family per page. Read shapes first: the other pages build on its fill and stroke calls.',
        ],
        items: [
            { page: 'shapes', lab: ['01-primitives', '07-rounded-rects', '11-icons'] },
            'lines-and-paths',
            'strokes-and-dashes',
            'shape-operations',
        ],
        aliases: ['drawing'],
    },
    {
        id: 'paint',
        title: 'Paint',
        section: 'features',
        summary: 'What goes inside a shape: gradients, shadows and blur, inner shadows, glass and glow.',
        intro: [
            'Gradients cover linear, radial, conic, mesh and along-the-path ramps.',
            'Shadows and effects blur a shape without a filter pass. Glass and glow are filters for the panels and lights around it.',
        ],
        items: [{ page: 'gradients', lab: ['13-banding'] }, 'shadows-and-effects', 'glass-and-glow'],
    },
    {
        id: 'typography',
        title: 'Text',
        section: 'features',
        summary: 'Labels and readouts drawn from distance fields, and text the reader can click and type into.',
        intro: ['Text draws labels with SilkText. Editing text turns a label into a field the reader types into.'],
        items: ['text', 'editing-text'],
    },
    {
        id: 'game-ui',
        title: 'Game UI',
        section: 'features',
        summary: 'Buttons, radial menus, layout, input and motion, and the controls of a slot game HUD.',
        intro: [
            'Ready-made widgets for game screens, each under its own pixi-silk/ui entry point.',
            'Layout places them. Interaction and motion cover hit testing and springs. The slot HUD page puts them together.',
        ],
        items: ['radial-menus-and-buttons', 'layout', 'interaction-and-motion', 'slot-hud'],
        aliases: ['ui', 'building-ui'],
    },
    {
        id: 'editor-kit',
        title: 'Editor kit',
        section: 'features',
        experimental: true,
        summary:
            'The pieces of a design tool canvas: camera, rulers, gizmos, selection, path editing, pickers and panels.',
        intro: [
            'Widgets for editors and level tools, each under its own pixi-silk/ui entry point. The editor kit is experimental in 1.0: its API may change in a minor release.',
            'Start with the camera and rulers, then gizmos and selection. The other pages add path editing, colour pickers, tools, dials and panels.',
        ],
        items: [
            'canvas-and-rulers',
            'gizmos-and-selection',
            'path-editing',
            'color-pickers',
            'editor-tools',
            'dials-and-timeline',
            'panels',
        ],
        aliases: ['editor-ui'],
    },
    {
        id: 'examples',
        title: 'Examples',
        section: 'examples',
        summary: 'Whole screens built with pixi-silk: five design sheets rebuilt 1:1, gallery scenes and charts.',
        intro: [
            'Complete scenes that combine the features. They are site code, not library code, so copy what you need.',
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
                    '23-timers',
                    '24-journeys',
                    '25-sky',
                    '26-dashboard',
                ],
            },
            { page: 'charts', lab: ['15-area-chart', '16-bar-charts', '18-ranges', '20-gauges', '21-sparklines'] },
        ],
    },
    {
        id: 'reference',
        title: 'Reference',
        section: 'reference',
        summary: 'The API reference, renderers, resolution, performance and the glossary.',
        intro: [
            'Look things up here once you know what you need. The API reference lists every export with its JSDoc.',
        ],
        items: [
            'renderers',
            { page: 'resolution', lab: ['05-resolution', '06-render-texture'] },
            'performance',
            'glossary',
        ],
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
    {
        id: 'architecture',
        title: 'Architecture',
        section: 'reference',
        summary:
            'How the shader draws a pixel, how pixi-silk compares with other anti-aliasing and how layout computes.',
        intro: ['The ideas under the API. Read these when you want to know why a result looks the way it does.'],
        items: ['how-it-works', { page: 'anti-aliasing-compared', lab: ['03-zoom', '04-subpixel'] }, 'layout-engine'],
        aliases: ['rendering', 'smooth-graphics'],
    },
];

/** The four top-level sections, in order, with the areas in each. Derived from DOCS_AREAS. */
export const DOCS_SECTIONS = /** @type {const} */ ([
    { id: 'learn', title: 'Learn' },
    { id: 'features', title: 'Features' },
    { id: 'examples', title: 'Examples' },
    { id: 'reference', title: 'Reference' },
]).map((s) => ({ ...s, areas: DOCS_AREAS.filter((a) => a.section === s.id).map((a) => a.id) }));

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
