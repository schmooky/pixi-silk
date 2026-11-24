import type { ParseLimits } from './author/parse';

/** One font file the compiler may shape with. */
export interface FontConfig {
    /** Path to a .ttf or .otf, relative to the config file. */
    file: string;
    /** Family name the theme refers to. Faces of one family with different weights form one chain. */
    family: string;
    /** CSS weight of this face. Default 400. */
    weight?: number;
}

/** Per-locale settings. Keys of `SilkConfig.locales` are the app's codes, such as `iq` or `kz`. */
export interface LocaleConfig {
    /**
     * BCP 47 tag the code stands for, for plural rules, numbers, script and direction. Default from
     * the compiler's `APP_LOCALES` table, else the code itself.
     */
    bcp47?: string;
    /** Font families to prefer for this locale, before the config's order (a Japanese face for `ja`). */
    families?: string[];
    /**
     * Numbering system number slots use, pinned because browsers disagree on defaults, such as
     * `arab` for `ar` and `latn` for `ar-MA`. Default CLDR's for the BCP 47 tag.
     */
    numberingSystem?: string;
}

/** Atlas settings. */
export interface AtlasConfig {
    /** Glyph kind of the pages. Default `msdf`. */
    kind?: 'msdf' | 'sdf' | 'mtsdf';
    /** Atlas pixels per em the glyphs are generated at. Default 40. */
    emSize?: number;
    /**
     * Atlas pixels per em by page group (`han`, `hangul`, `thai`...). Default `{ han: 56, hangul: 48 }`:
     * dense CJK glyphs need more detail to stay legible at small sizes.
     */
    emSizeByScript?: Record<string, number>;
    /** Distance range in atlas pixels. 0 derives it from the theme. Default 0. */
    distanceRange?: number;
    /** Largest page side in pixels. Default 1024. */
    maxPageSize?: number;
    /**
     * File format of the pages. `png` needs nothing. `webp` (lossless) is about 28% smaller and needs
     * the `sharp` package installed (see docs/v2/DECISIONS.md D11). Default `png`.
     */
    format?: 'png' | 'webp';
    /** Smallest text size the theme's effects must fit at, in pixels. Sets the derived distance range. Default 24. */
    minSize?: number;
    /** Largest derived distance range in atlas pixels. Effects that need more clip, with a warning. Default 16. */
    maxDistanceRange?: number;
}

/** `silk.config.json` (or `.mjs`): everything the compiler needs besides the strings and the theme. */
export interface SilkConfig {
    /** Locale translators translate from. Default `en`. */
    sourceLocale?: string;
    /** Locales to compile, with their settings. */
    locales: Record<string, LocaleConfig>;
    /**
     * Fonts in fallback order: for every character the first face of the chain that has a glyph
     * for it shapes it. The first family is the default.
     */
    fonts: FontConfig[];
    /** Tag names messages may use, besides the styles of the theme. */
    tags?: string[];
    /** Inline object names, written `<name/>`. */
    objects?: string[];
    /** Slot declarations by name, in the sheet's `slots` syntax, such as `number(maxDigits=7,tabular)`. */
    slots?: Record<string, string>;
    /** Atlas settings. */
    atlas?: AtlasConfig;
    /** Parser limits. */
    limits?: Partial<ParseLimits>;
    /**
     * Messages shown at a fixed size and width, laid out at compile time (LAYOUTS): the runtime uses
     * the baked positions when a message is prepared with exactly these options. Only messages
     * without slots, objects and tappable spans are baked.
     */
    layouts?: FixedLayout[];
    /** Keep message keys as strings in the bundles (dev builds). Default false. */
    devKeys?: boolean;
}

/** A message laid out at compile time, see {@link SilkConfig.layouts}. */
export interface FixedLayout {
    /** Message key. */
    key: string;
    /** Font size in pixels. */
    size: number;
    /** Widest line in pixels, 0 for none. Default 0. */
    maxWidth?: number;
    /** Alignment. Default `start`. */
    align?: 'start' | 'end' | 'left' | 'center' | 'right';
    /** Distance between baselines as a factor of the size. Default 1.35, as at runtime. */
    lineHeight?: number;
}

/** A parsed slot declaration. */
export interface SlotDecl {
    /** Slot name. */
    name: string;
    /** `number` or `text`. */
    type: 'number' | 'text';
    /** Most digits of a number slot. Default 7. */
    maxDigits: number;
    /** Most characters of a text slot. Default 16. */
    maxChars: number;
    /** Digits have one width. Default true for numbers. */
    tabular: boolean;
    /** The slot selects the plural variant. */
    plural: boolean;
    /** Numbers show as percentages: 0.25 is 25%. */
    percent?: boolean;
}

const SLOT = /^([a-z][a-zA-Z0-9_]*)\s*:\s*(number|text)\s*(?:\(([^)]*)\))?\s*(:\s*plural)?$/;

/**
 * Parses a `slots` cell or config entry: declarations separated by `;` or new lines, each
 * `name:number(maxDigits=7,tabular)`, `share:number(percent)`, `name:text(maxChars=16)` or
 * `count:number:plural`.
 * Returns the declarations and the problems found.
 */
export function parseSlots(source: string): { slots: SlotDecl[]; errors: string[] } {
    const slots: SlotDecl[] = [];
    const errors: string[] = [];

    for (const part of source
        .split(/[;\n]/)
        .map((s) => s.trim())
        .filter(Boolean)) {
        const m = SLOT.exec(part);

        if (!m) {
            errors.push(`"${part}" is not a slot declaration: write name:number(...) or name:text(...)`);
            continue;
        }
        const decl: SlotDecl = {
            name: m[1],
            type: m[2] as 'number' | 'text',
            maxDigits: 7,
            maxChars: 16,
            tabular: m[2] === 'number',
            plural: Boolean(m[4]),
        };

        for (const opt of (m[3] ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)) {
            const [k, v] = opt.split('=').map((s) => s.trim());

            if (k === 'maxDigits' && decl.type === 'number' && /^\d+$/.test(v ?? '')) decl.maxDigits = Number(v);
            else if (k === 'maxChars' && decl.type === 'text' && /^\d+$/.test(v ?? '')) decl.maxChars = Number(v);
            else if (k === 'tabular' && decl.type === 'number' && v === undefined) decl.tabular = true;
            else if (k === 'proportional' && decl.type === 'number' && v === undefined) decl.tabular = false;
            else if (k === 'plural' && decl.type === 'number' && v === undefined) decl.plural = true;
            else if (k === 'percent' && decl.type === 'number' && v === undefined) decl.percent = true;
            else errors.push(`slot "${decl.name}": unknown option "${opt}"`);
        }
        if (decl.plural && decl.type !== 'number') errors.push(`slot "${decl.name}": only number slots select plurals`);
        slots.push(decl);
    }

    return { slots, errors };
}

/** Writes a declaration back in the `slots` syntax. */
export function formatSlot(decl: SlotDecl): string {
    if (decl.type === 'text') return `${decl.name}:text(maxChars=${decl.maxChars})`;
    const opts = [
        `maxDigits=${decl.maxDigits}`,
        decl.tabular ? 'tabular' : 'proportional',
        ...(decl.percent ? ['percent'] : []),
    ];

    return `${decl.name}:number(${opts.join(',')})${decl.plural ? ':plural' : ''}`;
}
