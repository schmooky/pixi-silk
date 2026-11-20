---
"pixi-silk": minor
---

WebGL1 support as an opt-in: `enableWebGL1` from the new `pixi-silk/webgl1` entry point, or `createSilkApp({ webgl1: enableWebGL1 })`. When Pixi falls back to a WebGL1 context, SilkGraphics, SilkText and Glass draw with GLSL ES 1.00 shaders built from the WebGL2 sources. Apps without the import do not ship them. On WebGL1 nothing batches, and paths past 4096 edges draw in part with a warning. Without the opt-in, `createSilkApp` now logs an error on WebGL1 instead of failing to compile the shader.
