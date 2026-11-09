---
name: pixi-silk-layout
description: "Use this skill when laying out PixiJS containers with pixi-silk: responsive screens and flex rows. Covers SmartContainer from pixi-silk/ui/layout (a responsive container with portraitData and landscapeData records, a reference resolution, fit or cover, align and valign, extendWidth, corrections, named breakpoints, safe-area insets, switchTransition, viewport sources), FlexContainer (gap, padding, direction, wrap, grow, basis, absolute children, onSize, fit modes, text shrink-to-fit, portrait, landscape and media styles), simulateViewport, layoutDebug and the headless LayoutNode flex engine from pixi-silk/layout. Triggers on: SmartContainer, FlexContainer, LayoutNode, responsive layout, portrait landscape, reference resolution, design resolution, safe area, flexbox PixiJS, layout engine, pixi-silk/layout, pixi-silk/ui/layout."
license: MIT
---

Two entry points. `pixi-silk/layout` is `LayoutNode`, a flexbox engine with no Pixi in it: it runs in workers, tests and servers. `pixi-silk/ui/layout` puts it on Pixi containers. A `SmartContainer` places and scales a design box in the window from a portrait or a landscape record, each with a reference resolution. A `FlexContainer` lays out children with flex styles inside a box.

## Quick Start

```ts
import { SmartContainer } from 'pixi-silk/ui/layout';

const board = new SmartContainer({
    viewport: app, // follows app.renderer resizes; nothing happens without a viewport
    portraitData: { width: 1040, height: 640, correctionOffsetY: -200 },
    landscapeData: { width: 1040, height: 640 },
});

app.stage.addChild(board);
// children go in design units, inside a 1040x640 box fitted to a 1080x1920 or 1920x1080 reference
```

## Core Patterns

### Records, breakpoints and safe areas

```ts
import { SmartContainer } from 'pixi-silk/ui/layout';

const background = new SmartContainer({
    viewport: app.renderer,
    safeArea: { top: 44, bottom: 34 },
    breakpoints: [{ name: 'ultrawide', when: (w, h) => w / h > 2.1, data: { width: 2560, height: 1080, viewportWidth: 2560, fitCover: true } }],
    portraitData: { width: 1080, height: 1920, fitCover: true, ignoreSafeArea: true },
    landscapeData: { width: 1920, height: 1080, fitCover: true, ignoreSafeArea: true },
});

console.log(background.breakpoint); // 'ultrawide', 'portrait' or 'landscape'
```

| LayoutData field | Default | What it does |
|---|---|---|
| `width`, `height` | 0 | The design box, in design units. |
| `viewportWidth`, `viewportHeight` | 1080x1920 portrait, 1920x1080 landscape | Reference resolution the box is fitted to. |
| `align`, `valign` | `center` | Where the box sits in the window. |
| `fitCover` | false | Cover the window (larger ratio) instead of fitting inside it. |
| `extendWidth`, `extendHeight` | false | Keep the scale and widen or heighten the box to the window. |
| `correctionOffsetX`, `correctionOffsetY` | 0 | Move the box, in design units. |
| `ignoreSafeArea` | false | Place the box under notches and home bars. |

### A flex bar inside a SmartContainer

```ts
import { Container } from 'pixi.js';
import { SmartContainer } from 'pixi-silk/ui/layout';

const bar = new SmartContainer({
    viewport: app,
    layout: { padding: [16, 32, 28], gap: 24, alignItems: 'center', justifyContent: 'space-between', media: [{ breakpoint: 'portrait', style: { wrap: 'wrap', justifyContent: 'center' } }] },
    portraitData: { valign: 'bottom', width: 1080, height: 420, extendWidth: true },
    landscapeData: { valign: 'bottom', width: 1920, height: 200, extendWidth: true },
});

bar.add(new Container(), { media: [{ breakpoint: 'portrait', style: { basis: '100%' } }] });
bar.add(new Container(), { grow: 1 });
```

### FlexContainer on its own

```ts
import { SilkGraphics } from 'pixi-silk';
import { SilkText } from 'pixi-silk/text';
import { FlexContainer } from 'pixi-silk/ui/layout';

const card = new FlexContainer({ layout: { direction: 'column', gap: 8, padding: 16 } });
const bg = new SilkGraphics();

card.add(bg, { position: 'absolute', inset: 0, onSize: (w, h) => bg.clear().roundRect(0, 0, w, h, 18, 0.6).fill(0x1c1c1e) });
card.add(new SilkText({ text: '$1,250,000.00', fontSize: 30 }), { fit: 'scale-down', minScale: 0.55 });
card.resize(240, 120); // a root FlexContainer lays out in the area you give it
app.stage.addChild(card);
```

### The headless engine

```ts
import { LayoutNode } from 'pixi-silk/layout';

const root = new LayoutNode({ direction: 'row', gap: 8, padding: 16 });
const label = new LayoutNode({ grow: 1 });

root.add(new LayoutNode({ width: 100 })).add(label);
root.calculate(400, 120);
console.log(label.layout); // { x: 124, y: 16, width: 260, height: 88 }
```

### Testing other screens

```ts
import { layoutDebug, SmartContainer, simulateViewport } from 'pixi-silk/ui/layout';

const sim = simulateViewport({ area: app.screen, device: 'phone portrait' });
const panel = new SmartContainer({ viewport: sim, portraitData: { width: 1080, height: 300, valign: 'bottom' } });

sim.content.addChild(panel);
app.stage.addChild(sim);
sim.setDevice('phone landscape');
layoutDebug(app, { key: 'KeyL' }); // L toggles boxes and labels
```

## Common Mistakes

### [CRITICAL] A SmartContainer without a viewport

Symptom: the container stays at (0, 0) at scale 1 and never reacts to resizes. It only places itself once it has a `viewport`: the Application, its renderer, a signal of a rectangle or a plain rectangle.

Wrong:

```ts nocheck
const hud = new SmartContainer({ landscapeData: { width: 1920, height: 200 } });
```

Correct:

```ts
import { SmartContainer } from 'pixi-silk/ui/layout';

const hud = new SmartContainer({ viewport: app, landscapeData: { width: 1920, height: 200, valign: 'bottom' } });

app.stage.addChild(hud);
```

### [HIGH] A plain rectangle viewport that changes

Symptom: the layout stays at the first size. A plain `{ width, height }` has no events. Call `updateContainer()` after you change it, or pass the Application or a signal.

### [HIGH] `stretchWidth` to fill a wide window

Symptom: circles turn into ellipses and text widens. `stretchWidth` scales the x axis alone. Use `extendWidth`, which keeps the uniform scale and widens the box, so flex children spread out.

### [MEDIUM] Calling `calculate()` on a child LayoutNode

Symptom: wrong positions. Call `calculate(width, height)` on the root. Children read `node.layout` after it.

## API Reference

- [pixi-silk/ui/layout](https://pixi-silk.schmooky.dev/api/ui/layout.md): [SmartContainer](https://pixi-silk.schmooky.dev/api/ui/layout/classes/SmartContainer.md), [LayoutData](https://pixi-silk.schmooky.dev/api/ui/layout/interfaces/LayoutData.md), [FlexContainer](https://pixi-silk.schmooky.dev/api/ui/layout/classes/FlexContainer.md)
- [pixi-silk/layout](https://pixi-silk.schmooky.dev/api/layout.md): [LayoutNode](https://pixi-silk.schmooky.dev/api/layout/classes/LayoutNode.md), [LayoutStyle](https://pixi-silk.schmooky.dev/api/layout/interfaces/LayoutStyle.md)
- Guide: [Layout](https://pixi-silk.schmooky.dev/docs/layout.md)
