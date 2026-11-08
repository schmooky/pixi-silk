import { describe, expect, it } from 'vitest';
import { Flag, GradKind, STRIDE } from '../src/constants';
import { catmullRomWeights, MeshGradient, mesh, sampleMesh } from '../src/gradient';
import { SilkGraphics } from '../src/SilkGraphics';

const data = (g: SilkGraphics) => g.geometry.instanceBuffer.data as Float32Array;
const meta = (g: SilkGraphics, i: number) => Array.from(data(g).subarray(i * STRIDE + 16, i * STRIDE + 20));
const fx = (g: SilkGraphics, i: number) => Array.from(data(g).subarray(i * STRIDE + 40, i * STRIDE + 44));
const bounds = (g: SilkGraphics, i: number) => Array.from(data(g).subarray(i * STRIDE, i * STRIDE + 4));
const has = (flags: number, flag: number) => (flags & flag) !== 0;

describe('spread and blend', () => {
    it('packs the spread and grows the bounds by it', () => {
        const g = new SilkGraphics();

        g.rect(0, 0, 100, 100).fill({ color: 0xffffff, blur: 10, spread: 8 });
        expect(fx(g, 0)[0]).toBe(8);
        // 3 sigma of blur plus the spread
        expect(bounds(g, 0)).toEqual([-38, -38, 138, 138]);
    });

    it('marks plus-lighter paints additive', () => {
        const g = new SilkGraphics();

        g.circle(0, 0, 10).fill({ color: 0xffffff, blend: 'add' });
        g.circle(0, 0, 10).fill(0xffffff);
        expect(has(meta(g, 0)[1], Flag.Additive)).toBe(true);
        expect(has(meta(g, 1)[1], Flag.Additive)).toBe(false);
    });

    it('scales spread with the transform', () => {
        const g = new SilkGraphics();

        g.scaleTransform(2).rect(0, 0, 10, 10).fill({ color: 0xffffff, spread: 3 });
        expect(fx(g, 0)[0]).toBe(6);
    });
});

describe('progressive blur', () => {
    it('packs both radii and the angle, and reserves room for the larger one', () => {
        const g = new SilkGraphics();

        g.rect(0, 0, 100, 100).fill({ color: 0xffffff, blur: { from: 2, to: 20, angle: 0 } });
        const [, flags, , sigma] = meta(g, 0);
        const [, to, angle] = fx(g, 0);

        expect(has(flags, Flag.Progressive)).toBe(true);
        expect(sigma).toBe(2);
        expect(to).toBe(20);
        expect(angle).toBe(0);
        expect(bounds(g, 0)[0]).toBe(-60);
    });

    it('defaults to top to bottom', () => {
        const g = new SilkGraphics();

        g.rect(0, 0, 10, 10).fill({ color: 0xffffff, blur: { from: 0, to: 4 } });
        expect(fx(g, 0)[2]).toBeCloseTo(Math.PI / 2);
    });
});

describe('inner shadows', () => {
    const icon = (g: SilkGraphics) =>
        g.roundRect(0, 0, 400, 400, 80).fill({
            color: 0x0a0909,
            innerShadow: [
                { color: 0x144ccd, x: 0, y: -80, blur: 60, spread: -30 },
                { color: 0x6694ff, alpha: 0.5, x: 0, y: -40, blur: 30, spread: -8 },
                { color: 0xffffff, alpha: 0.4, x: 0, y: -20, blur: 20, spread: -6, blend: 'add' },
                { color: 0x2365ff, alpha: 0.15, x: 0, y: 6, blur: 6, spread: -2 },
            ],
        });

    it('adds one instance per shadow after the fill, in order', () => {
        const g = icon(new SilkGraphics());

        expect(g.primitiveCount).toBe(5);
        for (let i = 1; i < 5; i++) expect(has(meta(g, i)[1], Flag.Inner)).toBe(true);
        expect(has(meta(g, 0)[1], Flag.Inner)).toBe(false);
        expect(meta(g, 1)[3]).toBe(60);
        expect(fx(g, 1)[0]).toBe(-30);
        // offset in aStroke.xy
        expect(Array.from(data(g).subarray(STRIDE + 24, STRIDE + 26))).toEqual([0, -80]);
        expect(has(meta(g, 3)[1], Flag.Additive)).toBe(true);
        // shadow colour is premultiplied
        expect(data(g)[2 * STRIDE + 23]).toBeCloseTo(0.5);
    });

    it('keeps the shadows inside the shape box', () => {
        const g = icon(new SilkGraphics());

        expect(bounds(g, 1)).toEqual([0, 0, 400, 400]);
    });

    it('draws a following stroke on top of the shadows, as its own instance', () => {
        const g = new SilkGraphics();

        g.circle(0, 0, 50)
            .fill({ color: 0x000000, innerShadow: { color: 0xffffff, blur: 4 } })
            .stroke({ width: 2, color: 0xffffff });
        expect(g.primitiveCount).toBe(3);
        expect(has(meta(g, 2)[1], Flag.Stroke)).toBe(true);
        expect(has(meta(g, 2)[1], Flag.Fill)).toBe(false);
    });

    it('rotates the offset with the transform', () => {
        const g = new SilkGraphics();

        g.rotateTransform(Math.PI / 2)
            .rect(-10, -10, 20, 20)
            .fill({ color: 0, innerShadow: { y: 10 } });
        const [dx, dy] = Array.from(data(g).subarray(STRIDE + 24, STRIDE + 26));

        expect(dx).toBeCloseTo(-10);
        expect(dy).toBeCloseTo(0);
    });
});

describe('gradient mesh', () => {
    it('Catmull-Rom weights sum to one', () => {
        for (const f of [0, 0.25, 0.5, 0.9]) {
            expect(catmullRomWeights(f).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
        }
    });

    it('passes through every control value', () => {
        const values = [
            [0, 0, 0, 0],
            [1, 0, 0, 1],
            [0, 1, 0, 1],
            [0, 0, 1, 0.5],
            [1, 1, 1, 1],
            [0.5, 0.5, 0.5, 0.2],
        ];

        for (let r = 0; r < 2; r++) {
            for (let c = 0; c < 3; c++) {
                const v = sampleMesh(values, 3, 2, c, r);

                v.forEach((x, k) => expect(x).toBeCloseTo(values[r * 3 + c][k]));
            }
        }
    });

    it('is flat between equal values', () => {
        const values = Array.from({ length: 9 }, () => [0.3, 0.3, 0.3, 1]);

        expect(sampleMesh(values, 3, 3, 0.37, 1.61)[0]).toBeCloseTo(0.3);
    });

    it('bakes a 16 x 16 grid into one row and shares rows by colours', () => {
        const a = mesh(2, 2, [0xff0000, 0x00ff00, 0x0000ff, [0xffffff, 0]]);
        const b = mesh(2, 2, [0xff0000, 0x00ff00, 0x0000ff, [0xffffff, 0]]);
        const out = new Float32Array(256 * 4);

        a.bake(out);
        expect(a).toBeInstanceOf(MeshGradient);
        expect(a.kind).toBe(GradKind.Mesh);
        expect(a.key).toBe(b.key);
        // corners are the control colours: red top-left, transparent bottom-right
        expect(out[0]).toBeCloseTo(1);
        expect(out[3]).toBeCloseTo(1);
        expect(out[255 * 4 + 3]).toBeCloseTo(0);
    });

    it('fills a shape like any gradient', () => {
        const g = new SilkGraphics();

        g.rect(10, 20, 100, 50).fill(mesh(2, 2, [0xffffff, 0x000000, 0x000000, 0xffffff]));
        const o = 0;

        expect(data(g)[o + 32]).toBe(GradKind.Mesh);
        expect(Array.from(data(g).subarray(o + 28, o + 32))).toEqual([10, 20, 110, 70]);
    });
});
