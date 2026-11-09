---
name: pixi-silk-app-rendering
description: "Use this skill when setting up the PixiJS app for pixi-silk or tuning how it renders. Covers createSilkApp (DPR-exact canvas from devicePixelContentBoxSize, maxResolution, fixedResolution, setResolution, onResize, touchAction, destroy), using SilkGraphics in your own Application, WebGL2 versus WebGPU (preference 'webgpu', enableWebGPU from pixi-silk/webgpu), batching with enableSilkBatching and batch: false, draw calls, SilkGraphics.defaults, aaWidth, dither, minStrokePx, filter resolution, MSAA. Triggers on: createSilkApp, resolution, devicePixelRatio, DPR, retina, blurry canvas, WebGPU, WebGL2, enableWebGPU, renderer preference, enableSilkBatching, batching, draw calls, performance, antialias, MSAA."
license: MIT
---

pixi-silk anti-aliases in the shader, so the canvas needs no MSAA. It needs a canvas whose pixels map 1:1 to device pixels. `createSilkApp` sets that up. In your own `Application`, three settings matter: `antialias: false`, the device pixel ratio as `resolution`, and filters at that resolution.

## Quick Start

```ts
import { createSilkApp, SilkGraphics } from 'pixi-silk';

const silk = await createSilkApp({
    parent: document.getElementById('stage')!, // the canvas fills this element, which needs a size
    background: 0x000000,
    maxResolution: 3,
});

silk.app.stage.addChild(new SilkGraphics().circle(60, 60, 40).fill(0x30d158));
console.log(silk.width, silk.height, silk.resolution); // CSS pixels and device pixels per CSS pixel
```

## Core Patterns

### WebGPU

```ts
import { createSilkApp } from 'pixi-silk';

const silk = await createSilkApp({ parent: document.body, preference: 'webgpu' });

silk.app.renderer.name; // 'webgpu', or 'webgl' where the browser has no WebGPU
```

`createSilkApp` loads the WGSL shader on demand when Pixi picks WebGPU. WebGL2 apps never download it.

### Your own Application

```ts
import { Application, Filter } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { enableWebGPU } from 'pixi-silk/webgpu';

const own = new Application();

await own.init({ preference: 'webgpu', antialias: false, autoDensity: true, resolution: window.devicePixelRatio });
enableWebGPU(); // before the first SilkGraphics; harmless on WebGL2
Filter.defaultOptions.resolution = 'inherit'; // filters at screen resolution, not 1x
own.stage.addChild(new SilkGraphics().circle(60, 60, 40).fill(0x30d158));
```

### Batching

```ts
import { enableSilkBatching, SilkGraphics } from 'pixi-silk';

enableSilkBatching(); // before creating the objects
const dots = Array.from({ length: 500 }, (_, i) => new SilkGraphics().circle((i % 25) * 20, Math.floor(i / 25) * 20, 6).fill(0x0a84ff));
const alone = new SilkGraphics({ batch: false }); // keeps its own draw call

app.stage.addChild(...dots, alone);
```

Without batching every SilkGraphics is one draw call, whatever it holds. With it, consecutive SilkGraphics with the same blend mode and settings share one call, on WebGL2 and WebGPU. Many shapes in one SilkGraphics are one call either way.

### Per-object rendering settings

```ts
import { SilkGraphics } from 'pixi-silk';

SilkGraphics.defaults.aaWidth = 1; // for objects created after this line
const soft = new SilkGraphics({ aaWidth: 1.5, dither: 0, minStrokePx: 1 });

soft.aaWidth = 2; // device pixels of edge ramp; larger is softer
```

## Common Mistakes

### [CRITICAL] WebGPU in your own app without `enableWebGPU()`

Symptom: nothing draws on WebGPU, and Pixi warns that it skips the objects. Only `createSilkApp` installs the WGSL shader for you.

Wrong:

```ts nocheck
await app.init({ preference: 'webgpu' });
app.stage.addChild(new SilkGraphics().circle(50, 50, 40).fill(0x30d158));
```

Correct: call `enableWebGPU()` from `pixi-silk/webgpu` after `init` and before the first `new SilkGraphics()`, as in Core Patterns.

### [HIGH] Calling `enableWebGPU()` or `enableSilkBatching()` too late

Symptom: objects created before the call stay invisible on WebGPU, or keep one draw call each. Both settings apply to objects created after the call.

### [HIGH] A blurry canvas on retina screens

Symptom: soft edges and blurry text at DPR 2, or a canvas resampled at 1.25 and 1.5. Use `createSilkApp`, which sizes the backing store from `devicePixelContentBoxSize`. In your own app pass `resolution: window.devicePixelRatio` and `autoDensity: true`.

### [MEDIUM] Turning MSAA on

Symptom: higher GPU cost and no visible gain. Keep `antialias: false`. SilkGraphics edges are exact without it.

### [MEDIUM] A parent element with no size

Symptom: a 1x1 canvas. The `parent` of `createSilkApp` must have a width and height before the call.

## API Reference

- [createSilkApp](https://pixi-silk.schmooky.dev/api/functions/createSilkApp.md), [SilkAppOptions](https://pixi-silk.schmooky.dev/api/interfaces/SilkAppOptions.md), [SilkApp](https://pixi-silk.schmooky.dev/api/interfaces/SilkApp.md)
- [enableSilkBatching](https://pixi-silk.schmooky.dev/api/functions/enableSilkBatching.md), [SilkGraphicsOptions](https://pixi-silk.schmooky.dev/api/interfaces/SilkGraphicsOptions.md)
- [pixi-silk/webgpu](https://pixi-silk.schmooky.dev/api/webgpu.md)
- Guides: [Resolution](https://pixi-silk.schmooky.dev/docs/resolution.md), [Performance](https://pixi-silk.schmooky.dev/docs/performance.md)
