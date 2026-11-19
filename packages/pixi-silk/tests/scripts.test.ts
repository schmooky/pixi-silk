import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { SdfAtlas } from '../src/text/atlas';
import { clusters } from '../src/text/cluster';
import { layoutText, type TextMeasurer } from '../src/text/layout';
import { SilkRichText } from '../src/text/rich';
import { SilkText } from '../src/text/SilkText';
import { paintContext } from './ink-context';

// ------------------------------------------------------------------------------------ helpers

const MARK = /[\p{Mn}\p{Me}\u200c\u200d]/u;
/** Every code point but marks 10 wide. */
const mono: TextMeasurer = {
    advance: (s) => Array.from(s).filter((c) => !MARK.test(c)).length * 10,
    kerning: () => 0,
};
const metrics = { ascent: 8, descent: 2 };
const draws = (text: string, wordBreak?: 'normal' | 'keep-all') => clusters(text, wordBreak).map((c) => c.draw);
const breaks = (text: string, wordBreak?: 'normal' | 'keep-all') =>
    clusters(text, wordBreak)
        .filter((c) => c.breakBefore)
        .map((c) => c.start);
const lines = (text: string, w: number, extra = {}) =>
    layoutText(text, { ...metrics, wordWrap: true, wordWrapWidth: w, ...extra }, mono).lines.map((l) => l.text);

// ----------------------------------------------------------------------------------- clusters

describe('clusters', () => {
    it('keeps a Burmese word whole, so its vowels and stacked consonants shape', () => {
        // "mingalaba": the vowel sign e and the medials belong to their consonants
        const word = 'မင\u103a\u1039ဂလာပါ';

        const parts = clusters(word);

        // ICU splits it into "mingala" and "ba": the stacked consonant stays in the first word
        expect(parts.map((c) => c.draw).join('')).toBe(word);
        expect(parts[0].draw.startsWith('\u1019\u1004\u103a\u1039\u1002')).toBe(true);
        expect(parts.length).toBeLessThanOrEqual(2);
        // no cluster starts with a sign that belongs to the consonant before it
        expect(parts.every((c) => !/^\p{M}/u.test(c.draw))).toBe(true);
        // "thanks": a prefix vowel (U+1031) that Canvas draws before its consonant stays with it
        const thanks = '\u1000\u103b\u1031\u1038\u1007\u1030\u1038';
        const tp = clusters(thanks);

        expect(tp.map((c) => c.draw).join('')).toBe(thanks);
        expect(tp.every((c) => !c.draw.startsWith('\u1031'))).toBe(true);
    });

    it('bakes Thai a cluster at a time and lets lines break between its words', () => {
        const text = 'สว\u0e31สด\u0e35คร\u0e31บ';
        const parts = clusters(text);

        expect(parts.length).toBeGreaterThan(1);
        expect(parts.map((c) => c.draw).join('')).toBe(text);
        // Thai is baked a grapheme at a time, and lines break only between its words
        const starts = parts.filter((c) => c.breakBefore).map((c) => c.start);

        expect(starts.length).toBeGreaterThan(0);
        expect(starts.length).toBeLessThan(parts.length - 1);
        expect(parts.every((c) => !/^\p{M}/u.test(c.draw))).toBe(true);
    });

    it('keeps Indic conjuncts in one glyph', () => {
        expect(draws('नमस\u094dत\u0947')).toEqual(['नमस\u094dत\u0947']);
    });

    it('keeps emoji sequences, flags and accents whole', () => {
        const family = '\u{1f468}\u200d\u{1f469}\u200d\u{1f467}';

        expect(draws(`a${family}b`)).toEqual(['a', family, 'b']);
        expect(draws('\u{1f1eb}\u{1f1f7}')).toHaveLength(1);
        expect(draws('e\u0301té')).toEqual(['e\u0301', 't', 'é']);
        expect(draws('\u{1f44d}\u{1f3fd}')).toHaveLength(1);
    });

    it('breaks between Japanese characters but not before closing punctuation or small kana', () => {
        const text = '日本語。「テスト」って';
        const at = breaks(text);

        expect(at).toContain(1);
        expect(at).toContain(2);
        // not before 。 (3), not after 「 (5), not before 」 (8) or っ (9)
        expect(at).not.toContain(3);
        expect(at).not.toContain(5);
        expect(at).not.toContain(8);
        expect(at).not.toContain(9);
        expect(at).toContain(10);
    });

    it('breaks between Korean syllables unless keep-all', () => {
        const text = '한국어 텍스트';

        expect(breaks(text)).toEqual([1, 2, 5, 6]);
        expect(breaks(text, 'keep-all')).toEqual([]);
    });

    it('does not break numbers away from the characters next to them', () => {
        expect(breaks('100円')).toEqual([]);
        expect(breaks('€100')).toEqual([]);
    });
});

// ------------------------------------------------------------------------------------- layout

describe('layoutText across scripts', () => {
    it('wraps Japanese and Chinese without spaces', () => {
        const ja = '今日はいい天気ですね。';

        expect(lines(ja, 45)).toEqual(['今日はい', 'い天気で', 'すね。']);
        // the full stop never starts a line: it goes down with the character before it
        expect(lines('あいう。', 35)).toEqual(['あい', 'う。']);
    });

    it('wraps Korean at spaces with keep-all', () => {
        const ko = '한국어 텍스트';

        expect(lines(ko, 45, { wordBreak: 'keep-all' })).toEqual(['한국어', '텍스트']);
        expect(lines(ko, 25)).toEqual(['한국', '어', '텍스', '트']);
    });

    it('grows lines to fit ink that reaches past the font', () => {
        const tall: TextMeasurer = {
            ...mono,
            ink: (c) =>
                c === 'T'
                    ? { ascent: 14, descent: 1 }
                    : c === 'g'
                      ? { ascent: 5, descent: 6 }
                      : { ascent: 7, descent: 0 },
        };
        const plain = layoutText('ab\ncd', metrics, tall);

        expect(plain.ascent).toBe(8);
        expect(plain.height).toBe(20);
        const grown = layoutText('aT\ng', metrics, tall);

        expect(grown.ascent).toBe(14);
        expect(grown.descent).toBe(6);
        expect(grown.lines[0].y).toBe(14);
        expect(grown.lineHeight).toBe(20);
        expect(layoutText('aT', { ...metrics, fitInk: false }, tall).ascent).toBe(8);
    });

    it('makes room for inline objects', () => {
        const inlines = { coin: { width: 12, ascent: 9, descent: 3 } };
        const l = layoutText('Pay {coin} 5', { ...metrics, inlines }, mono);
        const coin = l.glyphs.find((g) => g.inline === 'coin');

        expect(coin).toMatchObject({ char: '￼', x: 40, index: 4 });
        expect(l.width).toBe(30 + 10 + 12 + 10 + 10);
        // the box is taller than the font: the line grows
        expect(l.ascent).toBe(9);
        expect(l.descent).toBe(3);
        // a caret steps over the whole token
        expect(l.lines[0].offsets).toContain(4);
        expect(l.lines[0].offsets).toContain(10);
        expect(l.lines[0].offsets).not.toContain(5);
        // names that are not listed stay text
        expect(layoutText('{gem}', { ...metrics, inlines }, mono).glyphs).toHaveLength(5);
    });

    it('moves inline objects with right-to-left text and wrapping', () => {
        const inlines = { coin: { width: 10, ascent: 7, descent: 0 } };
        const text = 'ربحت {coin} 50';
        const l = layoutText(text, { ...metrics, inlines }, mono);
        const coin = l.glyphs.find((g) => g.inline === 'coin');
        const word = l.glyphs.find((g) => g.index === 0);

        // Arabic first on the right, then the coin, then the number on the left
        expect(coin && word && coin.x < word.x).toBe(true);
        expect(l.glyphs.filter((g) => g.index >= text.indexOf('50')).every((g) => g.x < (coin?.x ?? 0))).toBe(true);
        const wrapped = layoutText('aaa {coin} bbb', { ...metrics, inlines, wordWrap: true, wordWrapWidth: 45 }, mono);

        expect(wrapped.glyphs.find((g) => g.inline === 'coin')?.line).toBe(1);
    });
});

// ---------------------------------------------------------------------------------- atlas, SilkText

describe('glyphs past their measured box', () => {
    it('bakes the ink Canvas draws, not the box it reports', () => {
        // marks stacked far above and below the box measureText reports
        const ctx = paintContext((s) => (s === 'X' ? { left: 0.1, right: 0.6, ascent: 1.3, descent: 0.6 } : null));
        const atlas = new SdfAtlas({ context: ctx });
        const font = { family: 'Test' };
        const g = atlas.glyph(font, 'X');
        const ink = atlas.ink(font, 'X');

        expect(ink.ascent).toBeCloseTo(1.3 * 48, 0);
        expect(ink.descent).toBeCloseTo(0.6 * 48, 0);
        expect(g.h).toBe(Math.round(1.9 * 48) + 2 * atlas.pad);
        expect(g.left).toBe(-Math.round(0.1 * 48) - atlas.pad);
        atlas.destroy();
    });

    it('draws a second pass with more room when the ink runs off the raster', () => {
        const ctx = paintContext((s) => (s === 'Y' ? { left: 0, right: 0.5, ascent: 2.5, descent: 0.2 } : null));
        const atlas = new SdfAtlas({ context: ctx });

        expect(atlas.ink({ family: 'Test' }, 'Y').ascent).toBeCloseTo(2.5 * 48, 0);
        atlas.destroy();
    });

    it('grows the SilkText line box and bounds to the ink', () => {
        const ctx = paintContext((s) => (s === 'X' ? { left: 0, right: 0.5, ascent: 1.5, descent: 0.2 } : null));
        const atlas = new SdfAtlas({ context: ctx });
        const plain = new SilkText({ text: 'ab', fontFamily: 'Test', fontSize: 20, atlas });
        const tall = new SilkText({ text: 'aX', fontFamily: 'Test', fontSize: 20, atlas });

        expect(plain.layout.ascent).toBeCloseTo(14, 0);
        expect(tall.layout.ascent).toBeCloseTo(30, 0);
        expect(tall.layout.height).toBeGreaterThan(plain.layout.height);
        const b = tall.bounds;

        expect(b.minY).toBeLessThanOrEqual(0);
        expect(b.maxY).toBeGreaterThanOrEqual(tall.layout.height - 1e-6);
        plain.destroy();
        tall.destroy();
        atlas.destroy();
    });
});

describe('SilkText outlines', () => {
    it('draws every outline before any fill', () => {
        const atlas = new SdfAtlas({ context: paintContext() });
        const t = new SilkText({ text: 'abc', fontFamily: 'Test', atlas, outline: { width: 2, color: 0 } });
        const data = t.geometry.instanceBuffer.data as Float32Array;

        expect(t.glyphCount).toBe(3);
        expect(t.geometry.instanceCount).toBe(6);
        // modes of the six instances: three outline-only, then three fill-only
        expect(Array.from({ length: 6 }, (_, i) => data[i * 12 + 9])).toEqual([1, 1, 1, 2, 2, 2]);
        t.outline = null;
        expect(t.glyphCount).toBe(3);
        expect(t.geometry.instanceCount).toBe(3);
        expect(data[9]).toBe(0);
        t.destroy();
        atlas.destroy();
    });
});

describe('inline objects', () => {
    it('places boxes on the line by alignment', () => {
        const atlas = new SdfAtlas({ context: paintContext() });
        // font size 20: ascent 14, descent 4, cap height 14
        const t = new SilkText({
            text: '{a}{b}{c}',
            fontFamily: 'Test',
            fontSize: 20,
            atlas,
            inlines: {
                a: { width: 10, height: 10, align: 'baseline' },
                b: { width: 10, height: 10, margin: 2 },
                c: { width: 10, height: 4, align: 'bottom', offsetY: -1 },
            },
        });
        const [a, b, c] = t.inlineRects();
        const base = t.layout.lines[0].y;

        expect(a).toMatchObject({ name: 'a', x: 0, width: 10, height: 10 });
        expect(a.y + a.height).toBeCloseTo(base);
        // middle: centred on half the cap height
        expect(b.x).toBe(12);
        expect(b.y + b.height / 2).toBeCloseTo(base - 7, 0);
        expect(c.x).toBe(24);
        expect(c.y + c.height).toBeCloseTo(base + 4 - 1);
        expect(t.glyphCount).toBe(0);
        t.destroy();
        atlas.destroy();
    });

    it('SilkRichText puts sprites and graphics into the boxes', () => {
        const atlas = new SdfAtlas({ context: paintContext() });
        const coin = new Container();
        const shape = () => {
            const c = new Container();

            // a 40 x 20 child at (-20, -10): bounds centred on the origin
            c.addChild(Object.assign(new Container(), { boundsArea: { x: -20, y: -10, width: 40, height: 20 } }));

            return c;
        };

        coin.boundsArea = { x: 0, y: 0, width: 50, height: 50 } as never;
        const rich = new SilkRichText({
            text: '{coin} 100 {gem} {gem}',
            fontFamily: 'Test',
            fontSize: 20,
            atlas,
            inlines: { coin: { object: coin, height: 'cap' }, gem: { object: shape, height: 10 } },
        });
        const rects = rich.textObject.inlineRects();

        expect(rects.map((r) => r.name)).toEqual(['coin', 'gem', 'gem']);
        // the coin is scaled to the cap height and sits in its box
        expect(rects[0].height).toBeCloseTo(14, 0);
        expect(coin.scale.x).toBeCloseTo(rects[0].height / 50);
        expect(coin.position.x).toBeCloseTo(rects[0].x);
        expect(coin.position.y).toBeCloseTo(rects[0].y);
        // a factory makes one object per token
        const gems = rich.children.filter((c) => c !== coin && c !== rich.textObject);

        expect(gems).toHaveLength(2);
        expect(rects[1].width).toBeCloseTo(20);
        expect(gems[1].position.x).toBeCloseTo(rects[2].x + 10);
        // text changes move the objects on the next sync
        rich.text = '{gem}';
        rich.sync();
        expect(gems[1].visible).toBe(false);
        expect(coin.visible).toBe(false);
        rich.destroy();
        expect(coin.destroyed).toBe(false);
        expect(gems[0].destroyed).toBe(true);
        atlas.destroy();
    });
});

// ------------------------------------------------------------------------------- anchors, labels

describe('SilkRichText anchors', () => {
    const shape = (w: number, h: number) => () => {
        const c = new Container();

        c.boundsArea = { x: 0, y: 0, width: w, height: h } as never;

        return c;
    };
    const make = (text: string, extra = {}) =>
        new SilkRichText({
            text,
            fontFamily: 'Test',
            fontSize: 20,
            atlas: new SdfAtlas({ context: paintContext() }),
            inlines: { icon: { object: shape(10, 10), height: 10 } },
            ...extra,
        });
    /** Where the first inline object is, against its box. */
    const placed = (r: SilkRichText) => {
        const rect = r.textObject.inlineRects()[0];
        const obj = r.children.find((c) => c !== r.textObject) as Container;

        return { rect, x: obj.position.x, y: obj.position.y };
    };

    it('moves the objects with the anchor', () => {
        const r = make('ab {icon} cd');
        const at0 = placed(r);
        const w = r.textObject.layout.width;
        const h = r.textObject.layout.height;

        r.anchor.set(0.5);
        r.sync();
        const mid = placed(r);

        expect(mid.x).toBeCloseTo(at0.x - w / 2);
        expect(mid.y).toBeCloseTo(at0.y - h / 2);
        r.anchor.set(1, 1);
        r.sync();
        const end = placed(r);

        expect(end.x).toBeCloseTo(at0.x - w);
        expect(end.y).toBeCloseTo(at0.y - h);
        // the object always fills its box
        for (const p of [at0, mid, end]) {
            expect(p.x).toBeCloseTo(p.rect.x);
            expect(p.y).toBeCloseTo(p.rect.y);
        }
        r.destroy();
    });

    it('keeps objects in their boxes with an anchor, wrapping and right-to-left text', () => {
        const r = make('مرحبا {icon} بالعالم {icon}', {
            anchor: 0.5,
            wordWrap: true,
            wordWrapWidth: 70,
        });
        const rects = r.textObject.inlineRects();
        const objs = r.children.filter((c) => c !== r.textObject);

        expect(rects).toHaveLength(2);
        expect(new Set(rects.map((x) => x.line)).size).toBe(2);
        rects.forEach((rect, i) => {
            expect(objs[i].position.x).toBeCloseTo(rect.x);
            expect(objs[i].position.y).toBeCloseTo(rect.y);
        });
        // the box lies inside the text's anchored bounds
        const b = r.textObject.bounds;

        for (const rect of rects) {
            expect(rect.x).toBeGreaterThanOrEqual(b.minX - 1e-6);
            expect(rect.x + rect.width).toBeLessThanOrEqual(b.maxX + 1e-6);
        }
        r.destroy();
    });

    it('follows a scaled and moved text object', () => {
        const r = make('{icon}');

        r.textObject.position.set(5, 7);
        r.textObject.scale.set(2);
        r.sync();
        const obj = r.children.find((c) => c !== r.textObject) as Container;
        const rect = r.textObject.inlineRects()[0];

        expect(obj.scale.x).toBeCloseTo(2);
        expect(obj.position.x).toBeCloseTo(5 + rect.x * 2);
        expect(obj.position.y).toBeCloseTo(7 + rect.y * 2);
        r.destroy();
    });
});

describe('silkRichLabel', () => {
    it('gives widgets labels with icons that size the widget', async () => {
        const { silkRichLabel } = await import('../src/text/label');
        const { ValuePill } = await import('../src/ui/ValuePill');
        const icon = () => {
            const c = new Container();

            c.boundsArea = { x: 0, y: 0, width: 30, height: 30 } as never;

            return c;
        };
        const atlas = new SdfAtlas({ context: paintContext() });
        const label = () => silkRichLabel({ up: { object: icon, height: 30 } }, { atlas });
        const plain = new ValuePill({ label: label() });
        const withIcon = new ValuePill({ label: label() });

        plain.show('12%');
        withIcon.show('{up} 12%');
        const rich = withIcon.children.find((c) => c instanceof SilkRichText) as SilkRichText;

        expect(rich).toBeInstanceOf(SilkRichText);
        expect(rich.textObject.inlineRects()).toHaveLength(1);
        // the label is anchored at its centre by the pill, and the icon makes it wider
        expect(rich.anchor.x).toBe(0.5);
        expect(withIcon.width).toBeGreaterThan(plain.width + 25);
    });
});

// ----------------------------------------------------------------------------- rough edges

describe('digits, breaks and arrows', () => {
    it('gives every digit set its own tabular width', () => {
        const wide: TextMeasurer = {
            advance: (s) => (s === '١' ? 4 : s === '٨' ? 14 : s === '1' ? 5 : 10),
            kerning: () => 0,
        };
        const tab = { ...metrics, tabularNumbers: true };

        // Arabic-Indic one is narrow, eight wide: both take the widest
        expect(layoutText('١١', tab, wide).width).toBe(28);
        expect(layoutText('٨٨', tab, wide).width).toBe(28);
        expect(layoutText('11', tab, wide).width).toBe(20);
        // Burmese and Thai digits are clusters of their own
        expect(draws('၁၂၃')).toHaveLength(3);
        expect(draws('๑๒')).toHaveLength(2);
    });

    it('breaks beside inline boxes next to wide text, keeps them with letters and digits', () => {
        const inlines = { i: { width: 10, ascent: 8, descent: 0 } };
        const at = (text: string, w: number) =>
            layoutText(text, { ...metrics, inlines, wordWrap: true, wordWrapWidth: w }, mono).lines.map((l) => l.text);

        expect(at('日本{i}語', 25)).toEqual(['日本', '{i}語']);
        expect(at('{i}{i}{i}', 25)).toEqual(['{i}{i}', '{i}']);
        // a box glued to a number stays with it
        expect(at('ab {i}100', 45)).toEqual(['ab', '{i}100']);
        expect(at('日本{i}語', 25).length).toBe(2);
        expect(
            layoutText(
                '日本{i}語',
                { ...metrics, inlines, wordWrap: true, wordWrapWidth: 25, wordBreak: 'keep-all' },
                mono,
            ).lines,
        ).toHaveLength(1);
    });

    it('steps carets by what is on screen in mixed lines', async () => {
        const { caretVisual, caretRect } = await import('../src/text/layout');
        // "abc " then an Arabic word: in a left-to-right line the Arabic sits on the right, reversed
        const text = 'abc مرح';
        const l = layoutText(text, metrics, mono);
        const xs = (i: number) => caretRect(l, i).x;
        let i = 0;
        let lead = false;
        const seen = [xs(0)];

        for (let k = 0; k < 10; k++) {
            const n = caretVisual(l, i, 1, false, undefined, lead);

            if (n === null) break;
            i = n.index;
            lead = n.leading;
            seen.push(caretRect(l, i, false, lead).x);
        }
        // moving right never goes left on screen and walks through the reversed Arabic run,
        // though in text order it runs the other way
        for (let k = 1; k < seen.length; k++) expect(seen[k]).toBeGreaterThan(seen[k - 1]);
        // both places of the offset where the direction changes are reachable: the caret gets to
        // the right edge of the line
        expect(Math.max(...seen)).toBeCloseTo(l.width);
        // a plain left-to-right line leaves it to the text order
        expect(caretVisual(layoutText('abc', metrics, mono), 1, 1)).toBeNull();
    });
});

// ------------------------------------------------------------------------------------- overflow

describe('overflow', () => {
    it('cuts lines past maxLines and ends the last one in an ellipsis', () => {
        const l = layoutText(
            'one two three four five',
            { ...metrics, wordWrap: true, wordWrapWidth: 75, maxLines: 2 },
            mono,
        );

        expect(l.truncated).toBe(true);
        expect(l.lines).toHaveLength(2);
        expect(l.lines[1].truncated).toBe(true);
        expect(l.glyphs[l.glyphs.length - 1].char).toBe('\u2026');
        expect(l.lines[1].width).toBeLessThanOrEqual(75);
    });

    it('cuts a line wider than maxWidth, with or without a mark', () => {
        const l = layoutText('abcdefghij', { ...metrics, maxWidth: 55 }, mono);

        expect(l.lines[0].text).toBe('abcd\u2026');
        expect(l.width).toBe(50);
        expect(layoutText('abcdefghij', { ...metrics, maxWidth: 55, ellipsis: null }, mono).lines[0].text).toBe(
            'abcde',
        );
        // nothing to cut: unchanged
        expect(layoutText('abc', { ...metrics, maxWidth: 55 }, mono).truncated).toBe(false);
    });

    it('puts the ellipsis at the end of right-to-left text, on the left', () => {
        const l = layoutText('אבגדהוז', { ...metrics, maxWidth: 45 }, mono);
        const sorted = [...l.glyphs].sort((a, b) => a.x - b.x);

        expect(sorted[0].char).toBe('\u2026');
        expect(sorted[sorted.length - 1].index).toBe(0);
    });

    it('SilkText shrinks to fit, then cuts what still does not fit', () => {
        const atlas = new SdfAtlas({ context: paintContext() });
        // every character is half an em wide: 10 characters at 20 px are 100 wide
        const t = new SilkText({
            text: 'abcdefghij',
            fontFamily: 'Test',
            fontSize: 20,
            atlas,
            maxWidth: 70,
            shrinkToFit: true,
        });

        expect(t.renderedFontSize).toBeLessThan(20);
        expect(t.renderedFontSize).toBeGreaterThan(13);
        expect(t.layout.width).toBeLessThanOrEqual(70);
        expect(t.truncated).toBe(false);
        // the floor is reached: cut
        t.minFontSize = 18;
        expect(t.renderedFontSize).toBe(18);
        expect(t.truncated).toBe(true);
        expect(t.layout.width).toBeLessThanOrEqual(70);
        // maxHeight limits the lines
        const p = new SilkText({
            text: 'aa bb cc dd ee ff',
            fontFamily: 'Test',
            fontSize: 20,
            atlas,
            wordWrap: true,
            wordWrapWidth: 30,
            maxHeight: 45,
        });

        expect(p.layout.height).toBeLessThanOrEqual(45);
        expect(p.truncated).toBe(true);
        t.destroy();
        p.destroy();
        atlas.destroy();
    });
});

// ----------------------------------------------------------------------- tabs, justify, spacing

describe('tabs, justify and spacing', () => {
    it('lines tabs up on stops', () => {
        const l = layoutText('a\tb\nabc\tb', { ...metrics, tabSize: 4 }, mono);
        const bs = l.glyphs.filter((g) => g.index === 2 || g.index === 8).map((g) => g.x);

        // both b sit on the first stop, 4 spaces from the line start
        expect(bs).toEqual([40, 40]);
        expect(layoutText('abcd\tb', { ...metrics, tabSize: 4 }, mono).glyphs[5].x).toBe(80);
    });

    it('justifies wrapped lines at spaces and leaves the last line', () => {
        const l = layoutText('aa b cc dd', { ...metrics, wordWrap: true, wordWrapWidth: 65, align: 'justify' }, mono);

        expect(l.lines.map((x) => x.text)).toEqual(['aa b', 'cc dd']);
        expect(l.lines[0].width).toBe(65);
        expect(l.glyphs.find((g) => g.char === 'b')?.x).toBe(55);
        // the last line keeps its width, at the start
        expect(l.lines[1].width).toBe(50);
        expect(l.lines[1].x).toBe(0);
    });

    it('justifies text without spaces between its characters', () => {
        const l = layoutText('一二三四五', { ...metrics, wordWrap: true, wordWrapWidth: 35, align: 'justify' }, mono);

        expect(l.lines[0].width).toBe(35);
        expect(l.glyphs.filter((g) => g.line === 0).map((g) => g.x)).toEqual([0, 12.5, 25]);
    });

    it('stretches Arabic words with kashida before widening spaces', () => {
        const words = 'ببب ببب ببب';
        const opts = { ...metrics, wordWrap: true, wordWrapWidth: 95, align: 'justify' as const };
        const l = layoutText(words, opts, mono);
        const tatweels = l.glyphs.reduce((n, g) => n + (g.char.match(/ـ/g)?.length ?? 0), 0);

        expect(l.lines[0].width).toBe(95);
        expect(tatweels).toBe(2);
        // without kashida only the space grows
        const plain = layoutText(words, { ...opts, kashida: false }, mono);

        expect(plain.glyphs.some((g) => g.char.includes('ـ'))).toBe(false);
        expect(plain.lines[0].width).toBe(95);
        // lam alef stays one ligature
        const la = layoutText('لالا لالا لا', opts, mono);

        expect(la.glyphs.some((g) => g.char.includes('لـا'))).toBe(false);
    });

    it('spaces letters, but not inside cursive or shaped words', () => {
        const latin = layoutText('ab', { ...metrics, letterSpacing: 4 }, mono);
        // two Arabic runs that meet: "مر" does not join forward, so they are two clusters
        const arabic = layoutText('مرحب', { ...metrics, letterSpacing: 4 }, mono);

        expect(latin.width).toBe(24);
        expect(arabic.width).toBe(40);
    });
});

// ------------------------------------------------------------------- icons, colour, affinity

describe('icons, colour glyphs and caret sides', () => {
    it('centres icons on the letters in text without capitals or digits', () => {
        const atlas = new SdfAtlas({ context: paintContext() });
        const box = { width: 10, height: 10 };
        const caps = new SilkText({ text: 'A {i}', fontFamily: 'Test', fontSize: 20, atlas, inlines: { i: box } });
        const plain = new SilkText({ text: '一 {i}', fontFamily: 'Test', fontSize: 20, atlas, inlines: { i: box } });
        const mid = (t: SilkText) => {
            const r = t.inlineRects()[0];

            return t.layout.lines[0].y - (r.y + r.height / 2);
        };

        // the fake font's ink is 0.7 em up and 0.2 em down: letters centre 0.25 em up, capitals 0.35 em
        expect(mid(caps)).toBeCloseTo(7, 0);
        expect(mid(plain)).toBeCloseTo(5, 0);
        atlas.destroy();
    });

    it('keeps the colours of colour glyphs in a second texture', () => {
        const atlas = new SdfAtlas({ context: paintContext(undefined, (s) => s === 'E') });
        const font = { family: 'Test' };
        const e = atlas.glyph(font, 'E');
        const a = atlas.glyph(font, 'a');

        expect(a.color).toBeUndefined();
        expect(e.color).toBeDefined();
        atlas.flush();
        const data = atlas.colorSource.resource as Uint8Array;
        const [w] = [atlas.colorSource.width];
        const cx = (e.color as { x: number }).x + e.w / 2;
        const cy = (e.color as { y: number }).y + e.h / 2;
        const i = (Math.floor(cy) * w + Math.floor(cx)) * 4;

        // premultiplied red at the middle of the cell
        expect([data[i], data[i + 1], data[i + 2], data[i + 3]]).toEqual([255, 0, 0, 255]);
        const t = new SilkText({ text: 'aE', fontFamily: 'Test', atlas });

        t.updateText();
        const f = t.geometry.instanceBuffer.data as Float32Array;

        expect([f[10], f[11]]).toEqual([-1, -1]);
        expect(f[12 + 10]).toBe(e.color?.x);
        expect(atlas.usage).toBeGreaterThan(0);
        t.destroy();
        atlas.destroy();
    });

    it('gives the offset where the direction changes both of its places', async () => {
        const { caretAtPoint, caretRect } = await import('../src/text/layout');
        // "ab " then Hebrew: offset 3 is after the space (x 30) and before the Hebrew word (its right edge)
        const l = layoutText('ab אבג', metrics, mono);

        expect(caretRect(l, 3).x).toBe(30);
        expect(caretRect(l, 3, false, true).x).toBe(60);
        const hit = caretAtPoint(l, 59, 5);

        expect(hit).toMatchObject({ index: 3, leading: true });
        expect(caretAtPoint(l, 31, 5)).toMatchObject({ index: 3, leading: false });
    });
});
