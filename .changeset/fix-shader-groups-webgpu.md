---
"pixi-silk": patch
---

SilkGraphics drawn by a WebGL renderer no longer fail after `enableWebGPU()` runs. The error read "Cannot read properties of undefined (reading 'resources')", on a page that started a WebGL app and then a WebGPU one. Shaders made before and after it now lay their resources out the same way, which Pixi's cached uniform sync code relies on.
