---
'pixi-silk': minor
---

Render on Pixi's WebGPU renderer. WebGL2 stays the default and the fallback.

- The uber shader has a WGSL port with the same shapes, strokes, dashes, effects and gradients as the GLSL one.
- `createSilkApp({ preference: 'webgpu' })` uses WebGPU where the browser has it. It loads the WGSL shader on demand, so WebGL2 apps do not download it.
- `pixi-silk/webgpu` exports `enableWebGPU()` for apps that create the Pixi application themselves.
- `Glass` now frosts the backdrop on WebGPU too, instead of drawing a plain fill.
