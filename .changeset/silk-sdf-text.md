---
'pixi-silk': minor
---

Add `pixi-silk/text`: text that stays sharp at any zoom, drawn from signed distance fields.

- `SilkText` is a display object with the PixiJS `Text` options you use for labels: font, size, weight, style, fill (colour or gradient), letter spacing, line height, alignment and word wrap. It is one instanced draw call per text, on WebGL2 and WebGPU.
- Outlines, drop shadows, glows, weight changes and tabular numbers come from the same distance field, with no filters.
- `SdfAtlas` bakes glyphs of any CSS font at runtime with Canvas2D and an exact distance transform, into one shared texture that grows as needed. `layoutText` and `sdfFromAlpha` are exported too.
- `ValuePill` takes a `label` factory. Pass `silkLabel()` for pills that stay sharp under a zooming camera. Widgets keep PixiJS `Text` by default and never import SilkText on their own.
