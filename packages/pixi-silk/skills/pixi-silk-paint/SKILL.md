---
name: pixi-silk-paint
description: "Use this skill when painting pixi-silk shapes: colours, gradients, blur, glows, shadows and glass in PixiJS v8. Covers FillStyle and StrokeStyle paint fields, linear, vertical, horizontal, radial, conic, along and mesh gradients (OKLab, stops, easing, extend, shape or local units, dithering), blur as a gaussian on the distance field, progressive blur, spread, inner shadows, blend 'add' (plus-lighter), Glass from pixi-silk/glass, Glow, neon, halo, shadowStack and Aurora from pixi-silk/glow. Triggers on: gradient, linear, radial, conic, along, mesh gradient, OKLab, banding, blur, glow, neon, drop shadow, inner shadow, innerShadow, spread, plus lighter, blend add, Glass, frosted glass, Aurora."
license: MIT
---

Paint is what goes inside a shape: a colour, a gradient, or either with blur, spread and inner shadows. All of it is evaluated from the same distance field as the edge, so a blurred shape needs no filter pass and stays in the object's draw call.

## Quick Start

```ts
import { conic, linear, SilkGraphics } from 'pixi-silk';

const g = new SilkGraphics();

g.roundRect(20, 38, 180, 100, 24, 0.6).fill({ color: 0x000000, alpha: 0.45, blur: 18 }); // soft shadow
g.roundRect(20, 20, 180, 100, 24, 0.6).fill(linear([0x0a84ff, 0xbf5af2], { from: [0, 0], to: [1, 1] }));
g.arcSweep(300, 70, 40, -Math.PI / 2, Math.PI * 1.6).stroke({ width: 10, cap: 'round', gradient: conic([0x30d158, 0xffd60a, 0xff453a]) });
g.circle(300, 70, 40).stroke({ width: 10, color: 0xff453a, alpha: 0.5, blur: 10 }); // glow under the ring
app.stage.addChild(g);
```

## Core Patterns

### Gradients

```ts
import { along, conic, horizontal, linear, radial, SilkGraphics, vertical } from 'pixi-silk';

const g = new SilkGraphics();

g.rect(0, 0, 100, 60).fill(vertical([0xffffff, 0x8e8e93]));
g.rect(110, 0, 100, 60).fill(horizontal([[0, 0xff375f], [0.3, 0xffd60a], [1, 0x0a84ff]])); // [offset, colour]
g.rect(220, 0, 100, 60).fill(linear([[0, 0xffffff, 1], [1, 0xffffff, 0]])); // [offset, colour, alpha]
g.circle(50, 120, 40).fill(radial([0xffd60a, 0xff9f0a], { center: [0.3, 0.3], radius: 0.9 }));
g.circle(160, 120, 40).fill(conic([0x30d158, 0x0a84ff, 0x30d158], { startAngle: -Math.PI / 2 }));
g.polyline([220, 120, 260, 90, 300, 140]).stroke({ width: 8, cap: 'round', gradient: along([0xff9f0a, 0xbf5af2]) });
```

Points and radii are fractions of each shape's box (`units: 'shape'`, the default). Pass `units: 'local'` for one ramp across many shapes. Stops mix in OKLab and the ramps are dithered, so dark gradients do not band.

### Blur, spread, inner shadows, blend

```ts
import { SilkGraphics } from 'pixi-silk';

const g = new SilkGraphics();

g.circle(80, 80, 50).stroke({ width: 8, color: 0xff375f, blur: 12, alpha: 0.9, blend: 'add' }); // bloom
g.circle(80, 80, 50).stroke({ width: 3, color: 0xffd1dc }); // crisp core
g.roundRect(160, 20, 160, 120, 32).fill({
    color: 0x0a0909,
    innerShadow: [
        { color: 0x144ccd, y: -40, blur: 30, spread: -15 },
        { color: 0xffffff, alpha: 0.4, y: -10, blur: 10, spread: -3, blend: 'add' },
    ],
});
g.rect(0, 160, 320, 60).fill({ color: 0x5b2ee0, blur: { from: 20, to: 1, angle: Math.PI / 2 } }); // progressive
```

`blur` is a gaussian standard deviation in local units. `spread` grows the shape before the blur, like a Figma shadow spread.

### Mesh gradients

```ts
import { mesh, SilkGraphics } from 'pixi-silk';

const beam = mesh(3, 3, [
    [0xffd9ec, 0], [0xffd9ec, 0], [0xffd9ec, 0],
    [0xffd9ec, 0.1], [0xffd9ec, 0.4], [0xffd9ec, 0.1],
    [0xffd9ec, 0.5], [0xffd9ec, 1], [0xffd9ec, 0.5],
]);

new SilkGraphics().rect(0, 0, 380, 220).fill(beam);
```

### Glass and glow

```ts
import { Text } from 'pixi.js';
import { Glass } from 'pixi-silk/glass';
import { bolt, Glow, neon } from 'pixi-silk/glow';

const card = new Glass({ width: 300, height: 190, radius: 34, blur: 18, refraction: 16, dispersion: 0.4 });
const spark = new Glow({ draw: (g) => bolt(g, -50, -70, 100, 140), layers: neon(0xffd60a, { size: 100 }) });

card.content.addChild(new Text({ text: 'Frosted', style: { fill: 0xffffff } }));
spark.position.set(420, 100);
app.stage.addChild(card, spark); // add Glass after the scene it frosts
```

## Common Mistakes

### [HIGH] Gradient points in pixels

Symptom: the shape shows one flat end colour. `linear(stops, { from: [0, 0], to: [200, 0] })` reads 200 as 200 box widths. Use fractions (`to: [1, 0]`) or pass `units: 'local'`.

### [HIGH] Glass on WebGL shows a plain fill on the first frame

Symptom: the pane shows a flat frosted fill before the blur behind it appears. Glass reads the back buffer, which WebGL turns on the first time it draws. Pass `useBackBuffer: true` to `createSilkApp` or `app.init`. WebGPU needs nothing.

Wrong:

```ts nocheck
const { app } = await createSilkApp({ parent });
```

Correct:

```ts
import { createSilkApp } from 'pixi-silk';
import { Glass } from 'pixi-silk/glass';

const { app } = await createSilkApp({ parent: document.body, useBackBuffer: true });

app.stage.addChild(new Glass({ width: 240, height: 160 }));
```

### [MEDIUM] Using a Pixi BlurFilter for glows

Symptom: an extra render pass per object, and soft edges that turn blurry on retina screens. Use `blur` on the paint. It costs nothing extra.

### [MEDIUM] `blend: 'add'` on a light background

Symptom: the shape turns white. Plus-lighter adds to what is underneath. Use it for light on dark scenes.

## API Reference

- [FillStyle](https://pixi-silk.schmooky.dev/api/interfaces/FillStyle.md), [StrokeStyle](https://pixi-silk.schmooky.dev/api/interfaces/StrokeStyle.md), [InnerShadow](https://pixi-silk.schmooky.dev/api/interfaces/InnerShadow.md), [ProgressiveBlur](https://pixi-silk.schmooky.dev/api/interfaces/ProgressiveBlur.md)
- [linear](https://pixi-silk.schmooky.dev/api/functions/linear.md), [radial](https://pixi-silk.schmooky.dev/api/functions/radial.md), [conic](https://pixi-silk.schmooky.dev/api/functions/conic.md), [along](https://pixi-silk.schmooky.dev/api/functions/along.md), [mesh](https://pixi-silk.schmooky.dev/api/functions/mesh.md), [GradientOptions](https://pixi-silk.schmooky.dev/api/interfaces/GradientOptions.md)
- [pixi-silk/glass](https://pixi-silk.schmooky.dev/api/glass.md), [pixi-silk/glow](https://pixi-silk.schmooky.dev/api/glow.md)
- Guides: [Gradients](https://pixi-silk.schmooky.dev/docs/gradients.md), [Glass and glow](https://pixi-silk.schmooky.dev/docs/glass-and-glow.md)
