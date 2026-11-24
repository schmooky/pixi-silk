# v2 text: audit of the repo (Milestone 0)

The brief is `pixi-silk-v2-task.md`: localized rich SDF text, shaped at build time. This file records what the repo has today, what the design can reuse, what conflicts with it, and which public APIs users depend on. It is based on `main` at `bba143c` (pixi-silk 1.2.0, PixiJS 8.21.0).

## 1. What exists today

### Repo and tooling

- pnpm workspace (`pnpm-workspace.yaml`: `packages/*`, `apps/*`), Node 22.12 or newer.
- One published package, `pixi-silk`. It has one ESM entry point per area and `sideEffects: false`, and builds with tsdown, one output file per module.
- The docs site lives in `apps/site` (Astro). Demos are in `apps/site/src/demos`.
- Checks:
  - Biome and `scripts/check-prose.mjs`.
  - vitest in node, with no GPU: 35 test files.
  - publint and Are the Types Wrong, run in `pnpm build`.
  - `scripts/size-check.mjs`: rolldown with a minified bundle per typical import, compared with `ci/size-baseline.json`. It fails at 10% growth and has tree-shaking markers.
  - `check:render`, `check:wgsl` and `check:pages`, through playwright-core.
- Changesets is required for library changes, and commitlint enforces Conventional Commits.
- There is no `pnpm bench` at the root. `packages/pixi-silk/bench/primitives.mjs` benchmarks SilkGraphics only.

### Text: `pixi-silk/text` (v1)

All text is shaped and laid out at runtime.

| File | Lines | What it does |
|---|---|---|
| `src/text/atlas.ts` | 692 | `SdfAtlas`: draws glyphs with Canvas2D `fillText`, then `sdfFromAlpha` makes a single-channel SDF. The texture is `r8unorm` (`BufferImageSource`), 1024 wide, and doubles in height up to 4096. A separate RGBA texture holds colour emoji. Advances and kerning are measured with `measureText`. Defaults: bake size 48, radius 16 |
| `src/text/edt.ts` | 145 | TinySDF-style Euclidean distance transform (Felzenszwalb and Huttenlocher) |
| `src/text/bidi.ts` | 545 | Full UAX #9 in JS: P2/P3, X1 to X10, W1 to W7, N0 to N2, I1/I2, L1, L2 and L4, plus a bidi class table |
| `src/text/cluster.ts` | 271 | Clusters (marks, emoji, joined Arabic runs, words of complex scripts) and break opportunities (CJK, Thai, Burmese, Khmer and Lao heuristics) |
| `src/text/segment.ts` | 128 | Grapheme and word stops for editing, using `Intl.Segmenter` |
| `src/text/layout.ts` | 1191 | `layoutText`: wrapping, align (including `justify`), tabs, ellipsis, `maxLines`/`maxWidth`/`maxHeight`, `shrinkToFit`, inline boxes (`{name}`), and carets and range rects |
| `src/text/SilkText.ts` | 1082 | `SilkText extends Mesh`: 12 floats per glyph instance, one draw per text. Every style field has a setter and `set()` |
| `src/text/shader.ts` | 453 | GLSL 3.00 and WGSL twins. Passes run shadow, then outline, then fill. A box filter one device pixel wide, a 4-tap path for small text, and gradient fills from the gradient atlas |
| `src/text/rich.ts` | 286 | `SilkRichText`: places Sprites or SilkGraphics into the inline boxes of a SilkText. It has no per-span styles |
| `src/text/label.ts` | 64 | `silkLabel()` and `silkRichLabel()` label factories for widgets |

v1 styling is per object. Fill, outline, shadow and dilate are uniforms of one `SilkText`, so one text has one look. Rich styling (a gold word inside a sentence) needs several SilkText objects.

Sizes, measured with `pnpm size` (minified, then gzip level 9 and brotli quality 11):

| Import | min | gzip | brotli |
|---|---|---|---|
| `pixi-silk/text` (everything) | 59.49 kB | 22.82 kB | 20.16 kB |
| `SilkText` | 53.74 kB | 20.78 kB | 18.36 kB |
| `layoutText, sdfFromAlpha` (no Pixi) | 20.04 kB | 8.95 kB | 7.84 kB |
| `bidiClass, resolveLevels, visualOrder` (Unicode data and the UBA) | 6.40 kB | 3.12 kB | 2.62 kB |
| `TextEditor` | 146.75 kB | 53.45 kB | 45.98 kB |

The `SilkText` row includes the core SilkGraphics code that it imports for gradients.

### Rendering infrastructure the design can use

- `src/batch.ts` has `SilkPipe` and `enableSilkBatching`, and it packs many SilkGraphics into one draw with RGBA32F data textures (`dataTexture`, `packBatch`). It is the model for v2 cross-text batching in Milestone 6.
- `src/shader-slot.ts` is a slot pattern, so a renderer's code loads only when it is opted in (`pixi-silk/webgpu`, `pixi-silk/webgl1`).
- `pixi-silk/webgl1` converts GLSL ES 3.00 to 1.00 at runtime and moves instance data into a float texture.
- Pixi 8.21 texture arrays exist on both backends. `TextureSource` has `arrayLayerCount` and `viewDimension: '2d-array'`. `GlTextureSystem` uploads `TEXTURE_2D_ARRAY` (WebGL2 only, and it throws on WebGL1), and `GpuTextureSystem` sets `depthOrArrayLayers`. The upload path is recent and needs a spike before we rely on it (see PLAN, M3).

### Dependencies

- `pixi-silk` has `pixi.js` as a peer and no runtime dependencies.
- None of the brief's compiler dependencies are installed yet. On npm today:
  - `harfbuzzjs` 1.6.4 (MIT)
  - `exceljs` 4.4.0 (MIT)
  - `xlsx` 0.18.5 (Apache-2.0). The npm release is stale, and newer SheetJS releases are only on the SheetJS CDN.
  - `msdfgen-wasm` 1.0.0 (MIT)
  - `fontkit` 3.0.0 (MIT)
  - `opentype.js` 2.0.0 (MIT)

## 2. What maps onto the design

| Brief | Existing code | Reuse |
|---|---|---|
| Dynamic canvas slots (sec. 6.5): `fillText` plus a TinySDF transform | `SdfAtlas` and `sdfFromAlpha` | Directly. The canvas run sprite is a bigger cluster drawn by the same code, so `pixi-silk/i18n/canvas` can wrap `edt.ts` |
| Colour emoji as a bitmap sprite | The colour atlas in `atlas.ts` (`hasColor`, the RGBA cell) | The detection and the RGBA path |
| One shader with outline, glow, shadow and weight bias | `text/shader.ts`: shadow and outline passes, dilate as a threshold shift, an AA width in device pixels | The coverage math and the small-text 4-tap path move into the v2 shader. v2 replaces per-object uniforms with style rows and adds MSDF median and kind flags |
| Data textures (style table, glyph metrics) | `dataTexture` in `batch.ts` (RGBA32F `BufferImageSource`) | Directly |
| Cross-text batching (M6) | `SilkPipe` | Same structure: merge the instances, plus a transform data texture |
| Shader twins and render checks | `check:render`, `check:wgsl`, `render-cases.js` | v2 cases are added there |
| Size budgets and tree-shaking checks | `size-check.mjs` markers | New entries and markers for every v2 entry point |
| Inline objects with em sizes | `rich.ts` `InlineSize` (`em`, `cap`, `line`) and `TextInline.align` | The vocabulary and the alignment rules |
| Tests without a GPU | vitest in node | The core is renderer-agnostic, so it is fully testable there |
| `Intl.PluralRules` and `Intl.NumberFormat` | Built in | Nothing to ship |

## 3. What conflicts with the design

1. **Runtime Unicode data.**
   - v1 ships `bidi.ts` (2.62 kB brotli) and the script heuristics in `cluster.ts`.
   - The brief allows none of that in the static text runtime (sec. 9.1 item 3).
   - Resolution: v2 entry points must not import `text/bidi`, `text/cluster`, `text/layout` or `text/segment`. A size-check marker enforces it (PLAN, M3).
   - v1 keeps them, because v1 is the dynamic path.
2. **The SDF source.**
   - v1 draws glyphs with the browser's rasterizer at runtime, as single-channel SDF.
   - v2 uses MSDF built from font outlines at compile time.
   - These are separate atlases and separate shaders. The v2 shader is new, and it borrows math from the v1 shader without sharing a file.
3. **Placeholder syntax.**
   - v1 uses `{icon}` for an inline object box.
   - v2 uses `{name}` for a value placeholder and `<coin/>` for an inline object.
   - They live in different entry points and never parse the same string. The docs must say so plainly, because a user moving from v1 could mix them up.
4. **Loader registration.**
   - The brief wants a Pixi `Assets` loader extension.
   - The repo invariant forbids `extensions.add` in a module body.
   - Resolution: export the extension object, and the app calls `extensions.add(silkBundleLoader)` once. This is the same opt-in pattern as `enableWebGPU`.
5. **Package names.** The brief lists `@pixi-silk/core`, `/pixi`, `/dynamic-canvas`, `/compiler` and `/cli`. The repo ships subpaths of one package. Decided in DECISIONS.md D1: runtime as subpaths, compiler as its own Node package.
6. **Class name.** The brief uses `new SilkText(set.get(...))`, and `SilkText` is already v1. Decided in D2: v1 stays, and v2 gets `SilkMessage`.
7. **Justification.** v1 supports `align: 'justify'`, and v2 does not (sec. 9.2 item 21). That is fine, because it is a different class, but the docs say so.
8. **"Next major version".** v1 stays unchanged, so v2 text is additive and needs no breaking change in `pixi-silk`. See D7.
9. **WebGL1.** `pixi-silk/webgl1` now exists (1.2.0). The brief's default is no WebGL1 for v2 text. v2 text will log one clear error on a WebGL1 context instead of failing to compile, as v1 SilkGraphics did before the opt-in.

## 4. Public APIs users depend on

Found in the docs (`apps/site/src/content/docs/*.mdx`), the demos, the skills (`packages/pixi-silk/skills`) and the widgets:

- `pixi-silk/text`, every export listed in `src/text.ts`. The ones in active use:
  - `SilkText` and its options and setters. Used by `text.mdx`, `sdf-text*.demo.ts`, `text-rtl`, `text-scripts` and `text-fit`.
  - `SdfAtlas` and `SdfAtlas.shared`.
  - `SilkRichText` and `RichInline`.
  - `silkLabel` and `silkRichLabel`, the `LabelFactory` in `ValuePill`, `ruler`, `guides`, `measure`, `camera` and `timeline`.
  - `layoutText` and the caret helpers, used by `pixi-silk/ui/textedit` (`TextEditor`).
  - `bidiClass`, `resolveLevels`, `visualOrder` and `mirror`. They are exported, and the text skill documents them.
- `pixi-silk/ui/textedit` (`TextEditor`), which is built on v1 layout.
- Skills: `pixi-silk-text/SKILL.md` documents the v1 API with type-checked examples, so it must keep compiling.

v2 changes none of these (D2). The compatibility rule in the brief (sec. 0, rule 3) holds because v1 stays.

## 5. Risks found during the audit

- **Scope.** The brief covers several months of work: a compiler with HarfBuzz, MSDF, xlsx and bidi conformance, a binary format, a runtime, two backends and a preview app. PLAN.md splits it into milestones that can each be reviewed on their own.
- **Fonts in the repo.** Noto Sans and Noto Sans Arabic, regular and bold, are a few MB. Downloading them needs the user's approval when Milestone 2 starts. They go under `fixtures/fonts` with their OFL files.
- **SheetJS on npm.** The npm release (0.18.5) is stale. Known advisories affect it (prototype pollution and ReDoS), and the fixes ship only from the SheetJS CDN. The compiler uses `exceljs` instead (D6).
- **MSDF determinism.** We need byte-identical outputs. A WASM msdfgen is deterministic for the same build, but we have to measure it. Writing our own TypeScript MSDF is the fallback (D6).
- **Texture arrays in Pixi.** The upload path is recent. Multi-texture binding stays the default until a spike proves arrays work on WebGL2 and WebGPU.
