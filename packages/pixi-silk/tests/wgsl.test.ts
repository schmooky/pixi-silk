import { BufferImageSource } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { minifyGlsl } from '../build/glsl';
import { CAP0_SHIFT, CAP1_SHIFT, Extend, Flag, GradKind, INSTANCE_ATTRIBUTES, Prim } from '../src/constants';
import { GlassFilter, glassFragment } from '../src/glass/GlassFilter';
import { glassWgsl } from '../src/glass/glass-wgsl';
import { SilkGraphics } from '../src/SilkGraphics';
import { createSilkShader, fragment, vertex } from '../src/shader';
import { silkGpu } from '../src/shader-slot';
import { createSilkGpuProgram, wgsl } from '../src/shader-wgsl';
import { enableWebGPU, isWebGPUEnabled } from '../src/webgpu';

/*
 * No GPU in node: these are consistency checks between the GLSL program (the reference) and its
 * WGSL port. `scripts/check-wgsl.mjs` compiles both WGSL programs on a real WebGPU device.
 */

const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, '');
const numbers = (src: string, pattern: RegExp) =>
    [...new Set([...strip(src).matchAll(pattern)].map((m) => Number(m[1])))].sort((a, b) => a - b);
const glsl = `${vertex}\n${fragment}`;

describe('WGSL port of the uber program', () => {
    it('has a branch for every primitive the GLSL program has', () => {
        const fromGlsl = numbers(glsl, /\btype == (\d+)/g);
        const fromWgsl = numbers(wgsl, /\bprim == (\d+)/g);

        expect(fromWgsl).toEqual(fromGlsl);
        // every primitive is drawn: Poly and the closed shapes go through closedSD
        for (const id of Object.values(Prim)) expect(fromWgsl).toContain(id);
    });

    it('tests the same flag bits, cap shifts, gradient kinds and extend modes', () => {
        const flagsGlsl = numbers(glsl, /flags & (\d+)\)/g);

        expect(numbers(wgsl, /flags & (\d+)\)/g)).toEqual(flagsGlsl);
        for (const bit of Object.values(Flag)) expect(flagsGlsl).toContain(bit);
        expect(numbers(wgsl, /flags >> (\d+)u\)/g)).toEqual([CAP0_SHIFT, CAP1_SHIFT]);
        expect(numbers(wgsl, /\bkind == (\d+)/g)).toEqual(numbers(glsl, /\bkind == (\d+)/g));
        expect(numbers(wgsl, /\bkind == (\d+)/g)).toEqual(
            Object.values(GradKind)
                .filter((k) => k !== GradKind.None && k !== GradKind.Path)
                .sort(),
        );
        expect(numbers(wgsl, /\bext == (\d+)/g)).toEqual([Extend.Repeat, Extend.Reflect]);
        expect(numbers(wgsl, /\bcap0? == (\d+)/g)).toEqual(numbers(glsl, /\bcap0? == (\d+)/g));
    });

    it('ports every GLSL function', () => {
        const fromGlsl = [...strip(fragment).matchAll(/^(?:float|vec2|vec4) (\w+)\(/gm)].map((m) => m[1]);
        const fromWgsl = [...strip(wgsl).matchAll(/^fn (\w+)\(/gm)].map((m) => m[1]);

        expect(fromGlsl.length).toBeGreaterThan(15);
        for (const name of fromGlsl) expect(fromWgsl).toContain(name);
    });

    it('reads the instance attributes at the locations Pixi gives them', () => {
        const program = createSilkGpuProgram();
        const attributes = Object.entries(program.attributeData)
            .sort(([, a], [, b]) => (a.location ?? 0) - (b.location ?? 0))
            .map(([name, a]) => [name, a.format]);

        expect(attributes).toEqual([
            ['aCorner', 'float32x2'],
            ...INSTANCE_ATTRIBUTES.map((name) => [name, 'float32x4']),
        ]);
        // same names as the GLSL inputs
        expect(attributes.map(([name]) => name)).toEqual(
            [...strip(vertex).matchAll(/^in vec\d (\w+);/gm)].map((m) => m[1]),
        );
    });

    it('passes the same varyings from vertex to fragment', () => {
        const outs = [...strip(vertex).matchAll(/out (?:float|vec\d) (\w+);/g)].map((m) => m[1]).sort();
        const vsOut = /struct VSOut \{([^}]*)\}/.exec(wgsl)?.[1] ?? '';
        const fields = [...vsOut.matchAll(/@location\(\d+\)(?: @interpolate\(flat\))? (\w+):/g)].map((m) => m[1]);

        expect(fields.sort()).toEqual(outs);
        // flat in GLSL, flat in WGSL
        const flat = [...strip(vertex).matchAll(/flat out vec4 (\w+);/g)].map((m) => m[1]).sort();

        expect([...vsOut.matchAll(/@interpolate\(flat\) (\w+):/g)].map((m) => m[1]).sort()).toEqual(flat);
    });

    it('uses the mesh bind group layout, so Pixi assigns the global and local uniforms', () => {
        const program = createSilkGpuProgram();
        const groups = program.structsAndGroups.groups.map((g) => `${g.group}/${g.binding} ${g.name}`);

        expect(groups).toEqual([
            '0/0 globalUniforms',
            '1/0 localUniforms',
            '2/0 silkUniforms',
            '2/1 uGradients',
            '2/2 uPolys',
        ]);
        expect(program.autoAssignGlobalUniforms).toBe(true);
        expect(program.autoAssignLocalUniforms).toBe(true);
        // RGBA32F is not filterable on WebGPU without an optional feature
        const textures = program.gpuLayout[2].filter((e) => e.texture);

        expect(textures.map((e) => e.texture?.sampleType)).toEqual(['unfilterable-float', 'unfilterable-float']);
        // the uniform names match the GLSL ones
        for (const name of [...strip(glsl).matchAll(/uniform (?:mat3|vec\d) (\w+);/g)].map((m) => m[1])) {
            expect(wgsl).toMatch(new RegExp(`\\b${name}: `));
        }
        // derivatives come before the first branch of the fragment entry
        const main = wgsl.slice(wgsl.indexOf('fn mainFragment('));

        expect(main.indexOf('dpdy(')).toBeLessThan(main.indexOf('if ('));
    });

    it('survives the build minifier token for token', () => {
        const words = (src: string) => strip(src).split(/\s+/).filter(Boolean);

        expect(words(minifyGlsl(wgsl))).toEqual(words(wgsl));
        expect(words(minifyGlsl(glassWgsl))).toEqual(words(glassWgsl));
    });

    it('balances its brackets', () => {
        for (const src of [wgsl, glassWgsl]) {
            const s = strip(src);

            for (const [open, close] of ['()', '{}', '[]']) {
                expect(s.split(open).length).toBe(s.split(close).length);
            }
        }
    });
});

describe('WebGPU installation', () => {
    it('adds the WGSL program next to the GLSL one, with every resource bound by name', () => {
        const polys = new BufferImageSource({
            resource: new Float32Array(4),
            width: 1,
            height: 1,
            format: 'rgba32float',
        });
        const before = createSilkShader({ dither: 1, aaWidth: 1, minStrokePx: 1 }, polys);

        expect(before.gpuProgram).toBeFalsy();
        expect(before.glProgram).toBeTruthy();

        enableWebGPU();
        expect(isWebGPUEnabled()).toBe(true);
        expect(silkGpu.program).toBe(createSilkGpuProgram());

        const shader = createSilkShader({ dither: 1, aaWidth: 1, minStrokePx: 1 }, polys);

        expect(shader.gpuProgram).toBe(silkGpu.program);
        expect(shader.glProgram).toBe(before.glProgram);
        // no resource falls into Pixi's catch-all group 99: all of them have a WGSL binding
        expect(Object.keys(shader.groups)).toEqual(['2']);
        expect(Object.keys(shader.groups[2].resources)).toEqual(['0', '1', '2']);

        // a SilkGraphics made now carries both programs and still finds its uniforms
        const g = new SilkGraphics().circle(0, 0, 10).fill(0xffffff);

        expect(g.shader?.gpuProgram).toBe(silkGpu.program);
        g.aaWidth = 2;
        expect(g.aaWidth).toBe(2);
    });
});

describe('WGSL port of the glass filter', () => {
    it('has a WebGPU program bound to the filter globals, the back texture and its own uniforms', () => {
        const filter = new GlassFilter();
        const groups = filter.gpuProgram.structsAndGroups.groups.map((g) => `${g.group}/${g.binding} ${g.name}`);

        expect(groups).toEqual(['0/0 gfu', '0/1 uTexture', '0/2 uSampler', '0/3 uBackTexture', '1/0 glassUniforms']);
        expect(filter.blendRequired).toBe(true);
        for (const name of [...glassFragment.matchAll(/uniform vec4 (u\w+);/g)].map((m) => m[1])) {
            expect(glassWgsl).toMatch(new RegExp(`\\b${name}: vec4<f32>`));
        }
    });
});
