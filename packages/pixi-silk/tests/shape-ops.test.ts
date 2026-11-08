import { describe, expect, it, vi } from 'vitest';
import { Flag, Prim, STRIDE } from '../src/constants';
import { SilkGraphics } from '../src/SilkGraphics';

const data = (g: SilkGraphics) => g.geometry.instanceBuffer.data as Float32Array;
const vec = (g: SilkGraphics, i: number, at: number) =>
    Array.from(data(g).subarray(i * STRIDE + at, i * STRIDE + at + 4));
const meta = (g: SilkGraphics, i: number) => vec(g, i, 16);
const poly = (g: SilkGraphics) => (g as unknown as { _poly: Float32Array })._poly;
/** [type, op] of every record of instance i. */
const records = (g: SilkGraphics, i = 0) => {
    const [start, n] = vec(g, i, 4);

    return Array.from({ length: n }, (_, r) => [poly(g)[(start + r * 4) * 4], poly(g)[(start + r * 4) * 4 + 1]]);
};
const hits = (g: SilkGraphics, pts: [number, number][]) => pts.map(([x, y]) => g.containsPoint({ x, y }));

const PUSH = 4;
const POP = 255;

describe('shape operations with fill({ op })', () => {
    it('subtracts every later shape from the first one, in one instance', () => {
        const g = new SilkGraphics();

        g.circle(50, 50, 40).circle(50, 50, 24).fill({ color: 0xffffff, alpha: 0.5, op: 'subtract' });
        expect(g.primitiveCount).toBe(1);
        expect(meta(g, 0)[0]).toBe(Prim.Union);
        expect(records(g)).toEqual([
            [Prim.Ellipse, PUSH],
            [Prim.Ellipse, 1],
        ]);
        // a ring: hollow in the middle
        expect(
            hits(g, [
                [50, 50],
                [50, 18],
                [50, 85],
                [50, 5],
            ]),
        ).toEqual([false, true, true, false]);
    });

    it('intersects and excludes', () => {
        const g = new SilkGraphics();

        g.rect(0, 0, 40, 40).circle(40, 40, 20).fill({ color: 0xffffff, op: 'intersect' });
        expect(
            hits(g, [
                [35, 35],
                [10, 10],
                [55, 55],
            ]),
        ).toEqual([true, false, false]);
        g.clear().rect(0, 0, 40, 40).circle(40, 40, 20).fill({ color: 0xffffff, op: 'exclude' });
        expect(
            hits(g, [
                [35, 35],
                [10, 10],
                [52, 52],
            ]),
        ).toEqual([false, true, true]);
        // bounds follow the operation: the overlap for intersect
        g.clear().rect(0, 0, 40, 40).circle(40, 40, 20).fill({ color: 0xffffff, op: 'intersect' });
        expect(data(g)[0]).toBeCloseTo(20, 0);
        expect(data(g)[2]).toBeCloseTo(40, 0);
    });

    it('takes a path as one even-odd operand', () => {
        const g = new SilkGraphics();

        // a square with a square hole, minus a bar across it
        g.svgPath('M0 0 H60 V60 H0 Z M20 20 V40 H40 V20 Z')
            .rect(25, -5, 10, 70)
            .fill({ color: 0xffffff, op: 'subtract' });
        expect(records(g)).toEqual([
            [Prim.Poly, PUSH],
            [Prim.Rect, 1],
        ]);
        expect(
            hits(g, [
                [10, 10],
                [30, 30],
                [30, 10],
                [50, 50],
            ]),
        ).toEqual([true, false, false, true]);
    });

    it('strokes the outline of the result, merged with its fill', () => {
        const g = new SilkGraphics();

        g.circle(50, 50, 40)
            .circle(50, 50, 24)
            .fill({ color: 0x333333, op: 'subtract' })
            .stroke({ width: 4, color: 0xffffff });
        expect(g.primitiveCount).toBe(1);
        expect(meta(g, 0)[1] & (Flag.Fill | Flag.Stroke)).toBe(Flag.Fill | Flag.Stroke);
        // on the inner edge of the ring
        expect(g.containsPoint({ x: 50, y: 50 - 23 })).toBe(true);
        g.clear().circle(50, 50, 40).circle(50, 50, 24).stroke({ width: 4, color: 0xffffff, op: 'subtract' });
        expect(g.primitiveCount).toBe(1);
        expect(
            hits(g, [
                [50, 26],
                [50, 18],
                [50, 50],
            ]),
        ).toEqual([true, false, false]);
    });

    it('keeps blur, gradients and inner shadows on the combined shape', () => {
        const g = new SilkGraphics();

        g.circle(0, 0, 20)
            .circle(10, 0, 12)
            .fill({ color: 0xffffff, op: 'subtract', blur: 4, innerShadow: { y: 2, blur: 3 } });
        expect(g.primitiveCount).toBe(2);
        expect(meta(g, 0)[3]).toBe(4);
        expect(meta(g, 1)[0]).toBe(Prim.Union);
        expect(meta(g, 1)[1] & Flag.Inner).toBeTruthy();
        // the shadow reads the same records
        expect(vec(g, 1, 4).slice(0, 2)).toEqual(vec(g, 0, 4).slice(0, 2));
    });

    it('keeps union: true as op: union', () => {
        const a = new SilkGraphics().circle(0, 0, 10).circle(12, 0, 10).fill({ color: 0xffffff, union: true });
        const b = new SilkGraphics().circle(0, 0, 10).circle(12, 0, 10).fill({ color: 0xffffff, op: 'union' });

        expect(records(a)).toEqual(records(b));
        expect(records(a)).toEqual([
            [Prim.Ellipse, PUSH],
            [Prim.Ellipse, 0],
        ]);
    });
});

describe('boolean()', () => {
    it('combines what two callbacks draw, and nests', () => {
        const g = new SilkGraphics();

        // (big circle minus small circle) minus a bar, then united with a dot in the middle
        g.boolean(
            'union',
            (g) =>
                g.boolean(
                    'subtract',
                    (g) => g.circle(50, 50, 40),
                    (g) => g.circle(50, 50, 24).rect(46, 0, 8, 30),
                ),
            (g) => g.circle(50, 50, 8),
        ).fill(0xffffff);
        expect(g.primitiveCount).toBe(1);
        expect(records(g)).toEqual([
            [Prim.Ellipse, PUSH],
            [Prim.Ellipse, PUSH],
            [Prim.Rect, 0],
            [POP, 1],
            [Prim.Ellipse, PUSH],
            [POP, 0],
        ]);
        // ring, notch, dot
        expect(
            hits(g, [
                [50, 85],
                [50, 14],
                [50, 50],
                [50, 35],
            ]),
        ).toEqual([true, false, true, false]);
    });

    it('is one shape on the active path: it fills on its own or joins other operations', () => {
        const g = new SilkGraphics();

        g.boolean(
            'intersect',
            (g) => g.rect(0, 0, 40, 40),
            (g) => g.circle(40, 40, 30),
        )
            .circle(100, 100, 5)
            .fill(0xffffff);
        // the boolean and the circle are separate instances
        expect(g.primitiveCount).toBe(2);
        g.clear()
            .rect(0, 0, 100, 100)
            .boolean(
                'union',
                (g) => g.circle(30, 30, 10),
                (g) => g.circle(70, 70, 10),
            )
            .fill({ color: 0xffffff, op: 'subtract' });
        expect(g.primitiveCount).toBe(1);
        expect(
            hits(g, [
                [30, 30],
                [70, 70],
                [50, 50],
            ]),
        ).toEqual([false, false, true]);
    });

    it('does not paint or keep the shapes the callbacks add', () => {
        const g = new SilkGraphics();

        g.rect(0, 0, 10, 10).boolean(
            'subtract',
            (g) => g.rect(20, 0, 10, 10),
            (g) => g.rect(25, 0, 10, 10),
        );
        expect(g.primitiveCount).toBe(0);
        g.fill(0xffffff);
        // the rect before it, and the boolean
        expect(g.primitiveCount).toBe(2);
        expect(
            hits(g, [
                [5, 5],
                [22, 5],
                [27, 5],
            ]),
        ).toEqual([true, true, false]);
    });

    it('leaves nothing for an intersection with nothing', () => {
        const g = new SilkGraphics();

        g.boolean(
            'intersect',
            (g) => g.rect(0, 0, 10, 10),
            () => {},
        ).fill(0xffffff);
        expect(g.primitiveCount).toBe(0);
        g.boolean(
            'subtract',
            (g) => g.rect(0, 0, 10, 10),
            () => {},
        ).fill(0xffffff);
        expect(hits(g, [[5, 5]])).toEqual([true]);
    });

    it('skips operations nested deeper than the shader stack, with a warning', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const g = new SilkGraphics();
        let draw = (gr: SilkGraphics) => gr.circle(0, 0, 10);

        for (let i = 0; i < 9; i++) {
            const inner = draw;

            draw = (gr) => gr.boolean('subtract', (h) => h.circle(0, 0, 20 + i), inner);
        }
        draw(g).fill(0xffffff);
        expect(g.primitiveCount).toBe(0);
        expect(warn).toHaveBeenCalledOnce();
        warn.mockRestore();
    });
});

describe('svgPath()', () => {
    it('parses a path into the active path, for fills and strokes', () => {
        const g = new SilkGraphics();

        g.svgPath('M10 10 h80 v80 h-80 z').fill(0xffffff);
        expect(meta(g, 0)[0]).toBe(Prim.Poly);
        expect(
            hits(g, [
                [50, 50],
                [95, 50],
            ]),
        ).toEqual([true, false]);
        g.clear().svgPath('M0 0 C 30 -20 60 20 90 0').stroke({ width: 4, color: 0xffffff });
        expect(meta(g, 0)[0]).toBe(Prim.Path);
        expect(g.containsPoint({ x: 0, y: 0 })).toBe(true);
    });

    it('follows the current transform', () => {
        const g = new SilkGraphics();

        g.translateTransform(100, 0).svgPath('M0 0 H20 V20 H0 Z').fill(0xffffff);
        expect(
            hits(g, [
                [110, 10],
                [10, 10],
            ]),
        ).toEqual([true, false]);
    });
});

describe('hit tests of every closed shape', () => {
    it('follows hearts, stars and sectors exactly', () => {
        const g = new SilkGraphics();

        g.star(0, 0, 5, 40, 16).fill(0xffffff);
        // a tip, and the notch between two tips
        expect(
            hits(g, [
                [0, -38],
                [0, 20],
                [0, -20],
            ]),
        ).toEqual([true, false, true]);
        g.clear()
            .sector(0, 0, 40, 0, Math.PI / 2, 20)
            .fill(0xffffff);
        expect(
            hits(g, [
                [21, 21],
                [5, 5],
                [-21, 21],
            ]),
        ).toEqual([true, false, false]);
        g.clear().heart(0, 0, 60).fill(0xffffff);
        expect(
            hits(g, [
                [0, 0],
                [0, -24],
                [-14, -16],
            ]),
        ).toEqual([true, false, true]);
    });
});
