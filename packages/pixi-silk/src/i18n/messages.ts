import { type BundleData, digitGlyph, findMessage, readBundle } from './bundle';
import {
    DIGIT_STRIDE,
    FACE_STRIDE,
    GLYPH_STRIDE,
    hashKey,
    MESSAGE_STRIDE,
    NONE,
    PAGE_STRIDE,
    PLURAL_CATEGORIES,
    type PluralCategory,
    SLOT_STRIDE,
    SlotFlag,
    SlotType,
    VARIANT_STRIDE,
} from './format';

/** A face of a bundle. */
export interface BundleFace {
    /** Face id (index in the compiler config). */
    id: number;
    /** Units per em. */
    unitsPerEm: number;
    /** Ascender in font units. */
    ascender: number;
    /** Descender in font units (negative). */
    descender: number;
    /** Line gap in font units. */
    lineGap: number;
    /** Family name. */
    family: string;
    /** CSS weight. */
    weight: number;
    /** 64-bit hash of the font file, as 16 hex digits. Runtime shapers compare it with the font they load. */
    hash: string;
}

/** An atlas page a bundle draws from. */
export interface BundlePage {
    /** Global page id, shared by every bundle of one compile. */
    id: number;
    /** File, relative to the bundle, such as `atlas/latin-0.webp`. */
    file: string;
    /** 0 msdf, 1 sdf, 2 mtsdf. */
    kind: number;
    /** Width in pixels. */
    width: number;
    /** Height in pixels. */
    height: number;
    /** Distance range in pixels. */
    distanceRange: number;
    /** Atlas pixels per em. */
    emSize: number;
}

/** A slot of a bundle. */
export interface BundleSlot {
    /** Slot name, as written between braces. */
    name: string;
    /** `number` or `text`. */
    type: 'number' | 'text';
    /** Most digits (numbers) or characters (text). */
    max: number;
    /** Digit table index, or -1. */
    digitTable: number;
    /** {@link SlotFlag} bits. */
    flags: number;
    /** Face id of the digits. */
    face: number;
}

/** A formatted number slot: one glyph per output character. */
export interface FormattedNumber {
    /** The formatted string. */
    text: string;
    /** Atlas glyph index per character (0 draws nothing). */
    glyphs: number[];
    /** Advance per character, font units of `face`. */
    advances: number[];
    /** Face the advances are in. */
    face: number;
    /** A character was missing from the digit table: Latin digits were used. */
    fellBack: boolean;
}

/**
 * A loaded `.silk` bundle (brief sec. 5) with lookups: messages by key, faces by id, slots, tags,
 * variants by plural category, and number formatting through the baked digit tables. Holds typed
 * arrays over the fetched buffer and decodes nothing up front.
 */
export class SilkBundle {
    /** The raw tables. */
    readonly data: BundleData;
    /** URL the bundle was loaded from, used to resolve atlas page files. Empty when unknown. */
    readonly url: string;
    private readonly _faces = new Map<number, BundleFace>();
    private _plural: Intl.PluralRules | null = null;
    private readonly _formats = new Map<string, Intl.NumberFormat>();

    constructor(data: BundleData | ArrayBuffer, url = '') {
        this.data = data instanceof ArrayBuffer ? readBundle(data) : data;
        this.url = url;
        const f = this.data.faces;

        for (let i = 0; i < f.length; i += FACE_STRIDE) {
            const lo = (f[i + 2] >>> 0).toString(16).padStart(8, '0');
            const hi = (f[i + 3] >>> 0).toString(16).padStart(8, '0');

            this._faces.set(f[i], {
                id: f[i],
                unitsPerEm: f[i + 1],
                ascender: f[i + 4],
                descender: f[i + 5],
                lineGap: f[i + 6],
                family: this.data.strings[f[i + 7]] ?? '',
                weight: f[i + 8],
                hash: hi + lo,
            });
        }
    }

    /** BCP 47 locale: what plural rules and number formatting use. */
    get locale(): string {
        return this.data.locale;
    }

    /** The app's code for the locale (the bundle name), such as `iq` for `ar-IQ`. */
    get id(): string {
        return this.data.id || this.data.locale;
    }

    /** Paragraph direction: 0 left to right, 1 right to left. */
    get dir(): 0 | 1 {
        return this.data.dir;
    }

    /** Faces, by id. */
    get faces(): ReadonlyMap<number, BundleFace> {
        return this._faces;
    }

    /** Face by id. Throws when the bundle has no such face. */
    face(id: number): BundleFace {
        const f = this._faces.get(id);

        if (!f) throw new Error(`pixi-silk: bundle ${this.locale} has no face ${id}`);
        return f;
    }

    /** Atlas pages the bundle draws from, in the order its glyphs refer to them. */
    pages(): BundlePage[] {
        const p = this.data.pages;
        const out: BundlePage[] = [];

        for (let i = 0; i < p.length; i += PAGE_STRIDE) {
            out.push({
                id: p[i],
                file: this.data.strings[p[i + 1]] ?? '',
                kind: p[i + 2],
                width: p[i + 3],
                height: p[i + 4],
                distanceRange: p[i + 5],
                emSize: p[i + 6],
            });
        }
        return out;
    }

    /** Number of atlas glyph records (record 0 is the empty glyph). */
    get glyphCount(): number {
        return this.data.glyphs.length / GLYPH_STRIDE;
    }

    /** Message index of a key, or -1. */
    message(key: string): number {
        return findMessage(this.data, hashKey(key));
    }

    /** Key string of a message, when the bundle keeps keys (dev builds), else its hash in hex. */
    keyOf(message: number): string {
        const ref = this.data.messages[message * MESSAGE_STRIDE + 1];

        return ref === NONE
            ? this.data.messages[message * MESSAGE_STRIDE].toString(16)
            : (this.data.strings[ref] ?? '');
    }

    /** Slot id that selects the plural variant of a message, or -1. */
    selector(message: number): number {
        const s = this.data.messages[message * MESSAGE_STRIDE + 2];

        return s === NONE ? -1 : s;
    }

    /** Variant index for a plural category: the matching variant, else `other`, else the first one. */
    variant(message: number, category: PluralCategory = 'other'): number {
        const m = this.data.messages;
        const first = m[message * MESSAGE_STRIDE + 3];
        const count = m[message * MESSAGE_STRIDE + 4];
        const want = PLURAL_CATEGORIES.indexOf(category);
        const other = PLURAL_CATEGORIES.indexOf('other');
        let fallback = first;

        for (let v = first; v < first + count; v++) {
            const c = this.data.variants[v * VARIANT_STRIDE];

            if (c === want) return v;
            if (c === other) fallback = v;
        }
        return fallback;
    }

    /** Plural category of a number in the bundle's locale. Uses the platform's `Intl.PluralRules`. */
    pluralCategory(n: number): PluralCategory {
        this._plural ??= new Intl.PluralRules(this.locale);

        return this._plural.select(n) as PluralCategory;
    }

    /** Text of a variant, holes as U+FFFC. Empty when the bundle has none. */
    variantText(variant: number): string {
        return this.data.strings[this.data.variants[variant * VARIANT_STRIDE + 6]] ?? '';
    }

    /** Slot record. */
    slot(id: number): BundleSlot {
        const s = this.data.slots;
        const o = id * SLOT_STRIDE;

        return {
            name: this.data.strings[s[o]] ?? '',
            type: s[o + 1] === SlotType.Number ? 'number' : 'text',
            max: s[o + 2],
            digitTable: s[o + 3] === NONE ? -1 : s[o + 3],
            flags: s[o + 4],
            face: s[o + 5],
        };
    }

    /** Tag name of a tag id. */
    tag(id: number): string {
        return this.data.strings[this.data.tags[id]] ?? '';
    }

    /**
     * Formats a number for a slot with `Intl.NumberFormat` in the bundle's pinned numbering system
     * (as a percentage for slots declared `percent`),
     * then maps every character through the slot's digit table. A character the table lacks (a
     * browser whose ICU differs) falls back to Latin digits from the same table, never to a missing
     * glyph.
     */
    formatNumber(slot: BundleSlot, value: number): FormattedNumber {
        const table = slot.digitTable;
        const ns = this.data.numberingSystem || 'latn';
        const percent = (slot.flags & SlotFlag.Percent) !== 0;
        const format = (system: string) => {
            const key = `${system}|${percent}`;
            let f = this._formats.get(key);

            if (!f) {
                f = new Intl.NumberFormat(this.locale, {
                    numberingSystem: system,
                    style: percent ? 'percent' : 'decimal',
                    maximumFractionDigits: percent ? 2 : 20,
                });
                this._formats.set(key, f);
            }
            return f.format(value);
        };
        const map = (text: string) => {
            const glyphs: number[] = [];
            const advances: number[] = [];

            for (const ch of text) {
                const e = table < 0 ? null : digitGlyph(this.data, table, ch.codePointAt(0) ?? 0);

                if (!e) return null;
                glyphs.push(Math.max(0, e[0]));
                advances.push(e[1]);
            }
            return { glyphs, advances };
        };
        const face = table < 0 ? slot.face : this.data.digits[table * DIGIT_STRIDE];
        let text = format(ns);
        let mapped = map(text);
        let fellBack = false;

        if (!mapped) {
            fellBack = true;
            text = format('latn');
            mapped = map(text) ?? { glyphs: [], advances: [] };
        }
        return { text, glyphs: mapped.glyphs, advances: mapped.advances, face, fellBack };
    }

    /** True when number slot updates of the same length can skip layout (tabular digits baked). */
    fastPath(slot: BundleSlot): boolean {
        return (
            slot.type === 'number' && (slot.flags & SlotFlag.Tabular) !== 0 && (slot.flags & SlotFlag.NoFastPath) === 0
        );
    }
}
