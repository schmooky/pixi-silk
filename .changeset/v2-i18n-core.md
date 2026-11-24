---
"pixi-silk": minor
"@pixi-silk/compiler": minor
---

New `pixi-silk/i18n` entry point: the renderer-agnostic core of baked localized text. It reads `.silk` bundles written by the new `@pixi-silk/compiler` package (the `silk` command), which imports strings from .xlsx, lints them, shapes them with HarfBuzz at build time and bakes MSDF atlas pages. `pixi-silk/text/bidi` exposes the Unicode Bidirectional Algorithm on its own. `pixi-silk/text` is unchanged.
