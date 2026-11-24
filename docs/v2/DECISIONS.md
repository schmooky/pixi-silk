# v2 text: decisions

Each entry records what was decided, why, and what would change it. Entries marked "to measure" are open until a script in the repo produces the numbers.

## D1. Runtime as subpaths, compiler as its own package

- Runtime: `pixi-silk/i18n` (core), `pixi-silk/i18n/pixi` and `pixi-silk/i18n/canvas`, all in the existing `pixi-silk` package.
- Compiler and CLI: one Node-only package, `@pixi-silk/compiler`, with the `silk` bin.

Why:
- Tree-shaking already keeps unused entry points out of app bundles, and the size check proves it per import. Separate runtime packages would add version skew and release work and save nothing.
- The compiler is different. harfbuzzjs (WASM), exceljs and an MSDF generator would become install dependencies of every `pixi-silk` user, including apps that never compile a string. A bundler resolving Node-only code from the same package is also a risk.
- The CLI is a thin wrapper, so it ships inside the compiler package.

What would change it: a runtime entry point whose code needs its own release cadence, such as the WASM shaper plugin (decided in M7).

## D2. v1 text stays and is the dynamic path

`pixi-silk/text` (`SilkText`, `SdfAtlas`, `layoutText` and the rest) is unchanged and not deprecated. v2 baked text gets its own class, `SilkMessage`.

Why:
- v1 handles arbitrary runtime strings, CJK, editing (`TextEditor`) and justification. Baked text cannot take a plain string without a compile step, so a "compatibility layer" that turns `new SilkText('x')` into baked data cannot exist without a runtime shaper.
- Keeping one `SilkText` meaning avoids a breaking rename.
- v2 dynamic slots reuse v1's `edt.ts` and canvas rasterizing.

## D3. Base branch

`feat/v2-text` branches from `origin/main` at `bba143c` (pixi-silk 1.2.0, which includes the WebGL1 opt-in from PR #16).

## D4. Brotli budgets

`scripts/size-check.mjs` reports minified, gzip (level 9) and brotli (quality 11) sizes. The 10% regression gate stays on gzip for existing entries. v2 entry points are budgeted in brotli, as the brief asks.

v1 baseline, from `pnpm size`:
- `SilkText`: 18.36 kB brotli.
- `pixi-silk/text` (everything): 20.16 kB brotli.
- v1 Unicode data and the UBA: 2.62 kB brotli.

## D5. Loader registration is explicit

`pixi-silk/i18n/pixi` exports `silkBundleLoader`, and the app calls `extensions.add(silkBundleLoader)`. No module registers anything at import time (repo invariant, AGENTS.md sec. 4). This replaces the brief's "explicit loader registration entry point", and `sideEffects` stays `false` everywhere.

## D6. Compiler dependencies (to measure in M1 and M2)

| Need | Choice | Notes |
|---|---|---|
| Shaping | `harfbuzzjs` 1.6.4, MIT | The brief's choice. Goldens are compared with `hb-shape` from the same HarfBuzz version |
| xlsx | `exceljs` 4.4.0, MIT | The npm `xlsx` (SheetJS) is 0.18.5. Known advisories affect it, and fixed releases are only on the SheetJS CDN |
| MSDF | Our own TypeScript generator (`src/atlas/msdf.ts`) | `msdfgen-wasm` loads glyphs by Unicode code point, so it cannot generate the contextual forms HarfBuzz picks for Arabic (they have no code point). The TypeScript port is plain arithmetic, so its output is byte-identical (tested) |
| Glyph outlines | From harfbuzzjs draw callbacks | No second font parser, unless the MSDF choice needs one |
| PNG writing | Node `zlib` and a small encoder (`src/atlas/png.ts`) | Deterministic, with no dependency |
| Line breaking (UAX #14) | Our own, Unicode 16 (`src/shape/uax14.ts`) | See D13 |
| Bidi classes | Generated from Unicode 16.0.0 `DerivedBidiClass.txt` (`src/shape/bidi-classes.ts`) | The UBA itself is v1's `pixi-silk/text/bidi`, which passes all 91 707 cases of `BidiCharacterTest.txt` with these classes |

Each one is a dependency of `@pixi-silk/compiler` only. None is a runtime dependency of `pixi-silk`, so the runtime budget is unaffected.

## D7. Versioning

"v2" names the text system and the `.silk` format (major 2). In `pixi-silk` it is an additive minor release, because no v1 API changes. The compiler package starts at 0.x until M7.

## D8. Key hashing

Production bundles store a 32-bit FNV-1a hash of each key. The compiler fails on a collision within a bundle and reports both keys. Dev bundles also store the key strings.

## D9. Atlas binding

A bundle with up to four pages binds them as four textures, and the shader picks one per glyph. A bundle with more pages binds them as one `2d-array` texture, with the page slot as the layer, so it still draws in one call. Layers are as large as the largest page.

Pixi 8.21 allocates array textures but has no uploader for array data. `pixi-silk/i18n/pixi` brings its own (`PageArraySource`, one `texSubImage3D` or `copyExternalImageToTexture` per layer). It adds the uploader to the renderer passed to `Silk.create({ renderer })`. Without a renderer, or on WebGL1, more than four pages still warn. Each glyph's metrics now carry its page's distance range and kind, so neither shader variant needs per-page uniforms for distances. The render case `i18n-page-array` draws the shop compiled on 128-pixel pages (7 pages) against the normal bundle: max difference 1 on WebGL2 and WebGPU.

## D10. Runtime shaper

kb_text_shape v2.32, in the new package `@pixi-silk/shaper-kb`. Measured with `packages/compiler/scripts/measure-shapers.ts` against HarfBuzz 11 from harfbuzzjs 1.6.4:

| | kb_text_shape | HarfBuzz (harfbuzzjs) |
|---|---|---|
| WebAssembly, brotli | 62.0 kB | 143.9 kB |
| WebAssembly, raw | 473 kB | 434 kB |
| 18-character Arabic name | 14.0 us | 15.1 us |

On the test corpus (Latin, Arabic with and without marks, lam-alef ligatures, Hebrew) both give the same glyphs, advances and offsets. The one difference is clusters: HarfBuzz merges a mark into its base's cluster, kb_text_shape keeps the mark's own offset. Slots do not use clusters, so it does not matter here.

The build needs no Emscripten. `wasm/build.sh` compiles a freestanding wrapper (`wasm/kb_wasm.c`: memset, memcpy, a free-list allocator and three exports) with stock clang and lld for `wasm32`. The built `kb.wasm` is committed, so the package builds without LLVM. A HarfBuzz HB_TINY build would need Emscripten for its C++ runtime, and harfbuzzjs is already more than twice the size, so it was not built.

The package fills TrueType outlines in JavaScript (an exact area rasterizer, 4.7 kB with the rest of the package) and runs the distance transform of `pixi-silk/text`. It needs no canvas, so it runs in Node and in workers. `ShapedTextProvider.checkBundle` compares `fontHash` with the bundle faces and warns on a mismatch. CFF fonts are not supported.

## D11. Atlas page format

Measured with `packages/compiler/scripts/measure-formats.ts`, as the browser downloads each file:

| Example | Pages | PNG | Lossless WebP | KTX2, raw + Zstd 19 |
|---|---|---|---|---|
| shop (en, ar, he) | 3 | 179.9 kB | 128.2 kB | 361.2 kB |
| world (31 locales, every script) | 19 | 738.5 kB | 533.9 kB | 1335.4 kB |

Lossless WebP is 28% smaller than PNG and decodes to the same pixels (tested). KTX2 with an uncompressed payload is twice the PNG, so it is out (the brief allowed it only if smaller). PNG stays the default because it needs no native dependency. `atlas.format: "webp"` writes WebP and needs the optional `sharp` package.

## D12. RUNS encoding

Delta-encoding the cluster column saves 0.0 kB on the shop bundles and 0.2 kB of 26.8 kB (under 1%) on the world bundles after brotli. Runs stay plain i16 and u16 columns, which the runtime reads with no decoding step.

## D13. Line breaking in the compiler

The compiler has its own UAX #14 for Unicode 16.0.0 (`src/shape/uax14.ts`, rules LB1 to LB31 with LB15a to LB15d, LB19a, LB20a, LB21a and LB28a). Its class and East Asian Width tables are generated from `DerivedLineBreak.txt` and `EastAsianWidth.txt`, with their `@missing` defaults. It passes all 16 672 cases of `LineBreakTest.txt` 16.0.0. It replaced the `linebreak` package, which implemented Unicode 13 and had 58 known differences. Its output only changes the baked break flags, never the runtime or the format.

## D14. Unicode data for tests

`scripts/fetch-ucd.ts` downloads the Unicode 16 bidi and line break data and their conformance tests into `packages/compiler/.cache/ucd` (not committed, about 10 MB). The conformance tests are skipped when the files are missing, and CI fetches them first.

## D15. Runtime budgets (first measurement, M3)

Measured with `pnpm size` (minified, brotli quality 11), and kept by the size check's 10% regression gate:

| Entry | Brotli | Brief target |
|---|---|---|
| `pixi-silk/i18n` (core, everything) | 5.79 kB | 20 kB |
| `pixi-silk/i18n/pixi` (`Silk`, `SilkMessage` and the loader, core included) | 10.66 kB | 12 kB for the Pixi part alone |

Both entries are checked for bidi class names, HarfBuzz, exceljs and Node built-ins. The shop example compiles to `en.silk` 1.19 kB, `ar.silk` 2.09 kB and `he.silk` 1.25 kB brotli, plus three PNG pages of 54, 96 and 29 kB.

## D16. Names that differ from the brief

- `Silk.addBundle` instead of the brief's `silk.useBundle`. A `use` prefix reads as a React hook to linters: Biome's `useHookAtTopLevel` flagged every call in a loop. Apps with React lint rules would see the same.
- `SilkMessage` instead of a second `SilkText` (D2).
- `pnpm bench` runs timed loops in `packages/compiler/bench`. Vitest 5 has no `bench` export, so the bench is plain timing code. It reports numbers and gates nothing.

## D17. Update tier gates (M4)

`packages/pixi-silk/tests/i18n.test.ts` asserts which tier runs for each kind of change. It also counts what the tier touches:

- `paint` writes no instance and keeps the layout.
- `value-fast` writes the instance buffer once and changes only the glyph field of the slot's instances.
- `value`, `variant` and `layout` lay out again.
- `shape` warns and reshapes nothing.

JavaScript has no portable allocation counter, so the brief's "zero allocations" for `paint` is checked as "no instance write and no layout", and the paint path allocates only the patched style object.

`pnpm bench` on an Apple M-series laptop (Node 24), for reference only:

| Operation | Time |
|---|---|
| prepare and lay out one of 200 messages | 7.0 us |
| lay out a 3-line Arabic message | 26.7 us |
| `value-fast` number update | 0.87 us |
| `paint`, one style in two rows | 1.63 us |

## D18. The canvas path for text slots (M5)

- A text slot is drawn as one glyph of a one-glyph `sdf` page. The run sprite is built from Canvas2D `fillText` with v1's distance transform (`text/edt.ts`). The message shader draws it, so the slot's outline, glow and shadow apply. Colour emoji pixels go to a bitmap sprite on top.
- Run sprites are drawn in a worker on an OffscreenCanvas. The worker is `canvas-worker.js`, loaded with `new Worker(new URL(..., import.meta.url))`, a pattern bundlers follow. The main thread does neither the drawing nor the distance transform (0.36 to 0.87 ms per name in Node 24). Pixels come back transferred, not copied. Without `Worker` or `OffscreenCanvas`, or if the worker fails to start, slots draw on the main thread. `check:i18n` reports which path ran: the worker, on WebGL2 and WebGPU.
- Run sprites are padded to a multiple of 4 pixels wide. WebGL uploads single-byte rows with 4-byte alignment, and an odd width sheared the sprite on WebGL2 (seen in the demo, fixed).
- Size: `createCanvasText` alone is 4.61 kB brotli, because it includes the shader. Loaded lazily from `pixi-silk/i18n/pixi`, it adds 1.99 kB gzip on demand (brief target: 4 kB).
- The `system` font is the default and downloads nothing. A `CanvasFont` downloads one file before the first slot.

## D19. Scale (M6)

- **Cross-text batching.** `SilkMessageLayer` merges the instances of its SilkMessage children into one draw per bundle and theme. Each instance carries its message index in the kind field, plus 4 times the index. A data texture carries each message's matrix and alpha, so moving a message writes 8 floats and no instance. The render case `i18n-batch-50` draws 50 messages in 1 draw call against 50 unbatched, with a max pixel difference of 1 on WebGL2 and WebGPU.
- **Effects stop where the distance field stops.** Outline, glow and shadow blur are clamped to half the page's distance range in local pixels. Before, a glow wider than the field drew a square around small glyphs.
- **Tint.** Pixi's `uColor` is premultiplied, so the shader multiplies by it once. Before, a message with alpha below 1 had its colour multiplied by alpha twice.
- **Layout cache.** `Silk.layouts` is an LRU with a 4 MB budget. Messages that show the same variant, values, size and width share one layout. A message copies a shared layout before a `value-fast` write.
- **`silk.stats()`** reports bundles, pages, atlas bytes, metrics bytes and the layout cache.
- **Chunks.** `silk compile --split-by sheet|keyPrefix` writes `<locale>.<chunk>.silk`. Each chunk refers only to the pages its glyphs use. The pages stay shared, one set per compile.
- **SilkBackend.** `pixi-silk/i18n` defines the brief's backend interface, `submitLayout` drives any backend, and `HeadlessBackend` is the reference: it draws the shop messages on the CPU in a test, with no renderer. The Pixi side implements it too, as `PixiBackend` (`Silk.backend`). Atlas pages go through `uploadAtlasPage`, and theme rows through `writeStyleRows` (`PixiStyleRows`, one per theme). Each SilkMessage owns a text buffer (`createTextBuffer`, `writeInstances`, `destroyTextBuffer`). A `value-fast` update writes only the slot's instance range. Text slots arrive as `RunSprite` pixels through `setRunSprite`, so the canvas path no longer touches Pixi. The size check's `i18n (runtime path)` entry keeps the reference backend out of what apps load.

## D20. The app's locales, and scripts without spaces

The app uses its own locale codes, and many are country codes or collide with ISO 639 codes of other languages. Examples: `ca` is Canadian English, not Catalan. `sd` is Nepali, not Sindhi. `aa` is Amharic, not Afar. `am` is Kurdish Badini, not Amharic. `ne` is Kurdish Kurmanji, not Nepali. `zu` is Zaza, not Zulu. `in` is Indian English.

- `@pixi-silk/compiler` exports `APP_LOCALES`: every app code with its English name and the BCP 47 tag it stands for, sorted by name. It holds the app's 98 codes plus 33 more (Afrikaans, Basque, Canadian French, Catalan as `ca-ES`, Dari, Gujarati, Kannada, Malayalam, Marathi, Odia, Punjabi, Telugu, Tigrinya, Zulu as `zu-ZA` and others). An added code never reuses one of the app's codes.
- `silk.config.json` keys stay the app's codes, and a locale may set `bcp47` and preferred `families`. Plural rules, numbering systems (CLDR's default unless pinned), script, direction and the shaping language all come from the BCP 47 tag. A bundle stores both: `SilkBundle.id` is the app code and `SilkBundle.locale` the tag. `Silk.bundles` and `prepare({ locale })` use the app code.
- This supersedes "out of scope for v2" for Thai, Lao, Khmer, Burmese and CJK line breaking. The compiler adds break opportunities between words of Thai, Lao, Khmer and Burmese from ICU's dictionaries (`Intl.Segmenter`, which Node ships with full ICU). UAX #14 already breaks between CJK characters. The breaks are baked, so the runtime still carries no tables.
- Fonts: full Noto fonts for 22 more scripts live in `packages/compiler/.cache/fonts` and are not committed. `scripts/build-world-fixture.ts` subsets them with HarfBuzz's subsetter (`subsetFont`, exported) to the characters `fixtures/world` needs, 348 kB in all, with their OFL licences. `tests/world.test.ts` compiles 32 locales, one per script group.
- Gurmukhi (Punjabi) comes from the `@expo-google-fonts/noto-sans-gurmukhi` npm package (Noto Sans Gurmukhi, OFL), because the GitHub mirrors refused the download. The `GurbaniWebThick` font offered first has no Gurmukhi code points: it is a legacy font that draws Gurmukhi on ASCII letters, with no shaping tables and an all-rights-reserved licence.

## D21. Atlas size per script

Han characters pack many strokes into one em. Drawn large (64 px) from pages at the default 40 atlas pixels per em, the dense parts of characters such as 鬱 and 釁 merge. At 56 they stay apart. At 12 to 16 px on screen both look the same: the screen's pixels limit legibility there, not the atlas. `atlas.emSizeByScript` sets pixels per em by page group, and defaults to `{ han: 56, hangul: 48 }`. The distance range scales with it, so outlines and glows keep their reach in local pixels. Han pages take about twice the area of the same glyphs at 40.

Recommended minimum text size for baked text is 12 px. Below it, SDF text has no hinting. Use `sdf` pages with a larger `emSize` for UI that must be smaller.
