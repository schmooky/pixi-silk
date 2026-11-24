---
"@pixi-silk/compiler": minor
"pixi-silk": patch
---

The compiler writes atlas pages as lossless WebP by default when the optional `sharp` package is installed: about 28% smaller than PNG, with the same pixels. Without sharp it writes PNG and warns with `png-pages`. Set `atlas.format` to `"png"` to keep PNG. `Silk.addBundle` loads either format, as before.
