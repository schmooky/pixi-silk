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
| Line breaking (UAX #14) | `linebreak` 2.0.0, MIT | See D13 |
| Bidi classes | Generated from Unicode 16.0.0 `DerivedBidiClass.txt` (`src/shape/bidi-classes.ts`) | The UBA itself is v1's `pixi-silk/text/bidi`, which passes all 91 707 cases of `BidiCharacterTest.txt` with these classes |

Each one is a dependency of `@pixi-silk/compiler` only. None is a runtime dependency of `pixi-silk`, so the runtime budget is unaffected.

## D7. Versioning

"v2" names the text system and the `.silk` format (major 2). In `pixi-silk` it is an additive minor release, because no v1 API changes. The compiler package starts at 0.x until M7.

## D8. Key hashing

Production bundles store a 32-bit FNV-1a hash of each key. The compiler fails on a collision within a bundle and reports both keys. Dev bundles also store the key strings.

## D9. Atlas binding

Pixi 8.21 has `TextureSource.arrayLayerCount` and `viewDimension: '2d-array'` on WebGL2 and WebGPU. SilkMessage binds up to four atlas pages as separate textures and picks one per glyph with the page slot in the glyph metrics. A bundle with more than four pages warns and should be split with `--split-by`. The shop example uses two pages per locale. Texture arrays have not been spiked yet. They would lift the four-page limit and are an optimization, not a format change.

## D10. Runtime shaper (to measure in M7)

kb_text_shape WASM against HarfBuzz HB_TINY (built with `-Oz`, LTO and `wasm-opt -Oz`, exporting only the shaping calls). Compare compressed size, Arabic results and speed.

## D11. Atlas page format (to measure in M2)

Lossless PNG, lossless WebP, and KTX2 (raw data with Zstd), compared after brotli.

## D12. RUNS encoding (to measure in M2)

Plain i16 columns against delta-encoded clusters, compared after brotli.

## D13. Line breaking in the compiler

The compiler uses the `linebreak` package (UAX #14 for Unicode 13). It passes 7594 of the 7652 cases of `LineBreakTest.txt` for that version. The 58 differences are listed one by one in `tests/linebreak-known.json`, so a new failure, or a fixed one, fails the test. Writing our own UAX #14 for Unicode 16 is possible later. It changes only compiler output, never the runtime or the format.

## D14. Unicode data for tests

`scripts/fetch-ucd.ts` downloads `BidiCharacterTest.txt`, `DerivedBidiClass.txt` and `LineBreakTest.txt` into `packages/compiler/.cache/ucd` (not committed, about 8 MB). The conformance tests are skipped when the files are missing, and CI fetches them first.

## D15. Runtime budgets (first measurement, M3)

Measured with `pnpm size` (minified, brotli quality 11), and kept by the size check's 10% regression gate:

| Entry | Brotli | Brief target |
|---|---|---|
| `pixi-silk/i18n` (core, everything) | 5.79 kB | 20 kB |
| `pixi-silk/i18n/pixi` (`Silk`, `SilkMessage`, loader; core included) | 10.66 kB | 12 kB for the Pixi part alone |

Both entries are checked for bidi class names, HarfBuzz, exceljs and Node built-ins. The shop example compiles to `en.silk` 1.19 kB, `ar.silk` 2.09 kB and `he.silk` 1.25 kB brotli, plus three PNG pages of 54, 96 and 29 kB.
