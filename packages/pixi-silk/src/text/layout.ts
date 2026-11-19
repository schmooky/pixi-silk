import {
    type BidiClass,
    hasRtl,
    mirror,
    paragraphLevel,
    resetWhitespace,
    resolveLevels,
    type TextDirection,
    visualOrder,
} from './bidi';
import { clusters, isWide, noLineEnd, noLineStart, type WordBreak } from './cluster';

/**
 * Horizontal alignment of the lines of a text block. `start` and `end` follow the direction of each
 * line's paragraph: `start` is left for left-to-right text and right for right-to-left text.
 * `justify` stretches every wrapped line to the full width and aligns the last line of each
 * paragraph to its start.
 */
export type TextAlign = 'left' | 'center' | 'right' | 'start' | 'end' | 'justify';

/** Widths of characters at the size being laid out, in local units. */
export interface TextMeasurer {
    /**
     * Advance width of one character, without kerning or letter spacing. Right-to-left and cursive
     * text also asks for whole runs of joined letters, and for their prefixes when placing carets.
     */
    advance(char: string): number;
    /** Extra space between two characters (negative pulls them together). */
    kerning(a: string, b: string): number;
    /**
     * How far a character's ink reaches above and below the baseline. Optional. With it, lines grow
     * to fit glyphs that reach past the font's ascent or descent (stacked Burmese, Thai or Vietnamese
     * marks), so nothing overlaps the next line.
     */
    ink?(char: string): { ascent: number; descent: number };
}

/** The box an inline object takes in a line, as {@link LayoutOptions.inlines} lists them. */
export interface InlineMetrics {
    /** Advance width, margins included. */
    width: number;
    /** Height above the baseline. */
    ascent: number;
    /** Depth below the baseline. Negative when the box sits above the baseline. */
    descent: number;
}

/** What {@link layoutText} needs besides the text. Sizes are in local units. */
export interface LayoutOptions {
    /** Font ascent: baseline to the top of the line box. */
    ascent: number;
    /** Font descent: baseline to the bottom of the line box. */
    descent: number;
    /** Extra space after each character. Default 0. */
    letterSpacing?: number;
    /** Distance between baselines. Default `ascent + descent`. */
    lineHeight?: number;
    /** Alignment of the lines inside the widest line. Default `start`. */
    align?: TextAlign;
    /**
     * Base direction of each paragraph. `auto` takes it from the paragraph's first strong character,
     * so Arabic or Hebrew text runs right to left and Latin text left to right. Default `auto`.
     */
    direction?: TextDirection;
    /**
     * Most lines to show. Text past the last one is dropped and the last line ends in `ellipsis`.
     * 0 for no limit. Default 0.
     */
    maxLines?: number;
    /**
     * Widest a line may be when `wordWrap` is off. A longer line is cut and ends in `ellipsis`. With
     * `wordWrap` on, lines that cannot break narrower than `wordWrapWidth` are cut the same way when
     * `maxWidth` or `maxLines` is set. Default no limit.
     */
    maxWidth?: number;
    /** What a cut line ends with. `null` cuts without a mark. Default `\u2026` (an ellipsis). */
    ellipsis?: string | null;
    /** Tab stops every this many space widths, from the start of the line. Default 8. */
    tabSize?: number;
    /** Lets `justify` stretch Arabic words with kashida (tatweel) before it widens spaces. Default true. */
    kashida?: boolean;
    /** Breaks lines longer than `wordWrapWidth` at spaces. Default false. */
    wordWrap?: boolean;
    /** Line width that `wordWrap` breaks at. Default 100. */
    wordWrapWidth?: number;
    /** Breaks words that do not fit on a line of their own. Default false. */
    breakWords?: boolean;
    /**
     * Gives the digits one width, so numbers do not jitter as they change. Each digit set gets its
     * own width: ASCII, Arabic-Indic, Persian, Devanagari, Thai, Burmese and the others. Default false.
     */
    tabularNumbers?: boolean;
    /** Applies the font's kerning. Default true. */
    kerning?: boolean;
    /**
     * Where lines may break without spaces: `normal` breaks between Chinese, Japanese and Korean
     * characters, `keep-all` only at spaces. Thai, Burmese, Khmer and Lao break between words either
     * way. Default `normal`.
     */
    wordBreak?: WordBreak;
    /**
     * Grows the line box when a glyph's ink reaches past the font's ascent or descent, so tall
     * stacks of marks are not cut or overlapped. Needs {@link TextMeasurer.ink}. Default true.
     */
    fitInk?: boolean;
    /**
     * Boxes for inline objects. `{name}` in the text, with a name listed here, becomes one box that
     * flows with the text like a character. Unlisted names stay text.
     */
    inlines?: Record<string, InlineMetrics>;
}

/** A character placed by {@link layoutText}. */
export interface PlacedGlyph {
    /**
     * What to draw: one code point. In text that needs the bidi pass, a base with its marks or a run
     * of joined letters, so Arabic words shape. Brackets in right-to-left runs come mirrored.
     */
    char: string;
    /** Pen position: the left of its advance box, after alignment. */
    x: number;
    /** Baseline y. */
    y: number;
    /** Index of the line in {@link TextLayout.lines}. */
    line: number;
    /** Offset of the character in the source text, in UTF-16 code units. */
    index: number;
    /** Name of the inline object this box stands for, when it is one. `char` is then U+FFFC. */
    inline?: string;
}

/** A run of a line that goes one way, as {@link LayoutLine.runs} lists them. */
export interface LineRun {
    /** Source offset of the run's first character. */
    start: number;
    /** Source offset after the run's last character. */
    end: number;
    /** Left edge of the run. */
    left: number;
    /** Right edge of the run. */
    right: number;
    /** True when the run reads right to left. */
    rtl: boolean;
}

/** One line of a laid-out text. */
export interface LayoutLine {
    /** The characters on the line, without the spaces a wrap removed. */
    text: string;
    /** Width of the line, without trailing spaces that hang past the edge. */
    width: number;
    /** Baseline y. */
    y: number;
    /** Left edge of the line after alignment. */
    x: number;
    /** Top of the line box. Lines stack every `lineHeight`. */
    top: number;
    /** Bottom of the line box. */
    bottom: number;
    /** Offset in the source text where the line starts. */
    start: number;
    /**
     * Offset where the line ends, before its newline. Spaces a wrap removed count as part of the line,
     * so a wrapped line ends where the next one starts.
     */
    end: number;
    /** True when the line ends at a wrap rather than at a newline or the end of the text. */
    wrapped: boolean;
    /** Every place a caret can sit on the line, as source offsets from `start` to `end`. */
    offsets: number[];
    /** The x of the caret at each of `offsets`. Spaces past the line's edge hang beyond `width`. */
    carets: number[];
    /** True when the line's paragraph runs right to left. */
    rtl: boolean;
    /** True when the line was cut to fit `maxWidth` or `maxLines` and ends in the ellipsis. */
    truncated: boolean;
    /**
     * The line's one-way runs in visual order, left to right. Set on lines that went through the bidi
     * pass (they hold right-to-left text), absent on plain left-to-right lines.
     */
    runs?: LineRun[];
    /**
     * Where a caret at each of `offsets` sits when it goes with the character after it, on lines with
     * `runs`. Where the direction changes one offset has two places on screen: `carets` holds the one
     * after the character before, `leads` the one before the character after.
     */
    leads?: number[];
}

/** Result of {@link layoutText}. */
export interface TextLayout {
    /** Every character with a position, spaces included. */
    glyphs: PlacedGlyph[];
    /** True when text was cut to fit `maxWidth` or `maxLines`. */
    truncated: boolean;
    /** The lines, top to bottom. Empty text has one empty line. */
    lines: LayoutLine[];
    /** Width of the widest line. */
    width: number;
    /** Height of the block, measured the way PixiJS `Text` does. */
    height: number;
    /** Font ascent the layout used. */
    ascent: number;
    /** Font descent the layout used. */
    descent: number;
    /** Distance between baselines. */
    lineHeight: number;
}

const NBSP = String.fromCharCode(160);
const isSpace = (c: string): boolean => c === ' ' || c === '\t' || c === NBSP;
/** First code point of each run of ten decimal digits: ASCII, Arabic-Indic, Persian, Indic, Thai, Lao, Tibetan, Myanmar, Khmer, Mongolian, full width. */
const ZEROS = [
    0x30, 0x660, 0x6f0, 0x7c0, 0x966, 0x9e6, 0xa66, 0xae6, 0xb66, 0xbe6, 0xc66, 0xce6, 0xd66, 0xde6, 0xe50, 0xed0,
    0xf20, 0x1040, 0x1090, 0x17e0, 0x1810, 0xff10,
];
/** The zero of the digit set a character belongs to, or -1 when it is not a digit. */
const digitZero = (c: string): number => {
    const cp = c.codePointAt(0) as number;

    if (c.length !== 1) return -1;
    for (const z of ZEROS) if (cp >= z && cp < z + 10) return z;

    return -1;
};
const isDigit = (c: string): boolean => digitZero(c) >= 0;
const ZWJ = '\u200d';
const OBJECT = '\ufffc';
const TOKEN = /\{([\w-]+)\}/g;

/** An inline object token in a text, as {@link inlineTokens} finds them. */
export interface InlineToken {
    /** Offset of the opening brace. */
    start: number;
    /** Offset after the closing brace. */
    end: number;
    /** The name between the braces. */
    name: string;
}

/** The `{name}` tokens of a text whose names `known` accepts, in order. Other braces stay text. */
export function inlineTokens(text: string, known: (name: string) => boolean): InlineToken[] {
    const out: InlineToken[] = [];

    for (const m of text.matchAll(TOKEN)) {
        if (!known(m[1])) continue;
        out.push({ start: m.index as number, end: (m.index as number) + m[0].length, name: m[1] });
    }

    return out;
}

/** A unit of layout: a cluster drawn as one glyph, or an inline object. */
interface Unit {
    /** What to draw. Inline objects are U+FFFC followed by their name. */
    draw: string;
    start: number;
    end: number;
    /** Caret offsets inside the unit (grapheme boundaries after the first). */
    inner: number[];
    type: BidiClass;
    breakBefore: boolean;
    inline?: string;
}

/** One line before alignment: its paragraph's units, the drawn range and where the next line starts. */
interface Row {
    chars: string[];
    offs: number[];
    units: Unit[];
    /** Resolved bidi levels of the paragraph's units, or null for plain left-to-right text. */
    levels: number[] | null;
    level: 0 | 1;
    from: number;
    to: number;
    next: number;
    last: boolean;
    /** The line was cut to fit and ends in the ellipsis. */
    cut?: boolean;
}

/** A row's units in visual order, with the levels after L1. */
interface Visual {
    order: number[];
    lv: (u: number) => number;
}

/** Cursive scripts and scripts baked a word at a time: no letter spacing between their pieces. */
const SHAPED =
    /^\u200d?[\p{Script=Arabic}\p{Script=Syriac}\p{Script=Nko}\p{Script=Mandaic}\p{Script=Mongolian}\p{Script=Myanmar}\p{Script=Khmer}\p{Script=Tibetan}\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Gurmukhi}\p{Script=Gujarati}\p{Script=Oriya}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Kannada}\p{Script=Malayalam}\p{Script=Sinhala}]/u;
const TATWEEL = '\u0640';
const LAM = 0x644;
const ALEFS = new Set([0x622, 0x623, 0x625, 0x627]);

/** How a justified line grows: words with kashida drawn in, and extra space after some units. */
interface Justified {
    draw: Map<number, string>;
    add: Map<number, number>;
}

/**
 * Lays out a block of text. Lines break at `\n` and, with `wordWrap`, at spaces. Each character gets
 * its advance, kerning and letter spacing, then the lines are aligned. Widths come from `measure`,
 * so the same layout works for any renderer.
 *
 * Paragraphs that hold right-to-left characters go through the bidi pass, and so does every
 * paragraph when `direction` is `rtl`. Words wrap in reading order, then each line is reordered for
 * display. Arabic and Hebrew read right to left, and numbers and Latin words inside them keep
 * reading left to right.
 *
 * Text is measured and drawn in clusters (see {@link clusters}). Marks stay with their letter.
 * Joined Arabic runs and words of Burmese, Thai and the Indic scripts are one glyph each, so Canvas
 * shapes them. `{name}` tokens listed in `inlines` become boxes for inline objects.
 */
export function layoutText(text: string, options: LayoutOptions, measure: TextMeasurer): TextLayout {
    const spacing = options.letterSpacing ?? 0;
    const useKerning = options.kerning ?? true;
    const direction = options.direction ?? 'auto';
    const inlines = options.inlines ?? {};
    // with tabular numbers each digit set gets the width of its widest digit
    const tabs = new Map<number, number>();
    const tabFor = (c: string): number => {
        const z = options.tabularNumbers ? digitZero(c) : -1;

        if (z < 0) return 0;
        let w = tabs.get(z);

        if (w === undefined) {
            w = 0;
            for (let d = 0; d < 10; d++) w = Math.max(w, measure.advance(String.fromCharCode(z + d)));
            tabs.set(z, w);
        }

        return w;
    };
    const tab = options.tabularNumbers ? 1 : 0;
    const advance = (c: string): number =>
        c[0] === OBJECT ? (inlines[c.slice(1)]?.width ?? 0) : tabFor(c) || measure.advance(c);
    const kern = (a: string, b: string): number =>
        useKerning && a[0] !== OBJECT && b[0] !== OBJECT && !(tab && (isDigit(a) || isDigit(b)))
            ? measure.kerning(a, b)
            : 0;
    // no letter spacing inside cursive or shaped words: Arabic letters keep joining, and a word baked
    // whole cannot take spacing inside it, so it takes none at its edges either
    const between = (a: string, b: string): number => (spacing && SHAPED.test(a) && SHAPED.test(b) ? 0 : spacing);
    // tab stops every tabSize spaces from the start of the line
    const tabW = (options.tabSize ?? 8) * measure.advance(' ');
    const step = (c: string, pos: number): number => {
        if (c !== '\t' || tabW <= 0) return advance(c);
        const r = pos % tabW;

        return r > tabW - 1e-6 || r < 1e-6 ? tabW : tabW - r;
    };
    const width = (chars: readonly string[], from = 0, to = chars.length): number => {
        let w = 0;

        for (let i = from; i < to; i++) {
            if (i > from) w += kern(chars[i - 1], chars[i]) + between(chars[i - 1], chars[i]);
            w += step(chars[i], w);
        }

        return w;
    };
    const max = options.wordWrapWidth ?? 100;
    const rows: Row[] = [];
    let p = 0;

    while (p <= text.length) {
        let q = text.indexOf('\n', p);

        if (q < 0) q = text.length;
        const stop = q > p && text[q - 1] === '\r' ? q - 1 : q;
        const para = text.slice(p, stop);
        const bidi = direction === 'rtl' || hasRtl(para);
        const units: Unit[] = [];
        const addText = (from: number, to: number): void => {
            for (const c of clusters(text.slice(from, to), options.wordBreak)) {
                units.push({ ...c, start: c.start + from, end: c.end + from, inner: c.inner.map((o) => o + from) });
            }
        };
        let t = p;

        // {name} tokens of listed inline objects become one box each
        for (const tok of inlineTokens(para, (n) => Object.hasOwn(inlines, n))) {
            addText(t, p + tok.start);
            t = p + tok.end;
            units.push({
                draw: OBJECT + tok.name,
                start: p + tok.start,
                end: t,
                inner: [],
                type: 'ON',
                breakBefore: false,
                inline: tok.name,
            });
        }
        addText(t, stop);
        // an inline box sticks to the letters and digits beside it, like part of a word, but a line
        // may break between two boxes, or between a box and Chinese, Japanese or Korean text
        if (options.wordBreak !== 'keep-all') {
            for (let i = 1; i < units.length; i++) {
                const a = units[i - 1];
                const b = units[i];

                if (!a.inline && !b.inline) continue;
                const left = a.inline ? null : (Array.from(a.draw).pop() ?? '');
                const right = b.inline ? null : String.fromCodePoint(b.draw.codePointAt(0) as number);

                if (left === null && right === null) b.breakBefore = true;
                else if (left !== null) b.breakBefore = isWide(left) && !noLineEnd(left);
                else if (right !== null) b.breakBefore = isWide(right) && !noLineStart(right);
            }
        }
        const chars = units.map((u) => u.draw);
        const offs = units.map((u) => u.start);

        offs.push(stop);
        const types = units.map((u) => u.type);
        const level = bidi ? paragraphLevel(types, direction) : 0;
        const levels = bidi ? resolveLevels(types, level, chars) : null;
        const ranges: [number, number][] = [];

        if (options.wordWrap) {
            wrap(
                chars,
                max,
                options.breakWords ?? false,
                (a, b) => width(chars, a, b),
                (i) => units[i].breakBefore,
                ranges,
            );
        } else ranges.push([0, chars.length]);
        ranges.forEach(([from, to], k) => {
            const last = k === ranges.length - 1;

            rows.push({
                chars,
                offs,
                units,
                levels,
                level,
                from,
                to,
                next: last ? chars.length : ranges[k + 1][0],
                last,
            });
        });
        p = q + 1;
    }

    /** Spreads `extra` over a line: kashida in Arabic words first, then spaces, then between characters. */
    const justify = (row: Row, extra: number): Justified | null => {
        if (extra <= 1e-6 || row.to - row.from < 2) return null;
        const out: Justified = { draw: new Map(), add: new Map() };
        const tw = options.kashida === false ? 0 : measure.advance(TATWEEL);
        // join points inside Arabic words, but never inside lam alef, which is one ligature
        const points: [number, number][] = [];

        for (let u = row.from; u < row.to; u++) {
            const unit = row.units[u];

            if (unit.type !== 'AL' || unit.inline) continue;
            for (const o of unit.inner) {
                const prev = text.codePointAt(o - 1) as number;

                if (!(prev === LAM && ALEFS.has(text.codePointAt(o) as number))) points.push([u, o]);
            }
        }
        if (tw > 0 && points.length) {
            // at most two tatweels at each point, spread evenly
            const n = Math.min(Math.floor(extra / tw), points.length * 2);
            const count = new Map<number, number[]>();

            for (let i = 0; i < n; i++) {
                // spread over the whole line, not bunched at its start
                const j = i < points.length ? Math.floor(((i + 0.5) * points.length) / Math.min(n, points.length)) : i;
                const [u, o] = points[j % points.length];
                const list = count.get(u) ?? [];

                list.push(o);
                count.set(u, list);
            }
            for (const [u, cuts] of count) {
                const unit = row.units[u];
                const lead = unit.draw.startsWith(ZWJ) ? 1 : 0;
                let d = unit.draw;

                // insert from the end, so earlier positions stay put
                for (const o of [...cuts].sort((a, b) => b - a)) {
                    const at = o - unit.start + lead;

                    d = d.slice(0, at) + TATWEEL + d.slice(at);
                }
                extra -= measure.advance(d) - measure.advance(unit.draw);
                out.draw.set(u, d);
            }
        }
        if (extra > 1e-6) {
            const spaces: number[] = [];

            for (let u = row.from; u < row.to; u++) if (isSpace(row.chars[u])) spaces.push(u);
            const at = spaces.length ? spaces : Array.from({ length: row.to - row.from - 1 }, (_, i) => row.from + i);

            for (const u of at) out.add.set(u, extra / at.length);
        }

        return out;
    };

    // ---- overflow: a line past maxLines, or wider than its limit, is cut and ends in the ellipsis
    const maxLines = Math.max(0, Math.floor(options.maxLines ?? 0));
    const limit = options.wordWrap ? max : (options.maxWidth ?? Number.POSITIVE_INFINITY);
    const ellipsis = options.ellipsis === undefined ? '\u2026' : (options.ellipsis ?? '');
    const cutWide = options.maxWidth !== undefined || maxLines > 0;
    let truncated = false;
    const cut = (row: Row, force: boolean): Row => {
        const ellW = ellipsis ? advance(ellipsis) : 0;
        const fits = (k: number): boolean =>
            (k > row.from ? width(row.chars, row.from, k) + (ellipsis ? spacing : 0) : 0) + ellW <= limit + 1e-6;
        let k = row.to;

        if (!force && width(row.chars, row.from, k) <= limit + 1e-6) return row;
        while (k > row.from && !fits(k)) k--;
        // no space before the ellipsis
        while (k > row.from && isSpace(row.chars[k - 1])) k--;
        const units = row.units.slice(0, k);
        const at = row.offs[k];

        if (ellipsis) units.push({ draw: ellipsis, start: at, end: at, inner: [], type: 'ON', breakBefore: false });
        const chars = units.map((u) => u.draw);
        const offs = units.map((u) => u.start);

        offs.push(at);
        truncated = true;

        return {
            chars,
            offs,
            units,
            levels: row.levels
                ? resolveLevels(
                      units.map((u) => u.type),
                      row.level,
                      chars,
                  )
                : null,
            level: row.level,
            from: row.from,
            to: units.length,
            next: units.length,
            last: true,
            cut: true,
        };
    };

    if (maxLines > 0 && rows.length > maxLines) {
        rows.length = maxLines;
        rows[maxLines - 1] = cut(rows[maxLines - 1], true);
    }
    if (cutWide && Number.isFinite(limit)) {
        for (let i = 0; i < rows.length; i++) if (!rows[i].cut) rows[i] = cut(rows[i], false);
    }

    // ---- bidi helpers: visual order of a row and the gaps between visual neighbours
    const visual = (row: Row): Visual => {
        const { from, to } = row;
        const lv = (row.levels as number[]).slice(from, to);

        resetWhitespace(
            row.units.slice(from, to).map((u) => u.type),
            lv,
            row.level,
        );

        return { order: visualOrder(lv).map((k) => k + from), lv: (u) => lv[u - from] };
    };
    const gap = (row: Row, v: Visual, a: number, b: number): number => {
        const odd = v.lv(a) & 1;
        let k = 0;

        // kerning applies to pairs that are neighbours in reading order too
        if (odd === (v.lv(b) & 1)) {
            if (!odd && b === a + 1) k = kern(row.chars[a], row.chars[b]);
            else if (odd && a === b + 1) k = kern(row.chars[b], row.chars[a]);
        }

        return k + between(row.chars[a], row.chars[b]);
    };
    const visuals = rows.map((r) => (r.levels ? visual(r) : null));
    const widths = rows.map((r, i) => {
        const v = visuals[i];

        if (!v) return width(r.chars, r.from, r.to);
        let w = 0;

        v.order.forEach((u, k) => {
            if (k > 0) w += gap(r, v, v.order[k - 1], u);
            w += step(r.chars[u], w);
        });

        return w;
    });
    // justify: wrapped lines grow to the full width, with kashida in Arabic, then at spaces, then
    // between characters of text without spaces
    const align = options.align ?? 'start';
    const target = options.wordWrap ? max : Math.max(0, ...widths);
    const adjust = rows.map((r, i) =>
        align === 'justify' && !r.last && !r.cut ? justify(r, target - widths[i]) : null,
    );

    adjust.forEach((a, i) => {
        if (a) widths[i] = target;
    });

    // glyphs that reach past the font's ascent or descent grow every line box
    let ascent = options.ascent;
    let descent = options.descent;

    if (options.fitInk !== false) {
        const seen = new Set<Unit[]>();

        for (const row of rows) {
            if (seen.has(row.units)) continue;
            seen.add(row.units);
            for (const u of row.units) {
                const box = u.inline ? inlines[u.inline] : null;
                const ink = box ?? (measure.ink && !isSpace(u.draw) ? measure.ink(u.draw) : null);

                if (!ink) continue;
                ascent = Math.max(ascent, ink.ascent);
                descent = Math.max(descent, ink.descent);
            }
        }
    }
    const fontHeight = ascent + descent;
    const lineHeight = options.lineHeight ?? fontHeight;
    const shift = Math.max(0, (lineHeight - fontHeight) / 2);
    const blockWidth = Math.max(0, ...widths);
    const glyphs: PlacedGlyph[] = [];
    const out: LayoutLine[] = [];
    /**
     * Where a caret inside a cluster sits, from its start: the middle of the shaped prefix and the
     * whole less the shaped rest. A word that reorders its vowels (Burmese, Indic) shapes its pieces
     * a little differently, and the average lands closer. Never moves back past `done`.
     */
    const innerX = (u: Unit, o: number, full: number, done: number): number => {
        const join = u.type === 'AL' ? ZWJ : '';
        const head = measure.advance(text.slice(u.start, o) + join);
        const tail = measure.advance(join + text.slice(o, u.end));

        return Math.min(full, Math.max(done, (head + full - tail) / 2));
    };
    const placed = (u: Unit, char: string, x: number, y: number, line: number): PlacedGlyph =>
        u.inline
            ? { char: OBJECT, x, y, line, index: u.start, inline: u.inline }
            : { char, x, y, line, index: u.start };

    rows.forEach((row, li) => {
        const { chars, offs, from, to } = row;
        const rtl = row.level === 1;
        const y = li * lineHeight + ascent + shift;
        const lw = widths[li];
        const adj = adjust[li];
        const drawOf = (u: number): string => adj?.draw.get(u) ?? chars[u];
        const extra = (u: number): number => adj?.add.get(u) ?? 0;
        const side =
            align === 'start' || align === 'justify'
                ? rtl
                    ? 'right'
                    : 'left'
                : align === 'end'
                  ? rtl
                      ? 'left'
                      : 'right'
                  : align;
        const x0 = side === 'center' ? (blockWidth - lw) / 2 : side === 'right' ? blockWidth - lw : 0;
        const offsets: number[] = [offs[from]];
        const carets: number[] = [x0];
        const v = visuals[li];
        let runs: LineRun[] | undefined;
        let leads: number[] | undefined;

        if (!v) {
            let x = x0;

            for (let i = from; i < to; i++) {
                const c = chars[i];

                if (i > from) {
                    const g = kern(chars[i - 1], c) + between(chars[i - 1], c);

                    // the caret sits in the middle of the gap between two characters
                    offsets.push(offs[i]);
                    carets.push(x + g / 2);
                    x += g;
                }
                // tabular digits sit centred in their widened box
                const centre = tab && isDigit(c) ? (tabFor(c) - measure.advance(c)) / 2 : 0;

                const unit = row.units[i];
                const d = drawOf(i);
                const w = step(d, x - x0);
                // kashida stretched the word: inner carets stretch with it
                const stretch = d === c ? 1 : w / advance(c);

                glyphs.push(placed(unit, d, x + centre, y, li));
                let done = 0;

                for (const o of unit.inner) {
                    done = innerX(unit, o, advance(c), done);
                    offsets.push(o);
                    carets.push(x + done * stretch);
                }
                x += w + extra(i);
            }
            if (to > from) {
                offsets.push(offs[to]);
                carets.push(x);
            }
            // spaces a wrap removed, or trailing ones: the caret moves past them, the line keeps its width
            for (let i = to; i < row.next; i++) {
                x += advance(chars[i]) + spacing;
                offsets.push(offs[i + 1]);
                carets.push(x);
            }
        } else {
            const left: number[] = [];
            const right: number[] = [];
            let x = x0;

            runs = [];
            v.order.forEach((u, k) => {
                const prev = v.order[k - 1];

                if (k > 0) x += gap(row, v, prev, u);
                const c = chars[u];
                const d = drawOf(u);
                const odd = (v.lv(u) & 1) === 1;
                const centre = tab && isDigit(c) ? (tabFor(c) - measure.advance(c)) / 2 : 0;

                glyphs.push(placed(row.units[u], odd ? mirror(d) : d, x + centre, y, li));
                left[u] = x;
                x += step(d, x - x0);
                right[u] = x;
                x += extra(u);
                // one-way runs: neighbours of one direction that follow each other in reading order
                const run = runs?.[runs.length - 1];
                const unit = row.units[u];

                if (run && run.rtl === odd && (odd ? u === prev - 1 : u === prev + 1)) {
                    run.start = Math.min(run.start, unit.start);
                    run.end = Math.max(run.end, unit.end);
                    run.right = x;
                } else runs?.push({ start: unit.start, end: unit.end, left: left[u], right: x, rtl: odd });
            });
            const odd = (u: number): boolean => (v.lv(u) & 1) === 1;
            const lead = (u: number): number => (odd(u) ? right[u] : left[u]);
            const trail = (u: number): number => (odd(u) ? left[u] : right[u]);

            offsets.length = 0;
            carets.length = 0;
            leads = [];
            if (to === from) {
                offsets.push(offs[from]);
                carets.push(rtl ? x0 + lw : x0);
                leads.push(carets[0]);
            }
            for (let u = from; u < to; u++) {
                // a caret sits after the character before it, in that character's direction
                offsets.push(offs[u]);
                carets.push(u === from ? lead(u) : trail(u - 1));
                leads.push(lead(u));
                const unit = row.units[u];
                const full = right[u] - left[u];
                let done = 0;

                const stretch = full / (advance(chars[u]) || full || 1);

                for (const o of unit.inner) {
                    done = innerX(unit, o, advance(chars[u]), done);
                    offsets.push(o);
                    carets.push(odd(u) ? right[u] - done * stretch : left[u] + done * stretch);
                    leads.push(carets[carets.length - 1]);
                }
            }
            if (to > from) {
                offsets.push(offs[to]);
                carets.push(trail(to - 1));
                leads.push(carets[carets.length - 1]);
            }
            // spaces a wrap removed hang past the end of the line, on the paragraph's side
            let hx = rtl ? x0 : x0 + lw;

            for (let i = to; i < row.next; i++) {
                hx += rtl ? -(advance(chars[i]) + spacing) : advance(chars[i]) + spacing;
                offsets.push(offs[i + 1]);
                carets.push(hx);
                leads.push(hx);
            }
        }
        out.push({
            text: text.slice(offs[from], offs[to]) + (row.cut && ellipsis ? ellipsis : ''),
            width: lw,
            y,
            x: x0,
            top: li * lineHeight,
            bottom: (li + 1) * lineHeight,
            start: offs[from],
            end: offs[row.next],
            wrapped: !row.last,
            truncated: !!row.cut,
            offsets,
            carets,
            rtl,
            ...(runs ? { runs, leads } : {}),
        });
    });

    return {
        glyphs,
        truncated,
        lines: out,
        width: blockWidth,
        height: rows.length ? Math.max(lineHeight, fontHeight) + (rows.length - 1) * lineHeight : 0,
        ascent,
        descent,
        lineHeight,
    };
}

/**
 * Greedy word wrap of one paragraph into `[from, to)` ranges of its characters. Spaces at a break
 * are dropped. Lines also break where `breakBefore` allows it.
 */
function wrap(
    chars: string[],
    max: number,
    breakWords: boolean,
    width: (from: number, to: number) => number,
    breakBefore: (i: number) => boolean,
    out: [number, number][],
): void {
    // runs of spaces and runs of everything else, as [from, to). Words also end where a line may
    // break without a space: between ideographs, between Thai or Burmese words.
    const tokens: [number, number][] = [];

    for (let i = 0; i < chars.length; i++) {
        const last = tokens[tokens.length - 1];
        const space = isSpace(chars[i]);

        if (last && isSpace(chars[last[0]]) === space && (space || !breakBefore(i))) last[1] = i + 1;
        else tokens.push([i, i + 1]);
    }
    // the open line is [s, e); a line only ever grows at its end
    let s = 0;
    let e = 0;
    let empty = true;
    let first = true;
    const trimEnd = (to: number): number => {
        while (to > s && isSpace(chars[to - 1])) to--;

        return to;
    };
    const hasInk = (): boolean => {
        if (empty) return false;
        for (let i = s; i < e; i++) if (!isSpace(chars[i])) return true;

        return false;
    };
    const push = (from: number, to: number): void => {
        if (empty) s = from;
        empty = false;
        e = to;
    };
    const flush = (): void => {
        out.push([s, trimEnd(e)]);
        empty = true;
        first = false;
    };

    for (const [a, b] of tokens) {
        if (isSpace(chars[a])) {
            // a wrapped line starts at its first word; the paragraph keeps its indent
            if (!empty || first) push(a, b);
            continue;
        }
        const ls = empty ? a : s;

        if (!hasInk() || width(ls, b) <= max) {
            if (hasInk() || !breakWords || width(ls, b) <= max) {
                push(a, b);
                continue;
            }
        } else {
            flush();
            if (!breakWords || width(a, b) <= max) {
                push(a, b);
                continue;
            }
        }
        // the word does not fit on a line of its own: break it between characters
        for (let c = a; c < b; c++) {
            if (hasInk() && width(s, c + 1) > max) flush();
            push(c, c + 1);
        }
    }
    if (!empty || first) {
        if (empty) s = e = chars.length;
        flush();
    }
}

// ------------------------------------------------------------------------------- hit testing

/** Where a point lands in a {@link TextLayout}: the nearest caret position. */
export interface CaretHit {
    /** Source offset of the caret. */
    index: number;
    /** Line the point is on. */
    line: number;
    /**
     * True when the caret belongs at the end of `line` although the next line starts at the same offset
     * (a wrap). Pass it back to {@link caretRect} to draw the caret where the point was.
     */
    upstream: boolean;
    /**
     * True when the character under the point ends at `index`: the point is left of the caret, or
     * right of it in right-to-left text.
     */
    before: boolean;
    /** True when the caret goes with the character after `index` (see {@link LayoutLine.leads}). */
    leading: boolean;
}

/** A caret position in layout units: a vertical segment from `top` to `bottom` at `x`. */
export interface CaretRect {
    /** x of the caret. */
    x: number;
    /** Top of the caret: the font's ascent above the baseline. */
    top: number;
    /** Bottom of the caret: the font's descent below the baseline. */
    bottom: number;
    /** Line the caret is on. */
    line: number;
}

/** A rectangle in layout units, as {@link rangeRects} returns them. */
export interface TextRect {
    x: number;
    y: number;
    width: number;
    height: number;
    /** Line the rectangle covers. */
    line: number;
}

/**
 * The caret position nearest to a point, in the layout's own units (the top left of the text box is
 * 0, 0). Points above the first line or below the last snap to them. `isStop` filters the offsets a
 * caret may take, for example grapheme cluster boundaries.
 */
export function caretAtPoint(layout: TextLayout, x: number, y: number, isStop?: (index: number) => boolean): CaretHit {
    const lines = layout.lines;
    const li = Math.max(0, Math.min(lines.length - 1, Math.floor(y / (layout.lineHeight || 1))));
    const line = lines[li];
    let best = 0;
    let dist = Infinity;
    let leading = false;

    for (let i = 0; i < line.offsets.length; i++) {
        if (isStop && i > 0 && i < line.offsets.length - 1 && !isStop(line.offsets[i])) continue;
        const d = Math.abs(line.carets[i] - x);

        if (d < dist) {
            dist = d;
            best = i;
            leading = false;
        }
        // where the direction changes, the same offset also sits before the next character
        const l = line.leads?.[i];

        if (l !== undefined && Math.abs(l - x) < dist - 1e-6) {
            dist = Math.abs(l - x);
            best = i;
            leading = true;
        }
    }
    const last = best === line.offsets.length - 1;
    // in a right-to-left run the character under a point right of the caret is the one before it
    const run = line.runs?.find((r) => x >= r.left && x < r.right);
    const cx = leading ? (line.leads as number[])[best] : line.carets[best];

    return {
        index: line.offsets[best],
        line: li,
        upstream: last && line.wrapped && line.offsets.length > 1,
        before: (run?.rtl ?? line.rtl) ? x > cx : x < cx,
        leading,
    };
}

/** The line a caret at `index` is on. At a wrap, `upstream` picks the end of the first line over the start of the next. */
export function lineOfIndex(layout: TextLayout, index: number, upstream = false): number {
    const lines = layout.lines;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (index > line.end) continue;
        if (index === line.end && line.wrapped && !(upstream && line.offsets.length > 1)) continue;

        return i;
    }

    return lines.length - 1;
}

/**
 * The x of a caret at `index` on line `li`: the nearest caret stop at or before it. `leading` puts
 * it before the character after it where the direction changes (see {@link LayoutLine.leads}).
 */
export function caretX(layout: TextLayout, li: number, index: number, leading = false): number {
    const line = layout.lines[li];
    const offsets = line.offsets;
    const carets = leading && line.leads ? line.leads : line.carets;

    if (index <= offsets[0]) return carets[0];
    for (let i = offsets.length - 1; i >= 0; i--) if (offsets[i] <= index) return carets[i];

    return carets[0];
}

/** A caret stop: a source offset and the side it goes with, as {@link caretVisual} returns it. */
export interface CaretStop {
    /** Source offset. */
    index: number;
    /** True when the caret goes with the character after `index` (see {@link LayoutLine.leads}). */
    leading: boolean;
}

/**
 * The caret stop one step left (`dir` -1) or right (1) on screen from `index`, on the same line.
 * In a line that mixes directions this follows what the eye sees, not the order of the text. The
 * arrow keys then move the way they point, and a caret can reach both places an offset has where
 * the direction changes. Returns null on a line that runs left to right only, or at the line's edge:
 * step through the text instead there. `isStop` filters the stops, for example to grapheme or word
 * boundaries.
 */
export function caretVisual(
    layout: TextLayout,
    index: number,
    dir: number,
    upstream = false,
    isStop?: (index: number) => boolean,
    leading = false,
): CaretStop | null {
    const li = lineOfIndex(layout, index, upstream);
    const line = layout.lines[li];

    if (!line.runs) return null;
    const x = caretX(layout, li, index, leading);
    let best: CaretStop | null = null;
    let bestD = Infinity;
    const consider = (o: number, cx: number, lead: boolean): void => {
        if (isStop && !isStop(o)) return;
        const d = (cx - x) * Math.sign(dir);

        // the nearest place on that side; places that share an x go in reading order
        if (d <= 1e-6) return;
        if (
            d < bestD - 1e-6 ||
            (Math.abs(d - bestD) <= 1e-6 && best && Math.abs(o - index) < Math.abs(best.index - index))
        ) {
            best = { index: o, leading: lead };
            bestD = d;
        }
    };

    line.offsets.forEach((o, i) => {
        consider(o, line.carets[i], false);
        const l = line.leads?.[i];

        if (l !== undefined && Math.abs(l - line.carets[i]) > 1e-6) consider(o, l, true);
    });

    return best;
}

/**
 * Where to draw a caret at `index`, in the layout's units. `leading` puts it before the character
 * after it where the direction changes.
 */
export function caretRect(layout: TextLayout, index: number, upstream = false, leading = false): CaretRect {
    const li = lineOfIndex(layout, index, upstream);
    const line = layout.lines[li];

    return {
        x: caretX(layout, li, index, leading),
        top: line.y - layout.ascent,
        bottom: line.y + layout.descent,
        line: li,
    };
}

/**
 * Highlight boxes of the range `from` to `to`, one per line, the full height of each line box. A range
 * that runs on past a newline gets a sliver of `newline` width at that line's end, so selected empty
 * lines still show. Default newline width a quarter of the font height.
 */
export function rangeRects(layout: TextLayout, from: number, to: number, newline?: number): TextRect[] {
    const a = Math.min(from, to);
    const b = Math.max(from, to);
    const out: TextRect[] = [];

    if (a === b) return out;
    const nl = newline ?? (layout.ascent + layout.descent) / 4;

    layout.lines.forEach((line, li) => {
        const hard = !line.wrapped && li < layout.lines.length - 1;
        const reach = hard ? line.end + 1 : line.end;

        if (b <= line.start || a >= reach || (a === line.end && !hard)) return;
        if (line.runs) {
            for (const [x0, x1] of bidiSpans(layout, li, a, b, hard ? nl : 0)) {
                out.push({ x: x0, y: line.top, width: x1 - x0, height: line.bottom - line.top, line: li });
            }

            return;
        }
        const x0 = caretX(layout, li, Math.max(a, line.start));
        let x1 = caretX(layout, li, Math.min(b, line.end));

        if (hard && b > line.end) x1 += nl;
        if (x1 > x0) out.push({ x: x0, y: line.top, width: x1 - x0, height: line.bottom - line.top, line: li });
    });

    return out;
}

/**
 * The selected spans of a line that went through the bidi pass, left to right. A range that is one
 * piece in reading order can be several pieces on screen when it crosses a change of direction.
 */
function bidiSpans(layout: TextLayout, li: number, a: number, b: number, newline: number): [number, number][] {
    const line = layout.lines[li];
    const runs = line.runs as LineRun[];
    const spans: [number, number][] = [];
    const edge = (run: LineRun, o: number): number => {
        if (o <= run.start) return run.rtl ? run.right : run.left;
        if (o >= run.end) return run.rtl ? run.left : run.right;

        return caretX(layout, li, o);
    };
    let ink = line.start;

    for (const run of runs) {
        ink = Math.max(ink, run.end);
        const s = Math.max(a, run.start);
        const e = Math.min(b, run.end);

        if (e <= s) continue;
        const p = edge(run, s);
        const q = edge(run, e);

        spans.push([Math.min(p, q), Math.max(p, q)]);
    }
    // spaces hanging past the line's end, then the newline sliver, on the paragraph's side
    const outer = line.rtl ? line.x : line.x + line.width;
    let reach = outer;

    if (b > ink && line.end > ink) reach = caretX(layout, li, Math.min(b, line.end));
    if (newline > 0 && b > line.end) reach += line.rtl ? -newline : newline;
    if (reach !== outer) {
        const from = a > ink ? caretX(layout, li, a) : outer;

        spans.push([Math.min(from, reach), Math.max(from, reach)]);
    }
    spans.sort((x, y) => x[0] - y[0]);
    // pieces that touch on screen are one highlight
    const tol = (layout.ascent + layout.descent) / 8;
    const merged: [number, number][] = [];

    for (const s of spans) {
        const last = merged[merged.length - 1];

        if (last && s[0] <= last[1] + tol) last[1] = Math.max(last[1], s[1]);
        else if (s[1] > s[0]) merged.push([s[0], s[1]]);
    }

    return merged;
}
