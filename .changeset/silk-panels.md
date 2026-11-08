---
"pixi-silk": minor
---

New editor panels, drawn on the canvas with no DOM. Each has its own entry point.

`pixi-silk/ui/panel` has `Panel`: a title bar, a body that scrolls, edges to resize and a chevron that folds it. Drag it by the title, and drop it near a screen edge or corner to dock it there. `ScrollView` scrolls with glide, flings and a slim scrollbar. `panelHitTest` keeps camera wheels and pans off the panels.

`pixi-silk/ui/layers` has `LayerTree`, a virtualised layer list over any tree through a `TreeAdapter`. It selects with a `Selection` store, drags rows to reorder and reparent them, renames in place and moves with the arrow keys. `pixiTreeAdapter` shows a Pixi scene graph.

`pixi-silk/ui/inspector` has `Inspector`, built from a schema of number, text, toggle, choice, colour and vector fields in folding sections. It edits objects or signals, shows Mixed for differing values and records one undo step per drag.

`pixi-silk/ui/minimap` has `Minimap`, a view of a camera's world with a frame you drag, click and scroll.

`Camera` takes an `ignore` option for points it should leave alone.
