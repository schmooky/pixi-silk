import { describe, expect, it } from 'vitest';
import { linear, SilkGraphics } from '../src';

describe('SilkGraphics', () => {
    it('records one instance per primitive', () => {
        const g = new SilkGraphics();

        g.rect(0, 0, 10, 10).fill(0xffffff);
        g.circle(50, 50, 10).fill(0xff0000);
        expect(g.primitiveCount).toBe(2);
        g.clear();
        expect(g.primitiveCount).toBe(0);
    });

    it('merges fill() followed by stroke() into the same instance', () => {
        const g = new SilkGraphics();

        g.roundRect(0, 0, 100, 40, 12).fill(0x1c1c1e).stroke({ width: 2, color: 0xffffff });
        expect(g.primitiveCount).toBe(1);
    });

    it('draws a polyline as one instance', () => {
        const g = new SilkGraphics();

        g.polyline([0, 0, 10, 0, 20, 10, 30, 0]).stroke({ width: 2, color: 0xffffff });
        expect(g.primitiveCount).toBe(1);
    });

    it('grows its bounds with the drawing, including stroke width', () => {
        const g = new SilkGraphics();

        g.rect(10, 20, 30, 40).fill(0xffffff);
        let b = g.geometry.localBounds;

        expect([b.minX, b.minY, b.maxX, b.maxY]).toEqual([10, 20, 40, 60]);
        g.clear().circle(0, 0, 10).stroke({ width: 4, color: 0xffffff });
        b = g.geometry.localBounds;
        expect(b.maxX).toBeGreaterThanOrEqual(12);
    });

    it('hit-tests the real shape: a ring is hollow', () => {
        const g = new SilkGraphics();

        g.circle(0, 0, 50).stroke({ width: 10, color: 0xffffff });
        expect(g.containsPoint({ x: 0, y: 0 })).toBe(false);
        expect(g.containsPoint({ x: 50, y: 0 })).toBe(true);
        expect(g.containsPoint({ x: 70, y: 0 })).toBe(false);
    });

    it('hit-tests filled shapes and thin lines', () => {
        const g = new SilkGraphics();

        g.roundRect(0, 0, 100, 100, 30).fill(0xffffff);
        expect(g.containsPoint({ x: 50, y: 50 })).toBe(true);
        // outside the rounded corner, inside the bounding box
        expect(g.containsPoint({ x: 2, y: 2 })).toBe(false);
        g.clear().line(0, 0, 100, 0).stroke({ width: 4, color: 0xffffff });
        expect(g.containsPoint({ x: 50, y: 1.5 })).toBe(true);
        expect(g.containsPoint({ x: 50, y: 6 })).toBe(false);
    });

    it('applies the transform stack to shapes', () => {
        const g = new SilkGraphics();

        g.save().translateTransform(100, 50).scaleTransform(2);
        g.rect(0, 0, 10, 10).fill(0xffffff);
        g.restore();
        const b = g.geometry.localBounds;

        expect([b.minX, b.minY, b.maxX, b.maxY]).toEqual([100, 50, 120, 70]);
    });

    it('accepts gradients as paint', () => {
        const g = new SilkGraphics();

        g.rect(0, 0, 100, 10).fill(linear([0xff0000, 0x0000ff]));
        expect(g.primitiveCount).toBe(1);
        g.destroy();
    });
});
