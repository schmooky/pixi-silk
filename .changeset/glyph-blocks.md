---
'pixi-silk': minor
---

Text and shapes in one draw call, and one-draw-call UI.

- `SilkGraphics.glyph()` and `Prim.Glyph`: a glyph cell of the text atlas is a closed shape. Fill, stroke, blur, gradients, shape operations and hit testing work on it like on any shape, on WebGL2, WebGPU and WebGL1.
- `drawText()` and `measureText()` in `pixi-silk/text`: lay out a string and add its glyphs to a SilkGraphics. The text draws in the call of the shapes around it and batches with other objects. Layouts of recent strings are cached.
- `pixi-silk/ui/blocks`: `BlockSurface`, `Block`, `ButtonBlock`, `CounterBlock`, `TextBlock`, `PanelBlock`, `stack` and `group`. Blocks are flex slots that paint into the surface's one SilkGraphics and follow signals. The surface draws live while something moves and as one cached texture at rest, one draw call either way, and its loop sleeps when nothing moves.
