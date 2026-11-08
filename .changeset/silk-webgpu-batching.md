---
"pixi-silk": minor
---

`enableSilkBatching()` batches on WebGPU too. Runs of SilkGraphics share one draw call under Pixi's WebGPU renderer, with the same packing as on WebGL2 and the same pixels. It needs the WGSL shader from `enableWebGPU()`, which `createSilkApp` loads for you.
