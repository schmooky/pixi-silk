import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as hb from 'harfbuzzjs';
import type { FontConfig } from '../config';

/** A loaded font face. */
export interface LoadedFace {
    /** Index in the config's `fonts` list: the bundle's face id. */
    id: number;
    /** Family name. */
    family: string;
    /** CSS weight. */
    weight: number;
    /** File the face came from. */
    file: string;
    /** HarfBuzz font, at the default scale (font units). */
    font: hb.Font;
    /** Units per em. */
    upem: number;
    /** Ascender, descender (negative) and line gap in font units. */
    extents: { ascender: number; descender: number; lineGap: number };
    /** 64-bit FNV-1a hash of the file bytes. */
    hash: bigint;
    /** OpenType features of GSUB and GPOS. */
    features: Set<string>;
    /** Main script of the face's glyphs, for grouping atlas pages: `latin`, `arabic`, `hebrew`... */
    script: string;
}

/** 64-bit FNV-1a over bytes. */
export function hash64(bytes: Uint8Array): bigint {
    let h = 0xcbf29ce484222325n;

    for (const b of bytes) {
        h ^= BigInt(b);
        h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
    }

    return h;
}

/** Page names of scripts. Faces are grouped on pages by the script most of their characters have. */
const PAGE_NAMES: Record<string, string> = {
    Latn: 'latin',
    Arab: 'arabic',
    Hebr: 'hebrew',
    Grek: 'greek',
    Cyrl: 'cyrillic',
    Hani: 'han',
    Hang: 'hangul',
};

/** Page name of a script tag. */
export function pageName(script: string): string {
    return PAGE_NAMES[script] ?? script.toLowerCase();
}

/** Loads every face of the config, resolving files against `root`. */
export function loadFaces(fonts: readonly FontConfig[], root: string): LoadedFace[] {
    return fonts.map((f, id) => {
        const bytes = new Uint8Array(readFileSync(resolve(root, f.file)));
        const face = new hb.Face(new hb.Blob(bytes));
        const font = new hb.Font(face);
        const counts = new Map<string, number>();

        for (const cp of face.collectUnicodes()) {
            const s = scriptOf(cp);

            if (s !== 'Zyyy' && s !== 'Zinh' && s !== 'Zzzz') counts.set(s, (counts.get(s) ?? 0) + 1);
        }
        // Latin wins ties: the default face's pages stay `latin`
        let script = 'latin';
        let best = 0;

        for (const [s, n] of counts) {
            if (n > best || (n === best && s === 'Latn')) {
                best = n;
                script = pageName(s);
            }
        }

        return {
            id,
            family: f.family,
            weight: f.weight ?? 400,
            file: f.file,
            font,
            upem: face.upem,
            extents: font.hExtents(),
            hash: hash64(bytes),
            features: new Set([...face.getTableFeatureTags('GSUB'), ...face.getTableFeatureTags('GPOS')]),
            script,
        };
    });
}

/**
 * The fallback chain for a family and weight: the requested family first, then the locale's
 * preferred families, then the other families in config order. Within each family, the face with
 * the nearest weight.
 */
export function faceChain(
    faces: readonly LoadedFace[],
    family: string | undefined,
    weight: number,
    preferred: readonly string[] = [],
): LoadedFace[] {
    const families = [...new Set(faces.map((f) => f.family))];

    for (const p of [...preferred].reverse()) {
        if (!families.includes(p)) continue;
        families.splice(families.indexOf(p), 1);
        families.unshift(p);
    }

    if (family && families.includes(family)) {
        families.splice(families.indexOf(family), 1);
        families.unshift(family);
    }

    return families.map((fam) => {
        const options = faces.filter((f) => f.family === fam);

        return options.reduce((a, b) => (Math.abs(b.weight - weight) < Math.abs(a.weight - weight) ? b : a));
    });
}

/** True when the face has a glyph for the code point. */
export function covers(face: LoadedFace, cp: number): boolean {
    const g = face.font.glyph(cp);

    return g !== undefined && g !== 0;
}

/** ISO 15924 script of a code point, `Zyyy` for common and `Zinh` for inherited characters. */
export function scriptOf(cp: number): string {
    const ch = String.fromCodePoint(cp);

    for (const [tag, re] of SCRIPTS) if (re.test(ch)) return tag;

    return 'Zzzz';
}

const SCRIPTS: [string, RegExp][] = [
    ['Zinh', /\p{Script=Inherited}/u],
    ['Zyyy', /\p{Script=Common}/u],
    ['Latn', /\p{Script=Latin}/u],
    ['Arab', /\p{Script=Arabic}/u],
    ['Hebr', /\p{Script=Hebrew}/u],
    ['Grek', /\p{Script=Greek}/u],
    ['Cyrl', /\p{Script=Cyrillic}/u],
    ['Armn', /\p{Script=Armenian}/u],
    ['Geor', /\p{Script=Georgian}/u],
    ['Deva', /\p{Script=Devanagari}/u],
    ['Beng', /\p{Script=Bengali}/u],
    ['Guru', /\p{Script=Gurmukhi}/u],
    ['Gujr', /\p{Script=Gujarati}/u],
    ['Orya', /\p{Script=Oriya}/u],
    ['Taml', /\p{Script=Tamil}/u],
    ['Telu', /\p{Script=Telugu}/u],
    ['Knda', /\p{Script=Kannada}/u],
    ['Mlym', /\p{Script=Malayalam}/u],
    ['Sinh', /\p{Script=Sinhala}/u],
    ['Ethi', /\p{Script=Ethiopic}/u],
    ['Thaa', /\p{Script=Thaana}/u],
    ['Mong', /\p{Script=Mongolian}/u],
    ['Tibt', /\p{Script=Tibetan}/u],
    ['Thai', /\p{Script=Thai}/u],
    ['Laoo', /\p{Script=Lao}/u],
    ['Khmr', /\p{Script=Khmer}/u],
    ['Mymr', /\p{Script=Myanmar}/u],
    ['Hani', /\p{Script=Han}/u],
    ['Hira', /\p{Script=Hiragana}/u],
    ['Kana', /\p{Script=Katakana}/u],
    ['Hang', /\p{Script=Hangul}/u],
];

/**
 * Scripts written without spaces between words, whose line breaks need a dictionary. The compiler
 * takes them from ICU's word segmenter (`Intl.Segmenter`), so the runtime still needs no tables.
 */
export const DICTIONARY_SCRIPTS: ReadonlySet<string> = new Set(['Thai', 'Laoo', 'Khmr', 'Mymr']);
