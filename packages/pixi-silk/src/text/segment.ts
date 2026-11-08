/**
 * Caret stops and word boundaries for editing text. Uses `Intl.Segmenter` where the platform has it,
 * so an emoji with modifiers or a letter with combining accents is one step. Without it, every code
 * point is a step and words are runs of letters, digits and underscores.
 */

interface Segment {
    segment: string;
    index: number;
    isWordLike?: boolean;
}

type Segmenter = { segment(text: string): Iterable<Segment> };
type SegmenterCtor = new (locale?: string, options?: { granularity: 'grapheme' | 'word' }) => Segmenter;

const Ctor = (globalThis as { Intl?: { Segmenter?: SegmenterCtor } }).Intl?.Segmenter;
let graphemes: Segmenter | null = null;
let words: Segmenter | null = null;
const WORD = /[\p{L}\p{N}\p{M}_']/u;

/** A run of text with a kind, as {@link wordSegments} returns them. */
export interface WordSegment {
    /** Offset of the first character. */
    start: number;
    /** Offset after the last character. */
    end: number;
    /** True for words, false for spaces and punctuation. */
    word: boolean;
}

/** Offsets where a caret can sit: 0, every grapheme cluster boundary, and the text's length. */
export function graphemeStops(text: string): number[] {
    const out: number[] = [];

    if (Ctor) {
        graphemes ??= new Ctor(undefined, { granularity: 'grapheme' });
        for (const s of graphemes.segment(text)) out.push(s.index);
    } else {
        for (let i = 0; i < text.length; ) {
            out.push(i);
            i += String.fromCodePoint(text.codePointAt(i) as number).length;
        }
    }
    out.push(text.length);

    return out;
}

/** Splits text into words and the runs between them. */
export function wordSegments(text: string): WordSegment[] {
    const out: WordSegment[] = [];

    if (Ctor) {
        words ??= new Ctor(undefined, { granularity: 'word' });
        for (const s of words.segment(text)) {
            out.push({ start: s.index, end: s.index + s.segment.length, word: s.isWordLike === true });
        }

        return out;
    }
    for (let i = 0; i < text.length; ) {
        const word = WORD.test(text[i]);
        const space = text[i] === ' ';
        let j = i + 1;

        // words, runs of spaces, and single other characters
        while (j < text.length && (word ? WORD.test(text[j]) : space && text[j] === ' ')) j++;
        out.push({ start: i, end: j, word });
        i = j;
    }

    return out;
}

/** The segment (word, run of spaces or punctuation) that holds the character at `index`. */
export function wordAt(text: string, index: number): { start: number; end: number } {
    if (!text) return { start: 0, end: 0 };
    const i = Math.max(0, Math.min(text.length - 1, index));

    for (const s of wordSegments(text)) if (i >= s.start && i < s.end) return { start: s.start, end: s.end };

    return { start: i, end: i };
}

/**
 * Where a word jump to the right lands. `mac` (the default on Apple platforms) stops at the end of
 * the next word, like Option + Right. Otherwise it stops at the start of the word after, like Ctrl + Right.
 */
export function nextWordStop(text: string, index: number, mac: boolean = isMac()): number {
    const segs = wordSegments(text);

    for (const s of segs) {
        if (s.end <= index || !s.word) continue;
        if (mac) return s.end;
        // past the word the caret is in or before, then past the spaces
        if (s.start > index) return s.start;
    }

    return text.length;
}

/** Where a word jump to the left lands: the start of the word before `index`. */
export function previousWordStop(text: string, index: number): number {
    const segs = wordSegments(text);

    for (let i = segs.length - 1; i >= 0; i--) {
        const s = segs[i];

        if (s.start < index && s.word) return s.start;
    }

    return 0;
}

/** The paragraph around `index`: from the newline before it to the newline after, newlines left out. */
export function paragraphAt(text: string, index: number): { start: number; end: number } {
    const start = text.lastIndexOf('\n', index - 1) + 1;
    const nl = text.indexOf('\n', index);

    return { start, end: nl < 0 ? text.length : nl };
}

/** True on macOS, iOS and iPadOS, where Option moves by word and Command by line. */
export function isMac(): boolean {
    const nav = (globalThis as { navigator?: { platform?: string; userAgent?: string } }).navigator;

    return /Mac|iPhone|iPad|iPod/.test(nav?.platform || nav?.userAgent || '');
}
