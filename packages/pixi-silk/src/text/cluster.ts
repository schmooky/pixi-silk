/**
 * Clusters and line break opportunities for {@link layoutText}. A cluster is what SilkText measures
 * and bakes as one glyph. It can be a character with its marks or an emoji sequence. It can also be
 * a run of joined Arabic letters, or a word of a script that Canvas has to shape as a whole
 * (Burmese, Thai, Khmer, the Indic scripts). Break opportunities let lines wrap where there are no spaces: between Chinese,
 * Japanese and Korean characters, and between words of Thai, Burmese, Khmer and Lao.
 */
import { type BidiClass, bidiClass } from './bidi';

/** How lines may break inside text without spaces, as in CSS `word-break`. */
export type WordBreak = 'normal' | 'keep-all';

/** A run of text drawn as one glyph, as {@link clusters} returns them. */
export interface Cluster {
    /** What to measure, bake and draw. Joined runs that were cut carry a zero width joiner at the cut. */
    draw: string;
    /** Offset of the first code point in the text. */
    start: number;
    /** Offset after the last code point. */
    end: number;
    /** Offsets inside the cluster where a caret can sit: its grapheme boundaries after the first. */
    inner: number[];
    /** Bidi type of the cluster's first character. */
    type: BidiClass;
    /** True when a line may break before the cluster although no space comes first. */
    breakBefore: boolean;
}

interface Segment {
    segment: string;
    index: number;
}
type Segmenter = { segment(text: string): Iterable<Segment> };
type SegmenterCtor = new (locale?: string, options?: { granularity: 'grapheme' | 'word' }) => Segmenter;

const Ctor = (globalThis as { Intl?: { Segmenter?: SegmenterCtor } }).Intl?.Segmenter;
let graphemeSeg: Segmenter | null = null;
let wordSeg: Segmenter | null = null;

const JOINING =
    /^[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Nko}\p{Script=Mandaic}\p{Script=Mongolian}\p{Script=Adlam}\p{Script=Hanifi_Rohingya}]$/u;
const LETTER = /^\p{L}$/u;
/** Scripts Canvas has to shape a whole word of: reordered vowels, stacked consonants, conjuncts. */
const COMPLEX: [string, RegExp][] = [
    ['Myanmar', /^\p{Script=Myanmar}$/u],
    ['Thai', /^\p{Script=Thai}$/u],
    ['Lao', /^\p{Script=Lao}$/u],
    ['Khmer', /^\p{Script=Khmer}$/u],
    ['Tibetan', /^\p{Script=Tibetan}$/u],
    ['Devanagari', /^\p{Script=Devanagari}$/u],
    ['Bengali', /^\p{Script=Bengali}$/u],
    ['Gurmukhi', /^\p{Script=Gurmukhi}$/u],
    ['Gujarati', /^\p{Script=Gujarati}$/u],
    ['Oriya', /^\p{Script=Oriya}$/u],
    ['Tamil', /^\p{Script=Tamil}$/u],
    ['Telugu', /^\p{Script=Telugu}$/u],
    ['Kannada', /^\p{Script=Kannada}$/u],
    ['Malayalam', /^\p{Script=Malayalam}$/u],
    ['Sinhala', /^\p{Script=Sinhala}$/u],
    ['Javanese', /^\p{Script=Javanese}$/u],
    ['Balinese', /^\p{Script=Balinese}$/u],
    ['Tai_Tham', /^\p{Script=Tai_Tham}$/u],
];
const COMPLEX_ANY =
    /[\p{Script=Myanmar}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Tibetan}\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Gurmukhi}\p{Script=Gujarati}\p{Script=Oriya}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Kannada}\p{Script=Malayalam}\p{Script=Sinhala}\p{Script=Javanese}\p{Script=Balinese}\p{Script=Tai_Tham}]/u;
/** Scripts with no spaces between words: lines may break between Thai, Lao, Khmer and Burmese words. */
const NO_SPACES = new Set(['Myanmar', 'Thai', 'Lao', 'Khmer', 'Tibetan']);
/**
 * Scripts whose grapheme clusters shape on their own: no vowel moves across a cluster. They are baked
 * a cluster at a time, which reuses atlas cells, and only their line breaks use whole words.
 */
const BY_GRAPHEME = new Set(['Thai', 'Lao']);
/** Text that needs more than one code point per glyph: marks, joiners, emoji sequences, cursive scripts. */
const NEEDS_CLUSTERS =
    /\u200d|\u200c|[\ufe00-\ufe0f]|[\u{1f3fb}-\u{1f3ff}]|[\p{M}\u{1f1e6}-\u{1f1ff}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Nko}\p{Script=Mandaic}\p{Script=Mongolian}\p{Script=Adlam}\p{Script=Hanifi_Rohingya}\p{Script=Hebrew}]/u;
const CJK =
    /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Bopomofo}\u3000-\u303f\u30fc\uff00-\uffef]$/u;
const HANGUL = /^\p{Script=Hangul}$/u;
const EMOJI = /^\p{Extended_Pictographic}$/u;
const DIGIT = /^\p{Nd}$/u;
// characters a line must not start with, and ones it must not end with (Japanese kinsoku, Latin punctuation)
const NO_START = new Set(
    Array.from(
        '\u3001\u3002\uff0c\uff0e\u30fb\uff1a\uff1b\uff1f\uff01\u309b\u309c\u30fd\u30fe\u309d\u309e\u3005\u303b\u30fc\u2010\u30a0\u2013\u301c\uff5e\uff09\u3015\uff3d\uff5d\u3009\u300b\u300d\u300f\u3011\u3019\u3017\u301f\uff60\u00bb\u3041\u3043\u3045\u3047\u3049\u3063\u3083\u3085\u3087\u308e\u3095\u3096\u30a1\u30a3\u30a5\u30a7\u30a9\u30c3\u30e3\u30e5\u30e7\u30ee\u30f5\u30f6)]},.!?:;%\u2019\u201d',
    ),
);
const NO_END = new Set(
    Array.from(
        '\uff08\u3014\uff3b\uff5b\u3008\u300a\u300c\u300e\u3010\u3018\u3016\u301d\uff5f\u00ab([{\u2018\u201c$\u00a3\u00a5\u20ac#',
    ),
);
// Arabic letters that join to the letter before them but not to the one after (joining type R), and hamza (U)
const RIGHT_JOINING = [
    0x621, 0x625, 0x627, 0x627, 0x629, 0x629, 0x62f, 0x632, 0x648, 0x648, 0x671, 0x677, 0x688, 0x699, 0x6c0, 0x6c0,
    0x6c3, 0x6cb, 0x6cd, 0x6cd, 0x6cf, 0x6cf, 0x6d2, 0x6d3, 0x6d5, 0x6d5, 0x6ee, 0x6ef, 0x759, 0x75b, 0x76b, 0x76c,
    0x771, 0x771, 0x773, 0x774, 0x778, 0x779, 0x8aa, 0x8ac, 0x8ae, 0x8ae, 0x8b1, 0x8b2, 0x8b9, 0x8b9, 0x710, 0x710,
    0x715, 0x719, 0x71e, 0x71e, 0x728, 0x728, 0x72a, 0x72a, 0x72c, 0x72c, 0x72f, 0x72f, 0x74d, 0x74d,
];
const ZWJ = '\u200d';
/** Longest joined Arabic run baked as one glyph, in letters. Longer runs are cut and joined with ZWJ. */
const MAX_JOINED = 24;
/** Longest word of a shaped script baked as one glyph, in grapheme clusters. */
const MAX_WORD = 16;
const ATTACH = /^(?:\u200d|\u200c|[\ufe00-\ufe0f]|[\u{1f3fb}-\u{1f3ff}]|[\p{M}\u{e0020}-\u{e007f}])$/u;

const inRange = (c: number, ranges: readonly number[]): boolean => {
    for (let i = 0; i < ranges.length; i += 2) if (c >= ranges[i] && c <= ranges[i + 1]) return true;

    return false;
};
const complexScript = (ch: string): string | null => {
    for (const [name, re] of COMPLEX) if (re.test(ch)) return name;

    return null;
};
const first = (s: string): string => String.fromCodePoint(s.codePointAt(0) as number);
const lastBase = (s: string): string => {
    const chars = Array.from(s);

    for (let i = chars.length - 1; i >= 0; i--) if (!ATTACH.test(chars[i])) return chars[i];

    return chars[0] ?? '';
};

/** True for ideographs, kana, Korean syllables and emoji: characters a line may break beside. */
export function isWide(ch: string): boolean {
    return CJK.test(ch) || HANGUL.test(ch) || EMOJI.test(ch);
}

/** True for characters a line must not start with: closing punctuation, small kana, `.` `,` `!` and the like. */
export function noLineStart(ch: string): boolean {
    return NO_START.has(ch);
}

/** True for characters a line must not end with: opening brackets and currency signs. */
export function noLineEnd(ch: string): boolean {
    return NO_END.has(ch);
}

/** Grapheme clusters of a text as [start, end) offsets. Uses `Intl.Segmenter` where the platform has it. */
function graphemes(text: string): [number, number][] {
    const out: [number, number][] = [];

    if (Ctor) {
        graphemeSeg ??= new Ctor(undefined, { granularity: 'grapheme' });
        for (const s of graphemeSeg.segment(text)) out.push([s.index, s.index + s.segment.length]);

        return out;
    }
    // without it: a code point with the marks, joiners and modifiers after it
    let joined = false;

    for (let i = 0; i < text.length; ) {
        const ch = first(text.slice(i));
        const prev = out[out.length - 1];

        if (prev && (joined || ATTACH.test(ch))) prev[1] = i + ch.length;
        else out.push([i, i + ch.length]);
        joined = ch === ZWJ;
        i += ch.length;
    }

    return out;
}

/** Word boundaries of a text written without spaces. Null without `Intl.Segmenter`. */
function wordStarts(text: string): Set<number> | null {
    if (!Ctor || !COMPLEX_ANY.test(text)) return null;
    wordSeg ??= new Ctor(undefined, { granularity: 'word' });
    const out = new Set<number>();

    for (const s of wordSeg.segment(text)) out.add(s.index);

    return out;
}

/**
 * Splits a paragraph into the clusters {@link layoutText} measures and draws, in reading order.
 *
 * - Plain text (Latin, Greek, Cyrillic, Chinese, Japanese, Korean) is one cluster per code point.
 * - A character with its marks, an emoji with its modifiers and joiners, and a flag are one cluster.
 * - Letters of a cursive script (Arabic, Syriac) stay together while they join, so Canvas shapes the
 *   run. A run breaks after a letter that does not join forward.
 * - A word of a script that needs shaping (Burmese, Thai, Khmer, Lao, Tibetan, the Indic scripts and
 *   Sinhala) is one cluster. Vowels written before their consonant and stacked consonants then
 *   come out right.
 *
 * `breakBefore` marks where a line may break without a space. That is between Chinese and Japanese
 * characters and Korean syllables unless `wordBreak` is `keep-all`, never before closing
 * punctuation or small kana, never after opening brackets. It is also between words of Thai, Lao,
 * Khmer and Burmese.
 */
export function clusters(text: string, wordBreak: WordBreak = 'normal'): Cluster[] {
    const out: Cluster[] = [];

    if (!NEEDS_CLUSTERS.test(text) && !COMPLEX_ANY.test(text)) {
        for (let i = 0; i < text.length; ) {
            const ch = first(text.slice(i));
            const type = bidiClass(ch.codePointAt(0) as number);

            out.push({ draw: ch, start: i, end: i + ch.length, inner: [], type, breakBefore: false });
            i += ch.length;
        }
    } else {
        const words = wordStarts(text);
        let cur: Cluster | null = null;
        let kind = '';
        let open = false; // the current Arabic run ends in a letter that joins forward
        let count = 0;

        for (const [a, b] of graphemes(text)) {
            const g = text.slice(a, b);
            const base = first(g);
            const cp = base.codePointAt(0) as number;
            const joins = JOINING.test(base) && LETTER.test(base);
            // digits stay clusters of their own, for tabular numbers and number order in bidi text
            const script = joins || DIGIT.test(base) ? null : complexScript(base);

            if (cur && kind === 'join' && open && joins && count < MAX_JOINED) {
                cur.draw += g;
                cur.inner.push(a);
                cur.end = b;
                count++;
            } else if (cur && kind === 'join' && open && joins) {
                // cut a long run: both halves keep their joined forms through a zero width joiner
                cur.draw += ZWJ;
                cur = { draw: ZWJ + g, start: a, end: b, inner: [], type: bidiClass(cp), breakBefore: false };
                out.push(cur);
                count = 1;
            } else if (
                cur &&
                script &&
                kind === script &&
                !BY_GRAPHEME.has(script) &&
                !words?.has(a) &&
                count < MAX_WORD
            ) {
                cur.draw += g;
                cur.inner.push(a);
                cur.end = b;
                count++;
            } else {
                // a new word of a script without spaces is where a line may break
                const breakBefore =
                    !!script && kind === script && NO_SPACES.has(script) && (words === null || words.has(a));

                cur = { draw: g, start: a, end: b, inner: [], type: bidiClass(cp), breakBefore };
                out.push(cur);
                kind = joins ? 'join' : (script ?? '');
                count = 1;
            }
            // a zero width non-joiner ends the joined run
            open = joins && !g.includes('\u200c') && !(cp >= 0x600 && cp <= 0x8ff && inRange(cp, RIGHT_JOINING));
        }
    }
    for (let i = 1; i < out.length; i++) {
        const c = out[i];
        const a = lastBase(out[i - 1].draw);
        const b = first(c.draw);

        if (NO_START.has(b) || NO_END.has(a)) {
            c.breakBefore = false;
            continue;
        }
        if (c.breakBefore || wordBreak === 'keep-all') continue;
        // between two ideographs, kana, emoji or Korean syllables
        if (isWide(a) && isWide(b)) c.breakBefore = true;
    }

    return out;
}
