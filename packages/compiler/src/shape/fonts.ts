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

const PAGE_SCRIPTS: [string, RegExp][] = [
    ['latin', /\p{Script=Latin}/u],
    ['arabic', /\p{Script=Arabic}/u],
    ['hebrew', /\p{Script=Hebrew}/u],
    ['greek', /\p{Script=Greek}/u],
    ['cyrillic', /\p{Script=Cyrillic}/u],
];

/** Loads every face of the config, resolving files against `root`. */
export function loadFaces(fonts: readonly FontConfig[], root: string): LoadedFace[] {
    return fonts.map((f, id) => {
        const bytes = new Uint8Array(readFileSync(resolve(root, f.file)));
        const face = new hb.Face(new hb.Blob(bytes));
        const font = new hb.Font(face);
        const unicodes = face.collectUnicodes();
        let script = 'latin';
        let best = 0;

        for (const [name, re] of PAGE_SCRIPTS) {
            let n = 0;

            for (const cp of unicodes) if (re.test(String.fromCodePoint(cp))) n++;
            if (n > best) {
                best = n;
                script = name;
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
 * The fallback chain for a family and weight: the requested family first, then the other families
 * in config order. Within each family, the face with the nearest weight.
 */
export function faceChain(faces: readonly LoadedFace[], family: string | undefined, weight: number): LoadedFace[] {
    const families = [...new Set(faces.map((f) => f.family))];

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
    ['Thai', /\p{Script=Thai}/u],
    ['Laoo', /\p{Script=Lao}/u],
    ['Khmr', /\p{Script=Khmer}/u],
    ['Mymr', /\p{Script=Myanmar}/u],
    ['Hani', /\p{Script=Han}/u],
    ['Hira', /\p{Script=Hiragana}/u],
    ['Kana', /\p{Script=Katakana}/u],
    ['Hang', /\p{Script=Hangul}/u],
];

/** Scripts whose line breaking v2 does not support (brief sec. 9.2 item 20). */
export const UNSUPPORTED_SCRIPTS = new Set(['Thai', 'Laoo', 'Khmr', 'Mymr', 'Hani', 'Hira', 'Kana', 'Hang']);
