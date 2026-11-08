import { silkGpu } from './shader-slot';
import { createSilkGpuProgram } from './shader-wgsl';

/**
 * Lets SilkGraphics render with Pixi's WebGPU renderer. It installs the WGSL version of the
 * shader, which lives in this module so that WebGL2 apps never download it.
 *
 * {@link createSilkApp} calls it for you when Pixi picks WebGPU. If you create the Pixi
 * application yourself, call it once before you create any SilkGraphics. Objects created before
 * the call have no WebGPU program, and Pixi skips them with a warning.
 *
 * @example
 * ```ts
 * import { Application } from 'pixi.js';
 * import { SilkGraphics } from 'pixi-silk';
 * import { enableWebGPU } from 'pixi-silk/webgpu';
 *
 * const app = new Application();
 * await app.init({ preference: 'webgpu' });
 * enableWebGPU();
 * app.stage.addChild(new SilkGraphics().circle(50, 50, 40).fill(0x30d158));
 * ```
 */
export function enableWebGPU(): void {
    silkGpu.program ??= createSilkGpuProgram();
}

/** Whether {@link enableWebGPU} has run, so new SilkGraphics carry a WebGPU program. */
export function isWebGPUEnabled(): boolean {
    return silkGpu.program !== null;
}
