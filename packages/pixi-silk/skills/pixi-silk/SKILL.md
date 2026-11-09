---
name: pixi-silk
description: "Use this skill first for ANY pixi-silk task; it routes to the right pixi-silk skill. pixi-silk draws smooth vector graphics in PixiJS v8: every shape is an exact signed distance field anti-aliased in the shader. Covers SilkGraphics, createSilkApp, gradients, blur and shadows, shape operations, WebGL2 and WebGPU, batching, SilkText, layout, UI widgets, the editor kit and migrating from PixiJS Graphics. Triggers on: pixi-silk, SilkGraphics, createSilkApp, SilkText, squircle, smooth graphics PixiJS, anti-aliased PixiJS, signed distance field shapes, enableSilkBatching, enableWebGPU, SmartContainer, FlexContainer, TransformGizmo, SilkButton, RadialMenu, pixi-silk/ui, pixi-silk/text, pixi-silk/layout."
license: MIT
---

pixi-silk is a TypeScript library for PixiJS v8 (peer dependency `pixi.js` ^8.6). Its `SilkGraphics` has a Graphics-like API and draws every shape as an exact distance field, so edges stay smooth at any zoom, rotation and device pixel ratio without MSAA. It renders on WebGL2 (default) and WebGPU.

## How to use this skill

1. Read the facts below. They are the things models most often get wrong.
2. Find the task in the router and load that skill's `SKILL.md`.
3. If no skill covers a symbol, read its API page as Markdown: `https://pixi-silk.schmooky.dev/api/<kind>/<Name>.md` for the root import, `https://pixi-silk.schmooky.dev/api/<subpath>/<kind>/<Name>.md` for a subpath (for example `/api/ui/gizmo/classes/TransformGizmo.md`). The index is `https://pixi-silk.schmooky.dev/llms.txt`.

## Quick Start

```ts
import { createSilkApp, SilkGraphics, linear } from 'pixi-silk';

const { app } = await createSilkApp({ parent: document.getElementById('stage')!, background: 0x000000 });
const g = new SilkGraphics();

g.roundRect(20, 20, 240, 120, 24, 0.6).fill(linear([0x0a84ff, 0xbf5af2]));
g.circle(320, 80, 40).stroke({ width: 6, color: 0xffffff, cap: 'round' });
app.stage.addChild(g);
```

## Facts

- WebGL2 is the default renderer. For WebGPU pass `createSilkApp({ preference: 'webgpu' })`, or call `enableWebGPU()` from `pixi-silk/webgpu` in your own Pixi app before the first SilkGraphics.
- Joins are `miter` by default (`bevel` and `round` exist), `miterLimit` 10.
- Free paths (`moveTo`, Bezier curves, `poly`, `svgPath`) fill as one exact even-odd shape and stroke.
- Shape operations: `fill({ op })`, `g.boolean(op, a, b)`, `g.svgPath(d)`.
- Batching is off: one draw call per SilkGraphics until you call `enableSilkBatching()` before creating them.
- One primitive is one instance of 44 floats.
- The root import is the core only. Every other area has its own entry point (table below).
- A `SmartContainer` does nothing until it has a `viewport`.

## Skill router

| Skill | Load when... |
|---|---|
| [pixi-silk-drawing](../pixi-silk-drawing/SKILL.md) | Drawing shapes with `SilkGraphics`: rects, squircles, circles, arcs, sectors, polylines, paths, areas, stars, `fill`, `stroke`, dashes, joins, transforms, shape operations, hit testing. |
| [pixi-silk-paint](../pixi-silk-paint/SKILL.md) | Gradients (`linear`, `radial`, `conic`, `along`, `mesh`), `blur`, glows, drop and inner shadows, `spread`, `blend: 'add'`, `Glass`, `Glow`, `Aurora`. |
| [pixi-silk-app-rendering](../pixi-silk-app-rendering/SKILL.md) | `createSilkApp`, resolution and DPR, WebGPU and WebGL2, `enableWebGPU`, `enableSilkBatching`, performance, using SilkGraphics in your own `Application`. |
| [pixi-silk-text](../pixi-silk-text/SKILL.md) | `SilkText`, `SdfAtlas`, `silkLabel`, outlines, text shadows, tabular numbers, caret and layout helpers. |
| [pixi-silk-layout](../pixi-silk-layout/SKILL.md) | `SmartContainer` (portrait and landscape records, reference resolution, safe area), `FlexContainer`, `LayoutNode`, `simulateViewport`, `layoutDebug`. |
| [pixi-silk-widgets](../pixi-silk-widgets/SKILL.md) | `SilkButton`, `ButtonDock`, `RadialMenu`, `Odometer`, `JogDial`, `Scrubber`, `ValuePill`, `trackGesture`, signals. |
| [pixi-silk-editor](../pixi-silk-editor/SKILL.md) | Editor canvases: `Camera`, `CanvasGrid`, `Ruler`, `Guides`, `Marquee`, `TransformGizmo`, `SelectionOutline`, `SnapEngine`, `Selection`, `History`, `PathGizmo`, `TextEditor`, panels, colour pickers. |
| [pixi-silk-migrate-from-graphics](../pixi-silk-migrate-from-graphics/SKILL.md) | Moving code from PixiJS `Graphics` to `SilkGraphics`: what is the same, what differs, what has no equivalent. |

## Entry points

Import each from its own path. The root import does not re-export the others.

| Import | What it holds |
|---|---|
| `pixi-silk` | SilkGraphics, createSilkApp, gradients, colour and curve helpers, motion helpers (`damp`, `Spring`, `ease`), `enableSilkBatching`. |
| `pixi-silk/webgpu` | `enableWebGPU` for your own WebGPU Application. |
| `pixi-silk/glass` | `Glass`, a frosted pane. |
| `pixi-silk/glow` | `Glow`, `Aurora`, `neon`, `halo`, rays. |
| `pixi-silk/text` | `SilkText`, `SdfAtlas`, `silkLabel`, `layoutText`, caret helpers. |
| `pixi-silk/layout` | `LayoutNode`, a headless flex engine. |
| `pixi-silk/ui/layout` | `SmartContainer`, `FlexContainer`, `simulateViewport`, `layoutDebug`. |
| `pixi-silk/signal` | `signal`, `computed`, `watch`, `batch`. |
| `pixi-silk/ui` | Every widget and editor tool in one import (ships more code). |
| `pixi-silk/ui/button` | `SilkButton`. |
| `pixi-silk/ui/radial` | `RadialMenu`, `bindRadialTrigger`. |
| `pixi-silk/ui/dock` | `ButtonDock`. |
| `pixi-silk/ui/pill` | `ValuePill`. |
| `pixi-silk/ui/odometer` | `Odometer`. |
| `pixi-silk/ui/dial` | `JogDial`, `Scrubber`. |
| `pixi-silk/ui/modes` | `SegmentedSwitch`, `ModeSwitcher`. |
| `pixi-silk/ui/gesture` | `trackGesture`. |
| `pixi-silk/ui/arc` | Angle helpers for ring widgets. |
| `pixi-silk/ui/keys` | Shared keyboard state. |
| `pixi-silk/ui/halo` | `ContextHalo`. |
| `pixi-silk/ui/brush` | `BrushCursor`. |
| `pixi-silk/selection` | `Selection`, `bindOutline`, `bindGizmo`, `bindMeasure`. |
| `pixi-silk/history` | `History`, `recordSignals`, `recordGizmo`, `bindHistoryKeys`. |
| `pixi-silk/path` | `BezierPath`, `drawPath`, `parseSvgPath`, path edits. |
| `pixi-silk/ui/camera` | `Camera`, `ZoomControl`. |
| `pixi-silk/ui/grid` | `CanvasGrid`. |
| `pixi-silk/ui/ruler` | `Ruler`. |
| `pixi-silk/ui/guides` | `Guides`. |
| `pixi-silk/ui/measure` | `Measure`. |
| `pixi-silk/ui/marquee` | `Marquee`. |
| `pixi-silk/ui/outline` | `SelectionOutline`. |
| `pixi-silk/ui/gizmo` | `TransformGizmo`. |
| `pixi-silk/ui/group` | `SelectionGroup`. |
| `pixi-silk/ui/snap` | `SnapEngine`, `SnapGuides`. |
| `pixi-silk/ui/spacing` | `SpacingMarkers`, `findSpacing`. |
| `pixi-silk/ui/pathgizmo` | `PathGizmo`, `PenTool`. |
| `pixi-silk/ui/color` | Colour pickers and colour maths. |
| `pixi-silk/ui/timeline` | `MiniTimeline`. |
| `pixi-silk/ui/textedit` | `TextEditor`. |
| `pixi-silk/ui/panel` | `Panel`. |
| `pixi-silk/ui/layers` | `LayerTree`. |
| `pixi-silk/ui/inspector` | `Inspector`. |
| `pixi-silk/ui/minimap` | `Minimap`. |

## Common Mistakes

### [CRITICAL] Importing a subpath export from the root

Symptom: `Module '"pixi-silk"' has no exported member 'SilkText'` (or `SilkButton`, `SmartContainer`, `enableWebGPU`).

Wrong:

```ts nocheck
import { SilkGraphics, SilkText } from 'pixi-silk';
```

Correct:

```ts
import { Container } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { SilkText } from 'pixi-silk/text';

const card = new Container();
const bg = new SilkGraphics().roundRect(0, 0, 160, 48, 12).fill(0x1c1c1e);
const label = new SilkText({ text: 'Total', fontSize: 14, anchor: 0.5 });

label.position.set(80, 24);
card.addChild(bg, label); // SilkGraphics is a leaf: group siblings in a Container
```

### [HIGH] Treating SilkGraphics as Pixi Graphics

Symptom: `Property 'context' does not exist`, texture fills that do nothing, `g.svg(...)` is not a function. SilkGraphics has no GraphicsContext, texture fill or `svg()`. Load [pixi-silk-migrate-from-graphics](../pixi-silk-migrate-from-graphics/SKILL.md).

## API Reference

- [Overview and entry points](https://pixi-silk.schmooky.dev/api.md)
- [SilkGraphics](https://pixi-silk.schmooky.dev/api/classes/SilkGraphics.md)
- [createSilkApp](https://pixi-silk.schmooky.dev/api/functions/createSilkApp.md)
- [llms.txt](https://pixi-silk.schmooky.dev/llms.txt), [llms-full.txt](https://pixi-silk.schmooky.dev/llms-full.txt), [llms-ui.txt](https://pixi-silk.schmooky.dev/llms-ui.txt)
