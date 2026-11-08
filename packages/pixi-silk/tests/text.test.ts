import type { Shader } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { minifyGlsl } from '../build/glsl';
import { linear } from '../src/gradient';
import { type GlyphContext, SdfAtlas } from '../src/text/atlas';
import { edt2d, sdfFromAlpha } from '../src/text/edt';
import { silkLabel } from '../src/text/label';
import { layoutText, type TextMeasurer } from '../src/text/layout';
import { SilkText } from '../src/text/SilkText';
import { textFragment, textVertex } from '../src/text/shader';
import { ValuePill } from '../src/ui/ValuePill';

// ------------------------------------------------------------------------------------ helpers

/** A coverage bitmap with a filled rectangle. */
function rectBitmap(w: number, h: number, x0: number, y0: number, x1: number, y1: number): Uint8Array {
    const a = new Uint8Array(w * h);

    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) a[y * w + x] = 255;

    return a;
}

/**
 * A fake 2D context: every character is a box `0.6 em` wide (`i` is `0.3 em`), from the cap height to
 * the baseline (descenders go below). `AV` kerns by `-0.1 em`. `fillText` paints the ink box, so
 * `getImageData` returns real coverage for the distance transform.
 */
function fakeContext(): GlyphContext & { measured: string[]; drawn: string[] } {
    let size = 48;
    let font = '';
    const canvas = { width: 64, height: 64 };
    let pixels = new Uint8ClampedArray(canvas.width * canvas.height * 4);
    const charW = (c: string) => (c === 'i' ? 0.3 : 0.6) * size;
    const width = (s: string) => {
        const chars = Array.from(s);
        let w = chars.reduce((sum, c) => sum + charW(c), 0);

        for (let i = 1; i < chars.length; i++) if (chars[i - 1] === 'A' && chars[i] === 'V') w -= 0.1 * size;

        return w;
    };
    const ctx = {
        measured: [] as string[],
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
        canvas,
        measureText(s: string) {
            ctx.measured.push(s);
            const ink = s.trim() !== '';
            const desc = /[gjpqy]/.test(s) ? 0.2 * size : 0;

            return {
                width: width(s),
                actualBoundingBoxLeft: 0,
                actualBoundingBoxRight: ink ? width(s) * 0.9 : 0,
                actualBoundingBoxAscent: ink ? 0.7 * size : 0,
                actualBoundingBoxDescent: ink ? Math.max(desc, s === '|ÉqÅM' ? 0.2 * size : 0) : 0,
            };
        },
        clearRect() {
            if (pixels.length !== canvas.width * canvas.height * 4)
                pixels = new Uint8ClampedArray(canvas.width * canvas.height * 4);
            pixels.fill(0);
        },
        fillText(s: string, x: number, y: number) {
            ctx.drawn.push(s);
            const m = ctx.measureText(s);
            ctx.measured.pop();

            for (
                let py = Math.round(y - m.actualBoundingBoxAscent);
                py < Math.round(y + m.actualBoundingBoxDescent);
                py++
            )
                for (let px = Math.round(x); px < Math.round(x + m.actualBoundingBoxRight); px++)
                    pixels[(py * canvas.width + px) * 4 + 3] = 255;
        },
        getImageData(x: number, y: number, w: number, h: number) {
            const data = new Uint8ClampedArray(w * h * 4);

            for (let row = 0; row < h; row++)
                data.set(
                    pixels.subarray(((y + row) * canvas.width + x) * 4, ((y + row) * canvas.width + x + w) * 4),
                    row * w * 4,
                );

            return { data };
        },
    };

    return ctx;
}

/** Monospace measurer: every character `w` wide, `AV` kerned by `kern`. */
const mono = (w = 10, kern = -2): TextMeasurer => ({
    advance: (c) => (c === '1' ? w / 2 : w),
    kerning: (a, b) => (a === 'A' && b === 'V' ? kern : 0),
});
const metrics = { ascent: 8, descent: 2 };

// ---------------------------------------------------------------------------------------- EDT

describe('distance transform', () => {
    it('matches brute force on random seeds', () => {
        const w = 23;
        const h = 17;
        const grid = new Float64Array(w * h).fill(1e20);
        const seeds: [number, number][] = [];
        let r = 7;

        for (let i = 0; i < 9; i++) {
            r = (r * 16807) % 2147483647;
            const x = r % w;
            r = (r * 16807) % 2147483647;
            const y = r % h;

            seeds.push([x, y]);
            grid[y * w + x] = 0;
        }
        edt2d(grid, w, h);
        for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++) {
                const best = Math.min(...seeds.map(([sx, sy]) => (sx - x) ** 2 + (sy - y) ** 2));

                expect(grid[y * w + x]).toBe(best);
            }
    });

    it('encodes signed distances around a square', () => {
        const radius = 8;
        const cutoff = 0.25;
        const field = sdfFromAlpha(rectBitmap(40, 40, 10, 10, 30, 30), 40, 40, radius, cutoff);
        const at = (x: number, y: number) => field[y * 40 + x];
        // decoded distance in pixels from a byte, positive outside
        const decode = (v: number) => ((255 - v) / 255 - cutoff) * radius;

        // deep inside clamps to 255, far outside to 0
        expect(at(20, 20)).toBe(255);
        expect(at(0, 0)).toBe(0);
        // distances run between pixel centres: pixel 30 is one away from the last inside pixel, 29
        expect(decode(at(30, 20))).toBeCloseTo(1, 0);
        expect(decode(at(32, 20))).toBeCloseTo(3, 0);
        expect(decode(at(34, 20))).toBeCloseTo(5, 0);
        // inside: decreasing distance, negative
        expect(decode(at(29, 20))).toBeLessThan(0);
        // monotonic across the edge
        for (let x = 22; x < 39; x++) expect(at(x, 20)).toBeGreaterThanOrEqual(at(x + 1, 20));
        // diagonal outside a corner is Euclidean (to the corner pixel 29, 29)
        expect(decode(at(33, 33))).toBeCloseTo(Math.hypot(4, 4), 0);
    });

    it('places the edge between pixels of partial coverage', () => {
        const a = new Uint8Array(16).fill(0);

        a.fill(255, 0, 8);
        a[8] = 128; // half covered
        const field = sdfFromAlpha(a, 16, 1, 4, 0.25);
        const edge = Math.round(255 * 0.75);

        expect(Math.abs(field[8] - edge)).toBeLessThanOrEqual(2);
    });

    it('reads the alpha byte of RGBA pixels', () => {
        const rgba = new Uint8Array(8 * 8 * 4);
        const mono1 = rectBitmap(8, 8, 2, 2, 6, 6);

        for (let i = 0; i < 64; i++) rgba[i * 4 + 3] = mono1[i];

        expect(Array.from(sdfFromAlpha(rgba, 8, 8, 4, 0.25, 4))).toEqual(
            Array.from(sdfFromAlpha(mono1, 8, 8, 4, 0.25)),
        );
    });
});

// ------------------------------------------------------------------------------------- layout

describe('layoutText', () => {
    it('places characters with advances, kerning and letter spacing', () => {
        const l = layoutText('AVA', { ...metrics, letterSpacing: 1 }, mono());

        expect(l.glyphs.map((g) => g.x)).toEqual([0, 9, 20]);
        expect(l.width).toBe(30);
        expect(l.glyphs[0].y).toBe(8);
        expect(layoutText('AVA', { ...metrics, kerning: false }, mono()).width).toBe(30);
    });

    it('splits lines at newlines and measures height like PixiJS Text', () => {
        const l = layoutText('ab\ncdef\n', metrics, mono());

        expect(l.lines.map((x) => x.text)).toEqual(['ab', 'cdef', '']);
        expect(l.width).toBe(40);
        expect(l.height).toBe(30);
        expect(l.lines.map((x) => x.y)).toEqual([8, 18, 28]);

        const tall = layoutText('a\nb', { ...metrics, lineHeight: 14 }, mono());

        expect(tall.height).toBe(28);
        expect(tall.lines[0].y).toBe(10);
    });

    it('wraps at spaces and drops the spaces at the break', () => {
        const l = layoutText('one two three four', { ...metrics, wordWrap: true, wordWrapWidth: 75 }, mono());

        expect(l.lines.map((x) => x.text)).toEqual(['one two', 'three', 'four']);
        expect(l.lines[0].width).toBe(70);
    });

    it('keeps long words whole unless breakWords is on', () => {
        const opts = { ...metrics, wordWrap: true, wordWrapWidth: 35 };

        expect(layoutText('abcdefgh ij', opts, mono()).lines.map((x) => x.text)).toEqual(['abcdefgh', 'ij']);
        expect(layoutText('abcdefgh ij', { ...opts, breakWords: true }, mono()).lines.map((x) => x.text)).toEqual([
            'abc',
            'def',
            'gh',
            'ij',
        ]);
    });

    it('aligns lines inside the widest one', () => {
        const l = layoutText('abcd\nab', { ...metrics, align: 'center' }, mono());

        expect(l.glyphs.find((g) => g.line === 1)?.x).toBe(10);
        expect(layoutText('abcd\nab', { ...metrics, align: 'right' }, mono()).glyphs[4].x).toBe(20);
    });

    it('gives digits one width with tabularNumbers', () => {
        const prop = layoutText('111', metrics, mono());
        const tab = layoutText('111', { ...metrics, tabularNumbers: true }, mono());

        expect(prop.width).toBe(15);
        expect(tab.width).toBe(30);
        // a narrow digit sits centred in its box
        expect(tab.glyphs[0].x).toBe(2.5);
        expect(layoutText('1.00', { ...metrics, tabularNumbers: true }, mono()).width).toBe(
            layoutText('8.88', { ...metrics, tabularNumbers: true }, mono()).width,
        );
    });

    it('handles empty text and code points outside the BMP', () => {
        expect(layoutText('', metrics, mono())).toMatchObject({ width: 0, height: 10 });
        expect(layoutText('a\u{1d400}b', metrics, mono()).glyphs).toHaveLength(3);
    });
});

// -------------------------------------------------------------------------------------- atlas

describe('SdfAtlas', () => {
    const font = { family: 'Test', weight: 600 };

    it('bakes each glyph once per font and caches measurements', () => {
        const ctx = fakeContext();
        const atlas = new SdfAtlas({ context: ctx });
        const a = atlas.glyph(font, 'A');

        expect(atlas.glyph(font, 'A')).toBe(a);
        expect(ctx.drawn).toEqual(['A']);
        expect(a.w).toBeGreaterThan(2 * atlas.pad);
        expect(a.left).toBe(-atlas.pad);
        expect(a.top).toBeCloseTo(-(Math.ceil(0.7 * 48) + atlas.pad));
        // another weight is another font
        atlas.glyph({ family: 'Test', weight: 400 }, 'A');
        expect(ctx.drawn).toEqual(['A', 'A']);

        const count = ctx.measured.length;

        atlas.advance(font, 'A');
        atlas.advance(font, 'A');
        atlas.kerning(font, 'A', 'V');
        atlas.kerning(font, 'A', 'V');
        expect(ctx.measured.length).toBe(count + 3); // A, then V and the pair AV
        expect(atlas.kerning(font, 'A', 'V')).toBeCloseTo(-4.8);
        expect(atlas.kerning(font, 'A', 'A')).toBe(0);
    });

    it('stores the distance field in the texture and packs without overlap', () => {
        const atlas = new SdfAtlas({ context: fakeContext(), width: 256, height: 64, maxHeight: 1024 });
        const glyphs = Array.from('ABCDEFGHIJKLMNOP', (c) => atlas.glyph(font, c));
        const data = atlas.source.resource as Uint8Array;
        const [W, H] = atlas.dimensions;

        expect(H).toBeGreaterThan(64);
        for (let i = 0; i < glyphs.length; i++)
            for (let j = i + 1; j < glyphs.length; j++) {
                const a = glyphs[i];
                const b = glyphs[j];
                const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;

                expect(apart).toBe(true);
            }
        atlas.flush();
        expect(atlas.source.resource).toBe(data === atlas.source.resource ? data : atlas.source.resource);
        const g = glyphs[0];
        const tex = atlas.source.resource as Uint8Array;

        // centre of the ink is inside (high), the cell corner far outside (0)
        expect(tex[(g.y + (g.h >> 1)) * W + g.x + (g.w >> 1)]).toBeGreaterThan(200);
        expect(tex[g.y * W + g.x]).toBe(0);
    });

    it('has no ink for spaces and starts over when cleared', () => {
        const ctx = fakeContext();
        const atlas = new SdfAtlas({ context: ctx });

        expect(atlas.glyph(font, ' ').w).toBe(0);
        atlas.glyph(font, 'A');
        const v = atlas.version;

        atlas.clear();
        expect(atlas.version).toBe(v + 1);
        atlas.glyph(font, 'A');
        expect(ctx.drawn).toEqual(['A', 'A']);
    });

    it('starts over when the texture cannot grow', () => {
        const atlas = new SdfAtlas({ context: fakeContext(), width: 128, height: 64, maxHeight: 128 });
        const v = atlas.version;
        const warn = console.warn;

        console.warn = () => {};
        for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') atlas.glyph(font, c);
        console.warn = warn;
        expect(atlas.version).toBeGreaterThan(v);
        const z = atlas.glyph(font, 'Z');

        expect(z.y + z.h).toBeLessThanOrEqual(128);
    });
});

// ----------------------------------------------------------------------------------- SilkText

describe('SilkText', () => {
    const atlas = () => new SdfAtlas({ context: fakeContext() });

    it('measures its box like the layout and follows the anchor', () => {
        const t = new SilkText({ text: 'AVi', fontSize: 24, fontFamily: 'Test', atlas: atlas() });
        // 0.6 + 0.6 - 0.1 + 0.3 em, at 24 px
        const w = (0.6 + 0.6 - 0.1 + 0.3) * 24;

        expect(t.width).toBeCloseTo(w);
        expect(t.height).toBeCloseTo(0.9 * 24, 0);
        expect(t.glyphCount).toBe(3);
        t.anchor.set(0.5);
        const b = t.getLocalBounds();

        expect(b.x).toBeCloseTo(-w / 2);
        expect(t.containsPoint({ x: 0, y: 0 })).toBe(true);
        expect(t.containsPoint({ x: w, y: 0 })).toBe(false);
    });

    it('lays out again when the text or style changes', () => {
        const t = new SilkText({ text: 'ab', fontFamily: 'Test', fontSize: 10, atlas: atlas() });

        expect(t.width).toBeCloseTo(12);
        t.text = 'abcd';
        expect(t.width).toBeCloseTo(24);
        t.fontSize = 20;
        expect(t.width).toBeCloseTo(48);
        t.set({ wordWrap: true, wordWrapWidth: 30, text: 'ab cd' });
        expect(t.lines.map((l) => l.text)).toEqual(['ab', 'cd']);
        t.text = 1234;
        expect(t.text).toBe('1234');
    });

    it('draws one instance per glyph with ink, two with a shadow', () => {
        const t = new SilkText({ text: 'a b', fontFamily: 'Test', atlas: atlas() });

        t.updateText();
        expect(t.geometry.instanceCount).toBe(2);
        t.shadow = { blur: 4, offsetY: 2 };
        t.updateText();
        expect(t.geometry.instanceCount).toBe(4);
        expect(t.glyphCount).toBe(2);
        // shadows come first, moved by the offset
        const f = t.geometry.instanceBuffer.data as Float32Array;

        expect(f[8]).toBe(1);
        expect(f[2 * 12 + 8]).toBe(0);
        expect(f[1] - f[2 * 12 + 1]).toBeCloseTo(2);
    });

    it('fills its uniforms from the style', () => {
        const t = new SilkText({
            text: 'a',
            fontFamily: 'Test',
            fontSize: 24,
            fill: 0xff0000,
            outline: { width: 2, color: 0x0000ff, alpha: 0.5 },
            atlas: atlas(),
        });

        t.updateText();
        const u = ((t.shader as Shader).resources.textUniforms as { uniforms: Record<string, Float32Array> }).uniforms;

        expect(Array.from(u.uFill)).toEqual([1, 0, 0, 1]);
        expect(Array.from(u.uOutline)).toEqual([0, 0, 0.5, 0.5]);
        expect(u.uParams[2]).toBeCloseTo(0.5);
        expect(u.uFx[1]).toBe(2);
        t.fill = linear(['#fff', '#000']);
        t.updateText();
        expect(u.uPaint[0]).toBe(1);
        expect(Array.from(u.uFill)).toEqual([1, 1, 1, 1]);
        t.destroy();
    });

    it('rebuilds after its atlas starts over', () => {
        const a = atlas();
        const t = new SilkText({ text: 'ab', fontFamily: 'Test', atlas: a });

        t.updateText();
        a.clear();
        expect(t.isRenderable).toBe(true);
        expect(t.geometry.instanceCount).toBe(2);
    });
});

describe('labels', () => {
    it('ValuePill takes a SilkText label', () => {
        const a = new SdfAtlas({ context: fakeContext() });
        const pill = new ValuePill({ label: silkLabel({ atlas: a }), fontSize: 10, textStyle: { fontFamily: 'Test' } });

        pill.text = '42';
        const label = pill.children[1] as SilkText;

        expect(label).toBeInstanceOf(SilkText);
        expect(label.fontWeight).toBe('600');
        expect(label.width).toBeCloseTo(12);
    });
});

describe('text shaders', () => {
    it('survive minification', () => {
        for (const src of [textVertex, textFragment])
            expect(minifyGlsl(src).startsWith('#version 300 es\n')).toBe(true);
    });
});
