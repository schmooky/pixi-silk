---
"pixi-silk": minor
---

Shape operations. `fill({ op })` and `stroke({ op })` combine the closed shapes of the active path with `union`, `subtract`, `intersect` or `exclude` into one exact shape. `boolean(op, a, b)` combines what two callbacks draw and nests. The result is one instance with a sharp outline, and it takes strokes, gradients, blur, spread and inner shadows. Hit tests follow it.

`svgPath(d)` reads an SVG path string into the active path, for fills, strokes and shape operations.

Hit tests of hearts, stars and sectors now follow their exact shape instead of their bounds.
