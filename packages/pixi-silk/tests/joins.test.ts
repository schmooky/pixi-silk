import { describe, expect, it } from 'vitest';
import { Flag, Join, PATH_CHUNK, Prim, STRIDE } from '../src/constants';
import { SilkGraphics } from '../src/SilkGraphics';
import { joinKind, joinPolygon, miterRatio, nearWindows, pathStrokeDist, polygonDist, segSegDist } from '../src/stroke';

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
        // header (segments, closed, length, dash scale), segments, lengths before each segment
        expect(texel(g, 0)).toEqual([2, 0, 70, 1]);
        expect(texel(g, 1)).toEqual([0, 0, 30, 0]);
        expect(texel(g, 2)).toEqual([30, 0, 30, 40]);
        expect(texel(g, 3)).toEqual([0, 30, 0, 0]);
        // one window it owns (header texel, first segment, count, key), none of other instances
        expect(vec(g, 0, 4)).toEqual([4, 1, 0, 0]);
        expect(texel(g, 4)).toEqual([0, 0, 2, 0]);
        expect(vec(g, 0, 8)).toEqual([Join.Bevel, 3, 0, 0]);
    });

    it('defaults to miter joins with a limit of 10, like Canvas', () => {
        const g = new SilkGraphics();

        g.polyline([0, 0, 10, 0, 10, 10]).stroke({ width: 2, color: 0xffffff });
        expect(vec(g, 0, 8).slice(0, 2)).toEqual([Join.Miter, 10]);
        g.clear().polyline([0, 0, 10, 0, 10, 10]).stroke({ width: 2, join: 'round', color: 0xffffff });
        expect(vec(g, 0, 8)[0]).toBe(Join.Round);
    });

    it('splits long subpaths into chunks that see the segments of their neighbours', () => {
        const g = new SilkGraphics();
        const pts: number[] = [];

        for (let i = 0; i <= 100; i++) pts.push(i * 10, i % 2 ? 0 : 5);
        g.polyline(pts).stroke({ width: 2, color: 0xffffff });
        const chunks = Math.ceil(100 / PATH_CHUNK);

        expect(g.primitiveCount).toBe(chunks);
        const seg = Math.hypot(10, 5);

        // lengths before each segment, four per texel after the segments
        expect(texel(g, 1 + 100 + 1)[2]).toBeCloseTo(6 * seg, 3);
        for (let i = 0; i < chunks; i++) {
            const [win, own, near, key] = vec(g, i, 4);

            expect([own, key]).toEqual([1, i]);
            expect(texel(g, win)).toEqual([0, i * PATH_CHUNK, Math.min(PATH_CHUNK, 100 - i * PATH_CHUNK), i]);
            // the chunks before and after share a vertex with this one: their nearest segments are listed
            const keys = Array.from({ length: near }, (_, k) => texel(g, win + 1 + k)[3]);

            expect([...new Set(keys)].sort()).toEqual([i - 1, i + 1].filter((k) => k >= 0 && k < chunks));
        }
        // each chunk's bounds cover its own segments only
        expect(data(g)[0]).toBeLessThan(0);
        expect(data(g)[2]).toBeLessThan(PATH_CHUNK * 10 + 5);
    });

    it('keeps several short subpaths in one instance, so they never double-blend', () => {
        const g = new SilkGraphics();

        g.moveTo(0, 0).lineTo(20, 20).moveTo(0, 20).lineTo(20, 0).stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
        expect(g.primitiveCount).toBe(1);
        // two windows, one per subpath: header, one segment and one length texel each
        expect(vec(g, 0, 4)).toEqual([6, 2, 0, 0]);
        expect(texel(g, 6)).toEqual([0, 0, 1, 0]);
        expect(texel(g, 7)).toEqual([3, 0, 1, 0]);
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

    it('lets chunks of a path that crosses itself far along its length see each other', () => {
        const g = new SilkGraphics();
        const pts: number[] = [];

        // a figure eight: it passes the centre at segments 0, 100 and 200
        for (let i = 0; i <= 200; i++) {
            const t = (i / 200) * Math.PI * 2;

            pts.push(100 * Math.sin(t), 50 * Math.sin(2 * t));
        }
        g.polyline(pts).stroke({ width: 4, color: 0xffffff, alpha: 0.5 });
        const nearKeys = (i: number) => {
            const [win, own, near] = vec(g, i, 4);

            return new Set(Array.from({ length: near }, (_, k) => texel(g, win + own + k)[3]));
        };

        // chunk 0 (segments 0 to 31) meets chunk 3 (96 to 127) there, and the last chunk where it ends
        expect(nearKeys(0).has(3)).toBe(true);
        expect(nearKeys(0).has(6)).toBe(true);
        expect(nearKeys(3).has(0)).toBe(true);
        for (let i = 0; i < g.primitiveCount; i++) for (const k of nearKeys(i)) expect(nearKeys(k).has(i)).toBe(true);
    });

    it('lists only the segments that can meet, as runs of one subpath', () => {
        const sub = { pts: [0, 0, 10, 0, 20, 0, 30, 0, 40, 0] };
        const far = { pts: [0, 100, 40, 100] };
        const cross = { pts: [25, -10, 25, 10] };
        const owned = [[{ sub, s: 0, count: 4 }], [{ sub: far, s: 0, count: 1 }], [{ sub: cross, s: 0, count: 1 }]];
        const near = nearWindows(owned, 2);

        expect(near[1]).toEqual([]);
        // the line at x = 25 crosses segment 2 and stays more than 4 units from the others
        expect(near[0]).toEqual([{ sub: cross, s: 0, count: 1, key: 2 }]);
        expect(near[2]).toEqual([{ sub, s: 2, count: 1, key: 0 }]);
        expect(segSegDist([0, 0, 10, 0], 0, [5, -5, 5, 5], 0)).toBe(0);
        expect(segSegDist([0, 0, 10, 0], 0, [12, 3, 20, 3], 0)).toBeCloseTo(Math.hypot(2, 3));
    });

    it('stretches dashes per closed subpath, in its header', () => {
        const g = new SilkGraphics();

        g.moveTo(0, 0).lineTo(100, 0).lineTo(100, 50).closePath();
        g.moveTo(200, 0)
            .lineTo(300, 0)
            .stroke({ width: 2, dash: [10, 7], color: 0xffffff });
        const L = 150 + Math.hypot(100, 50);
        const scale = texel(g, 0)[3];

        expect((L / ((10 + 7) * scale)) % 1).toBeCloseTo(0, 5);
        // the open subpath keeps the pattern as it is
        expect(texel(g, 1 + 3 + 1)[3]).toBe(1);
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
        // header, two segments, their lengths before them, one window owning both
        const e = new Float32Array([2, 0, 20, 1, 0, 0, 10, 0, 10, 0, 10, 10, 0, 10, 0, 0, 0, 0, 2, 0]);
        const ref = { windows: 4, count: 1, miterLimit: 10, cap0: 0, cap1: 0, hw: 2 } as const;

        expect(pathStrokeDist(e, { ...ref, join: Join.Miter }, 11.9, -1.9)).toBeLessThan(0);
        expect(pathStrokeDist(e, { ...ref, join: Join.Bevel }, 11.9, -1.9)).toBeGreaterThan(0);
        expect(pathStrokeDist(e, { ...ref, join: Join.Round }, 11.9, -1.9)).toBeGreaterThan(0);
        expect(pathStrokeDist(e, { ...ref, join: Join.Round }, 11.2, -1.2)).toBeLessThan(0);
        expect(pathStrokeDist(e, { ...ref, join: Join.Miter }, 5, 0)).toBeCloseTo(-2);
    });

    it('draws joins round when they differ from round by under a tenth of a pixel, as the shader does', () => {
        // straight on: a miter adds nothing
        expect(joinKind(1, 0, 1, 0, 5, Join.Miter, 10, 1)).toBe(1);
        // a right angle is a miter at any zoom, a bevel past the limit
        expect(joinKind(1, 0, 0, 1, 5, Join.Miter, 10, 1)).toBe(2);
        expect(joinKind(1, 0, 0, 1, 5, Join.Miter, 1.2, 1)).toBe(3);
        // a full reversal has no join: the two butt ends cover it
        expect(joinKind(1, 0, -1, 0, 5, Join.Bevel, 10, 1)).toBe(0);
        expect(joinKind(1, 0, 0, 1, 5, Join.Round, 10, 1)).toBe(1);
    });

    it('cuts the disc of a round join where the stroke starts', () => {
        // a 1 unit segment, then on: the disc at (1, 0) must not reach back past x = 0
        const e = new Float32Array([2, 0, 11, 1, 0, 0, 1, 0, 1, 0, 11, 0, 0, 1, 0, 0, 0, 0, 2, 0]);
        const ref = { windows: 4, count: 1, join: Join.Round, miterLimit: 10, cap0: 0, cap1: 0, hw: 3 } as const;

        expect(pathStrokeDist(e, ref, -0.5, 0)).toBeCloseTo(0.5);
        expect(pathStrokeDist(e, ref, 0.5, 0)).toBeLessThan(0);
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
