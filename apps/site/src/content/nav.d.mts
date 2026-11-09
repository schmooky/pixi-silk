export interface AreaLink {
    label: string;
    href: string;
    description: string;
}
export type SectionId = 'learn' | 'features' | 'examples' | 'reference';
export type AreaItem = string | { page: string; lab: string[] };
export interface DocsArea {
    id: string;
    title: string;
    section: SectionId;
    summary: string;
    intro: string[];
    items: AreaItem[];
    links?: AreaLink[];
    aliases?: string[];
    experimental?: boolean;
}
export declare const itemPage: (item: AreaItem) => string;
export declare const itemLab: (item: AreaItem) => string[];
export declare const DOCS_AREAS: DocsArea[];
export declare const VISIBLE_AREAS: DocsArea[];
export declare const DOCS_NAV: { id: string; title: string; items: string[] }[];
export declare const DOCS_LINKS: { label: string; href: string }[];
export declare const DOCS_SECTIONS: { id: SectionId; title: string; areas: string[] }[];
