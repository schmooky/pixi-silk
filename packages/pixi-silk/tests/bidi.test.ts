import { describe, expect, it } from 'vitest';
import { type GlyphContext, SdfAtlas } from '../src/text/atlas';
import { bidiClass, clusters, hasRtl, mirror, paragraphLevel, resolveLevels, visualOrder } from '../src/text/bidi';
import {
    caretAtPoint,
    caretRect,
    layoutText,
    rangeRects,
    type TextLayout,
    type TextMeasurer,
} from '../src/text/layout';
import { SilkText } from '../src/text/SilkText';

// ------------------------------------------------------------------------------------ helpers

const ZWJ = '‍';
const MARK = /[\p{Mn}\p{Me}‌‍]/u;

/**
 * Every code point 10 wide, `1` half that. Marks and joiners have no width, so a run of joined
 * letters is as wide as its letters, the way a shaped word is roughly.
 */
const mono: TextMeasurer = {
    advance: (s) => Array.from(s).reduce((w, c) => w + (MARK.test(c) ? 0 : c === '1' ? 5 : 10), 0),
    kerning: () => 0,
};
const metrics = { ascent: 8, descent: 2 };

/** The drawn glyphs of a layout, left to right, as their source offsets. */
const order = (l: TextLayout): number[] => [...l.glyphs].sort((a, b) => a.x - b.x).map((g) => g.index);
/** The x of the glyph that starts at a source offset. */
const xOf = (l: TextLayout, index: number): number => {
    const g = l.glyphs.find((x) => x.index === index);

    if (!g) throw new Error(`no glyph at ${index}`);

    return g.x;
};
/** Asserts that the characters at these offsets sit left to right in this order. */
const leftToRight = (l: TextLayout, offsets: number[]): void => {
    const xs = offsets.map((o) => xOf(l, o));

    for (let i = 1; i < xs.length; i++)
        expect(xs[i], `offset ${offsets[i]} after ${offsets[i - 1]}`).toBeGreaterThan(xs[i - 1]);
};
const at = (text: string, part: string): number => {
    const i = text.indexOf(part);

    if (i < 0) throw new Error(`${part} not in ${text}`);

    return i;
};

// ---------------------------------------------------------------------------------- algorithm

describe('bidi algorithm', () => {
    it('classifies characters', () => {
        const cls = (s: string) => bidiClass(s.codePointAt(0) as number);

        expect(cls('a')).toBe('L');
        expect(cls('ب')).toBe('AL');
        expect(cls('א')).toBe('R');
        expect(cls('5')).toBe('EN');
        expect(cls('٥')).toBe('AN');
        expect(cls('۵')).toBe('EN');
        expect(cls('%')).toBe('ET');
        expect(cls('$')).toBe('ET');
        expect(cls(',')).toBe('CS');
        expect(cls('-')).toBe('ES');
        expect(cls(' ')).toBe('WS');
        expect(cls('(')).toBe('ON');
        expect(cls('َ')).toBe('NSM');
        expect(cls('‏')).toBe('R');
        expect(hasRtl('hello')).toBe(false);
        expect(hasRtl('hello عالم')).toBe(true);
    });

    it('takes the paragraph direction from the first strong character', () => {
        const types = (s: string) => Array.from(s, (c) => bidiClass(c.codePointAt(0) as number));

        expect(paragraphLevel(types('123 مرحبا'))).toBe(1);
        expect(paragraphLevel(types('123 hello مرحبا'))).toBe(0);
        expect(paragraphLevel(types('123'))).toBe(0);
        expect(paragraphLevel(types('hello'), 'rtl')).toBe(1);
    });

    it('keeps numbers left to right inside right-to-left text', () => {
        const text = 'ب 12.5% ج';
        const types = Array.from(text, (c) => bidiClass(c.codePointAt(0) as number));
        const levels = resolveLevels(types, 1);

        // after Arabic letters digits are Arabic numbers (W2): the number and its decimal point rise a
        // level, the percent sign stays with the letters and shows on the number's left, as browsers do
        expect(levels).toEqual([1, 1, 2, 2, 2, 2, 1, 1, 1]);
        expect(visualOrder(levels)).toEqual([8, 7, 6, 2, 3, 4, 5, 1, 0]);
        // after Hebrew letters they stay European numbers and keep the percent sign on their right
        const hebrew = Array.from('א 12.5% ב', (c) => bidiClass(c.codePointAt(0) as number));

        expect(visualOrder(resolveLevels(hebrew, 1))).toEqual([8, 7, 2, 3, 4, 5, 6, 1, 0]);
    });

    it('mirrors brackets', () => {
        expect(mirror('(')).toBe(')');
        expect(mirror('»')).toBe('«');
        expect(mirror('a')).toBe('a');
    });

    it('keeps joined Arabic letters in one cluster and breaks after letters that do not join forward', () => {
        // meem joins forward, reh does not: "مر" + "حبا"
        expect(clusters('مرحبا').map((c) => c.draw)).toEqual(['مر', 'حبا']);
        // lam alef stays in one run, so the font can use its ligature
        expect(clusters('سلام').map((c) => c.draw)).toEqual(['سلا', 'م']);
        // harakat ride on their letter and are not caret stops
        const marked = clusters('بَيت');

        expect(marked.map((c) => c.draw)).toEqual(['بَيت']);
        expect(marked[0].inner).toEqual([2, 3]);
        // digits, spaces and Latin letters are clusters of their own
        expect(clusters('ب 12').map((c) => c.draw)).toEqual(['ب', ' ', '1', '2']);
    });

    it('cuts joined runs longer than 24 letters and keeps them joined through a zero width joiner', () => {
        const long = 'ب'.repeat(30);
        const parts = clusters(long);

        expect(parts).toHaveLength(2);
        expect(parts[0].draw.endsWith(ZWJ)).toBe(true);
        expect(parts[1].draw.startsWith(ZWJ)).toBe(true);
        expect(parts[1].start).toBe(24);
    });
});

// ------------------------------------------------------------------------------------- layout

describe('layoutText with right-to-left text', () => {
    it('lays Arabic out right to left and draws joined runs whole', () => {
        const text = 'مرحبا بالعالم';
        const l = layoutText(text, metrics, mono);

        expect(l.lines[0].rtl).toBe(true);
        expect(l.width).toBe(130);
        expect(l.glyphs.map((g) => g.char).sort()).toEqual(['مر', 'حبا', ' ', 'با', 'لعا', 'لم'].sort());
        // the first word is on the right, the second on the left
        expect(order(l)).toEqual([11, 8, 6, 5, 2, 0]);
        expect(xOf(l, 0)).toBe(110);
    });

    it('does not break numbers next to Arabic words', () => {
        const text = 'السعر 1,234.56 دولار';
        const l = layoutText(text, metrics, mono);
        const n = at(text, '1,234.56');

        // the digits read left to right, with their separators
        leftToRight(
            l,
            Array.from({ length: 8 }, (_, i) => n + i),
        );
        // and the number sits between the two words: "dollar" on the left, "price" on the right
        expect(xOf(l, at(text, 'دو'))).toBeLessThan(xOf(l, n));
        expect(xOf(l, n + 7)).toBeLessThan(xOf(l, 0));
    });

    it('keeps percent signs, currency and signs with their numbers', () => {
        const text = 'خصم 50% اليوم';
        const l = layoutText(text, metrics, mono);
        const n = at(text, '50%');

        // Arabic order: the percent sign touches the number on its left, "%50"
        leftToRight(l, [n + 2, n, n + 1]);
        expect(xOf(l, n)).toBe(xOf(l, n + 2) + 10);
        expect(xOf(l, n + 1)).toBeLessThan(xOf(l, 0));

        const minus = 'الحرارة -5 درجات';
        const m = layoutText(minus, metrics, mono);

        expect(xOf(m, at(minus, '-'))).toBe(xOf(m, at(minus, '5')) + 10);

        const price = 'السعر $99';
        const p = layoutText(price, metrics, mono);
        const d = at(price, '9');

        leftToRight(p, [d, d + 1, at(price, '$')]);
        expect(xOf(p, at(price, '$'))).toBe(xOf(p, d + 1) + 10);
        // a left-to-right mark before the number keeps the sign on the left, "$99"
        const marked = 'السعر \u200e$99';
        const q = layoutText(marked, metrics, mono);

        leftToRight(q, [at(marked, '$'), at(marked, '9'), at(marked, '9') + 1]);
    });

    it('keeps Arabic-Indic digits left to right', () => {
        const text = 'رقم ١٢٣';
        const l = layoutText(text, metrics, mono);
        const n = at(text, '١');

        leftToRight(l, [n, n + 1, n + 2]);
        // the number ends the sentence, so it is on the left
        expect(xOf(l, n + 2)).toBeLessThan(xOf(l, 0));
    });

    it('keeps Latin words inside Arabic text left to right', () => {
        const text = 'أنا أحب JavaScript كثيرا';
        const l = layoutText(text, metrics, mono);
        const j = at(text, 'JavaScript');

        leftToRight(
            l,
            Array.from({ length: 10 }, (_, i) => j + i),
        );
        expect(xOf(l, at(text, 'كث'))).toBeLessThan(xOf(l, j));
        expect(xOf(l, j + 9)).toBeLessThan(xOf(l, at(text, 'أحب')));
    });

    it('places an Arabic word at the end of a left-to-right sentence', () => {
        const text = 'Total: 100 ريال';
        const l = layoutText(text, metrics, mono);

        expect(l.lines[0].rtl).toBe(false);
        leftToRight(l, [0, at(text, '1'), at(text, '1') + 1, at(text, '1') + 2, at(text, 'ريا')]);
    });

    it('mirrors brackets in right-to-left runs', () => {
        const text = '(مرحبا)';
        const l = layoutText(text, metrics, mono);
        const sorted = [...l.glyphs].sort((a, b) => a.x - b.x);

        // the closing bracket is drawn on the left, as an opening one
        expect(sorted[0]).toMatchObject({ char: '(', index: text.length - 1 });
        expect(sorted[sorted.length - 1]).toMatchObject({ char: ')', index: 0 });

        const num = 'رقم (123)';
        const nl = layoutText(num, metrics, mono);
        const n = at(num, '123');

        leftToRight(nl, [n + 3, n, n + 1, n + 2, n - 1]);
    });

    it('aligns right-to-left paragraphs to the right by default', () => {
        const l = layoutText('مرحبا بالعالم\nنعم', metrics, mono);

        expect(l.lines[1].rtl).toBe(true);
        expect(l.lines[1].x).toBe(l.width - l.lines[1].width);
        expect(layoutText('مرحبا بالعالم\nنعم', { ...metrics, align: 'left' }, mono).lines[1].x).toBe(0);
        // a left-to-right paragraph in the same block keeps to the left
        expect(layoutText('مرحبا بالعالم\nyes', metrics, mono).lines[1].x).toBe(0);
        expect(layoutText('abc', { ...metrics, direction: 'rtl' }, mono).lines[0].rtl).toBe(true);
    });

    it('wraps in reading order: the first words go on the first line', () => {
        const text = 'واحد اثنان ثلاثة أربعة';
        const l = layoutText(text, { ...metrics, wordWrap: true, wordWrapWidth: 110 }, mono);

        expect(l.lines.map((x) => x.text)).toEqual(['واحد اثنان', 'ثلاثة أربعة']);
        expect(l.lines.every((x) => x.rtl)).toBe(true);
        // the first word of each line is on its right
        expect(xOf(l, 0)).toBeGreaterThan(xOf(l, at(text, 'اثنان')));
    });

    it('leaves left-to-right text exactly as before', () => {
        const l = layoutText('AVA', { ...metrics, letterSpacing: 1 }, mono);

        expect(l.lines[0].rtl).toBe(false);
        expect(l.lines[0].runs).toBeUndefined();
        expect(l.glyphs.map((g) => g.x)).toEqual([0, 11, 22]);
    });
});

// ------------------------------------------------------------------------------ carets and selection

describe('carets in right-to-left text', () => {
    const text = 'مرحبا 123';

    it('starts a right-to-left line on the right and ends it on the left', () => {
        const l = layoutText(text, metrics, mono);

        expect(caretRect(l, 0).x).toBe(l.width);
        expect(caretRect(l, text.length).x).toBeLessThan(l.width);
        // inside the word, carets step leftwards one letter at a time
        const xs = [1, 2, 3, 4, 5].map((i) => caretRect(l, i).x);

        for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeLessThan(xs[i - 1]);
        expect(xs).toEqual([75, 65, 55, 45, 35]);
    });

    it('steps through numbers left to right inside them', () => {
        const l = layoutText(text, metrics, mono);
        const n = at(text, '1');

        expect(caretRect(l, n + 1).x).toBeLessThan(caretRect(l, n + 2).x);
    });

    it('finds the caret under a point', () => {
        const l = layoutText(text, metrics, mono);

        expect(caretAtPoint(l, l.width, 5).index).toBe(0);
        // right half of the first letter: the letter under the point starts at 0
        const hit = caretAtPoint(l, l.width - 3, 5);

        expect(hit.index).toBe(0);
        expect(hit.before).toBe(false);
        expect(caretAtPoint(l, l.width - 7, 5)).toMatchObject({ index: 1, before: true });
    });

    it('splits a selection that crosses a change of direction', () => {
        const l = layoutText(text, metrics, mono);
        const n = at(text, '1');
        // only the number: one box over the digits
        const digits = rangeRects(l, n, n + 3);

        expect(digits).toHaveLength(1);
        expect(digits[0].x).toBeCloseTo(xOf(l, n));
        expect(digits[0].width).toBeCloseTo(25);
        // the last letter of the word and the first digit are far apart on screen: two boxes
        const across = rangeRects(l, n - 2, n + 1);

        expect(across).toHaveLength(2);
        // the whole line is one box
        expect(rangeRects(l, 0, text.length)).toEqual([{ x: 0, y: 0, width: l.width, height: 10, line: 0 }]);
    });
});

// ---------------------------------------------------------------------------------- SilkText

/** A glyph context that records what it draws: every code point but marks and joiners is half an em wide. */
function inkContext(): GlyphContext & { drawn: string[] } {
    let size = 48;
    let font = '';
    const width = (s: string) => Array.from(s).filter((c) => !MARK.test(c)).length * 0.5 * size;
    const ctx = {
        drawn: [] as string[],
        get font() {
            return font;
        },
        set font(v: string) {
            font = v;
            size = Number(/(\d+(?:\.\d+)?)px/.exec(v)?.[1] ?? 48);
        },
        fillStyle: '#000' as unknown,
        textBaseline: 'alphabetic',
        textAlign: 'left',
        direction: 'inherit',
        canvas: { width: 64, height: 64 },
        measureText(s: string) {
            const ink = s.trim() !== '';

            return {
                width: width(s),
                actualBoundingBoxLeft: 0,
                actualBoundingBoxRight: ink ? width(s) : 0,
                actualBoundingBoxAscent: ink ? 0.7 * size : 0,
                actualBoundingBoxDescent: ink ? 0.2 * size : 0,
            };
        },
        clearRect() {},
        fillText(s: string) {
            ctx.drawn.push(s);
        },
        getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    };

    return ctx;
}

describe('SilkText with right-to-left text', () => {
    it('bakes each joined Arabic run as one glyph, left to right on the canvas', () => {
        const ctx = inkContext();
        const atlas = new SdfAtlas({ context: ctx });
        const t = new SilkText({ text: 'مرحبا 2026', fontFamily: 'Test', fontSize: 20, atlas });

        expect(t.glyphCount).toBe(6);
        expect(ctx.drawn).toEqual(expect.arrayContaining(['مر', 'حبا', '2', '0', '6']));
        expect(ctx.direction).toBe('ltr');
        expect(t.lines[0].rtl).toBe(true);
        expect(t.direction).toBe('auto');
        t.direction = 'ltr';
        expect(t.lines[0].rtl).toBe(false);
        t.destroy();
        atlas.destroy();
    });
});
