export interface AreaLink {
    label: string;
    href: string;
    description: string;
}
export interface DocsArea {
    id: string;
    title: string;
    summary: string;
    intro: string[];
    items: string[];
    lab?: string[];
    links?: AreaLink[];
    aliases?: string[];
}
export declare const DOCS_AREAS: DocsArea[];
export declare const VISIBLE_AREAS: DocsArea[];
export declare const DOCS_NAV: { id: string; title: string; items: string[] }[];
export declare const DOCS_LINKS: { label: string; href: string }[];
