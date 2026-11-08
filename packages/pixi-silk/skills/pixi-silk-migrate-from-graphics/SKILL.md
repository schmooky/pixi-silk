---
name: pixi-silk-migrate-from-graphics
description: "Use this skill when moving PixiJS v8 Graphics code to pixi-silk's SilkGraphics, or deciding which of the two to use. Covers what stays the same (active path, fill and stroke styles, path commands, transforms, events), what differs (joins, holes with cut versus op subtract, GraphicsContext, texture and pattern fills, svg import, batching) and what is new (squircles, arcSweep, sector, smoothed and tapered polylines, area, dashes, blur, OKLab gradients). Triggers on: migrate from Graphics, replace Graphics, Graphics vs SilkGraphics, drop-in Graphics replacement, cut, beginHole, GraphicsContext, FillGradient, FillPattern, texture fill, svg(), jagged Graphics, blurry Graphics, @pixi/graphics-smooth."
license: MIT
---

Most `Graphics` code runs after renaming the class. Both use the v8 shape-then-paint model: draw shapes on the active path, then `fill()` or `stroke()`. SilkGraphics evaluates each shape as a distance field per pixel, where Graphics tessellates triangles, so curves and thin lines stay smooth without MSAA.

## Quick Start

```ts
import { SilkGraphics } from 'pixi-silk';

// was: const g = new Graphics();
const g = new SilkGraphics();

g.roundRect(0, 0, 200, 80, 16).fill(0x1c1c1e).stroke({ width: 2, color: 0xffffff });
g.circle(40, 40, 12).fill({ color: 0xff375f, alpha: 0.8 });
g.moveTo(0, 100).lineTo(200, 120).stroke({ width: 1, color: 0xffffff });
app.stage.addChild(g);
```

## Core Patterns

### What maps one to one

| Graphics | SilkGraphics |
|---|---|
| `rect`, `roundRect`, `circle`, `ellipse`, `poly`, `star`, `regularPoly` | same names and arguments, plus optional corner radius or smoothing |
| `moveTo`, `lineTo`, `quadraticCurveTo`, `bezierCurveTo`, `arc`, `closePath`, `beginPath` | same |
| `fill(color)`, `fill({ color, alpha })` | same, plus `gradient`, `blur`, `spread`, `innerShadow`, `blend`, `op` |
| `stroke({ width, color, alpha, alignment, cap, join, miterLimit })` | same, `alignment` also takes `'inside' \| 'center' \| 'outside'` |
| `save`, `restore`, `translateTransform`, `rotateTransform`, `scaleTransform`, `setTransform` | same |
| `eventMode`, `containsPoint`, masks, filters, render textures | same: it is a regular display object, and hit tests use the real shape |

### Holes and cut-outs

```ts
import { SilkGraphics } from 'pixi-silk';

const g = new SilkGraphics();

// was: g.rect(0, 0, 120, 80).fill(0x1c1c1e).circle(60, 40, 24).cut();
g.rect(0, 0, 120, 80).circle(60, 40, 24).fill({ color: 0x1c1c1e, op: 'subtract' });
g.svgPath('M140 0 H260 V80 H140 Z M180 20 H220 V60 H180 Z').fill(0x30d158); // even-odd: the inner square is a hole
```

### Gradients

```ts
import { linear, radial, SilkGraphics } from 'pixi-silk';

const g = new SilkGraphics();

// was: new FillGradient({ type: 'linear', start: { x: 0, y: 0 }, end: { x: 1, y: 0 }, colorStops: [...] })
g.rect(0, 0, 200, 60).fill(linear([0xff375f, 0x0a84ff], { from: [0, 0], to: [1, 0] }));
g.circle(260, 30, 30).fill(radial([0xffffff, 0x0a84ff]));
```

### New things worth using

```ts
import { SilkGraphics } from 'pixi-silk';

const g = new SilkGraphics();

g.roundRect(0, 0, 120, 60, 18, 0.6).fill(0x2c2c2e); // squircle
g.arcSweep(180, 30, 26, -Math.PI / 2, Math.PI * 1.5).stroke({ width: 6, cap: 'round', color: 0x30d158 });
g.polyline([0, 120, 60, 80, 120, 110, 180, 70], { smooth: 'monotone' }).stroke({ width: [2, 10], cap: 'round', color: 0x0a84ff });
g.circle(260, 100, 24).stroke({ width: 3, color: 0x64d2ff, dash: [6, 4] });
g.circle(260, 100, 24).fill({ color: 0x64d2ff, alpha: 0.5, blur: 10 }); // glow, no filter
```

## Common Mistakes

### [CRITICAL] Using GraphicsContext with SilkGraphics

Symptom: `Property 'context' does not exist on type 'SilkGraphics'`, or `new SilkGraphics(ctx)` fails to type-check. SilkGraphics has no shared context. To reuse a drawing, write a function that draws into a SilkGraphics and call it for each object. Redrawing is cheap: `clear()` keeps the buffers.

### [HIGH] Texture and pattern fills, `svg()`

Symptom: `fill({ texture })` paints nothing, and `g.svg(...)` is not a function. SilkGraphics has neither. Use gradients for fills and `svgPath(d)` for SVG path data. Draw images with a Pixi `Sprite`.

### [HIGH] `cut()` and `beginHole()`

Symptom: `cut` is not a function. Combine the shapes with `fill({ op: 'subtract' })` or `g.boolean('subtract', a, b)`. A path from `moveTo` or `svgPath` fills even-odd, so inner subpaths are holes already.

Wrong:

```ts nocheck
g.rect(0, 0, 100, 100).fill(0xffffff).circle(50, 50, 20).cut();
```

Correct:

```ts
import { SilkGraphics } from 'pixi-silk';

new SilkGraphics().rect(0, 0, 100, 100).circle(50, 50, 20).fill({ color: 0xffffff, op: 'subtract' });
```

### [MEDIUM] Expecting Graphics batching

Symptom: draw calls go up after the switch. Pixi batches Graphics together. A SilkGraphics is one draw call however many shapes it holds. Put many shapes in one object, or call `enableSilkBatching()` before creating them.

### [MEDIUM] Keeping `antialias: true`

Symptom: extra GPU cost and no visible change. SilkGraphics edges are exact without MSAA. Use `createSilkApp`, or `antialias: false` with `resolution: window.devicePixelRatio`.

## API Reference

- [SilkGraphics](https://pixi-silk.schmooky.dev/api/classes/SilkGraphics.md)
- [FillStyle](https://pixi-silk.schmooky.dev/api/interfaces/FillStyle.md), [StrokeStyle](https://pixi-silk.schmooky.dev/api/interfaces/StrokeStyle.md)
- [linear](https://pixi-silk.schmooky.dev/api/functions/linear.md), [enableSilkBatching](https://pixi-silk.schmooky.dev/api/functions/enableSilkBatching.md)
- Guide: [Migrating from Graphics](https://pixi-silk.schmooky.dev/docs/migrating-from-graphics.md)
