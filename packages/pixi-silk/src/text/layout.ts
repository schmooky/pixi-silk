/** Horizontal alignment of the lines of a text block. */
export type TextAlign = 'left' | 'center' | 'right';

/** Widths of characters at the size being laid out, in local units. */
export interface TextMeasurer {
    /** Advance width of a character. */
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
    /** Default `left`. */
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
    /** Baseline. */
    y: number;
    /** Line index. */
    line: number;
}

/** One line of a laid-out text. */
export interface LayoutLine {
    /** The characters on the line, without the spaces a wrap removed. */
    text: string;
    /** Width of the line. */
    width: number;
    /** Baseline. */
    y: number;
}

/** Result of {@link layoutText}. */
export interface TextLayout {
    /** Every character with a position, spaces included. */
    glyphs: PlacedGlyph[];
    /** The lines, top to bottom. */
    lines: LayoutLine[];
    /** Width of the widest line. */
    width: number;
    /** Height of the block, measured the way PixiJS `Text` does. */
    height: number;
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
    const lines: string[][] = [];
    const max = options.wordWrapWidth ?? 100;

    for (const paragraph of text.split(/\r?\n/)) {
        const chars = Array.from(paragraph);

        if (!options.wordWrap) {
            lines.push(chars);
            continue;
        }
        wrap(chars, max, options.breakWords ?? false, width, lines);
    }

    const ascent = options.ascent;
    const fontHeight = ascent + options.descent;
    const lineHeight = options.lineHeight ?? fontHeight;
    const shift = Math.max(0, (lineHeight - fontHeight) / 2);
    const widths = lines.map((l) => width(l));
    const blockWidth = Math.max(0, ...widths);
    const align = options.align ?? 'left';
    const glyphs: PlacedGlyph[] = [];
    const out: LayoutLine[] = [];

    lines.forEach((chars, li) => {
        const y = li * lineHeight + ascent + shift;
        const lw = widths[li];
        let x = align === 'center' ? (blockWidth - lw) / 2 : align === 'right' ? blockWidth - lw : 0;

        for (let i = 0; i < chars.length; i++) {
            const c = chars[i];

            if (i > 0) x += kern(chars[i - 1], c) + spacing;
            // tabular digits sit centred in their widened box
            const centre = tab && isDigit(c) ? (tab - measure.advance(c)) / 2 : 0;

            glyphs.push({ char: c, x: x + centre, y, line: li });
            x += advance(c);
        }
        out.push({ text: chars.join(''), width: lw, y });
    });

    return {
        glyphs,
        lines: out,
        width: blockWidth,
        height: lines.length ? Math.max(lineHeight, fontHeight) + (lines.length - 1) * lineHeight : 0,
    };
}

/** Greedy word wrap of one paragraph into `lines`. Spaces at a break are dropped. */
function wrap(
    chars: string[],
    max: number,
    breakWords: boolean,
    width: (chars: readonly string[]) => number,
    lines: string[][],
): void {
    // runs of spaces and runs of everything else
    const tokens: string[][] = [];

    for (const c of chars) {
        const last = tokens[tokens.length - 1];

        if (last && isSpace(last[0]) === isSpace(c)) last.push(c);
        else tokens.push([c]);
    }
    let line: string[] = [];
    let first = true;
    const trimmed = (l: string[]): string[] => {
        let end = l.length;

        while (end > 0 && isSpace(l[end - 1])) end--;

        return end === l.length ? l : l.slice(0, end);
    };
    const hasInk = (l: string[]): boolean => l.some((c) => !isSpace(c));
    const flush = (): void => {
        lines.push(trimmed(line));
        line = [];
        first = false;
    };

    for (const token of tokens) {
        if (isSpace(token[0])) {
            // a wrapped line starts at its first word; the paragraph keeps its indent
            if (line.length || first) line.push(...token);
            continue;
        }
        if (!hasInk(line) || width(trimmed([...line, ...token])) <= max) {
            if (hasInk(line) || !breakWords || width([...line, ...token]) <= max) {
                line.push(...token);
                continue;
            }
        } else {
            flush();
            if (!breakWords || width(token) <= max) {
                line.push(...token);
                continue;
            }
        }
        // the word does not fit on a line of its own: break it between characters
        for (const c of token) {
            if (hasInk(line) && width([...line, c]) > max) flush();
            line.push(c);
        }
    }
    if (line.length || first) flush();
}
