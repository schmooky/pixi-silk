import { describe, expect, it } from 'vitest';
import { GradientAtlas } from '../src/atlas';
import { RAMP_WIDTH } from '../src/constants';
import { conic, linear, radial, vertical } from '../src/gradient';

const bake = (g: ReturnType<typeof linear>) => {
    const out = new Float32Array(RAMP_WIDTH * 4);

    g.bake(out);

    return out;
};

describe('stops', () => {
    it('spreads bare colours evenly', () => {
        const g = linear([0xff0000, 0x00ff00, 0x0000ff]);

        expect(g.stops.map((s) => s.offset)).toEqual([0, 0.5, 1]);
    });

    it('clamps offsets to 0..1 and keeps them non-decreasing, like CSS', () => {
        const g = linear([
            [0.6, 0xff0000],
            [0.2, 0x00ff00],
            [1.4, 0x0000ff],
        ]);

        expect(g.stops.map((s) => s.offset)).toEqual([0.6, 0.6, 1]);
    });

    it('accepts object stops with alpha', () => {
        const g = linear([
            { offset: 0, color: 0xffffff, alpha: 0 },
            { offset: 1, color: 0xffffff },
        ]);

        expect(g.stops[0].rgba[3]).toBe(0);
    });

    it('shares a key between identical ramps and not across spaces', () => {
        expect(linear([0xff0000, 0x0000ff]).key).toBe(vertical([0xff0000, 0x0000ff]).key);
        expect(linear([0xff0000, 0x0000ff]).key).not.toBe(linear([0xff0000, 0x0000ff], { space: 'srgb' }).key);
    });

    it('uses a different key for a range than for the default ramp', () => {
        const stops = [0x000000, 0xffffff];

        expect(linear(stops, { range: [0, 0.5] }).key).not.toBe(linear(stops).key);
    });

    it('clamps range endpoints and resets non-finite ranges', () => {
        const stops = [0x000000, 0xffffff];

        expect(linear(stops, { range: [-1, 2] }).range).toEqual([0, 1]);
        expect(linear(stops, { range: [Number.NaN, 0.5] }).range).toEqual([0, 1]);
    });
});

describe('bake', () => {
    it('hits the end colours exactly (premultiplied)', () => {
        const out = bake(linear([0xff0000, 0x0000ff]));

        expect(Array.from(out.slice(0, 4))).toEqual([1, 0, 0, 1]);
        const last = Array.from(out.slice((RAMP_WIDTH - 1) * 4));

        expect(last[0]).toBeCloseTo(0, 5);
        expect(last[2]).toBeCloseTo(1, 5);
    });

    it('bakes only the first half of the ramp for range [0, 0.5]', () => {
        const out = bake(linear([0x000000, 0xffffff], { range: [0, 0.5], space: 'srgb' }));
        const middle = Math.floor((RAMP_WIDTH - 1) / 2);

        expect(out[0]).toBe(0);
        expect(out[middle * 4]).toBeCloseTo((middle / (RAMP_WIDTH - 1)) * 0.5, 5);
        expect(out[(RAMP_WIDTH - 1) * 4]).toBeCloseTo(0.5, 5);
    });

    it('bakes a reversed range in reverse colour order', () => {
        const out = bake(linear([0x000000, 0xffffff], { range: [0.5, 0], space: 'srgb' }));
        const middle = Math.floor((RAMP_WIDTH - 1) / 2);

        expect(out[0]).toBeCloseTo(0.5, 5);
        expect(out[middle * 4]).toBeCloseTo(0.5 * (1 - middle / (RAMP_WIDTH - 1)), 5);
        expect(out[(RAMP_WIDTH - 1) * 4]).toBe(0);
    });

    it('bakes a constant colour when range endpoints are equal', () => {
        const out = bake(linear([0x000000, 0xffffff], { range: [0.25, 0.25], space: 'srgb' }));

        for (let i = 0; i < RAMP_WIDTH; i++) {
            expect(out[i * 4]).toBeCloseTo(0.25, 5);
        }
    });

    it('premultiplies alpha, so fading to transparent never darkens', () => {
        const out = bake(
            linear([
                [0, 0xffffff, 1],
                [1, 0xffffff, 0],
            ]),
        );

        for (let i = 0; i < RAMP_WIDTH; i++) {
            const a = out[i * 4 + 3];

            // straight colour stays white all the way
            if (a > 1e-3) expect(out[i * 4] / a).toBeCloseTo(1, 3);
        }
    });

    it('keeps OKLab ramps brighter in the middle than naive sRGB mixing of red and green', () => {
        const mid = (RAMP_WIDTH / 2) * 4;
        const ok = bake(linear([0xff0000, 0x00ff00]));
        const srgb = bake(linear([0xff0000, 0x00ff00], { space: 'srgb' }));
        const luma = (o: Float32Array) => 0.2126 * o[mid] + 0.7152 * o[mid + 1] + 0.0722 * o[mid + 2];

        expect(luma(ok)).toBeGreaterThan(luma(srgb));
    });

    it('never overshoots with smooth easing', () => {
        const out = bake(
            linear(
                [
                    [0, 0x000000],
                    [0.1, 0xffffff],
                    [0.2, 0x000000],
                    [1, 0xffffff],
                ],
                { easing: 'smooth', space: 'srgb' },
            ),
        );

        for (let i = 0; i < RAMP_WIDTH; i++) {
            expect(out[i * 4]).toBeGreaterThanOrEqual(-1e-6);
            expect(out[i * 4]).toBeLessThanOrEqual(1 + 1e-6);
        }
    });

    it('supports hard stops', () => {
        const out = bake(
            linear(
                [
                    [0, 0xff0000],
                    [0.5, 0xff0000],
                    [0.5, 0x0000ff],
                    [1, 0x0000ff],
                ],
                { space: 'srgb' },
            ),
        );
        const before = Math.floor(RAMP_WIDTH * 0.45) * 4;
        const after = Math.ceil(RAMP_WIDTH * 0.55) * 4;

        expect(out[before]).toBeCloseTo(1, 5);
        expect(out[after + 2]).toBeCloseTo(1, 5);
    });
});

describe('geometry', () => {
    it('resolves shape units against the shape box', () => {
        const out = new Float32Array(4);

        vertical([0, 0xffffff]).resolve({ x: 10, y: 20, w: 100, h: 50 }, out, 0);
        expect(Array.from(out)).toEqual([10, 20, 10, 70]);
    });

    it('scales radial radii by the larger side', () => {
        const out = new Float32Array(4);

        radial([0, 0xffffff]).resolve({ x: 0, y: 0, w: 200, h: 100 }, out, 0);
        expect(out[0]).toBe(100);
        expect(out[1]).toBe(50);
        expect(out[2]).toBe(100);
    });

    it('conic gradients follow the arc they are drawn on', () => {
        const out = new Float32Array(4);

        conic([0, 0xffffff]).resolve({ x: 0, y: 0, w: 100, h: 100, start: 1, sweep: 2 }, out, 0);
        expect(out[2]).toBe(1);
        expect(out[3]).toBe(2);
    });

    it('uses the shape direction for an explicit conic sweep', () => {
        const out = new Float32Array(4);
        const frame = { x: 0, y: 0, w: 100, h: 100, sweep: -Math.PI };

        conic([0, 0xffffff], { sweep: 2, sweepDirection: 'shape' }).resolve(frame, out, 0);
        expect(out[3]).toBe(-2);
    });

    it('keeps the explicit conic sweep sign in fixed mode', () => {
        const out = new Float32Array(4);
        const frame = { x: 0, y: 0, w: 100, h: 100, sweep: -Math.PI };

        conic([0, 0xffffff], { sweep: 2, sweepDirection: 'fixed' }).resolve(frame, out, 0);
        expect(out[3]).toBe(2);
    });
});

describe('GradientAtlas', () => {
    it('uploads the baked (already premultiplied) ramps without premultiplying them again', () => {
        // premultiply-on-upload darkened translucent ramps in Chrome and made WebKit reject the
        // half-float upload, which dropped every SilkGraphics draw in Safari
        expect(new GradientAtlas().source.alphaMode).toBe('premultiplied-alpha');
    });
});
