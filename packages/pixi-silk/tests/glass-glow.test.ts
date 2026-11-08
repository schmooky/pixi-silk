import { describe, expect, it } from 'vitest';
import { GLASS_DEFAULTS, Glass, lightVector, resolveGlass } from '../src/glass';
import { glassFragment } from '../src/glass/GlassFilter';
import { glassWgsl } from '../src/glass/glass-wgsl';
import { Aurora, auroraBlobs, fan, Glow, hexLabel, neon, rayQuad, SPECTRUM, shadowStack, spectrum } from '../src/glow';

describe('glass options', () => {
    it('fills defaults and clamps ranges', () => {
        const r = resolveGlass({ dispersion: 3, frost: -1, opacity: 2, tint: 0xff0000, blur: -5 });

        expect(r.dispersion).toBe(1);
        expect(r.frost).toBe(0);
        expect(r.opacity).toBe(1);
        expect(r.blur).toBe(0);
        expect(r.tint).toEqual([1, 0, 0]);
        expect(r.radius).toBe(GLASS_DEFAULTS.radius);
    });

    it('points the light vector where the angle says', () => {
        const [x, y] = lightVector(-Math.PI / 2);

        expect(x).toBeCloseTo(0);
        expect(y).toBeCloseTo(-1);
    });

    it('builds a pane, resizes it and restyles it', () => {
        const glass = new Glass({ width: 200, height: 120, blur: 30 });

        glass.resize(300, 180).set({ refraction: 4 });
        expect([glass.paneWidth, glass.paneHeight]).toEqual([300, 180]);
        expect(glass.style).toMatchObject({ blur: 30, refraction: 4 });
        expect(glass.content.parent).toBe(glass);
    });

    it('hands the world rotation and the scale of each axis to the filter', () => {
        const glass = new Glass({ width: 200, height: 100, radius: 20 });
        const filter = (
            glass as unknown as { _filter: { resources: Record<string, { uniforms: Record<string, Float32Array> }> } }
        )._filter;
        const u = filter.resources.glassUniforms.uniforms;

        glass.rotation = Math.PI / 6;
        glass.scale.set(2, 0.5);
        glass.updateLocalTransform();
        const body = glass.children[1];

        body.worldTransform.copyFrom(glass.localTransform);
        (glass as unknown as { _sync(r: unknown): void })._sync({ name: 'webgpu', renderTarget: {} });
        expect(u.uFrame[0]).toBeCloseTo(Math.cos(Math.PI / 6));
        expect(u.uFrame[1]).toBeCloseTo(Math.sin(Math.PI / 6));
        expect([...u.uShape.slice(0, 3)]).toEqual([200, 25, 10]);
    });

    it('rotates the shape in both shader twins', () => {
        expect(glassFragment).toContain('uniform vec4 uFrame;');
        expect(glassWgsl).toContain('uFrame: vec4<f32>,');
    });
});

describe('glow', () => {
    it('draws one graphics per pass, with the pass blend mode', () => {
        const glow = new Glow({ draw: (g) => g.circle(0, 0, 40), layers: neon(0xffd60a, { size: 80 }) });

        expect(glow.passes.length).toBe(7);
        expect(glow.passes[0].blendMode).toBe('add');
        // the core: its fill plus the pale inner shadow
        expect(glow.passes[4].blendMode).toBe('normal');
        expect(glow.passes[4].primitiveCount).toBe(2);
        glow.setLayers(neon(0xff0000).slice(0, 2));
        expect(glow.passes.length).toBe(2);
    });

    it('stacks CSS-style shadows with half the blur as sigma', () => {
        const layers = shadowStack();

        expect(layers).toHaveLength(3);
        expect(layers[2].fill).toMatchObject({ blur: 64, spread: 32 });
    });

    it('spreads the spectrum evenly', () => {
        const colors = spectrum(SPECTRUM.length);

        expect(colors[0]).toBe(SPECTRUM[0]);
        expect(colors.at(-1)).toBe(SPECTRUM.at(-1));
        expect(spectrum(3)).toHaveLength(3);
        expect(hexLabel(0xff3636)).toBe('#FF3636');
    });

    it('tapers rays and fans them around an angle', () => {
        const q = rayQuad({ x0: 0, y0: 0, x1: 100, y1: 0, w0: 2, w1: 20 });

        expect(q).toEqual([0, 1, 0, -1, 100, -10, 100, 10]);
        const rays = fan(0, 0, 0, Math.PI / 4, 100, 8);

        expect(rays).toHaveLength(8);
        expect(Math.atan2(rays[0].y1, rays[0].x1)).toBeLessThan(0);
        expect(Math.atan2(rays[7].y1, rays[7].x1)).toBeGreaterThan(0);
    });

    it('keeps aurora light inside its box and white at the bottom', () => {
        const blobs = auroraBlobs(3.2, 200, 400);
        const white = blobs.filter((b) => b.tone === 3);

        expect(white).toHaveLength(1);
        expect(white[0].y).toBeGreaterThan(380);
        for (const b of blobs) expect(b.x).toBeGreaterThan(-60);
    });

    it('animates while it has speed and rests when frozen', () => {
        const aurora = new Aurora({ width: 200, height: 300, ticker: null });

        expect(aurora.tick(1 / 60)).toBe(true);
        aurora.set({ speed: 0 });
        expect(aurora.tick(1 / 60)).toBe(false);
    });
});
