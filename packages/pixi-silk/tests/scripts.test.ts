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
        // "the last one": a prefix vowel (U+1031) that Canvas draws before its consonant
        const last = 'နောက\u103aဆ\u102f\u1036း';

        expect(draws(last).join('')).toBe(last);
        expect(draws(last).length).toBeLessThan(3);
    });

    it('splits Thai into words and lets lines break between them', () => {
        const text = 'สว\u0e31สด\u0e35คร\u0e31บ';
        const parts = clusters(text);

        expect(parts.length).toBeGreaterThan(1);
        expect(parts.map((c) => c.draw).join('')).toBe(text);
        expect(parts.slice(1).every((c) => c.breakBefore)).toBe(true);
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
        const l = layoutText('Win {coin} 5', { ...metrics, inlines }, mono);
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
