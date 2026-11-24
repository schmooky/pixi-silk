---
"pixi-silk": minor
---

New `pixi-silk/i18n/shaper` entry point. It draws text slots such as player names with the font the bundle was baked from. The kb_text_shape shaper in WebAssembly (62 kB brotli) shapes them, and the outlines become a distance-field run sprite with no canvas. Pass `await createShapedText({ font })` as `dynamicText` to `Silk.create`.
