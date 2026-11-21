import type { Geometry, GlProgram, GpuProgram, Shader } from 'pixi.js';

/**
 * @internal Where the WebGPU program of the uber shader goes once `pixi-silk/webgpu` installs it.
 * The WGSL source lives in its own module, so apps that render with WebGL2 never download it.
 * `createSilkShader` reads the slot when a SilkGraphics is created.
 */
export const silkGpu: { program: GpuProgram | null } = { program: null };

/**
 * @internal What `pixi-silk/webgl1` installs: GLSL ES 1.00 programs and the per-object state they
 * need. The core reads it and never imports the WebGL1 sources, so apps without the opt-in do not
 * ship them. While it is set, every new SilkGraphics, SilkText and GlassFilter uses these programs.
 */
export interface SilkGl1 {
    /**
     * The WebGL1 version of a program, from its GLSL ES 3.00 stages, built once per name. The core
     * passes its own sources, so this module never imports text or glass. The uber program
     * (`silk-sdf`) reads each instance from `uInstances` instead of from varyings.
     */
    program(name: string, vertex: string, fragment: string): GlProgram;
    /**
     * Extra resources of a shader that uses {@link SilkGl1.program} `name` (call that first): the
     * size uniforms of the textures it samples, and for `silk-sdf` the instance texture.
     */
    resources(name: string): Record<string, unknown>;
    /** Adds the per-instance index attribute to a new SilkGraphics geometry. */
    attach(geometry: Geometry): void;
    /** Mirrors `count` packed instances into the instance texture and syncs the size uniforms. */
    commit(geometry: Geometry, shader: Shader, data: Float32Array, count: number): void;
    /** Copies the size of each texture a shader samples into its size uniforms. */
    syncSizes(shader: Shader): void;
    /** Frees the instance texture {@link SilkGl1.resources} made for a SilkGraphics. */
    release(shader: Shader): void;
    /**
     * Set when a WebGL1 device cannot filter half floats (no `OES_texture_half_float_linear`).
     * {@link SilkGl1.syncSizes} then switches the gradient ramps to nearest filtering, which the
     * WebGL1 programs blend themselves.
     */
    nearestRamps: boolean;
}

/** @internal Set by `enableWebGL1()` from `pixi-silk/webgl1`. */
export const silkGl1: { hooks: SilkGl1 | null } = { hooks: null };
