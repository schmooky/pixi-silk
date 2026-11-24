# v2 text: plan

This plan maps the brief's milestones onto this repo. AUDIT.md covers what exists, and DECISIONS.md records the choices made so far. Each milestone ends green on build, tests and size budgets, and lands as one or more PRs. Nothing is pushed until the user asks.

## Answers to the open questions (brief sec. 13)

| # | Question | Answer | Source |
|---|---|---|---|
| 1 | Pixi version | v8 only (8.21 today) | default |
| 2 | WebGL1 | Not for v2 text. WebGL2 and WebGPU only. v2 text logs one error on a WebGL1 context | default |
| 3 | Other renderers | A headless reference backend in M6 | default |
| 4 | Locales | en, ar, he, plus Latin-script locales | default |
| 5 | v1 APIs that must keep working | All of `pixi-silk/text` and `pixi-silk/ui/textedit`, unchanged. v1 stays the dynamic text path | user (D2) |
| 6 | Translation platform | None: xlsx round trip only | default |
| 7 | Runtime user text | Names only. Canvas mode by default, and the shaper plugin is optional | default |
| 8 | Monorepo tooling | The existing pnpm workspace | default (repo) |
| - | Packaging | Runtime as subpaths of `pixi-silk`, and the compiler as `@pixi-silk/compiler` | user (D1) |
| - | Base branch | `feat/v2-text` from `origin/main` (`bba143c`) | user (D3) |
| - | Size metric | Brotli budgets, with gzip kept next to them | user (D4) |

## Layout

```
packages/pixi-silk/src/
  i18n.ts                pixi-silk/i18n           core: no Pixi import, no Unicode tables
  i18n/format.ts         section ids, flags, record sizes: the one definition the compiler shares
  i18n/bundle.ts         .silk reader: typed-array views over the fetched ArrayBuffer
  i18n/theme.ts          theme parsing, paint vs shape classification, composite style rows
  i18n/messages.ts       variant selection (Intl.PluralRules), slots, number formatting via digit tables
  i18n/layout.ts         greedy breaking at baked flags, L2 reordering from baked levels, hit rects
  i18n/instances.ts      glyph instance writer, update tiers
  i18n/backend.ts        SilkBackend interface (brief sec. 2.3)
  i18n/headless.ts       reference backend (M6)
  i18n-pixi.ts           pixi-silk/i18n/pixi      Silk.create, SilkMessage, silkBundleLoader, the pipe
  i18n/pixi/shader.ts    GLSL 3.00   <->   i18n/pixi/shader-wgsl.ts   WGSL twin
  i18n-canvas.ts         pixi-silk/i18n/canvas    dynamic slots: canvas run sprites (wraps text/edt.ts)
packages/compiler/       @pixi-silk/compiler, bin `silk`, Node only, depends on pixi-silk (workspace)
  src/import/            xlsx (exceljs), csv (--allow-csv)
  src/author/            parser, normalizer, linter
  src/shape/             harfbuzzjs shaping, bidi (reuses pixi-silk/text bidi), UAX #14
  src/atlas/             MSDF generation, page packing by script
  src/emit/              .silk writer, messages.d.ts, debug JSON
  src/cli.ts             silk compile | lint | export | import | bake | preview | size
  fixtures/              strings.xlsx, theme.json, fonts (OFL) and their licences
  tests/
apps/preview/            M7, private, not published
```

The compiler imports `pixi-silk/i18n/format` and the reader. The format then has a single definition, and every round-trip test uses the real runtime reader. The runtime never imports the compiler, and a check enforces it (M1).

v1's `bidi.ts` is a complete UAX #9. The compiler reuses it and runs `BidiCharacterTest.txt` against it (M2). This fixes the v1 runtime and the compiler together.

## M0: audit and plan (this PR)

- `docs/v2/AUDIT.md`, `PLAN.md`, `DECISIONS.md`.
- `scripts/size-check.mjs` reports brotli next to gzip. `ci/size-baseline.json` stores both. There is a new `text (bidi)` entry, so the cost of runtime Unicode data has a baseline (2.62 kB brotli).
- `docs/` added to the prose check.
- Done when `pnpm lint` and `pnpm size:check` pass.

## M1: bundle format and compiler skeleton

1. `packages/compiler` package: tsdown with Node output, vitest, the `silk` bin, `private: false` with a changeset. Add it to `check-publish-contents` and to CI.
2. `i18n/format.ts` and `i18n/bundle.ts`:
   - header, section table, and 8-byte alignment;
   - the little-endian assertion;
   - major and minor version checks (refuse a different major, warn on a newer minor).
3. Compiler `emit/writer.ts`. Tests:
   - write, read and compare (round trip);
   - every section offset is a multiple of 8;
   - a bundle with major + 1 is refused, and minor + 1 warns;
   - a truncated buffer throws a clear error.
4. `author/parse.ts` (sec. 3.1):
   - placeholders, tags, self-closing objects and backslash escapes;
   - no attributes, nesting up to 4, length and span caps.
5. `author/normalize.ts` and `lint.ts` (sec. 4.2):
   - NFC, CRLF to LF, and invisible-character rules;
   - the `<nbsp/>` and `<zwj/>` tokens;
   - placeholder and tag multisets checked against the source locale;
   - plural categories from `Intl.PluralRules`;
   - `maxLen`.
6. `import/xlsx.ts` with exceljs. It reads raw cell values, rejects formula cells, and checks the key column.
7. `fixtures/strings.xlsx` with the shop sample plus the sec. 9.2 item 16 cases: `=1+1`, `007`, `1/2`, a leading apostrophe, Alt+Enter, smart quotes, NBSP and pasted RLM. The fixture is built by a script in the repo, so it can be reviewed as code.
8. `emit/dts.ts` writes `messages.d.ts`. `silk lint` exits 0 when clean, 1 on errors, and 2 on bad usage.
9. A check that the runtime never imports the compiler: size-check markers (`exceljs`, `harfbuzz`, `node:`) on every `pixi-silk/i18n*` entry.

Done when every lint error names the sheet, row, column and locale, the round-trip tests pass, and `pnpm size:check` passes.

## M2: baked shaping and atlas (LTR first, then Arabic)

Fonts are downloaded first, after asking the user: Noto Sans and Noto Sans Arabic, regular and bold, with their OFL files. Hebrew comes from Noto Sans Hebrew, which needs the same approval.

1. `shape/bidi.ts`:
   - the v1 UBA, with placeholders as isolates (FSI to PDI);
   - `BidiCharacterTest.txt` conformance, with the test data vendored under `fixtures/unicode` at a pinned version.
2. `shape/linebreak.ts`:
   - UAX #14 with `LineBreakTest.txt` conformance;
   - compiler only, so its tables never reach the runtime.
3. `shape/shape.ts`, with harfbuzzjs:
   - itemize by level, script, fallback face and shape-relevant style;
   - shape every item with the paragraph as context;
   - keep `UNSAFE_TO_BREAK`, and write the RUNS columns.
4. Digit tables:
   - digits shaped with `tnum`;
   - Latin and native digits, separators, minus, percent, and the zero-width ALM, LRM and RLM marks;
   - an error for a missing glyph or a face without `tnum`, naming the key, the locale and the character.
5. `atlas/msdf.ts`:
   - one MSDF per used glyph;
   - pages grouped by script, `distanceRange` from the theme, and a warning when an effect would clip;
   - lossless PNG.
   - Determinism test: build twice and get byte-identical output.
6. Goldens:
   - `hb-shape` JSON for a fixed corpus: Latin, Arabic without diacritics, Arabic with diacritics, Hebrew, mixed direction, and a style change inside an Arabic word.
   - They are diffed in CI, and regenerated by a script.
7. Out-of-scope scripts (Thai, Lao, Khmer, Burmese, CJK) are an error unless `--allow-unsupported-scripts` is set.

Done when the goldens match, the conformance suites pass, the atlas is deterministic, and the sizes of the example `.silk` and its pages are reported.

## M3: runtime core and Pixi backend

1. Texture array spike on WebGL2 and WebGPU, using Pixi 8.21 `arrayLayerCount` and `viewDimension: '2d-array'`. Result goes in D9. Multi-texture binding is the fallback.
2. `i18n/layout.ts`:
   - greedy fill over the baked advances, breaking only at the baked flags;
   - L2 reordering per line from the levels;
   - `start`, `end`, `left`, `center` and `right` alignment, with no justification;
   - hit rects per visual fragment.
3. `i18n/theme.ts`: style rows and composite rows per unique tag stack. The paint vs shape table lives here, and the compiler imports it.
4. `i18n-pixi.ts`:
   - `Silk.create`, `addBundle`, `prepare`, `SilkMessage`, and `silkBundleLoader` (the app registers it with `extensions.add`);
   - the instanced pipe, with glyph metrics and style rows in data textures.
5. Shader twins: `msdf` (median), `sdf` and `mtsdf` by page kind. Pixel range comes from `fwidth`. Outline, glow, shadow and weight bias in linear space, with premultiplied alpha.
6. Decorations (underline and strike) and `accessibleText`.
7. `size-check` entries for each `pixi-silk/i18n*` entry, with markers for v1 bidi (`bidiClass`) and v1 layout. The first measurement sets the budgets (brief sec. 10 targets: core 20 kB, pixi 12 kB, canvas 4 kB, all brotli).
8. Render cases for each locale, renderer and glyph kind in `render-cases.js`, through `check:render --renderer=all`. v1 cases stay as they are.

Done when the en and ar shop screen renders from baked data on WebGL2 and WebGPU, the v1 demos still render, and the budgets are set.

## M4: messages, slots, tiers

- Plural variants, number slots (the `value-fast` path through the digit tables), inline objects from `registerInline`, composite styles, `theme.set` paint updates, and `silk.on('update', { tier, ms })`.
- Tests assert which tier ran for every kind of change, and count allocations and instance writes. Paint must make zero instance writes, and `value-fast` must touch only the slot's range.
- A root `pnpm bench` covers `prepare` for 200 messages and the layout of a 3-line Arabic message. It reports numbers and has no timing gates.
- `{count}` at the start, middle and end of Arabic sentences, with minus and percent.

## M5: dynamic text

- `pixi-silk/i18n/canvas`:
  - run sprites from `fillText` plus `sdfFromAlpha` (v1 code), in an `OffscreenCanvas` worker when the platform has one;
  - the `system` font by default;
  - an emoji bitmap path.
- Mixed-direction tests: a Latin name in Arabic text, an Arabic name in English text, and punctuation next to slots.

## M6: scale

- Cross-text batching, modelled on `SilkPipe`. The goal is one draw for 50 texts that share a page set, asserted by counting draw calls.
- A layout LRU with a memory budget, and `silk.stats()` with atlas memory and cache sizes.
- Per-chunk bundles (`--split-by`).
- `i18n/headless.ts` reference backend, with core tests run through it.

## M7: shaper plugin and tooling

- Prototype kb_text_shape WASM and HarfBuzz HB_TINY, then measure compressed size, Arabic results and speed (D10).
- Ship the winner with a runtime atlas page and the font-hash check.
- `silk export` and `silk import` round trip.
- `apps/preview`: live theme editing, lint errors per cell, and RTL.
- Docs: v1 to v2 migration, a one-page translator guide with screenshots, and a theme guide.
- Definition of done: the shop screen in en and ar runs with no font file and no shaper downloaded. A Playwright test checks the network log.

## Not in v2

The same list as brief sec. 14, plus WebGL1 for v2 text (open question 2).
