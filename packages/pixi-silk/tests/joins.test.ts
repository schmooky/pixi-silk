import { describe, expect, it } from 'vitest';
import { Flag, Join, PATH_CHUNK, Prim, STRIDE } from '../src/constants';
import { SilkGraphics } from '../src/SilkGraphics';
import { joinPolygon, miterRatio, pathStrokeDist, polygonDist } from '../src/stroke';

const data = (g: SilkGraphics) => g.geometry.instanceBuffer.data as Float32Array;
const vec = (g: SilkGraphics, i: number, at: number) =>
    Array.from(data(g).subarray(i * STRIDE + at, i * STRIDE + at + 4));
const meta = (g: SilkGraphics, i: number) => vec(g, i, 16);
const poly = (g: SilkGraphics) => (g as unknown as { _poly: Float32Array })._poly;
const texel = (g: SilkGraphics, t: number) => Array.from(poly(g).subarray(t * 4, t * 4 + 4));

describe('stroked paths', () => {
    it('packs a polyline as one instance: header, segments, join and miter limit', () => {
        const g = new SilkGraphics();

        g.polyline([0, 0, 30, 0, 30, 40]).stroke({ width: 4, join: 'bevel', miterLimit: 3, color: 0xffffff });
        expect(g.primitiveCount).toBe(1);
        expect(meta(g, 0)[0]).toBe(Prim.Path);
        expect(meta(g, 0)[2]).toBe(4);
        // header texel, one subpath, every segment
        expect(vec(g, 0, 4)).toEqual([0, 1, 0, -1]);
        expect(vec(g, 0, 8)).toEqual([Join.Bevel, 3, 0, 0]);
        expect(texel(g, 0)).toEqual([2, 0, 70, 0]);
        expect(texel(g, 1)).toEqual([0, 0, 30, 0]);
        expect(texel(g, 2)).toEqual([30, 0, 30, 40]);
    });

    it('defaults to miter joins with a limit of 10, like Canvas', () => {
        const g = new SilkGraphics();

        g.polyline([0, 0, 10, 0, 10, 10]).stroke({ width: 2, color: 0xffffff });
        expect(vec(g, 0, 8).slice(0, 2)).toEqual([Join.Miter, 10]);
        g.clear().polyline([0, 0, 10, 0, 10, 10]).stroke({ width: 2, join: 'round', color: 0xffffff });
        expect(vec(g, 0, 8)[0]).toBe(Join.Round);
    });

    it('splits long subpaths into chunks that know the length before them', () => {
        const g = new SilkGraphics();
        const pts: number[] = [];

        for (let i = 0; i <= 100; i++) pts.push(i * 10, i % 2 ? 0 : 5);
        g.polyline(pts).stroke({ width: 2, color: 0xffffff });
        const chunks = Math.ceil(100 / PATH_CHUNK);

        expect(g.primitiveCount).toBe(chunks);
        const seg = Math.hypot(10, 5);

        for (let i = 0; i < chunks; i++) {
            expect(vec(g, i, 4)).toEqual([0, 1, i * PATH_CHUNK, Math.min(PATH_CHUNK, 100 - i * PATH_CHUNK)]);
            expect(vec(g, i, 8)[2]).toBeCloseTo(i * PATH_CHUNK * seg, 3);
        }
        // each chunk's bounds cover its own segments only
        expect(data(g)[0]).toBeLessThan(0);
        expect(data(g)[2]).toBeLessThan(PATH_CHUNK * 10 + 5);
    });

    it('keeps several short subpaths in one instance, so they never double-blend', () => {
        const g = new SilkGraphics();

        g.moveTo(0, 0).lineTo(20, 20).moveTo(0, 20).lineTo(20, 0).stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
        expect(g.primitiveCount).toBe(1);
        expect(vec(g, 0, 4)).toEqual([0, 2, 0, -1]);
        expect(texel(g, 2)[0]).toBe(1); // second header after one segment
    });

    it('merges separate open paths with union: true', () => {
        const g = new SilkGraphics();

        g.line(0, 0, 20, 20).line(0, 20, 20, 0).stroke({ width: 2, color: 0xffffff, union: true });
        expect(g.primitiveCount).toBe(1);
        expect(vec(g, 0, 4)[1]).toBe(2);
        g.clear().line(0, 0, 20, 20).line(0, 20, 20, 0).stroke({ width: 2, color: 0xffffff });
        expect(g.primitiveCount).toBe(2);
    });

    it('keeps dashes on paths and fits them on closed outlines', () => {
        const g = new SilkGraphics();

        g.rect(0, 0, 100, 50).stroke({ width: 2, dash: [12, 8], color: 0xffffff });
        expect(meta(g, 0)[1] & Flag.Dash).toBeTruthy();
        const [dash, gap] = vec(g, 0, 36);

        // 300 units of outline tile into whole periods
        expect(300 / (dash + gap)).toBeCloseTo(Math.round(300 / (dash + gap)), 6);
    });

    it('keeps tapered strokes as one capsule per segment', () => {
        const g = new SilkGraphics();

        g.polyline([0, 0, 10, 0, 20, 10]).stroke({ width: [1, 6], color: 0xffffff });
        expect(g.primitiveCount).toBe(2);
        expect(meta(g, 0)[0]).toBe(Prim.Segment);
    });
});

describe('sharp corners of closed shapes', () => {
    it('strokes a rect without radius as a closed path with miter corners', () => {
        const g = new SilkGraphics();

        g.rect(0, 0, 40, 20).stroke({ width: 4, color: 0xffffff });
        expect(meta(g, 0)[0]).toBe(Prim.Path);
        expect(texel(g, 0).slice(0, 2)).toEqual([4, 1]);
        // the outer corner is covered, as in Canvas
        expect(g.containsPoint({ x: -1.8, y: -1.8 })).toBe(true);
        g.clear().rect(0, 0, 40, 20).stroke({ width: 4, color: 0xffffff, join: 'round' });
        expect(meta(g, 0)[0]).toBe(Prim.Rect);
        expect(g.containsPoint({ x: -1.8, y: -1.8 })).toBe(false);
    });

    it('cuts the corner flat with a bevel', () => {
        const g = new SilkGraphics();

        g.rect(0, 0, 40, 20).stroke({ width: 4, color: 0xffffff, join: 'bevel' });
        expect(g.containsPoint({ x: -1.8, y: -1.8 })).toBe(false);
        expect(g.containsPoint({ x: -0.5, y: -0.5 })).toBe(true);
    });

    it('fills and strokes a sharp rect as a fill instance and an outline', () => {
        const g = new SilkGraphics();

        g.rect(0, 0, 40, 20).fill(0x333333).stroke({ width: 4, color: 0xffffff });
        expect(g.primitiveCount).toBe(2);
        expect(meta(g, 0)[0]).toBe(Prim.Rect);
        expect(meta(g, 0)[1] & Flag.Stroke).toBe(0);
        expect(meta(g, 1)[0]).toBe(Prim.Path);
    });

    it('keeps rounded rects on their own distance field', () => {
        const g = new SilkGraphics();

        g.roundRect(0, 0, 40, 20, 6).fill(0x333333).stroke({ width: 2, color: 0xffffff });
        expect(g.primitiveCount).toBe(1);
        expect(meta(g, 0)[0]).toBe(Prim.Rect);
    });

    it('moves the outline for inside and outside alignment', () => {
        const g = new SilkGraphics();

        g.rect(0, 0, 40, 20).stroke({ width: 4, color: 0xffffff, alignment: 'inside' });
        expect(texel(g, 1).slice(0, 2)).toEqual([2, 2]);
        g.clear().triangle(0, 0, 40, 0, 20, 30).stroke({ width: 2, color: 0xffffff });
        expect(meta(g, 0)[0]).toBe(Prim.Path);
        g.clear().regularPoly(0, 0, 20, 6).stroke({ width: 2, color: 0xffffff });
        expect(texel(g, 0)[0]).toBe(6);
        g.clear().star(0, 0, 5, 20).stroke({ width: 2, color: 0xffffff });
        expect(texel(g, 0)[0]).toBe(10);
    });
});

describe('join geometry', () => {
    it('puts the miter tip where the outer edges meet', () => {
        // right angle: the tip sits one half width out on both axes
        const p = joinPolygon(0, 0, 1, 0, 0, 1, 2, Join.Miter, 10) as number[];

        expect(p).toHaveLength(8);
        expect(p[4]).toBeCloseTo(2);
        expect(p[5]).toBeCloseTo(-2);
        expect(miterRatio(1, 0, 0, 1)).toBeCloseTo(Math.SQRT2);
    });

    it('falls back to a bevel past the miter limit', () => {
        expect(joinPolygon(0, 0, 1, 0, 0, 1, 2, Join.Miter, 1.4)).toHaveLength(6);
        expect(joinPolygon(0, 0, 1, 0, 0, 1, 2, Join.Bevel, 10)).toHaveLength(6);
        expect(joinPolygon(0, 0, 1, 0, 0, 1, 2, Join.Round, 10)).toBeNull();
        expect(joinPolygon(0, 0, 1, 0, 1, 0, 2, Join.Miter, 10)).toBeNull();
    });

    it('measures signed distance to polygons and strokes', () => {
        expect(polygonDist([0, 0, 10, 0, 10, 10, 0, 10], 5, 5)).toBeCloseTo(-5);
        expect(polygonDist([0, 0, 10, 0, 10, 10, 0, 10], 13, 14)).toBeCloseTo(5);
        // an L with a 2 unit half width, miter join
        const e = new Float32Array([2, 0, 20, 0, 0, 0, 10, 0, 10, 0, 10, 10]);
        const ref = { header: 0, subpaths: 1, first: 0, count: -1, miterLimit: 10, cap0: 0, cap1: 0, hw: 2 } as const;

        expect(pathStrokeDist(e, { ...ref, join: Join.Miter }, 11.9, -1.9)).toBeLessThan(0);
        expect(pathStrokeDist(e, { ...ref, join: Join.Bevel }, 11.9, -1.9)).toBeGreaterThan(0);
        expect(pathStrokeDist(e, { ...ref, join: Join.Round }, 11.9, -1.9)).toBeGreaterThan(0);
        expect(pathStrokeDist(e, { ...ref, join: Join.Round }, 11.2, -1.2)).toBeLessThan(0);
        expect(pathStrokeDist(e, { ...ref, join: Join.Miter }, 5, 0)).toBeCloseTo(-2);
    });

    it('hit tests the miter tip of a polyline', () => {
        const g = new SilkGraphics();

        g.polyline([0, 0, 50, 0, 50, 50]).stroke({ width: 10, color: 0xffffff });
        expect(g.containsPoint({ x: 54, y: -4 })).toBe(true);
        g.clear().polyline([0, 0, 50, 0, 50, 50]).stroke({ width: 10, color: 0xffffff, join: 'bevel' });
        expect(g.containsPoint({ x: 54, y: -4 })).toBe(false);
    });
});

describe('unions', () => {
    it('fills overlapping shapes as one instance with one record per shape', () => {
        const g = new SilkGraphics();

        g.rect(0, -2, 40, 4).triangle(36, -8, 50, 0, 36, 8).fill({ color: 0xffffff, alpha: 0.5, union: true });
        expect(g.primitiveCount).toBe(1);
        expect(meta(g, 0)[0]).toBe(Prim.Union);
        expect(vec(g, 0, 4).slice(0, 2)).toEqual([0, 2]);
        expect(texel(g, 0)[0]).toBe(Prim.Rect);
        expect(texel(g, 4)[0]).toBe(Prim.Triangle);
        expect(g.containsPoint({ x: 10, y: 0 })).toBe(true);
        expect(g.containsPoint({ x: 46, y: 0 })).toBe(true);
        expect(g.containsPoint({ x: 46, y: 6 })).toBe(false);
    });

    it('merges a following stroke into the union instance', () => {
        const g = new SilkGraphics();

        g.circle(0, 0, 10)
            .circle(12, 0, 10)
            .fill({ color: 0x333333, union: true })
            .stroke({ width: 2, color: 0xffffff });
        expect(g.primitiveCount).toBe(1);
        expect(meta(g, 0)[1] & (Flag.Fill | Flag.Stroke)).toBe(Flag.Fill | Flag.Stroke);
    });

    it('joins polygons in, one record per subpath', () => {
        const g = new SilkGraphics();

        g.poly([0, 0, 10, 0, 5, 10]).circle(20, 5, 5).fill({ color: 0xffffff, union: true });
        expect(g.primitiveCount).toBe(1);
        expect(vec(g, 0, 4)[1]).toBe(2);
        // the polygon's edges come first, then the records
        expect(texel(g, 3)[0]).toBe(Prim.Poly);
        expect(texel(g, 4).slice(0, 2)).toEqual([0, 3]);
        expect(g.containsPoint({ x: 5, y: 3 })).toBe(true);
        expect(g.containsPoint({ x: 20, y: 5 })).toBe(true);
    });

    it('copies the union into its inner shadows', () => {
        const g = new SilkGraphics();

        g.circle(0, 0, 10)
            .circle(12, 0, 10)
            .fill({ color: 0x333333, union: true, innerShadow: { y: 2, blur: 3 } });
        expect(g.primitiveCount).toBe(2);
        expect(meta(g, 1)[0]).toBe(Prim.Union);
        expect(meta(g, 1)[1] & Flag.Inner).toBeTruthy();
    });
});
