---
name: pixi-silk-drawing
description: "Use this skill when drawing shapes with pixi-silk's SilkGraphics in PixiJS v8. Covers rect, roundRect with squircle smoothing and per-corner radii, pill, circle, ellipse, arc, arcSweep, sector, heart, star, regularPoly, triangle, line, polyline (monotone or Catmull-Rom smoothing, tapered widths), poly, area charts, moveTo and Bezier paths, svgPath, fill and stroke, stroke alignment, caps, joins and miterLimit, dashes and dots, save, restore and transforms, shape operations (union, subtract, intersect, exclude, boolean), clear and redraw, hit testing. Triggers on: SilkGraphics, roundRect, squircle, arcSweep, sector, polyline, area, svgPath, boolean, op subtract, dash, dashOffset, join, miterLimit, alignment, containsPoint."
license: MIT
---

`SilkGraphics` is a Pixi display object (a Mesh leaf) with a Graphics-like API. Shapes go on the active path, and `fill()` or `stroke()` paints them. Every primitive is an exact distance field, so a rotated squircle at 40x zoom is as sharp as an axis-aligned rect.

## Quick Start

```ts
import { SilkGraphics } from 'pixi-silk';

const g = new SilkGraphics();

g.roundRect(0, 0, 200, 80, 20, 0.6).fill(0x1c1c1e).stroke({ width: 2, color: 0x3a3a3c });
g.arcSweep(260, 40, 32, -Math.PI / 2, Math.PI * 1.5).stroke({ width: 8, cap: 'round', color: 0x30d158 });
g.polyline([0, 140, 60, 110, 120, 130, 180, 96], { smooth: 'monotone' }).stroke({ width: 3, color: 0x0a84ff, cap: 'round' });
app.stage.addChild(g);
```

`stroke()` right after `fill()` paints the same shapes. The next shape after a paint call starts a new path.

## Core Patterns

### Shapes

```ts
import { SilkGraphics } from 'pixi-silk';

const g = new SilkGraphics();

g.rect(0, 0, 80, 40).fill(0xff375f);
g.roundRect(100, 0, 80, 40, [16, 16, 4, 4]).fill(0xff9f0a); // tl, tr, br, bl
g.roundRect(200, 0, 80, 40, 14, 0.6).fill(0xffd60a); // smoothing 0..1: squircle corners
g.pill(300, 0, 80, 40).fill(0x30d158);
g.circle(40, 100, 30).fill(0x64d2ff);
g.ellipse(140, 100, 40, 24).fill(0x0a84ff);
g.sector(240, 100, 40, 0, Math.PI * 1.2, 22, 4).fill(0x5e5ce6); // innerRadius, cornerRadius
g.star(340, 100, 5, 32, 14, 0, 3).fill(0xbf5af2);
g.regularPoly(40, 190, 30, 6, 0, 4).fill(0xff375f);
g.triangle(100, 220, 140, 160, 180, 220, 6).fill(0xff9f0a);
g.heart(240, 190, 56, 0.15).fill(0xff2d55);
```

### Lines, paths and areas

```ts
import { along, SilkGraphics, vertical } from 'pixi-silk';

const g = new SilkGraphics();
const pts = [0, 60, 50, 20, 100, 50, 150, 10, 200, 40];

g.line(0, 0, 200, 0).stroke({ width: 1, color: 0xffffff, alpha: 0.4 });
g.polyline(pts, { smooth: 'catmull' }).stroke({ width: [2, 14], cap: 'round', gradient: along([0xff9f0a, 0xbf5af2]) });
g.area(pts, 80, { smooth: 'monotone' }).fill(vertical([[0, 0x0a84ff, 0.6], [1, 0x0a84ff, 0]])).stroke({ width: 2, color: 0x0a84ff });
g.moveTo(0, 120).quadraticCurveTo(60, 80, 120, 120).bezierCurveTo(150, 150, 180, 90, 200, 120).stroke({ width: 3, color: 0xffd60a });
g.svgPath('M12 2 L22 22 H2 Z').fill(0x30d158); // M L H V C S Q T A Z, absolute and relative
```

`area(points, lower)` fills under a series sorted by x. `lower` is a baseline y or a second series for bands. The stroke after it draws the top line only.

### Strokes: alignment, caps, joins, dashes

```ts
import { SilkGraphics } from 'pixi-silk';

const g = new SilkGraphics();

g.rect(0, 0, 80, 60).stroke({ width: 8, color: 0xffffff, alignment: 'inside', join: 'miter', miterLimit: 4 });
g.polyline([100, 60, 130, 0, 160, 60]).stroke({ width: 10, color: 0x0a84ff, join: 'round', cap: 'round' });
g.circle(230, 30, 28).stroke({ width: 3, color: 0x64d2ff, dash: [10, 6] }); // closed outlines tile without a seam
g.line(0, 90, 260, 90).stroke({ width: 8, cap: 'round', dash: [0, 16], color: 0x30d158 }); // dots
```

### Shape operations

```ts
import { SilkGraphics } from 'pixi-silk';

const g = new SilkGraphics();

g.circle(60, 60, 50).circle(60, 60, 30).fill({ color: 0x30d158, op: 'subtract' }); // a ring
g.rect(140, 10, 100, 100).circle(240, 110, 50).fill({ color: 0x0a84ff, op: 'intersect' });
g.boolean('subtract', (s) => s.circle(330, 60, 40), (s) => s.rect(326, 10, 8, 40)).fill(0xff9f0a).stroke({ width: 2, color: 0xffffff });
g.rect(0, 140, 40, 8).triangle(36, 132, 52, 144, 36, 156).fill({ color: 0xff375f, union: true }); // one seamless arrow
```

### Transforms, redraw and hit testing

```ts
import { SilkGraphics } from 'pixi-silk';

const g = new SilkGraphics();

g.eventMode = 'static';
g.cursor = 'pointer';
g.on('pointertap', () => console.log('tap')); // hits the real shape, not its box

app.ticker.add((ticker) => {
    const t = ticker.lastTime / 1000;

    g.clear(); // keeps the buffers: redrawing every frame is cheap
    g.save().translateTransform(100, 100).rotateTransform(t);
    g.roundRect(-40, -20, 80, 40, 12, 0.6).fill(0x5e5ce6);
    g.restore();
});
app.stage.addChild(g);
```

## Common Mistakes

### [CRITICAL] Painting inside `boolean()` callbacks

Symptom: the operation is ignored and the operands appear as separate painted shapes. The callbacks only add shapes. Paint the result once.

Wrong:

```ts nocheck
g.boolean('subtract', (s) => s.circle(50, 50, 40).fill(0xffffff), (s) => s.circle(50, 50, 20).fill(0xffffff));
```

Correct:

```ts
import { SilkGraphics } from 'pixi-silk';

new SilkGraphics().boolean('subtract', (s) => s.circle(50, 50, 40), (s) => s.circle(50, 50, 20)).fill(0xffffff);
```

### [HIGH] Expecting round joins

Symptom: sharp spikes at acute polyline corners. Joins default to `miter` (limit 10), as in Canvas 2D and Pixi. Pass `join: 'round'` or `'bevel'`, or lower `miterLimit`.

### [HIGH] Redrawing without `clear()`

Symptom: shapes pile up every frame and `g.primitiveCount` keeps growing. Call `g.clear()` before drawing the frame.

### [MEDIUM] Overlapping translucent shapes painted one by one

Symptom: `rect().triangle().fill({ alpha: 0.5 })` shows a darker seam where the shapes overlap, and blur shows two halos. Pass `union: true` (or `op: 'union'`) to paint the shapes as one.

### [MEDIUM] Unsorted points in `area()`

Symptom: the fill folds over itself. `area()` needs points sorted by x (ascending or descending).

## API Reference

- [SilkGraphics](https://pixi-silk.schmooky.dev/api/classes/SilkGraphics.md)
- [FillStyle](https://pixi-silk.schmooky.dev/api/interfaces/FillStyle.md)
- [StrokeStyle](https://pixi-silk.schmooky.dev/api/interfaces/StrokeStyle.md)
- [PolylineOptions](https://pixi-silk.schmooky.dev/api/interfaces/PolylineOptions.md), [AreaOptions](https://pixi-silk.schmooky.dev/api/interfaces/AreaOptions.md)
- [ShapeOp](https://pixi-silk.schmooky.dev/api/types/ShapeOp.md), [LineJoin](https://pixi-silk.schmooky.dev/api/types/LineJoin.md), [LineCap](https://pixi-silk.schmooky.dev/api/types/LineCap.md)
- Guides: [Shapes](https://pixi-silk.schmooky.dev/docs/shapes.md), [Lines and paths](https://pixi-silk.schmooky.dev/docs/lines-and-paths.md), [Shape operations](https://pixi-silk.schmooky.dev/docs/shape-operations.md)
