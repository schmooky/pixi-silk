---
"@pixi-silk/shaper-kb": minor
---

New package `@pixi-silk/shaper-kb`: the runtime shaper for text slots. kb_text_shape, compiled to WebAssembly (62 kB with brotli), shapes a slot's value with the font the bundle was baked from. The outlines are filled in JavaScript and turned into an SDF run sprite, so names match the baked text in font and shaping on every platform. Pass `await createShapedText({ font })` as `dynamicText` to `Silk.create`. Values the font cannot draw go to an optional fallback provider, such as `createCanvasText`.
