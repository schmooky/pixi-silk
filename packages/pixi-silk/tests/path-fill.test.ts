import { describe, expect, it } from 'vitest';
import { Flag, POLY_WIDTH, Prim, STRIDE } from '../src/constants';
import { bolt, drop } from '../src/glow/shapes';
import { SilkGraphics } from '../src/SilkGraphics';

const data = (g: SilkGraphics) => g.geometry.instanceBuffer.data as Float32Array;
const shape0 = (g: SilkGraphics, i: number) => Array.from(data(g).subarray(i * STRIDE + 4, i * STRIDE + 8));
const meta = (g: SilkGraphics, i: number) => Array.from(data(g).subarray(i * STRIDE + 16, i * STRIDE + 20));
const bounds = (g: SilkGraphics, i: number) => Array.from(data(g).subarray(i * STRIDE, i * STRIDE + 4));

describe('filled paths', () => {
    it('fills a polygon as one instance that points at its edges', () => {
        const g = new SilkGraphics();

        g.poly([0, 0, 100, 0, 50, 80]).fill(0xffffff);
        expect(g.primitiveCount).toBe(1);
        expect(meta(g, 0)[0]).toBe(Prim.Poly);
        expect(shape0(g, 0).slice(0, 2)).toEqual([0, 3]);
        expect(bounds(g, 0)).toEqual([0, 0, 100, 80]);
    });

    it('keeps the edges of every path in one texture, one after another', () => {
        const g = new SilkGraphics();

        g.poly([0, 0, 10, 0, 10, 10, 0, 10]).fill(0xffffff);
        bolt(g, 0, 0, 100, 140).fill(0xffffff);
        expect(shape0(g, 1).slice(0, 2)).toEqual([4, 6]);
    });

    it('fills curved paths, holes included (even-odd)', () => {
        const g = new SilkGraphics();

        g.beginPath()
            .moveTo(0, 0)
            .lineTo(100, 0)
            .lineTo(100, 100)
            .lineTo(0, 100)
            .closePath()
            .moveTo(30, 30)
            .lineTo(70, 30)
            .lineTo(70, 70)
            .lineTo(30, 70)
            .closePath()
            .fill(0xffffff);
        expect(g.primitiveCount).toBe(1);
        expect(g.containsPoint({ x: 10, y: 10 })).toBe(true);
        expect(g.containsPoint({ x: 50, y: 50 })).toBe(false);
    });

    it('hits the real outline of a bolt, not its box', () => {
        const g = new SilkGraphics();

        bolt(g, 0, 0, 100, 140).fill(0xffffff);
        expect(g.containsPoint({ x: 40, y: 70 })).toBe(true);
        expect(g.containsPoint({ x: 5, y: 5 })).toBe(false);
    });

    it('works with blur, spread, inner shadows and progressive blur', () => {
        const g = new SilkGraphics();

        drop(g, 50, 50, 30)
            .fill({ color: 0xffffff, blur: 10, spread: 4, innerShadow: { color: 0x000000, y: 4, blur: 3 } })
            .poly([0, 0, 50, 0, 25, 40])
            .fill({ color: 0xffffff, blur: { from: 2, to: 20, angle: 0 } });
        expect(g.primitiveCount).toBe(3);
        expect(meta(g, 1)[0]).toBe(Prim.Poly);
        expect(meta(g, 1)[1] & Flag.Inner).toBe(Flag.Inner);
        // 3 sigma of blur plus the spread
        expect(bounds(g, 0)[1]).toBeLessThan(50 - 30 * 1.6 - 30);
    });

    it('grows the edge texture past one row and starts over on clear', () => {
        const g = new SilkGraphics();
        const pts: number[] = [];

        for (let i = 0; i < POLY_WIDTH + 10; i++) {
            const a = (i / (POLY_WIDTH + 10)) * Math.PI * 2;

            pts.push(Math.cos(a) * 50, Math.sin(a) * 50);
        }
        g.poly(pts).fill(0xffffff);
        expect(g.containsPoint({ x: 0, y: 0 })).toBe(true);
        g.clear().poly([0, 0, 10, 0, 5, 8]).fill(0xffffff);
        expect(shape0(g, 0).slice(0, 2)).toEqual([0, 3]);
    });

    it('strokes a path as one outline, and a tapered one segment by segment', () => {
        const g = new SilkGraphics();

        g.poly([0, 0, 100, 0, 50, 80]).stroke({ width: 2, color: 0xffffff });
        expect(meta(g, 0)[0]).toBe(Prim.Path);
        g.clear()
            .poly([0, 0, 100, 0, 50, 80])
            .stroke({ width: [1, 4], color: 0xffffff });
        expect(meta(g, 0)[0]).toBe(Prim.Segment);
    });
});
