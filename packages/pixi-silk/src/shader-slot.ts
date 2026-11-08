import type { GpuProgram } from 'pixi.js';

/**
 * @internal Where the WebGPU program of the uber shader goes once `pixi-silk/webgpu` installs it.
 * The WGSL source lives in its own module, so apps that render with WebGL2 never download it.
 * `createSilkShader` reads the slot when a SilkGraphics is created.
 */
export const silkGpu: { program: GpuProgram | null } = { program: null };
