import { BufferImageSource } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import { createSilkShader } from '../src/shader';
import { silkGpu } from '../src/shader-slot';
import { enableWebGPU } from '../src/webgpu';

const settings = { dither: 0, aaWidth: 1, minStrokePx: 0 };
const polys = () =>
    new BufferImageSource({ resource: new Float32Array(4), width: 1, height: 1, format: 'rgba32float' });
/** Group and binding of every resource, as Pixi laid the shader out. */
const layout = (shader: ReturnType<typeof createSilkShader>) =>
    (shader as unknown as { _uniformBindMap: Record<string, Record<string, string>> })._uniformBindMap;

describe('SilkGraphics shader layout', () => {
    afterEach(() => {
        silkGpu.program = null;
    });

    // Pixi's WebGL shader system caches the uniform sync code per GL program and reuses it for every
    // shader of that program. A shader made before enableWebGPU() and one made after must therefore lay
    // their resources out in the same groups, or the second one reads a group that does not exist
    // ("Cannot read properties of undefined (reading 'resources')"), as on a page with a WebGL app made
    // before a WebGPU one.
    it('puts the resources in the same groups before and after enableWebGPU', () => {
        const before = createSilkShader(settings, polys());

        enableWebGPU();
        const after = createSilkShader(settings, polys());

        expect(after.gpuProgram).not.toBeNull();
        expect(before.glProgram).toBe(after.glProgram);
        expect(layout(before)[2]).toEqual(layout(after)[2]);
        expect(Object.keys(before.groups).sort()).toEqual(Object.keys(after.groups).sort());
    });
});
