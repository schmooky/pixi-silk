---
"pixi-silk": patch
---

`createSilkApp({ preference: 'webgpu' })` retries on WebGL2 when WebGPU is offered but fails to start, and logs a warning, instead of rejecting.
