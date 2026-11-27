---
'pixi-silk': minor
---

Cheaper GPU frames for UI.

- `BlockSurface` paints into two layers. Blocks that do not change stay in a still layer, painted once and cached. A block moves to the live layer the first time it animates or changes, and only that layer draws while something moves. A win count-up in the slot HUD lab went from 1364 to 110 microseconds of GPU time per frame. `BlockOptions.layer` sets the layer by hand, and `stats` counts `stillPaints` and `liveBlocks`.
- `ButtonBlock` takes `flat: true`: one face with its border, colours mixed on the CPU, no blurred shadow.
- The shader returns the fill at once inside solid rectangles, rounded rectangles and ellipses, away from the edge and the stroke. Big panels cost 20 to 45 percent less.
- `renderOnDemand(app)` renders only frames that something asked for. `requestFrame()` asks, and `BlockSurface` calls it when it paints.
- `enableLowEnd(app)` caps the resolution at 1.5, renders on demand, and gives blocks their cheap look: flat buttons, no corner smoothing, 30 repaints a second. `when: 'auto'` asks `isLowEndDevice()` first.
