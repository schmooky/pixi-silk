---
'pixi-silk': minor
---

Add effects drawn from the distance field in the same draw call, plus glass and glow.

- Fills and strokes take `spread` (grow before blur), `blend: 'add'` (plus lighter) and a progressive `blur: { from, to, angle }`.
- `innerShadow` draws one or more inset shadows with offset, blur, spread, colour and blend on any closed shape.
- `mesh(cols, rows, colors)` is a smooth gradient mesh, blended in OKLab.
- `pixi-silk/glass`: a frosted glass pane with backdrop blur, refraction, dispersion, a lit rim and grain.
- `pixi-silk/glow`: stacked glow passes, neon and halo recipes, an animated aurora, light rays and spectrum helpers.
