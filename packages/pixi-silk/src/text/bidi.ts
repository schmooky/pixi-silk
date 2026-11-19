/**
 * Bidirectional text for {@link layoutText}: the Unicode Bidirectional Algorithm (UAX #9).
 *
 * Covered: paragraph direction (P2, P3), and embeddings, overrides and isolates (X1 to X10, U+202A
 * to U+202E and U+2066 to U+2069). Also weak types (W1 to W7), bracket pairs (N0), neutrals (N1,
 * N2), implicit levels (I1, I2), trailing whitespace (L1), reordering (L2) and mirrored brackets (L4).
 */

/** Base direction of a paragraph. `auto` takes it from the first strong character, left to right when there is none. */
export type TextDirection = 'ltr' | 'rtl' | 'auto';

/** Bidi character types used here (UAX #9 table 4, minus the explicit formatting types). */
export type BidiClass =
    | 'L'
    | 'R'
    | 'AL'
    | 'EN'
    | 'ES'
    | 'ET'
    | 'AN'
    | 'CS'
    | 'NSM'
    | 'BN'
    | 'B'
    | 'S'
    | 'WS'
    | 'ON'
    | 'LRE'
    | 'RLE'
    | 'LRO'
    | 'RLO'
    | 'PDF'
    | 'LRI'
    | 'RLI'
    | 'FSI'
    | 'PDI';

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
const CONTROLS: BidiClass[] = ['LRE', 'RLE', 'PDF', 'LRO', 'RLO'];
const CONTROLS2: BidiClass[] = ['LRI', 'RLI', 'FSI', 'PDI'];
const PUNCT = /^[\p{P}\p{S}]$/u;

/** The bidi type of one code point. Covers the common scripts. Anything unlisted is `L`, or `ON` for punctuation and symbols. */
export function bidiClass(cp: number): BidiClass {
    if (cp < 0x80) {
        if (cp >= 0x41 && cp <= 0x5a) return 'L';
        if (cp >= 0x61 && cp <= 0x7a) return 'L';
    }
    const control = CONTROLS[cp - 0x202a] ?? CONTROLS2[cp - 0x2066];

    if ((cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069)) return control;
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

const RTL_TEST =
    /[\u0590-\u08ff\u200f\u061c\u202a-\u202e\u2066-\u2069\ufb1d-\ufdff\ufe70-\ufefe\u{10800}-\u{10fff}\u{1e800}-\u{1efff}]/u;

/** True when the text holds a right-to-left character or a bidi control, so it needs the bidi pass. */
export function hasRtl(text: string): boolean {
    return RTL_TEST.test(text);
}

/** Paragraph level from the first strong type (P2, P3): 1 for `R` or `AL`, 0 for `L` or none. Text inside isolates is skipped. */
export function paragraphLevel(types: readonly BidiClass[], direction: TextDirection = 'auto'): 0 | 1 {
    if (direction === 'ltr') return 0;
    if (direction === 'rtl') return 1;

    return firstStrong(types, 0, types.length) ?? 0;
}

const ISOLATE = new Set<BidiClass>(['LRI', 'RLI', 'FSI']);
const EMBED = new Set<BidiClass>(['LRE', 'RLE', 'LRO', 'RLO']);
/** Removed by X9: embedding controls and boundary neutrals. They take the level of what comes before. */
const REMOVED = new Set<BidiClass>(['LRE', 'RLE', 'LRO', 'RLO', 'PDF', 'BN']);
const isNI = (t: BidiClass): boolean =>
    t === 'B' || t === 'S' || t === 'WS' || t === 'ON' || t === 'LRI' || t === 'RLI' || t === 'FSI' || t === 'PDI';

/** P2 and P3 between `from` and `to`: the direction of the first strong type outside isolates, or null. */
function firstStrong(types: readonly BidiClass[], from: number, to: number): 0 | 1 | null {
    let depth = 0;

    for (let i = from; i < to; i++) {
        const t = types[i];

        if (ISOLATE.has(t)) depth++;
        else if (t === 'PDI') {
            if (depth > 0) depth--;
            else if (from > 0) return null;
        } else if (depth === 0 && t === 'L') return 0;
        else if (depth === 0 && (t === 'R' || t === 'AL')) return 1;
    }

    return null;
}

/** BD9: the index of the PDI that closes each isolate initiator, or -1. */
function matchingPdi(types: readonly BidiClass[]): number[] {
    const out = new Array<number>(types.length).fill(-1);
    const open: number[] = [];

    for (let i = 0; i < types.length; i++) {
        if (ISOLATE.has(types[i])) open.push(i);
        else if (types[i] === 'PDI' && open.length) out[open.pop() as number] = i;
        else if (types[i] === 'B') open.length = 0;
    }

    return out;
}

// Bidi_Paired_Bracket pairs, opening then closing
const BRACKETS =
    '()[]{}༺༻༼༽᚛᚜⁅⁆⁽⁾₍₎⌈⌉⌊⌋〈〉❨❩❪❫❬❭❮❯❰❱❲❳❴❵⟅⟆⟦⟧⟨⟩⟪⟫⦃⦄⦅⦆〈〉《》「」『』【】〔〕〖〗〘〙〚〛﹙﹚﹛﹜﹝﹞（）［］｛｝｟｠｢｣';
const OPENING = new Map<string, string>();
const CLOSING = new Map<string, string>();

for (let i = 0; i < BRACKETS.length; i += 2) {
    OPENING.set(BRACKETS[i], BRACKETS[i + 1]);
    CLOSING.set(BRACKETS[i + 1], BRACKETS[i]);
}
// U+2329 and U+232A pair with U+3008 and U+3009 as well (canonical equivalents)
const canon = (c: string): string => (c === '〈' ? '〈' : c === '〉' ? '〉' : c);

/**
 * Embedding levels of one paragraph, one per unit, in logical order (UAX #9 rules X1 to X10, W1 to
 * W7, N0 to N2, I1 and I2). `types` are the original types. `chars` are the units' text, used to
 * pair brackets (N0). Even levels run left to right, odd ones right to left. Embedding controls and
 * boundary neutrals take the level of the unit before them.
 */
export function resolveLevels(types: readonly BidiClass[], level: 0 | 1, chars?: readonly string[]): number[] {
    const n = types.length;
    const t = types.slice();
    const levels = new Array<number>(n).fill(level);
    const pdi = matchingPdi(types);

    // ---- X1 to X8: explicit levels
    type Entry = { level: number; override: '' | 'L' | 'R'; isolate: boolean };
    const stack: Entry[] = [{ level, override: '', isolate: false }];
    let overflowIsolate = 0;
    let overflowEmbed = 0;
    let validIsolate = 0;
    const MAX = 125;

    for (let i = 0; i < n; i++) {
        const top = stack[stack.length - 1];
        let c = t[i];

        if (c === 'FSI') {
            const end = pdi[i] < 0 ? n : pdi[i];

            c = firstStrong(types, i + 1, end) === 1 ? 'RLI' : 'LRI';
        }
        if (EMBED.has(c)) {
            const rtl = c === 'RLE' || c === 'RLO';
            const next = rtl ? (top.level + 1) | 1 : (top.level + 2) & ~1;

            levels[i] = top.level;
            if (next <= MAX && overflowIsolate === 0 && overflowEmbed === 0) {
                stack.push({ level: next, override: c === 'LRO' ? 'L' : c === 'RLO' ? 'R' : '', isolate: false });
            } else if (overflowIsolate === 0) overflowEmbed++;
        } else if (c === 'RLI' || c === 'LRI') {
            levels[i] = top.level;
            if (top.override) t[i] = top.override;
            const next = c === 'RLI' ? (top.level + 1) | 1 : (top.level + 2) & ~1;

            if (next <= MAX && overflowIsolate === 0 && overflowEmbed === 0) {
                validIsolate++;
                stack.push({ level: next, override: '', isolate: true });
            } else overflowIsolate++;
        } else if (c === 'PDI') {
            if (overflowIsolate > 0) overflowIsolate--;
            else if (validIsolate > 0) {
                overflowEmbed = 0;
                while (!stack[stack.length - 1].isolate) stack.pop();
                stack.pop();
                validIsolate--;
            }
            const now = stack[stack.length - 1];

            levels[i] = now.level;
            if (now.override) t[i] = now.override;
        } else if (c === 'PDF') {
            levels[i] = top.level;
            if (overflowIsolate > 0) {
                // ignored
            } else if (overflowEmbed > 0) overflowEmbed--;
            else if (!top.isolate && stack.length >= 2) stack.pop();
        } else if (c === 'B') {
            levels[i] = level;
        } else {
            levels[i] = top.level;
            if (c !== 'BN' && top.override) t[i] = top.override;
        }
    }
    // ---- X9, X10: isolating run sequences over the units that stay
    const kept: number[] = [];

    for (let i = 0; i < n; i++) if (!REMOVED.has(types[i])) kept.push(i);
    const runs: number[][] = [];

    for (const i of kept) {
        const last = runs[runs.length - 1];

        if (last && levels[last[last.length - 1]] === levels[i]) last.push(i);
        else runs.push([i]);
    }
    const runOf = new Map<number, number[]>();

    for (const r of runs) runOf.set(r[0], r);
    const sequences: number[][] = [];
    const chained = new Set<number[]>();

    for (const r of runs) {
        if (chained.has(r)) continue;
        // a run that starts with a PDI matching an initiator belongs to the initiator's sequence
        if (types[r[0]] === 'PDI' && pdi.includes(r[0])) continue;
        const seq = [...r];
        let end = r[r.length - 1];

        while (ISOLATE.has(types[end]) && pdi[end] >= 0) {
            const next = runOf.get(pdi[end]);

            if (!next) break;
            chained.add(next);
            seq.push(...next);
            end = next[next.length - 1];
        }
        sequences.push(seq);
    }
    const prevKept = (i: number): number => {
        for (let k = i - 1; k >= 0; k--) if (!REMOVED.has(types[k])) return k;

        return -1;
    };
    const nextKept = (i: number): number => {
        for (let k = i + 1; k < n; k++) if (!REMOVED.has(types[k])) return k;

        return -1;
    };

    for (const seq of sequences) {
        const lv = levels[seq[0]];
        const first = seq[0];
        const last = seq[seq.length - 1];
        const p = prevKept(first);
        const q = ISOLATE.has(types[last]) ? -1 : nextKept(last);
        const sos: BidiClass = Math.max(lv, p < 0 ? level : levels[p]) & 1 ? 'R' : 'L';
        const eos: BidiClass = Math.max(lv, q < 0 ? level : levels[q]) & 1 ? 'R' : 'L';

        resolveSequence(t, seq, sos, eos, lv, types, chars);
    }
    // ---- I1, I2
    for (const i of kept) {
        const c = t[i];
        const l = levels[i];

        if ((l & 1) === 0) levels[i] = c === 'R' ? l + 1 : c === 'AN' || c === 'EN' ? l + 2 : l;
        else levels[i] = c === 'L' || c === 'EN' || c === 'AN' ? l + 1 : l;
    }
    // removed units take the level of the unit before them
    for (let i = 0; i < n; i++) if (REMOVED.has(types[i])) levels[i] = i > 0 ? levels[i - 1] : level;

    return levels;
}

/** W1 to W7, N0, N1 and N2 on one isolating run sequence. Changes `t`. */
function resolveSequence(
    t: BidiClass[],
    seq: readonly number[],
    sos: BidiClass,
    eos: BidiClass,
    lv: number,
    original: readonly BidiClass[],
    chars?: readonly string[],
): void {
    const m = seq.length;
    const at = (k: number): BidiClass => t[seq[k]];
    const set = (k: number, c: BidiClass): void => {
        t[seq[k]] = c;
    };

    // W1: marks take the type before them; after an isolate initiator or a PDI they are neutral
    for (let k = 0; k < m; k++) {
        if (at(k) !== 'NSM') continue;
        const prev = k > 0 ? at(k - 1) : sos;

        set(k, ISOLATE.has(prev) || prev === 'PDI' || prev === 'LRI' || prev === 'RLI' ? 'ON' : prev);
    }
    // W2, W3
    let strong: BidiClass = sos;

    for (let k = 0; k < m; k++) {
        const c = at(k);

        if (c === 'L' || c === 'R' || c === 'AL') strong = c;
        else if (c === 'EN' && strong === 'AL') set(k, 'AN');
    }
    for (let k = 0; k < m; k++) if (at(k) === 'AL') set(k, 'R');
    // W4
    for (let k = 1; k < m - 1; k++) {
        const a = at(k - 1);
        const b = at(k + 1);

        if (at(k) === 'ES' && a === 'EN' && b === 'EN') set(k, 'EN');
        else if (at(k) === 'CS' && a === b && (a === 'EN' || a === 'AN')) set(k, a);
    }
    // W5
    for (let k = 0; k < m; k++) {
        if (at(k) !== 'ET') continue;
        let j = k;

        while (j < m && at(j) === 'ET') j++;
        if ((k > 0 && at(k - 1) === 'EN') || (j < m && at(j) === 'EN')) for (let x = k; x < j; x++) set(x, 'EN');
        k = j - 1;
    }
    // W6
    for (let k = 0; k < m; k++) if (at(k) === 'ES' || at(k) === 'ET' || at(k) === 'CS') set(k, 'ON');
    // W7
    strong = sos;
    for (let k = 0; k < m; k++) {
        const c = at(k);

        if (c === 'L' || c === 'R') strong = c;
        else if (c === 'EN' && strong === 'L') set(k, 'L');
    }
    const e: 'L' | 'R' = lv & 1 ? 'R' : 'L';
    const dirOf = (c: BidiClass): 'L' | 'R' | null =>
        c === 'L' ? 'L' : c === 'R' || c === 'AN' || c === 'EN' ? 'R' : null;

    // N0: paired brackets take the direction of what they enclose
    if (chars) {
        const pairs: [number, number][] = [];
        const open: [string, number][] = [];

        for (let k = 0; k < m; k++) {
            if (at(k) !== 'ON') continue;
            const ch = canon(chars[seq[k]] ?? '');

            if (OPENING.has(ch)) {
                if (open.length === 63) break;
                open.push([canon(OPENING.get(ch) as string), k]);
            } else if (CLOSING.has(ch)) {
                for (let s = open.length - 1; s >= 0; s--) {
                    if (open[s][0] !== ch) continue;
                    pairs.push([open[s][1], k]);
                    open.length = s;
                    break;
                }
            }
        }
        pairs.sort((a, b) => a[0] - b[0]);
        for (const [a, b] of pairs) {
            let found: 'L' | 'R' | null = null;

            for (let k = a + 1; k < b; k++) {
                const d = dirOf(at(k));

                if (d === e) {
                    found = e;
                    break;
                }
                if (d) found = d;
            }
            if (!found) continue;
            let dir: 'L' | 'R' = e;

            if (found !== e) {
                // only the other direction inside: follow the context before the opening bracket
                let before: 'L' | 'R' = sos === 'R' ? 'R' : 'L';

                for (let k = a - 1; k >= 0; k--) {
                    const d = dirOf(at(k));

                    if (d) {
                        before = d;
                        break;
                    }
                }
                dir = before === found ? found : e;
            }
            set(a, dir);
            set(b, dir);
            // marks after a bracket follow it
            for (const k of [a, b]) {
                for (let x = k + 1; x < m && original[seq[x]] === 'NSM'; x++) set(x, dir);
            }
        }
    }
    // N1, N2
    for (let k = 0; k < m; k++) {
        if (!isNI(at(k))) continue;
        let j = k;

        while (j < m && isNI(at(j))) j++;
        const before = k > 0 ? (dirOf(at(k - 1)) ?? e) : sos === 'R' ? 'R' : 'L';
        const after = j < m ? (dirOf(at(j)) ?? e) : eos === 'R' ? 'R' : 'L';
        const dir = before === after ? before : e;

        for (let x = k; x < j; x++) set(x, dir);
        k = j - 1;
    }
}

/**
 * L1 for one line: whitespace and isolate controls at the end of the line, and before tabs, fall
 * back to the paragraph level. `types` are the original types of the line's units. Changes
 * `levels` in place.
 */
export function resetWhitespace(types: readonly BidiClass[], levels: number[], level: number): void {
    let trailing = true;

    for (let i = types.length - 1; i >= 0; i--) {
        const c = types[i];

        if (c === 'S' || c === 'B') {
            levels[i] = level;
            trailing = true;
        } else if (trailing && (c === 'WS' || isNI(c) || REMOVED.has(c)) && c !== 'ON') levels[i] = level;
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
    '\u00ab\u00bb',
    '\u2039\u203a',
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
