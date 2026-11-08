/** Horizontal alignment of the lines of a text block. */
export type TextAlign = 'left' | 'center' | 'right';

/** Widths of characters at the size being laid out, in local units. */
export interface TextMeasurer {
    /** Advance width of one character, without kerning or letter spacing. */
    advance(char: string): number;
    /** Extra space between two characters (negative pulls them together). */
    kerning(a: string, b: string): number;
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
    /** Alignment of the lines inside the widest line. Default `left`. */
    align?: TextAlign;
    /** Breaks lines longer than `wordWrapWidth` at spaces. Default false. */
    wordWrap?: boolean;
    /** Line width that `wordWrap` breaks at. Default 100. */
    wordWrapWidth?: number;
    /** Breaks words that do not fit on a line of their own. Default false. */
    breakWords?: boolean;
    /** Gives the digits 0 to 9 one width, so numbers do not jitter as they change. Default false. */
    tabularNumbers?: boolean;
    /** Applies the font's kerning. Default true. */
    kerning?: boolean;
}

/** A character placed by {@link layoutText}. */
export interface PlacedGlyph {
    /** The character (one code point). */
    char: string;
    /** Pen position: the left of its advance box, after alignment. */
    x: number;
    /** Baseline y. */
    y: number;
    /** Index of the line in {@link TextLayout.lines}. */
    line: number;
    /** Offset of the character in the source text, in UTF-16 code units. */
    index: number;
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
}

/** Result of {@link layoutText}. */
export interface TextLayout {
    /** Every character with a position, spaces included. */
    glyphs: PlacedGlyph[];
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
const isDigit = (c: string): boolean => c >= '0' && c <= '9' && c.length === 1;
const DIGITS = '0123456789';

/**
 * Lays out a block of text. Lines break at `\n` and, with `wordWrap`, at spaces. Each character gets
 * its advance, kerning and letter spacing, then the lines are aligned. Widths come from `measure`,
 * so the same layout works for any renderer.
 */
export function layoutText(text: string, options: LayoutOptions, measure: TextMeasurer): TextLayout {
    const spacing = options.letterSpacing ?? 0;
    const useKerning = options.kerning ?? true;
    const tab = options.tabularNumbers ? Math.max(...Array.from(DIGITS, (d) => measure.advance(d))) : 0;
    const advance = (c: string): number => (tab && isDigit(c) ? tab : measure.advance(c));
    const kern = (a: string, b: string): number =>
        useKerning && !(tab && (isDigit(a) || isDigit(b))) ? measure.kerning(a, b) : 0;
    const width = (chars: readonly string[], from = 0, to = chars.length): number => {
        let w = 0;

        for (let i = from; i < to; i++) {
            if (i > from) w += kern(chars[i - 1], chars[i]) + spacing;
            w += advance(chars[i]);
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
        const chars: string[] = [];
        const offs: number[] = [];

        for (let i = p; i < stop; ) {
            const c = String.fromCodePoint(text.codePointAt(i) as number);

            chars.push(c);
            offs.push(i);
            i += c.length;
        }
        offs.push(stop);
        const ranges: [number, number][] = [];

        if (options.wordWrap) wrap(chars, max, options.breakWords ?? false, (a, b) => width(chars, a, b), ranges);
        else ranges.push([0, chars.length]);
        ranges.forEach(([from, to], k) => {
            const last = k === ranges.length - 1;

            rows.push({ chars, offs, from, to, next: last ? chars.length : ranges[k + 1][0], last });
        });
        p = q + 1;
    }

    const ascent = options.ascent;
    const descent = options.descent;
    const fontHeight = ascent + descent;
    const lineHeight = options.lineHeight ?? fontHeight;
    const shift = Math.max(0, (lineHeight - fontHeight) / 2);
    const widths = rows.map((r) => width(r.chars, r.from, r.to));
    const blockWidth = Math.max(0, ...widths);
    const align = options.align ?? 'left';
    const glyphs: PlacedGlyph[] = [];
    const out: LayoutLine[] = [];

    rows.forEach((row, li) => {
        const { chars, offs, from, to } = row;
        const y = li * lineHeight + ascent + shift;
        const lw = widths[li];
        const x0 = align === 'center' ? (blockWidth - lw) / 2 : align === 'right' ? blockWidth - lw : 0;
        const offsets: number[] = [offs[from]];
        const carets: number[] = [x0];
        let x = x0;

        for (let i = from; i < to; i++) {
            const c = chars[i];

            if (i > from) {
                const gap = kern(chars[i - 1], c) + spacing;

                // the caret sits in the middle of the gap between two characters
                offsets.push(offs[i]);
                carets.push(x + gap / 2);
                x += gap;
            }
            // tabular digits sit centred in their widened box
            const centre = tab && isDigit(c) ? (tab - measure.advance(c)) / 2 : 0;

            glyphs.push({ char: c, x: x + centre, y, line: li, index: offs[i] });
            x += advance(c);
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
        out.push({
            text: chars.slice(from, to).join(''),
            width: lw,
            y,
            x: x0,
            top: li * lineHeight,
            bottom: (li + 1) * lineHeight,
            start: offs[from],
            end: offs[row.next],
            wrapped: !row.last,
            offsets,
            carets,
        });
    });

    return {
        glyphs,
        lines: out,
        width: blockWidth,
        height: rows.length ? Math.max(lineHeight, fontHeight) + (rows.length - 1) * lineHeight : 0,
        ascent,
        descent,
        lineHeight,
    };
}

/** One line before alignment: its paragraph's characters and offsets, the drawn range and where the next line starts. */
interface Row {
    chars: string[];
    offs: number[];
    from: number;
    to: number;
    next: number;
    last: boolean;
}

/** Greedy word wrap of one paragraph into `[from, to)` ranges of its characters. Spaces at a break are dropped. */
function wrap(
    chars: string[],
    max: number,
    breakWords: boolean,
    width: (from: number, to: number) => number,
    out: [number, number][],
): void {
    // runs of spaces and runs of everything else, as [from, to)
    const tokens: [number, number][] = [];

    for (let i = 0; i < chars.length; i++) {
        const last = tokens[tokens.length - 1];

        if (last && isSpace(chars[last[0]]) === isSpace(chars[i])) last[1] = i + 1;
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
    /** True when the point is left of the caret: the character under the point ends at `index`. */
    before: boolean;
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

    for (let i = 0; i < line.offsets.length; i++) {
        if (isStop && i > 0 && i < line.offsets.length - 1 && !isStop(line.offsets[i])) continue;
        const d = Math.abs(line.carets[i] - x);

        if (d < dist) {
            dist = d;
            best = i;
        }
    }
    const last = best === line.offsets.length - 1;

    return {
        index: line.offsets[best],
        line: li,
        upstream: last && line.wrapped && line.offsets.length > 1,
        before: x < line.carets[best],
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

/** The x of a caret at `index` on line `li`: the nearest caret stop at or before it. */
export function caretX(layout: TextLayout, li: number, index: number): number {
    const line = layout.lines[li];
    const { offsets, carets } = line;

    if (index <= offsets[0]) return carets[0];
    for (let i = offsets.length - 1; i >= 0; i--) if (offsets[i] <= index) return carets[i];

    return carets[0];
}

/** Where to draw a caret at `index`, in the layout's units. */
export function caretRect(layout: TextLayout, index: number, upstream = false): CaretRect {
    const li = lineOfIndex(layout, index, upstream);
    const line = layout.lines[li];

    return { x: caretX(layout, li, index), top: line.y - layout.ascent, bottom: line.y + layout.descent, line: li };
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
        const x0 = caretX(layout, li, Math.max(a, line.start));
        let x1 = caretX(layout, li, Math.min(b, line.end));

        if (hard && b > line.end) x1 += nl;
        if (x1 > x0) out.push({ x: x0, y: line.top, width: x1 - x0, height: line.bottom - line.top, line: li });
    });

    return out;
}
