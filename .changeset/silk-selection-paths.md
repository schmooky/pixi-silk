---
"pixi-silk": minor
---

New `pixi-silk/selection`. `Selection` keeps the selected items in order, the primary item and the hovered one as signals. `bindOutline`, `bindGizmo` and `bindMeasure` make the widgets follow it with one call each.

New `pixi-silk/history`. `History` is an undo stack with transactions, merging, labels, a depth limit and `canUndo` and `canRedo` signals. `recordSignals` makes signal changes undoable without commands, `recordGizmo` turns each gizmo drag into one step, and `bindHistoryKeys` binds cmd or ctrl + Z. Widgets take any `HistoryLike`, so an app can bring its own store.

New `pixi-silk/path` and `pixi-silk/ui/pathgizmo`. Bezier paths are plain data with helpers to draw, split, insert, delete and convert from and to SVG. `PathGizmo` edits them like a design tool, with a pen tool, and every edit is undoable.
