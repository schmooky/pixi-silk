---
"pixi-silk": minor
"@pixi-silk/compiler": minor
---

New `pixi-silk/i18n` entry point: the renderer-agnostic core of baked localized text. It reads `.silk` bundles written by the new `@pixi-silk/compiler` package (the `silk` command), which imports strings from .xlsx, lints them, shapes them with HarfBuzz at build time and bakes MSDF atlas pages. `pixi-silk/i18n/pixi` draws them in PixiJS on WebGL2 and WebGPU: `Silk`, `SilkMessage` and the `silkBundleLoader` for `Assets`. `pixi-silk/text/bidi` exposes the Unicode Bidirectional Algorithm on its own. `pixi-silk/text` is unchanged. `pixi-silk/i18n/canvas` draws text slots such as player names, and `SilkMessageLayer` draws many messages in one draw call. `pixi-silk/i18n/shaper` draws text slots with the baked font instead: kb_text_shape in WebAssembly (62 kB brotli) shapes them, with no canvas.
