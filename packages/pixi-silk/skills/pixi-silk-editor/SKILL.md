---
name: pixi-silk-editor
description: "Use this skill when building a design-tool or editor canvas with pixi-silk in PixiJS v8. Covers Camera (pan, zoom, inertia, wheel, keys) and ZoomControl, CanvasGrid, Ruler, Guides, Marquee, SelectionOutline, TransformGizmo (move, rotate, scale, box, universal, snapping), SelectionGroup, SnapEngine and SnapGuides, SpacingMarkers, Measure, the Selection store and bindOutline, bindGizmo, bindMeasure, History with recordSignals, recordGizmo and bindHistoryKeys, BezierPath, drawPath and PathGizmo, TextEditor, Panel, LayerTree, Inspector, Minimap, colour pickers, MiniTimeline. Triggers on: editor canvas, design tool, Camera, pan and zoom, infinite canvas, grid, ruler, guides, marquee selection, TransformGizmo, gizmo, snapping, Selection, undo, redo, History, PathGizmo, pen tool, TextEditor, LayerTree, Inspector, Minimap, ColorPicker."
license: MIT
---

The editor kit is a set of entry points that work together on one canvas. A `Camera` moves a world container. Overlays above it (grid, rulers, outlines, gizmos) stay one screen pixel wide at any zoom. Stores hold the selection and the undo history. The kit is marked experimental for 1.0: names may still change.

The layout is always the same. `world` holds your content and is moved by the camera. `overlay` sits above it in screen space and holds the tools.

## Quick Start

```ts
import { Container } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { Camera } from 'pixi-silk/ui/camera';
import { CanvasGrid } from 'pixi-silk/ui/grid';
import { TransformGizmo } from 'pixi-silk/ui/gizmo';

const world = new Container();
const overlay = new Container();
const camera = new Camera({ world, element: app.canvas });
const grid = new CanvasGrid({ camera, style: 'dots', axes: true });
const shape = new SilkGraphics().roundRect(-60, -40, 120, 80, 16, 0.6).fill(0x0a84ff);
const gizmo = new TransformGizmo({ mode: 'universal', snap: { translate: 10, angle: Math.PI / 12, scale: 0.1 } });

world.addChild(shape);
overlay.addChild(gizmo);
app.stage.addChild(grid, world, overlay);
gizmo.attach(shape);
```

## Core Patterns

### Selection, outlines and undo

```ts
import type { Container } from 'pixi.js';
import { bindHistoryKeys, History, recordGizmo } from 'pixi-silk/history';
import { bindGizmo, bindOutline, Selection } from 'pixi-silk/selection';
import { TransformGizmo } from 'pixi-silk/ui/gizmo';
import { SelectionOutline } from 'pixi-silk/ui/outline';

declare const layers: Container[];
declare const overlay: Container;

const selection = new Selection<Container>();
const outline = new SelectionOutline({ dash: [5, 4], march: 16, padding: 4 });
const hover = new SelectionOutline();
const gizmo = new TransformGizmo({ mode: 'box' });
const history = new History();

overlay.addChild(hover, outline, gizmo);
for (const layer of layers) {
    layer.eventMode = 'static';
    layer.on('pointerdown', (e) => selection.pick(layer, e.shiftKey ? 'toggle' : 'replace'));
    layer.on('pointerover', () => selection.state.hovered.set(layer));
}
bindOutline(selection, outline, hover);
bindGizmo(selection, gizmo);
recordGizmo(gizmo, history); // every drag is one undo step
bindHistoryKeys(history); // cmd or ctrl + Z, shift + cmd + Z
```

### Your own commands and signals in the history

```ts
import { History, recordSignals } from 'pixi-silk/history';
import { signal } from 'pixi-silk/signal';

const history = new History();
const doc = { title: signal('Untitled'), zoom: signal(1) };

recordSignals(history, doc);
doc.title.value = 'Poster';
history.execute({ label: 'Reset zoom', do: () => doc.zoom.set(1), undo: () => doc.zoom.set(2) });
history.undo();
history.undo(); // title is 'Untitled' again
```

### Rulers, guides, snapping, marquee

```ts
import { Container } from 'pixi.js';
import { Camera } from 'pixi-silk/ui/camera';
import { Guides } from 'pixi-silk/ui/guides';
import { Marquee } from 'pixi-silk/ui/marquee';
import { Ruler } from 'pixi-silk/ui/ruler';
import { SnapEngine } from 'pixi-silk/ui/snap';

const world = new Container();
const overlay = new Container();
const camera = new Camera({ world, element: app.canvas });
const ruler = new Ruler({ camera, format: (v) => `${Math.round(v)}` });
const engine = new SnapEngine();
const guides = new Guides({ camera, ruler, snap: engine });
let selected: readonly Container[] = [];

app.stage.eventMode = 'static';
app.stage.hitArea = app.screen; // the marquee listens on the stage
const marquee = new Marquee({ camera, surface: app.stage, candidates: () => world.children, selection: () => selected, onChange: (next) => (selected = next) });

guides.bindSnap(engine); // objects snap to the guides
overlay.addChild(guides, ruler, marquee);
app.stage.addChild(world, overlay);
```

### Editing a Bezier path

```ts
import { Container } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { History } from 'pixi-silk/history';
import { type BezierPath, drawPath } from 'pixi-silk/path';
import { watch } from 'pixi-silk/signal';
import { PathGizmo } from 'pixi-silk/ui/pathgizmo';

const world = new Container();
const overlay = new Container();
const drop: BezierPath = {
    closed: true,
    anchors: [
        { x: 0, y: -80, type: 'corner' },
        { x: 50, y: 20, in: { x: 0, y: -40 }, out: { x: 0, y: 40 }, type: 'smooth' },
        { x: -50, y: 20, in: { x: 0, y: 40 }, out: { x: 0, y: -40 }, type: 'smooth' },
    ],
};
const gizmo = new PathGizmo({ path: drop, space: world, history: new History() });
const shape = new SilkGraphics();

world.addChild(shape);
overlay.addChild(gizmo);
watch(gizmo.state.path, (path) => drawPath(shape.clear(), path).fill(0x0a84ff));
```

### Panels and text fields

```ts
import { Container } from 'pixi.js';
import { Camera } from 'pixi-silk/ui/camera';
import { Panel, panelHitTest } from 'pixi-silk/ui/panel';
import { TextEditor } from 'pixi-silk/ui/textedit';

const world = new Container();
const panels: Panel[] = [];
const camera = new Camera({ world, element: app.canvas, ignore: panelHitTest(() => panels) }); // drags on panels do not pan
const panel = new Panel({ title: 'Layers', dock: 'left', width: 260, viewport: camera.state });
const note = new TextEditor({ text: 'Edit me', fontSize: 15, width: 320, placeholder: 'Write something', element: app.canvas });

panels.push(panel);
note.on('change', (text: string) => console.log(text));
world.addChild(note);
app.stage.addChild(world, panel);
```

## Common Mistakes

### [HIGH] Tools inside the world container

Symptom: handles, outlines and rulers grow and shrink with the zoom, and hit areas drift. Keep gizmos, outlines, guides and rulers in an overlay above `world`. They follow their targets every frame and stay one screen pixel wide.

Wrong:

```ts nocheck
world.addChild(shape, gizmo);
```

Correct:

```ts
import { Container } from 'pixi.js';
import { TransformGizmo } from 'pixi-silk/ui/gizmo';

const world = new Container();
const overlay = new Container();
const gizmo = new TransformGizmo();

app.stage.addChild(world, overlay);
overlay.addChild(gizmo);
```

### [HIGH] Changing a BezierPath in place

Symptom: the shape and the gizmo do not update, and undo restores the wrong path. Path helpers (`moveAnchors`, `insertAnchor`, `setHandle` ...) never change their input. They return a new path: store it.

### [MEDIUM] A marquee that never starts

Symptom: dragging on empty canvas does nothing. The marquee listens on its `surface`. Give the stage `eventMode = 'static'` and `hitArea = app.screen`.

### [MEDIUM] Camera without an input element

Symptom: no wheel zoom or drag pan. Pass `element: app.canvas`. The camera reads wheel and pointer events from it.

## API Reference

- [pixi-silk/ui/camera](https://pixi-silk.schmooky.dev/api/ui/camera.md), [pixi-silk/ui/grid](https://pixi-silk.schmooky.dev/api/ui/grid.md), [pixi-silk/ui/ruler](https://pixi-silk.schmooky.dev/api/ui/ruler.md), [pixi-silk/ui/guides](https://pixi-silk.schmooky.dev/api/ui/guides.md), [pixi-silk/ui/marquee](https://pixi-silk.schmooky.dev/api/ui/marquee.md)
- [pixi-silk/ui/gizmo](https://pixi-silk.schmooky.dev/api/ui/gizmo.md), [pixi-silk/ui/outline](https://pixi-silk.schmooky.dev/api/ui/outline.md), [pixi-silk/ui/snap](https://pixi-silk.schmooky.dev/api/ui/snap.md), [pixi-silk/ui/group](https://pixi-silk.schmooky.dev/api/ui/group.md)
- [pixi-silk/selection](https://pixi-silk.schmooky.dev/api/selection.md), [pixi-silk/history](https://pixi-silk.schmooky.dev/api/history.md), [pixi-silk/path](https://pixi-silk.schmooky.dev/api/path.md), [pixi-silk/ui/pathgizmo](https://pixi-silk.schmooky.dev/api/ui/pathgizmo.md)
- [pixi-silk/ui/textedit](https://pixi-silk.schmooky.dev/api/ui/textedit.md), [pixi-silk/ui/panel](https://pixi-silk.schmooky.dev/api/ui/panel.md), [pixi-silk/ui/layers](https://pixi-silk.schmooky.dev/api/ui/layers.md), [pixi-silk/ui/inspector](https://pixi-silk.schmooky.dev/api/ui/inspector.md), [pixi-silk/ui/color](https://pixi-silk.schmooky.dev/api/ui/color.md)
- Guides: [Path editing](https://pixi-silk.schmooky.dev/docs/path-editing.md), [Panels](https://pixi-silk.schmooky.dev/docs/panels.md), [Editor tools](https://pixi-silk.schmooky.dev/docs/editor-tools.md), [Editing text](https://pixi-silk.schmooky.dev/docs/editing-text.md)
