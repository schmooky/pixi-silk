# @pixi-silk/compiler

## 0.1.0

### Minor Changes

- [#19](https://github.com/schmooky/pixi-silk/pull/19) [`6626014`](https://github.com/schmooky/pixi-silk/commit/6626014d6f2d0f20923605756712ce02586b4b6a) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - New `pixi-silk/i18n` entry point: the renderer-agnostic core of baked localized text. It reads `.silk` bundles written by the new `@pixi-silk/compiler` package (the `silk` command), which imports strings from .xlsx, lints them, shapes them with HarfBuzz at build time and bakes MSDF atlas pages. `pixi-silk/i18n/pixi` draws them in PixiJS on WebGL2 and WebGPU: `Silk`, `SilkMessage` and the `silkBundleLoader` for `Assets`. `pixi-silk/text/bidi` exposes the Unicode Bidirectional Algorithm on its own. `pixi-silk/text` is unchanged. `pixi-silk/i18n/canvas` draws text slots such as player names, and `SilkMessageLayer` draws many messages in one draw call.

- [#20](https://github.com/schmooky/pixi-silk/pull/20) [`7d7eb16`](https://github.com/schmooky/pixi-silk/commit/7d7eb167f305a9d1fd4b4f46c0a15bbaafde2827) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - The compiler writes atlas pages as lossless WebP by default when the optional `sharp` package is installed: about 28% smaller than PNG, with the same pixels. Without sharp it writes PNG and warns with `png-pages`. Set `atlas.format` to `"png"` to keep PNG. `Silk.addBundle` loads either format, as before.

### Patch Changes

- Updated dependencies [[`bcbfdf1`](https://github.com/schmooky/pixi-silk/commit/bcbfdf1f1f9756a2145fb00b7fd56089fe1b60e9), [`0ceef04`](https://github.com/schmooky/pixi-silk/commit/0ceef04906a53623bbb1109ff12f81e76e7d0630), [`6626014`](https://github.com/schmooky/pixi-silk/commit/6626014d6f2d0f20923605756712ce02586b4b6a), [`7d7eb16`](https://github.com/schmooky/pixi-silk/commit/7d7eb167f305a9d1fd4b4f46c0a15bbaafde2827)]:
  - pixi-silk@1.3.0
