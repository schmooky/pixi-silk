/**
 * Docs sidebar order. Titles come from each page's frontmatter; every page in
 * src/content/docs must appear here exactly once (checked at build time), so the
 * sidebar, sitemap, llms.txt and prev/next links can never drift apart.
 *
 * @type {{ title: string, items: string[] }[]}
 */
export const DOCS_NAV = [
    { title: 'Getting started', items: ['introduction', 'installation', 'quick-start', 'migrating-from-graphics'] },
    {
        title: 'Smooth graphics',
        items: ['antialiasing-in-pixijs', 'smooth-graphics-pixijs', 'graphics-smooth-v8', 'glossary'],
    },
    { title: 'Drawing', items: ['shapes', 'arcs-and-rings', 'lines-and-paths', 'fills-and-strokes', 'dashes'] },
    { title: 'Paint', items: ['gradients', 'blur-and-shadows'] },
    { title: 'Building UI', items: ['charts', 'transforms', 'hit-testing', 'animation', 'radial-menus-and-buttons'] },
    { title: 'Rendering', items: ['resolution', 'performance', 'how-it-works'] },
];

/** Extra links under the sidebar. */
export const DOCS_LINKS = [
    { label: 'API reference', href: '/api/' },
    { label: 'FAQ', href: '/faq/' },
    { label: 'Changelog', href: '/changelog/' },
];
