# pixi-silk

**Smooth vector graphics for PixiJS v8.** pixi-silk draws shapes as exact signed distance fields.
Every edge is anti-aliased per pixel, so it stays smooth at any zoom, rotation and device pixel
ratio. No MSAA, no triangles, one draw call per object.

[Docs](https://pixi-silk.schmooky.dev/docs/) |
[API reference](https://pixi-silk.schmooky.dev/api/) |
[Lab](https://pixi-silk.schmooky.dev/lab/) |
[Showcase](https://pixi-silk.schmooky.dev/showcase/) |
[llms.txt](https://pixi-silk.schmooky.dev/llms.txt)

```bash
npm install pixi-silk pixi.js
```

```ts
import { createSilkApp, SilkGraphics, conic, vertical } from 'pixi-silk';

const { app } = await createSilkApp({ parent: document.getElementById('stage')!, background: 0x000000 });

const g = new SilkGraphics()
    .roundRect(10, 10, 340, 140, 22, 0.6).fill(0x1c1c1e)                     // squircle card
    .arcSweep(80, 80, 44, -Math.PI / 2, Math.PI * 1.5)
    .stroke({ width: 12, cap: 'round', gradient: conic([0x30d158, 0xffd60a, 0xff453a]) });

g.area([120, 100, 170, 80, 220, 92, 270, 60, 320, 70], 130, { smooth: 'monotone' })
    .fill(vertical([[0, 0xff9f0a, 0.8], [1, 0xff9f0a, 0]]))
    .stroke({ width: 2, color: 0xff9f0a, cap: 'round' });                   // stroke right after fill = top line

app.stage.addChild(g);
```

## Why

PixiJS v8 turns `Graphics` into triangles when you draw. Scaled curves show facets. Thin lines
crawl between pixels. Anti-aliasing is MSAA on the main canvas only, so filters and render textures
stay aliased unless you opt each one in. Filters render at resolution 1, and 8-bit gradients band.

| | Pixi `Graphics` | `SilkGraphics` |
|---|---|---|
| Edges | triangles + optional MSAA | exact distance per pixel, 1-device-pixel filter |
| Zoom | facets appear | exact at any scale |
| Thin lines | break up below 1 px | keep 1 px and fade |
| Inside filters / render textures | aliased unless each target opts into MSAA | same quality everywhere |
| Gradients | sRGB, 8-bit | OKLab, half-float ramps, dithered |
| Draw calls | batched geometry | one instanced draw call per object, or per run with batching on |

## Features

- **Shapes.** `rect`, `roundRect` with per-corner radii and squircle smoothing, `pill`, `circle`,
  `ellipse`, `arc`, `arcSweep`, `sector` (donuts, gauges), `line` and `polyline`. Polylines can be
  smoothed (monotone or Catmull-Rom), closed and tapered.
- **Paths and more.** `moveTo`, `lineTo`, `quadraticCurveTo`, `bezierCurveTo`, `area` for charts,
  `heart`, `star`, `regularPoly` and rounded `triangle`.
- **Gradients.** `linear`, `vertical`, `horizontal`, `radial`, `conic` and `along`. They mix in OKLab
  (or linear or sRGB), with easing and extend modes.
- **Paint.** A gaussian `blur` on any fill or stroke gives glows and soft shadows. Dashes and dots
  are drawn in the shader. Strokes align inside, center or outside. Hairlines keep 1 pixel and fade.
- **Transforms.** `save`, `restore`, `translateTransform`, `rotateTransform`, `scaleTransform` and
  `setTransform`. Rotated shapes stay exact.
- **Events.** `containsPoint` tests the real shapes. Rings are hollow and a line only reacts on its
  stroke.
- **`createSilkApp`.** Maps canvas pixels 1:1 to device pixels, even at fractional ratios, and follows
  DPR changes. No MSAA, filters at screen resolution, and pages still scroll on touch screens.
- **Motion.** Frame-rate independent `damp`, `dampAngle`, `Spring` and `ease`.
- **Performance.** 44 floats per primitive and one draw call per object, or per run of objects
  after `enableSilkBatching()`. Rebuilding 50,000 primitives
  takes about 12 ms of CPU per frame.

Requirements: `pixi.js` ^8.6 (peer dependency) and WebGL2 or WebGPU. `createSilkApp` uses WebGL2 by
default. Pass `preference: 'webgpu'` for WebGPU, which loads the WGSL shader on demand
(`enableWebGPU()` from `pixi-silk/webgpu` for your own Pixi app).
Strokes support miter, bevel and round joins with `miterLimit`, as in Canvas 2D.

## Documentation

- [Introduction](https://pixi-silk.schmooky.dev/docs/introduction/), [installation](https://pixi-silk.schmooky.dev/docs/installation/) and [quick start](https://pixi-silk.schmooky.dev/docs/quick-start/)
- Smooth graphics: [anti-aliasing in PixiJS v8 (MSAA vs SDF)](https://pixi-silk.schmooky.dev/docs/antialiasing-in-pixijs/), [fix jagged or blurry PixiJS graphics](https://pixi-silk.schmooky.dev/docs/smooth-graphics-pixijs/), [@pixi/graphics-smooth and PixiJS v8](https://pixi-silk.schmooky.dev/docs/graphics-smooth-v8/), [glossary](https://pixi-silk.schmooky.dev/docs/glossary/)
- Guides with live demos: [shapes](https://pixi-silk.schmooky.dev/docs/shapes/), [arcs & rings](https://pixi-silk.schmooky.dev/docs/arcs-and-rings/), [lines & paths](https://pixi-silk.schmooky.dev/docs/lines-and-paths/), [fills & strokes](https://pixi-silk.schmooky.dev/docs/fills-and-strokes/), [dashes](https://pixi-silk.schmooky.dev/docs/dashes/), [gradients](https://pixi-silk.schmooky.dev/docs/gradients/), [blur & shadows](https://pixi-silk.schmooky.dev/docs/blur-and-shadows/), [charts](https://pixi-silk.schmooky.dev/docs/charts/), [transforms](https://pixi-silk.schmooky.dev/docs/transforms/), [hit testing](https://pixi-silk.schmooky.dev/docs/hit-testing/), [animation](https://pixi-silk.schmooky.dev/docs/animation/), [resolution & DPR](https://pixi-silk.schmooky.dev/docs/resolution/), [performance](https://pixi-silk.schmooky.dev/docs/performance/)
- [How it works](https://pixi-silk.schmooky.dev/docs/how-it-works/), [Migrating from Graphics](https://pixi-silk.schmooky.dev/docs/migrating-from-graphics/) and the [FAQ](https://pixi-silk.schmooky.dev/faq/)
- [API reference](https://pixi-silk.schmooky.dev/api/), generated from the source JSDoc

## Repository

A pnpm workspace:

| path | |
|---|---|
| `packages/pixi-silk` | the library, built by tsdown into ES modules (one file per module), tested with vitest |
| `apps/site` | docs site: Astro, React islands, MDX guides with live demos, TypeDoc API pages, lab, llms.txt |
| `scripts` | release helpers, page checks, screenshot and measurement tools |

```bash
pnpm install
pnpm site:dev                   # docs + lab at http://localhost:5178
pnpm --filter pixi-silk test    # unit tests
pnpm build                      # library build
pnpm site:build                 # static site + search index
```

Releases use [changesets](.changeset/README.md) and npm trusted publishing. See
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
