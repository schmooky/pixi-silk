import { Buffer, BufferImageSource, BufferUsage, GlProgram, type TextureSource, UniformGroup } from 'pixi.js';
import { INSTANCE_ATTRIBUTES, Prim, STRIDE } from '../constants';
import { type SilkGl1, silkGpu } from '../shader-slot';
import {
    GL1_MAX_EDGES,
    GL1_MAX_WINDOWS,
    GL1_VERTEX_ATTRIBUTES,
    gl1Sources,
    INSTANCE_TEXTURE_WIDTH,
    INSTANCES_PER_ROW,
} from './programs';

// offsets in one packed instance (see INSTANCE_ATTRIBUTES): aShape0 is texel 1, aMeta texel 4
const SHAPE0 = 4;
const META = 16;

function dataTexture(label: string): BufferImageSource {
    return new BufferImageSource({
        resource: new Float32Array(INSTANCE_TEXTURE_WIDTH * 4),
        width: INSTANCE_TEXTURE_WIDTH,
        height: 1,
        format: 'rgba32float',
        alphaMode: 'premultiplied-alpha',
        scaleMode: 'nearest',
        autoGenerateMipmaps: false,
        label,
    });
}

function ascending(n: number): Float32Array {
    const a = new Float32Array(n);

    for (let i = 0; i < n; i++) a[i] = i;

    return a;
}

/** @internal Shapes past the WebGL1 loop caps, reported once per page. */
const warned = { caps: false };

/** @internal Warns once when an instance needs more loop iterations than the WebGL1 shader runs. */
export function checkCaps(data: Float32Array, count: number): void {
    if (warned.caps) return;
    for (let i = 0; i < count; i++) {
        const o = i * STRIDE;
        const type = data[o + META];
        const a = data[o + SHAPE0 + 1];
        const over =
            ((type === Prim.Poly || type === Prim.Union) && a > GL1_MAX_EDGES) ||
            (type === Prim.Path && a + data[o + SHAPE0 + 2] > GL1_MAX_WINDOWS);

        if (over) {
            warned.caps = true;
            console.warn(
                `pixi-silk: a path is too long for WebGL1 (over ${GL1_MAX_EDGES} edges or ${GL1_MAX_WINDOWS} stroke windows) and draws in part. Split it into several paths.`,
            );

            return;
        }
    }
}

/** @internal Builds the hooks `enableWebGL1()` installs in the slot. */
export function createGl1Hooks(): SilkGl1 {
    const programs = new Map<string, { program: GlProgram; sized: string[] }>();

    const hooks: SilkGl1 = {
        program(name, vertex, fragment) {
            let entry = programs.get(name);

            if (!entry) {
                const s = gl1Sources(name, vertex, fragment);

                entry = {
                    program: GlProgram.from({
                        vertex: s.vertex.source,
                        fragment: s.fragment.source,
                        name: `${name}-gl1`,
                        preferredVertexPrecision: 'highp',
                        preferredFragmentPrecision: 'highp',
                    }),
                    sized: [...new Set([...s.vertex.sized, ...s.fragment.sized])],
                };
                programs.set(name, entry);
            }

            return entry.program;
        },

        resources(name) {
            const sized = programs.get(name)?.sized ?? [];
            const uniforms: Record<string, { value: Float32Array; type: 'vec2<f32>' }> = {};

            for (const s of sized) uniforms[`${s}Size`] = { value: new Float32Array([1, 1]), type: 'vec2<f32>' };
            const out: Record<string, unknown> = { gl1Sizes: new UniformGroup(uniforms) };

            if (name === 'silk-sdf') out.uInstances = dataTexture('silk-instances-gl1');

            return out;
        },

        attach(geometry) {
            // the fragment stage reads the rest from uInstances. Pixi warns about every geometry
            // attribute a program lacks, so drop them, unless WebGPU (which reads them all) is on too.
            if (silkGpu.program === null) {
                for (const name of INSTANCE_ATTRIBUTES) {
                    if (!GL1_VERTEX_ATTRIBUTES.has(name)) delete geometry.attributes[name];
                }
            }
            geometry.addAttribute('aIndex', {
                buffer: new Buffer({
                    data: ascending(32),
                    usage: BufferUsage.VERTEX | BufferUsage.COPY_DST,
                    label: 'silk-index-gl1',
                }),
                format: 'float32',
                stride: 4,
                offset: 0,
                instance: true,
            });
        },

        commit(geometry, shader, data, count) {
            const index = geometry.attributes.aIndex?.buffer;

            if (index && (index.data as Float32Array).length < count) {
                let n = (index.data as Float32Array).length;

                while (n < count) n *= 2;
                index.data = ascending(n);
            }
            const src = shader.resources.uInstances as BufferImageSource;
            const rows = Math.max(1, Math.ceil(count / INSTANCES_PER_ROW));
            const floats = rows * INSTANCE_TEXTURE_WIDTH * 4;
            let mirror = src.resource as Float32Array;

            if (mirror.buffer.byteLength < floats * 4) mirror = new Float32Array(floats);
            else mirror = new Float32Array(mirror.buffer, 0, floats);
            mirror.set(data.subarray(0, count * STRIDE));
            src.resource = mirror;
            if (src.height !== rows) src.resize(INSTANCE_TEXTURE_WIDTH, rows);
            src.update();
            hooks.syncSizes(shader);
            checkCaps(data, count);
        },

        syncSizes(shader) {
            const ramps = shader.resources.uGradients as TextureSource | undefined;

            // the programs blend two ramp texels themselves, so nearest gives the same colours
            if (hooks.nearestRamps && ramps && ramps.style.scaleMode !== 'nearest') {
                ramps.style.scaleMode = 'nearest';
                ramps.style.update();
            }
            const group = shader.resources.gl1Sizes as UniformGroup | undefined;

            if (!group) return;
            let changed = false;

            for (const key of Object.keys(group.uniforms)) {
                const src = shader.resources[key.slice(0, -4)] as TextureSource | undefined;
                const v = group.uniforms[key] as Float32Array;

                if (!src || (v[0] === src.pixelWidth && v[1] === src.pixelHeight)) continue;
                v[0] = src.pixelWidth;
                v[1] = src.pixelHeight;
                changed = true;
            }
            if (changed) group.update();
        },

        release(shader) {
            (shader.resources.uInstances as TextureSource | undefined)?.destroy();
        },

        nearestRamps: false,
    };

    return hooks;
}
