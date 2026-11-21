import {
    type BufferImageSource,
    GlTextureSystem,
    mapFormatToGlFormat,
    mapFormatToGlInternalFormat,
    mapFormatToGlType,
    type Renderer,
    type Shader,
    type TextureSource,
} from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { minifyGlsl } from '../build/glsl';
import { INSTANCE_ATTRIBUTES, Prim, STRIDE } from '../src/constants';
import { glassFragment, glassVertex } from '../src/glass/GlassFilter';
import { SilkGraphics } from '../src/SilkGraphics';
import { fragment, vertex } from '../src/shader';
import { silkGl1 } from '../src/shader-slot';
import { textFragment, textVertex } from '../src/text/shader';
import { enableWebGL1, isWebGL1, isWebGL1Enabled } from '../src/webgl1';
import { normalizeGlsl, rewriteCalls, toGlsl100 } from '../src/webgl1/glsl100';
import { checkCaps, createGl1Hooks } from '../src/webgl1/hooks';
import {
    GL1_MAX_EDGES,
    gl1Sources,
    INSTANCE_TEXTURE_WIDTH,
    INSTANCES_PER_ROW,
    TEXELS_PER_INSTANCE,
} from '../src/webgl1/programs';

/*
 * No GPU in node: these check the GLSL ES 1.00 conversion (every patch still applies, nothing that
 * WebGL1 lacks is left) and the per-object state. `scripts/check-render.mjs --renderer=webgl1`
 * compiles and draws the programs on a real WebGL1 context.
 */

const programs = {
    'silk-sdf': [vertex, fragment],
    'silk-text': [textVertex, textFragment],
    'silk-glass': [glassVertex, glassFragment],
} as const;

const varyings = (src: string) => [...src.matchAll(/^varying (\w+) (\w+);/gm)].map((m) => m[2]);
const attributes = (src: string) => [...src.matchAll(/^attribute (\w+) (\w+);/gm)].map((m) => m[2]);

afterEach(() => {
    silkGl1.hooks = null;
});

describe('GLSL ES 1.00 conversion', () => {
    for (const [name, [v, f]] of Object.entries(programs)) {
        it(`converts ${name} with nothing left that WebGL1 lacks`, () => {
            const s = gl1Sources(name, v, f);

            for (const src of [s.vertex.source, s.fragment.source]) {
                expect(src).not.toMatch(/#version|texelFetch|textureSize|textureLod|\bflat\b|finalColor/);
                expect(src).not.toMatch(/^(in|out) /m);
            }
            // the vertex and fragment stages agree on their varyings
            expect(varyings(s.fragment.source).sort()).toEqual(varyings(s.vertex.source).sort());
        });

        it(`gives the same ${name} program from the source and from the published (minified) source`, () => {
            expect(gl1Sources(name, minifyGlsl(v), minifyGlsl(f))).toEqual(gl1Sources(name, v, f));
        });
    }

    it('normalizes like the build minifier', () => {
        for (const src of [vertex, fragment, textFragment, glassFragment])
            expect(normalizeGlsl(src)).toBe(minifyGlsl(src));
    });

    it('keeps the uber program within the WebGL1 minimums: 8 varyings, 8 attributes', () => {
        const s = gl1Sources('silk-sdf', vertex, fragment);

        expect(varyings(s.vertex.source)).toEqual(['vPos', 'vIndex', 'vProg']);
        expect(attributes(s.vertex.source).length).toBeLessThanOrEqual(8);
        expect(attributes(s.vertex.source)).toContain('aIndex');
        expect(s.fragment.sized.sort()).toEqual(['uGradients', 'uInstances', 'uPolys']);
        // every instance attribute but the bounds is read back in the fragment stage
        for (const [i, a] of INSTANCE_ATTRIBUTES.entries()) {
            if (a !== 'aBounds') expect(s.fragment.source).toContain(`v${a.slice(1)} = instanceTexel(${i});`);
        }
        expect(s.fragment.source).toMatch(/^precision highp float;\n#extension GL_OES_standard_derivatives : enable\n/);
    });

    it('blends gradient ramps in the shader, so nearest filtering gives the linear result', () => {
        for (const name of ['silk-sdf', 'silk-text'] as const) {
            const [v, f] = programs[name];
            const { source } = gl1Sources(name, v, f).fragment;

            expect(source).toContain('vec4 rampLinear(float t, float row)');
            expect(source).not.toMatch(/texture2D\(uGradients, vec2\(\(t \* 255/);
            expect(source).toMatch(/rampLinear\(t, [uv]Paint\.y\)/);
        }
    });

    it('rewrites flag tests, cap fields and int modulo', () => {
        const { source } = toGlsl100(
            'uniform float u;\nvoid main(void)\n{\nint flags = 1;\nbool a = (flags & 16) != 0;\nbool b = (flags & 32) == 0;\nint c = (flags >> 8) & 3;\nint d = (c % 4 + 4) % 4;\n}',
            'vertex',
        );

        expect(source).toContain('bool a = bitSet(flags, 16.0);');
        expect(source).toContain('bool b = !bitSet(flags, 32.0);');
        expect(source).toContain('int c = bitsAt(flags, 256.0, 4.0);');
        expect(source).toContain('int d = imod(imod(c, 4) + 4, 4);');
    });

    it('caps loops whose bound is not a constant, and throws on a loop with no cap', () => {
        const src =
            'uniform float u;\nvoid main(void)\n{\nint n = 3;\nfor (int i = 0; i < n; i++)\n{\n}\nfor (int j = 0; j < 4; j++)\n{\n}\n}';

        expect(toGlsl100(src, 'vertex', { caps: { n: 16 } }).source).toContain(
            'for (int i_gl1 = 0; i_gl1 < 16; i_gl1++)\n{\nint i = 0 + i_gl1;\nif (i >= n) break;',
        );
        expect(() => toGlsl100(src, 'vertex')).toThrow(/no cap/);
        expect(() => toGlsl100(src, 'vertex', { caps: { n: 16, m: 4 } })).toThrow(/matches no loop/);
    });

    it('throws when a patch no longer matches', () => {
        expect(() => toGlsl100('uniform float u;', 'vertex', { patches: [{ find: 'gone', replace: '' }] })).toThrow(
            /no longer matches/,
        );
    });

    it('splits call arguments at the top level only', () => {
        expect(rewriteCalls('a(f(x, y), vec2(1.0, 2.0))', 'a', (args) => args.join('|'))).toBe(
            'f(x, y)|vec2(1.0, 2.0)',
        );
    });
});

interface FakeDevice {
    floatTexture?: boolean;
    halfFloatLinear?: boolean;
    derivatives?: boolean;
    highp?: boolean;
    tables?: boolean;
}

function fakeRenderer(version: 1 | 2, device: FakeDevice = {}): Renderer & { formats: Record<string, number> } {
    const { floatTexture = true, halfFloatLinear = true, derivatives = true, highp = true, tables = true } = device;
    const formats: Record<string, number> = { rgba32float: 0 };
    const gl = {
        RGBA: 6408,
        LUMINANCE: 6409,
        FRAGMENT_SHADER: 1,
        HIGH_FLOAT: 2,
        getExtension: vi.fn((name: string) => (name === 'OES_standard_derivatives' && !derivatives ? null : {})),
        getShaderPrecisionFormat: () => ({ precision: highp ? 23 : 0 }),
    };

    return {
        name: 'webgl',
        gl,
        formats,
        context: {
            webGLVersion: version,
            extensions: {
                floatTexture: floatTexture ? {} : null,
                textureHalfFloat: {},
                textureHalfFloatLinear: halfFloatLinear ? {} : null,
            },
        },
        texture: tables ? { _mapFormatToInternalFormat: formats, _mapFormatToFormat: {}, _mapFormatToType: {} } : {},
        runners: { contextChange: { add: vi.fn() } },
    } as unknown as Renderer & { formats: Record<string, number> };
}

describe('enableWebGL1', () => {
    it('does nothing on WebGL2', () => {
        const r = fakeRenderer(2);

        expect(isWebGL1(r)).toBe(false);
        expect(enableWebGL1(r)).toBe(false);
        expect(isWebGL1Enabled()).toBe(false);
    });

    it('installs the hooks and fixes the float texture format on WebGL1', () => {
        const r = fakeRenderer(1);

        expect(enableWebGL1(r)).toBe(true);
        expect(isWebGL1Enabled()).toBe(true);
        expect(r.formats).toMatchObject({ rgba32float: 6408, rgba16float: 6408, r8unorm: 6409 });
        expect(
            (r as unknown as { gl: { getExtension: ReturnType<typeof vi.fn> } }).gl.getExtension,
        ).toHaveBeenCalledWith('OES_standard_derivatives');
    });

    it('refuses a WebGL1 device without float textures', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});

        expect(enableWebGL1(fakeRenderer(1, { floatTexture: false }))).toBe(false);
        expect(isWebGL1Enabled()).toBe(false);
        expect(error).toHaveBeenCalledOnce();
        error.mockRestore();
    });

    // the programs declare highp ints, floats and samplers: without highp they do not compile
    for (const [lack, device] of [
        ['highp', { highp: false }],
        ['OES_standard_derivatives', { derivatives: false }],
        ['format tables', { tables: false }],
    ] as const) {
        it(`refuses a WebGL1 device or Pixi without ${lack}`, () => {
            const error = vi.spyOn(console, 'error').mockImplementation(() => {});

            expect(enableWebGL1(fakeRenderer(1, device))).toBe(false);
            expect(isWebGL1Enabled()).toBe(false);
            expect(error).toHaveBeenCalledOnce();
            error.mockRestore();
        });
    }

    it('switches the gradient ramps to nearest filtering without OES_texture_half_float_linear', () => {
        expect(enableWebGL1(fakeRenderer(1))).toBe(true);
        expect(silkGl1.hooks?.nearestRamps).toBe(false);
        expect(enableWebGL1(fakeRenderer(1, { halfFloatLinear: false }))).toBe(true);
        expect(silkGl1.hooks?.nearestRamps).toBe(true);

        const g = new SilkGraphics();

        g.circle(0, 0, 2).fill(0xffffff);
        const ramps = (g.shader as Shader).resources.uGradients as TextureSource;

        expect(ramps.style.scaleMode).toBe('nearest');
        ramps.style.scaleMode = 'linear';
        g.destroy();
    });
});

describe("Pixi's private format tables", () => {
    // enableWebGL1 edits these: a Pixi release that renames them must fail here, not on a device
    it('still exist on GlTextureSystem and hold the formats silk patches', () => {
        // contextChange builds the tables (protected in the types, so read it through a cast)
        const source = String((GlTextureSystem.prototype as unknown as { contextChange: () => void }).contextChange);

        for (const field of ['_mapFormatToInternalFormat', '_mapFormatToFormat', '_mapFormatToType'])
            expect(source).toContain(field);
        // a WebGL1 context: the class Pixi's adapter tests for, with every GL constant set
        class WebGLRenderingContext {}
        vi.stubGlobal('WebGLRenderingContext', WebGLRenderingContext);
        const gl = new Proxy(new WebGLRenderingContext(), { get: () => 1 });
        const tables = [
            mapFormatToGlInternalFormat(gl as WebGL2RenderingContext, {} as never),
            mapFormatToGlFormat(gl as WebGL2RenderingContext),
            mapFormatToGlType(gl as WebGL2RenderingContext),
        ];

        for (const table of tables) {
            for (const format of ['rgba32float', 'rgba16float', 'r8unorm']) expect(table).toHaveProperty(format);
        }
        vi.unstubAllGlobals();
    });
});

describe('SilkGraphics with the WebGL1 hooks', () => {
    it('mirrors instances into the instance texture, one row per 64 instances', () => {
        silkGl1.hooks = createGl1Hooks();
        const g = new SilkGraphics();

        for (let i = 0; i < 70; i++) g.circle(i, 0, 2).fill(0xffffff);
        const src = (g.shader as Shader).resources.uInstances as BufferImageSource;
        const data = (g as unknown as { _f: Float32Array })._f;

        expect(TEXELS_PER_INSTANCE * 4).toBe(STRIDE);
        expect(src.width).toBe(INSTANCE_TEXTURE_WIDTH);
        expect(src.height).toBe(Math.ceil(70 / INSTANCES_PER_ROW));
        expect(Array.from((src.resource as Float32Array).subarray(0, 70 * STRIDE))).toEqual(
            Array.from(data.subarray(0, 70 * STRIDE)),
        );
        // one index per instance, and the size uniforms follow the textures
        const index = g.geometry.attributes.aIndex.buffer.data as Float32Array;

        expect(index.length).toBeGreaterThanOrEqual(70);
        expect(index[69]).toBe(69);
        const sizes = ((g.shader as Shader).resources.gl1Sizes as { uniforms: Record<string, Float32Array> }).uniforms;

        expect(Array.from(sizes.uInstancesSize)).toEqual([INSTANCE_TEXTURE_WIDTH, 2]);
        expect(Array.from(sizes.uGradientsSize)).toEqual([256, 256]);
        g.destroy();
        expect(src.destroyed).toBe(true);
    });

    it('leaves objects made before the hooks alone', () => {
        const g = new SilkGraphics();

        silkGl1.hooks = createGl1Hooks();
        g.circle(0, 0, 2).fill(0xffffff);
        expect((g.shader as Shader).resources.uInstances).toBeUndefined();
        expect(g.geometry.attributes.aIndex).toBeUndefined();
        g.destroy();
    });

    it('warns once about a path past the WebGL1 caps', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const data = new Float32Array(STRIDE * 2);

        data[16] = Prim.Poly;
        data[5] = GL1_MAX_EDGES + 1;
        checkCaps(data, 2);
        checkCaps(data, 2);
        expect(warn).toHaveBeenCalledOnce();
        warn.mockRestore();
    });
});
