---
'pixi-silk': minor
---

Text and shapes in one draw call, and UI built from blocks.

- `SilkGraphics.glyph()` and `Prim.Glyph`: a glyph cell of the text atlas is a closed shape. Fill, stroke, blur, gradients, shape operations and hit testing work on it like on any shape, on WebGL2, WebGPU and WebGL1.
- `drawText()` and `measureText()` in `pixi-silk/text`: lay out a string and add its glyphs to a SilkGraphics. The text draws in the call of the shapes around it and batches with other objects. Layouts of recent strings are cached.
- `pixi-silk/ui/blocks`: `BlockSurface`, `Block`, `ButtonBlock`, `CounterBlock`, `TextBlock`, `PanelBlock`, `stack` and `group`. Blocks are flex slots that paint into the surface and follow signals. The surface caches what does not move, and its loop sleeps when nothing moves.
