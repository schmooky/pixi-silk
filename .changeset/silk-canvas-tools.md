---
"pixi-silk": minor
---

Canvas tools for the camera, each its own entry point. `pixi-silk/ui/grid`: `CanvasGrid` draws an infinite lines or dots grid whose levels fade with the zoom, two silk shapes per level. `pixi-silk/ui/ruler`: `Ruler` draws top and left rulers with 1, 2, 5 labels, a selection band and a cursor marker. `pixi-silk/ui/guides`: `Guides` are dragged out of the rulers, snap to a `SnapEngine` and feed it back.

`pixi-silk/ui/marquee`: `Marquee` is rubber-band selection on empty canvas, with Shift to add, Alt to take away, and intersect or contain modes. `pixi-silk/ui/group`: `SelectionGroup` lets the `TransformGizmo` move, resize and rotate several objects about a common pivot. `pixi-silk/ui/spacing`: `findSpacing` and `SpacingMarkers` show Figma-style equal gaps and alignment lines. `Camera` gains `world` and `element` getters.
