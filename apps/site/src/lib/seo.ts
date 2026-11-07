import { SITE } from './site';
import { SILK_VERSION } from './version';

export interface PageSeo {
    title: string;
    description: string;
    /** Canonical path starting with `/`. */
    path?: string;
    /** Absolute or root-relative image URL (defaults to the page's generated Open Graph card). */
    image?: string;
    type?: 'website' | 'article';
    article?: { section?: string; tags?: string[]; published?: string; modified?: string };
    /** Extra search phrases for `keywords` meta (the site-wide ones are always included). */
    keywords?: string[];
    /** Markdown twin of the page, advertised as an alternate for machines. */
    markdown?: string;
    jsonLd?: unknown[];
    noIndex?: boolean;
}

export const canonical = (path?: string): string => new URL(path ?? '/', SITE.url).toString();
export const imageUrl = (image?: string): string => new URL(image ?? SITE.defaultImage, SITE.url).toString();
export const isoDate = (d: Date | string): string => (typeof d === 'string' ? d : d.toISOString().slice(0, 10));

/** `<title>`: keywords first, brand last, unless the brand is already in it. */
export function pageTitle(title: string): string {
    return /pixi-silk/i.test(title) ? title : `${title} | ${SITE.name}`;
}

/** Open Graph card for a route. Ids must match `src/og/targets.ts`. */
export function ogUrlForPath(pathname: string | undefined): string {
    const p = (pathname ?? '/').replace(/\/+$/, '') || '/';

    if (p === '/') return '/og/home.png';
    const doc = p.match(/^\/docs\/([^/]+)$/);

    if (doc) return `/og/docs/${doc[1]}.png`;
    const lab = p.match(/^\/lab\/([^/]+)$/);

    if (lab) return `/og/lab/${lab[1]}.png`;
    for (const section of ['docs', 'api', 'faq', 'changelog', 'search']) {
        if (p === `/${section}` || p.startsWith(`/${section}/`)) return `/og/section/${section}.png`;
    }

    return SITE.defaultImage;
}

const ORG_ID = `${SITE.url}/#organization`;
const WEBSITE_ID = `${SITE.url}/#website`;
const SOFTWARE_ID = `${SITE.url}/#software`;

const org = {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: SITE.author,
    url: SITE.githubRepo,
    logo: imageUrl('/icon-512.png'),
    sameAs: [SITE.githubRepo, SITE.npm],
};

export function webSiteLd() {
    return {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        '@id': WEBSITE_ID,
        name: SITE.name,
        alternateName: 'pixi-silk docs',
        url: SITE.url,
        description: SITE.tagline,
        inLanguage: SITE.language,
        publisher: org,
        potentialAction: {
            '@type': 'SearchAction',
            target: { '@type': 'EntryPoint', urlTemplate: `${SITE.url}/search/?q={search_term_string}` },
            'query-input': 'required name=search_term_string',
        },
    };
}

const FEATURES = [
    'Analytic anti-aliasing with signed distance fields (no MSAA)',
    'Rects, squircles, circles, ellipses, arcs, sectors, polylines, paths, areas, hearts, stars, polygons',
    'Linear, radial, conic and along-the-path gradients in OKLab, dithered',
    'Gaussian blur for glows and soft shadows without filters',
    'Dashes, dots, tapered strokes and energy-conserving hairlines',
    'Device-pixel-exact canvas on retina and fractional DPR screens',
    'One instanced draw call per graphics object',
];

export function softwareLd() {
    return {
        '@context': 'https://schema.org',
        '@type': 'SoftwareSourceCode',
        '@id': `${SITE.url}/#source`,
        name: SITE.name,
        description: SITE.description,
        url: SITE.url,
        codeRepository: SITE.githubRepo,
        programmingLanguage: { '@type': 'ComputerLanguage', name: 'TypeScript' },
        runtimePlatform: 'Web browser (WebGL2), PixiJS v8',
        license: 'https://opensource.org/licenses/MIT',
        version: SILK_VERSION,
        keywords: SITE.keywords.join(', '),
        author: org,
        targetProduct: { '@id': SOFTWARE_ID },
    };
}

export function softwareApplicationLd() {
    return {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        '@id': SOFTWARE_ID,
        name: SITE.name,
        applicationCategory: 'DeveloperApplication',
        applicationSubCategory: '2D graphics library',
        operatingSystem: 'Any (web browser with WebGL2)',
        description: SITE.description,
        url: SITE.url,
        downloadUrl: SITE.npm,
        installUrl: `${SITE.url}/docs/installation/`,
        softwareVersion: SILK_VERSION,
        softwareRequirements: 'pixi.js ^8',
        license: 'https://opensource.org/licenses/MIT',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        featureList: FEATURES,
        keywords: SITE.keywords.join(', '),
        screenshot: imageUrl('/og/home.png'),
        author: org,
    };
}

export function articleLd(p: {
    title: string;
    description: string;
    path: string;
    section?: string;
    keywords?: string[];
    published?: string;
    modified?: string;
}) {
    return {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        headline: p.title,
        description: p.description,
        articleSection: p.section,
        inLanguage: SITE.language,
        keywords: p.keywords?.length ? p.keywords.join(', ') : undefined,
        datePublished: p.published,
        dateModified: p.modified,
        mainEntityOfPage: { '@type': 'WebPage', '@id': canonical(p.path) },
        image: imageUrl(ogUrlForPath(p.path)),
        isAccessibleForFree: true,
        author: org,
        publisher: org,
        isPartOf: { '@id': WEBSITE_ID },
        about: { '@id': SOFTWARE_ID },
        dependencies: 'pixi.js ^8',
    };
}

export function breadcrumbLd(crumbs: { name: string; url: string }[]) {
    return {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: crumbs.map((c, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: c.name,
            item: canonical(c.url),
        })),
    };
}

export function faqLd(items: { q: string; a: string }[]) {
    return {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: items.map((i) => ({
            '@type': 'Question',
            name: i.q,
            acceptedAnswer: { '@type': 'Answer', text: i.a.replace(/`/g, '') },
        })),
    };
}

export function definedTermSetLd(p: {
    name: string;
    path: string;
    terms: { term: string; slug: string; definition: string }[];
}) {
    const url = canonical(p.path);

    return {
        '@context': 'https://schema.org',
        '@type': 'DefinedTermSet',
        '@id': `${url}#terms`,
        name: p.name,
        url,
        hasDefinedTerm: p.terms.map((t) => ({
            '@type': 'DefinedTerm',
            '@id': `${url}#${t.slug}`,
            name: t.term,
            description: t.definition,
            inDefinedTermSet: `${url}#terms`,
            url: `${url}#${t.slug}`,
        })),
    };
}
