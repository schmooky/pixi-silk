---
"pixi-silk": minor
---

Strokes support `join: 'miter' | 'bevel' | 'round'` and `miterLimit`, as in Canvas 2D. The default is now `miter`, so stroked rects without a radius have sharp corners. Use `join: 'round'` for the old look. A stroked path is one distance field, with caps, joins and dashes, and no double blending at its corners. `union: true` on a fill or stroke paints several shapes as one, with no seam where they meet. The gizmo arrows and handles use it. `enableSilkBatching()` draws runs of consecutive SilkGraphics in one draw call. `new SilkGraphics({ batch: false })` opts an object out.
