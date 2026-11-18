/**
 * Bidirectional text for {@link layoutText}: the Unicode Bidirectional Algorithm (UAX #9) without
 * explicit embeddings, and the clusters that keep joined scripts such as Arabic shaped.
 *
 * Covered: paragraph direction (P2, P3) and weak types (W1 to W7), so signs, separators and percent
 * signs stay with their digits. Also neutrals (N1, N2), implicit levels (I1, I2), trailing
 * whitespace (L1), reordering (L2) and mirrored brackets (L4). Not covered: embedding, override and
 * isolate controls (U+202A to U+202E, U+2066 to U+2069), which are ignored, and bracket pairs (N0).
 */

/** Base direction of a paragraph. `auto` takes it from the first strong character, left to right when there is none. */
export type TextDirection = 'ltr' | 'rtl' | 'auto';

/** Bidi character types used here (UAX #9 table 4, minus the explicit formatting types). */
export type BidiClass = 'L' | 'R' | 'AL' | 'EN' | 'ES' | 'ET' | 'AN' | 'CS' | 'NSM' | 'BN' | 'B' | 'S' | 'WS' | 'ON';

const inRange = (c: number, ranges: readonly number[]): boolean => {
    for (let i = 0; i < ranges.length; i += 2) if (c >= ranges[i] && c <= ranges[i + 1]) return true;

    return false;
};

// pairs of [first, last] code points
const EN = [
    0x30, 0x39, 0xb2, 0xb3, 0xb9, 0xb9, 0x6f0, 0x6f9, 0x2070, 0x2070, 0x2074, 0x2079, 0x2080, 0x2089, 0xff10, 0xff19,
];
const AN = [0x600, 0x605, 0x660, 0x669, 0x66b, 0x66c, 0x6dd, 0x6dd, 0x8e2, 0x8e2, 0x10e60, 0x10e7e];
const ES = [
    0x2b, 0x2b, 0x2d, 0x2d, 0x207a, 0x207b, 0x208a, 0x208b, 0x2212, 0x2212, 0xfe62, 0xfe63, 0xff0b, 0xff0b, 0xff0d,
    0xff0d,
];
const ET = [
    0x23, 0x25, 0xa2, 0xa5, 0xb0, 0xb1, 0x58f, 0x58f, 0x609, 0x60a, 0x66a, 0x66a, 0x9f2, 0x9f3, 0xe3f, 0xe3f, 0x2030,
    0x2034, 0x20a0, 0x20cf, 0x212e, 0x212e, 0x2213, 0x2213, 0xfe5f, 0xfe5f, 0xfe69, 0xfe6a, 0xff03, 0xff05, 0xffe0,
    0xffe1, 0xffe5, 0xffe6,
];
const CS = [
    0x2c, 0x2c, 0x2e, 0x2f, 0x3a, 0x3a, 0xa0, 0xa0, 0x60c, 0x60c, 0x202f, 0x202f, 0x2044, 0x2044, 0xfe50, 0xfe50,
    0xfe52, 0xfe52, 0xfe55, 0xfe55, 0xff0c, 0xff0c, 0xff0e, 0xff0f, 0xff1a, 0xff1a,
];
const WS = [0x20, 0x20, 0x0c, 0x0c, 0x1680, 0x1680, 0x2000, 0x200a, 0x2028, 0x2028, 0x205f, 0x205f, 0x3000, 0x3000];
const S = [0x09, 0x09, 0x0b, 0x0b, 0x1f, 0x1f];
const B = [0x0a, 0x0a, 0x0d, 0x0d, 0x1c, 0x1e, 0x85, 0x85, 0x2029, 0x2029];
const BN = [
    0x00, 0x08, 0x0e, 0x1b, 0x7f, 0x84, 0x86, 0x9f, 0xad, 0xad, 0x180e, 0x180e, 0x200b, 0x200d, 0x202a, 0x202e, 0x2060,
    0x2069, 0xfeff, 0xfeff,
];
// right-to-left blocks: Arabic-type letters (AL) and the others (R)
const AL = [
    0x608, 0x608, 0x60b, 0x60b, 0x60d, 0x60d, 0x61b, 0x64a, 0x66d, 0x66f, 0x671, 0x6d5, 0x6e5, 0x6e6, 0x6ee, 0x6ef,
    0x6fa, 0x70d, 0x70f, 0x710, 0x712, 0x72f, 0x74d, 0x7a5, 0x7b1, 0x7b1, 0x860, 0x86a, 0x870, 0x8d2, 0xfb50, 0xfd3d,
    0xfd40, 0xfdff, 0xfe70, 0xfefe, 0x10d00, 0x10d23, 0x10f30, 0x10f45, 0x1ee00, 0x1eeff,
];
const R = [
    0x590, 0x5ff, 0x7c0, 0x85f, 0x200f, 0x200f, 0xfb1d, 0xfb4f, 0x10800, 0x10fff, 0x1e800, 0x1edff, 0x1ef00, 0x1efff,
];
const MARK = /^[\p{Mn}\p{Me}]$/u;
const PUNCT = /^[\p{P}\p{S}]$/u;

/** The bidi type of one code point. Covers the common scripts. Anything unlisted is `L`, or `ON` for punctuation and symbols. */
export function bidiClass(cp: number): BidiClass {
    if (cp < 0x80) {
        if (cp >= 0x41 && cp <= 0x5a) return 'L';
        if (cp >= 0x61 && cp <= 0x7a) return 'L';
    }
    if (inRange(cp, EN)) return 'EN';
    if (inRange(cp, AN)) return 'AN';
    if (inRange(cp, WS)) return 'WS';
    if (inRange(cp, ES)) return 'ES';
    if (inRange(cp, CS)) return 'CS';
    if (inRange(cp, ET)) return 'ET';
    if (inRange(cp, S)) return 'S';
    if (inRange(cp, B)) return 'B';
    if (inRange(cp, BN)) return 'BN';
    if (cp === 0x200e) return 'L';
    if (cp === 0x61c) return 'AL';
    const ch = String.fromCodePoint(cp);

    if (MARK.test(ch)) return 'NSM';
    if (cp === 0xfd3e || cp === 0xfd3f) return 'ON';
    if (inRange(cp, AL)) return 'AL';
    if (inRange(cp, R)) return 'R';
    if (PUNCT.test(ch)) return 'ON';

    return 'L';
}

const RTL_TEST = /[֐-ࣿ‏؜יִ-﷿ﹰ-﻾\u{10800}-\u{10fff}\u{1e800}-\u{1efff}]/u;

/** True when the text holds a right-to-left character, so it needs the bidi pass. */
export function hasRtl(text: string): boolean {
    return RTL_TEST.test(text);
}

/** Paragraph level from the first strong type (P2, P3): 1 for `R` or `AL`, 0 for `L` or none. */
export function paragraphLevel(types: readonly BidiClass[], direction: TextDirection = 'auto'): 0 | 1 {
    if (direction === 'ltr') return 0;
    if (direction === 'rtl') return 1;
    for (const t of types) {
        if (t === 'L') return 0;
        if (t === 'R' || t === 'AL') return 1;
    }

    return 0;
}

const isNI = (t: BidiClass): boolean => t === 'B' || t === 'S' || t === 'WS' || t === 'ON';

/**
 * Embedding levels of one paragraph (W1 to W7, N1, N2, I1, I2). `types` are the original types, one
 * per unit, in logical order. Even levels run left to right, odd ones right to left.
 */
export function resolveLevels(types: readonly BidiClass[], level: 0 | 1): number[] {
    const n = types.length;
    const t = types.slice();
    const sos: BidiClass = level ? 'R' : 'L';

    // X9: boundary neutrals take the type of what precedes them, like marks
    // W1: marks take the type of the previous character, or sos
    for (let i = 0; i < n; i++) {
        if (t[i] === 'NSM' || t[i] === 'BN') t[i] = i > 0 ? t[i - 1] : sos;
    }
    // W2: European digits after Arabic letters are Arabic digits; W3: AL is R
    let strong: BidiClass = sos;

    for (let i = 0; i < n; i++) {
        const c = t[i];

        if (c === 'L' || c === 'R' || c === 'AL') strong = c;
        else if (c === 'EN' && strong === 'AL') t[i] = 'AN';
    }
    for (let i = 0; i < n; i++) if (t[i] === 'AL') t[i] = 'R';
    // W4: one separator between two numbers of the same kind joins them
    for (let i = 1; i < n - 1; i++) {
        const a = t[i - 1];
        const b = t[i + 1];

        if (t[i] === 'ES' && a === 'EN' && b === 'EN') t[i] = 'EN';
        else if (t[i] === 'CS' && a === b && (a === 'EN' || a === 'AN')) t[i] = a;
    }
    // W5: terminators next to European digits ($100, 50%) become digits
    for (let i = 0; i < n; i++) {
        if (t[i] !== 'ET') continue;
        let j = i;

        while (j < n && t[j] === 'ET') j++;
        if ((i > 0 && t[i - 1] === 'EN') || (j < n && t[j] === 'EN')) for (let k = i; k < j; k++) t[k] = 'EN';
        i = j - 1;
    }
    // W6: separators and terminators left over are neutral
    for (let i = 0; i < n; i++) if (t[i] === 'ES' || t[i] === 'ET' || t[i] === 'CS') t[i] = 'ON';
    // W7: European digits in a left-to-right context are L
    strong = sos;
    for (let i = 0; i < n; i++) {
        const c = t[i];

        if (c === 'L' || c === 'R') strong = c;
        else if (c === 'EN' && strong === 'L') t[i] = 'L';
    }
    // N1, N2: neutrals between two strong runs of one direction take it, others the paragraph's
    const dirOf = (c: BidiClass): 'L' | 'R' => (c === 'L' ? 'L' : 'R');

    for (let i = 0; i < n; i++) {
        if (!isNI(t[i])) continue;
        let j = i;

        while (j < n && isNI(t[j])) j++;
        const before = i > 0 ? dirOf(t[i - 1]) : sos;
        const after = j < n ? dirOf(t[j]) : sos;
        const dir = before === after ? before : sos;

        for (let k = i; k < j; k++) t[k] = dir;
        i = j - 1;
    }
    // I1, I2
    const out = new Array<number>(n);

    for (let i = 0; i < n; i++) {
        const c = t[i];

        if (level === 0) out[i] = c === 'R' ? 1 : c === 'AN' || c === 'EN' ? 2 : 0;
        else out[i] = c === 'L' || c === 'EN' || c === 'AN' ? 2 : 1;
    }

    return out;
}

/**
 * L1 for one line: whitespace at the end of the line, and before tabs, falls back to the paragraph
 * level. `types` are the original types of the line's units. Changes `levels` in place.
 */
export function resetWhitespace(types: readonly BidiClass[], levels: number[], level: number): void {
    let trailing = true;

    for (let i = types.length - 1; i >= 0; i--) {
        const c = types[i];

        if (c === 'S' || c === 'B') {
            levels[i] = level;
            trailing = true;
        } else if (trailing && (c === 'WS' || c === 'BN')) levels[i] = level;
        else trailing = false;
    }
}

/** L2: the visual order of a line as indices into `levels`, left to right. */
export function visualOrder(levels: readonly number[]): number[] {
    const order = levels.map((_, i) => i);
    let high = 0;
    let lowOdd = Infinity;

    for (const l of levels) {
        if (l > high) high = l;
        if (l & 1 && l < lowOdd) lowOdd = l;
    }
    for (let lv = high; lv >= lowOdd && lv > 0; lv--) {
        for (let i = 0; i < order.length; i++) {
            if (levels[order[i]] < lv) continue;
            let j = i;

            while (j < order.length && levels[order[j]] >= lv) j++;
            order.splice(i, j - i, ...order.slice(i, j).reverse());
            i = j;
        }
    }

    return order;
}

const MIRROR: Record<string, string> = {};

for (const pair of [
    '()',
    '<>',
    '[]',
    '{}',
    '«»',
    '‹›',
    '⁅⁆',
    '⁽⁾',
    '₍₎',
    '≤≥',
    '≦≧',
    '⌈⌉',
    '⌊⌋',
    '〈〉',
    '⟨⟩',
    '⟦⟧',
    '「」',
    '『』',
    '【】',
    '〔〕',
    '〈〉',
    '《》',
    '﴾﴿',
    '（）',
    '［］',
    '｛｝',
    '＜＞',
]) {
    const [a, b] = Array.from(pair);

    MIRROR[a] = b;
    MIRROR[b] = a;
}

/** L4: the mirrored form of a character drawn right to left, such as `)` for `(`, or the character itself. */
export function mirror(char: string): string {
    return MIRROR[char] ?? char;
}

// ------------------------------------------------------------------------------- clusters

/** A run of text drawn as one glyph: a character with its marks, or joined letters of a cursive script. */
export interface Cluster {
    /** What to bake and draw. Joined runs that were split carry a zero width joiner at the cut. */
    draw: string;
    /** Offset of the first code point in the paragraph text. */
    start: number;
    /** Offset after the last code point. */
    end: number;
    /** Offsets of the code points inside the cluster after the first, for carets. Marks are left out. */
    inner: number[];
    /** Bidi type of the cluster's first character. */
    type: BidiClass;
}

const JOINING =
    /^[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Nko}\p{Script=Mandaic}\p{Script=Mongolian}\p{Script=Adlam}\p{Script=Hanifi_Rohingya}]$/u;
const LETTER = /^\p{L}$/u;
// Arabic letters that join to the letter before them but not to the one after (joining type R), and hamza (U)
const RIGHT_JOINING = [
    0x621, 0x625, 0x627, 0x627, 0x629, 0x629, 0x62f, 0x632, 0x648, 0x648, 0x671, 0x677, 0x688, 0x699, 0x6c0, 0x6c0,
    0x6c3, 0x6cb, 0x6cd, 0x6cd, 0x6cf, 0x6cf, 0x6d2, 0x6d3, 0x6d5, 0x6d5, 0x6ee, 0x6ef, 0x759, 0x75b, 0x76b, 0x76c,
    0x771, 0x771, 0x773, 0x774, 0x778, 0x779, 0x8aa, 0x8ac, 0x8ae, 0x8ae, 0x8b1, 0x8b2, 0x8b9, 0x8b9, 0x710, 0x710,
    0x715, 0x719, 0x71e, 0x71e, 0x728, 0x728, 0x72a, 0x72a, 0x72c, 0x72c, 0x72f, 0x72f, 0x74d, 0x74d,
];
const ZWJ = '‍';
const ZWNJ = 0x200c;
/** Longest joined run baked as one glyph, in letters. Longer runs are cut and joined with ZWJ. */
const MAX_RUN = 24;

/**
 * Splits a paragraph into clusters for the bidi pass. Marks stay with their base. Letters of a
 * cursive script stay together while they join, so Canvas shapes the whole run (initial, medial and
 * final forms, ligatures such as lam alef). A run breaks after a letter that does not join forward.
 */
export function clusters(text: string): Cluster[] {
    const out: Cluster[] = [];
    let cur: Cluster | null = null;
    let open = false; // the current cluster ends in a letter that joins forward
    let letters = 0;

    for (let i = 0; i < text.length; ) {
        const cp = text.codePointAt(i) as number;
        const ch = String.fromCodePoint(cp);
        const type = bidiClass(cp);
        const next = i + ch.length;

        if (cur && (type === 'NSM' || cp === 0x200d || cp === ZWNJ)) {
            // marks and joiners ride on the cluster before them
            cur.draw += ch;
            cur.end = next;
            if (cp === ZWNJ) open = false;
            i = next;
            continue;
        }
        const joins = JOINING.test(ch) && LETTER.test(ch);

        if (cur && open && joins && letters >= MAX_RUN) {
            // cut a long run: both halves keep their joined forms through a zero width joiner
            cur.draw += ZWJ;
            cur = { draw: ZWJ + ch, start: i, end: next, inner: [], type };
            out.push(cur);
            letters = 1;
        } else if (cur && open && joins) {
            cur.draw += ch;
            cur.inner.push(i);
            cur.end = next;
            letters++;
        } else {
            cur = { draw: ch, start: i, end: next, inner: [], type };
            out.push(cur);
            letters = 1;
        }
        open = joins && !(cp >= 0x600 && cp <= 0x8ff && inRange(cp, RIGHT_JOINING));
        i = next;
    }

    return out;
}
