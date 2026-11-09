# AGENTS.md

Instructions for AI coding agents (Claude Code, Codex, Cursor and others) and for people working in this repo. Read it before you change anything. CONTRIBUTING.md has the human workflow, and this file does not repeat it.

If you are helping someone build with pixi-silk rather than change it, read the skills in `packages/pixi-silk/skills/` (start with `pixi-silk/SKILL.md`) and `apps/site/public/llms.txt`.

## 1. What this repo is

pixi-silk draws smooth vector graphics in PixiJS v8. `SilkGraphics` has a Graphics-like API, and the shader evaluates every shape as an exact signed distance field, so edges stay anti-aliased at any zoom, rotation and device pixel ratio. It renders on WebGL2 (default) and WebGPU.

```
packages/pixi-silk/   the library, published to npm as pixi-silk
apps/site/            the docs site (Astro), https://pixi-silk.schmooky.dev, not published
scripts/              repo checks: prose, render, WGSL, pages, size, skills, publish contents
```

The package has one entry point per area. The root import is the core and does not re-export the others.

| Area | Entry points |
|---|---|
| Core | `pixi-silk`: SilkGraphics, createSilkApp, gradients, colour, curves, motion, enableSilkBatching |
| Rendering | `pixi-silk/webgpu` |
| Paint | `pixi-silk/glass`, `pixi-silk/glow` |
| Text | `pixi-silk/text` |
| Layout | `pixi-silk/layout` (headless), `pixi-silk/ui/layout` (SmartContainer, FlexContainer) |
| UI widgets | `pixi-silk/signal`, `pixi-silk/ui/button`, `pixi-silk/ui/radial`, `pixi-silk/ui/dock`, `pixi-silk/ui/pill`, `pixi-silk/ui/odometer`, `pixi-silk/ui/dial`, `pixi-silk/ui/modes`, `pixi-silk/ui/gesture`, `pixi-silk/ui/arc`, `pixi-silk/ui/keys`, `pixi-silk/ui/halo` |
| Editor kit (experimental) | `pixi-silk/selection`, `pixi-silk/history`, `pixi-silk/path`, `pixi-silk/ui/camera`, `pixi-silk/ui/grid`, `pixi-silk/ui/ruler`, `pixi-silk/ui/guides`, `pixi-silk/ui/measure`, `pixi-silk/ui/marquee`, `pixi-silk/ui/outline`, `pixi-silk/ui/gizmo`, `pixi-silk/ui/group`, `pixi-silk/ui/snap`, `pixi-silk/ui/spacing`, `pixi-silk/ui/pathgizmo`, `pixi-silk/ui/color`, `pixi-silk/ui/brush`, `pixi-silk/ui/timeline`, `pixi-silk/ui/textedit`, `pixi-silk/ui/panel`, `pixi-silk/ui/layers`, `pixi-silk/ui/inspector`, `pixi-silk/ui/minimap` |
| Barrel | `pixi-silk/ui`: every widget and tool in one import |

`apps/site/src/content/facts.mjs` describes each entry point and holds the facts the llms files and the skills repeat. `pnpm check:skills` fails when a subpath in `package.json` is missing from it, from the router skill or from this table.

## 2. What it is not

| Out of scope | Why | Where it belongs |
|---|---|---|
| A replacement for every Graphics feature | No texture or pattern fills, no `svg()` import, no shared GraphicsContext | Pixi `Graphics` or `Sprite` next to SilkGraphics |
| Bitmap effects on other objects | Blur and shadows act on silk shapes from their distance field | Pixi filters |
| A UI framework | Widgets are containers with signal state. No routing, no app state, no DOM | The app, or a DOM UI over the canvas |
| A document model for editors | Selection and History store references and commands, not your data | The app's own model |
| Application-specific screens | Demos and examples live on the site | `apps/site/src/demos`, `apps/site/src/lab` |
| Canvas 2D or WebGL1 | Needs WebGL2 or WebGPU | Not supported |

If a request lands in the right column, say so and point at the alternative instead of adding it to the library.

## 3. Layout

```
packages/pixi-silk/
  src/
    index.ts            the root barrel (core only)
    SilkGraphics.ts     the display object: shapes, paths, paint, packing into instances
    constants.ts        instance layout (STRIDE = 44 floats), primitive ids
    shader.ts           GLSL program       <-> shader-wgsl.ts (WGSL twin)
    stroke.ts hit.ts    joins and outlines, CPU hit testing
    gradient.ts atlas.ts color.ts curves.ts motion.ts
    batch.ts            enableSilkBatching, SilkPipe
    app.ts              createSilkApp
    webgpu.ts           enableWebGPU (pixi-silk/webgpu)
    glass/ glow/        pixi-silk/glass (GlassFilter has its WGSL twin in glass-wgsl.ts), pixi-silk/glow
    text/               pixi-silk/text: SDF atlas, layout, SilkText and its shader (GLSL and WGSL)
    layout/             pixi-silk/layout: the headless flex engine
    signal.ts selection.ts history.ts path.ts
    ui/                 one file per widget entry point, ui/index.ts is the pixi-silk/ui barrel
  tests/                vitest, node environment
  skills/               agent skills shipped in the npm package
  build/glsl.ts         tsdown plugin for the shader sources
apps/site/
  src/content/docs/     MDX guides          src/content/nav.mjs: areas and page order
  src/content/facts.mjs facts and entry point descriptions
  src/demos/            live demos (*.demo.ts, defineDemo)
  src/lab/              full-screen experiments
  scripts/              build-llms, postprocess-api, check-snippets, check-seo
  typedoc.config.mjs    API reference for every entry point
  public/llms*.txt      generated and committed
```

## 4. Invariants

Break one of these and a check, a test or a user breaks.

- Shaders come in twins. `shader.ts` (GLSL) and `shader-wgsl.ts` (WGSL) implement the same primitives, and so do the glass and text shaders. Change both. `pnpm build && pnpm check:wgsl` compiles the WGSL on a real device. `pnpm build && pnpm check:render` compares the two renderers pixel by pixel. Add a case to `scripts/render-cases.js` with every rendering fix.
- The instance layout is 44 floats (`STRIDE` in `constants.ts`). Packers, attributes and both shaders read it. Write the number from the constant, never from memory.
- `sideEffects: false` and one output file per module. Nothing runs at import time: no registration, no globals, no `extensions.add` in a module body.
- The root barrel must not import `ui/`, `text/`, `layout/`, `glass/`, `glow/` or `webgpu.ts`. `createSilkApp` loads `pixi-silk/webgpu` with a dynamic `import()`, so WebGL2 apps never download the WGSL. `pnpm size:check` fails when a bundle pulls in what it should not.
- Every export has JSDoc. The API reference is generated from it, and the TypeDoc plugin (`apps/site/scripts/typedoc-subpaths.mjs`) fails the build on an export without a comment. Say units, defaults, ranges and side effects. Do not restate the name.
- Library changes need a changeset (`pnpm changeset`). CI blocks a PR that changes `packages/pixi-silk/src` without one.
- Text follows the house style: ASCII punctuation, short sentences, no hype words. `pnpm lint:prose` checks docs, JSDoc, skills and this file.

### Adding a subpath export

1. Add the source file and list it in `tsdown.config.ts` `entry`.
2. Add the `exports` entry in `packages/pixi-silk/package.json` (types and default).
3. Add its description to `ENTRY_POINTS` in `apps/site/src/content/facts.mjs`.
4. Add a row to the router skill's Entry points table (`packages/pixi-silk/skills/pixi-silk/SKILL.md`) and to the table above.
5. Add a path alias in `apps/site/tsconfig.json` and `apps/site/scripts/check-snippets.mjs` if its name does not fit `pixi-silk/ui/*`.
6. Write JSDoc on every export. TypeDoc picks the entry point up from `package.json`.
7. Run `pnpm build` (publint and Are the Types Wrong), `pnpm size`, `pnpm check:skills`.

## 5. Common tasks

### Add a primitive or a paint option

1. Pack it in `SilkGraphics.ts`, using a new `Prim` id from `constants.ts` if it needs one.
2. Evaluate it in `shader.ts` and in `shader-wgsl.ts`.
3. Hit test it in `hit.ts`.
4. Test the packing in `packages/pixi-silk/tests`, add a render case, and run `check:render` and `check:wgsl`.
5. Document it in the guide that owns it and add or extend a demo.

### Add a widget

1. One file in `src/ui/`, a `Container` subclass with its state as signals on `state` and a `Driver` for animation (`ticker: null` lets tests step it).
2. Export it from its own entry point (see the checklist above) and from `src/ui/index.ts`.
3. Draw labels through a `LabelFactory`, so `silkLabel()` from `pixi-silk/text` can replace Pixi `Text`.
4. Test it in node with `ticker: null`.

### Change the docs

The docs agent rules live in CONTRIBUTING.md ("Where docs go"). `nav.mjs` is the only file that says where a page belongs. `pnpm site:build` regenerates the API pages and `public/llms*.txt`. Commit the llms files: CI compares them with the build.

### Change a skill

Edit `packages/pixi-silk/skills/<name>/SKILL.md`. Every ` ```ts ` block is a whole module and must type-check (`app` is the one global). Mark a deliberate wrong example ` ```ts nocheck `. Each Common Mistakes entry has a severity and the exact symptom. Run `pnpm check:skills`.

## 6. Before you say done

```bash
pnpm lint                    # Biome and prose
pnpm typecheck               # library, site, docs samples, skills
pnpm --filter pixi-silk test
pnpm build                   # library, publint, attw
pnpm site:build              # docs, API pages, llms files
pnpm --filter @pixi-silk/site check:seo
```

For shader or rendering changes add `pnpm check:render` and `pnpm check:wgsl` (both after `pnpm build`). For new imports add `pnpm size`.

## 7. Debugging the canvas

You cannot see a canvas from a terminal. Use these instead.

- `pnpm site:dev`, then open a docs page. Add `?renderer=webgpu` to the URL to run every demo on WebGPU. Each canvas has `data-renderer` with the renderer Pixi picked.
- `node scripts/check-pages.mjs http://127.0.0.1:5178 1280 800` loads every page and reports WebGL and console errors. Add `--webkit` for Safari.
- `pnpm check:render` writes pixel reports for the hard cases (self-crossing paths, fold-backs, dash caps, shape operations, batching) on both renderers.
- Chrome on Windows runs WebGL2 on Direct3D 11, where FXC compiles the shader and can fail where every other backend works (the context is then lost). The Windows WebGL workflow runs the render cases there. `scripts/dump-hlsl.mjs` writes the HLSL ANGLE produced, and the workflow compiles it with FXC to print the error line.
- `g.primitiveCount` tells how many instances a SilkGraphics holds. A number that grows every frame means a missing `clear()`.
- A WebGPU object that draws nothing was created before `enableWebGPU()`. Pixi logs a warning for it.
- A SmartContainer stuck at (0, 0) has no `viewport`.

## 8. How to work here

- State the plan and the files you expect to touch before you edit. Ask when the request has two readings.
- Read the code before you describe it. Numbers and defaults come from the source, not from the docs or memory.
- Keep changes small and on topic. A fix and a refactor are two commits.
- Write a failing test first when you can. The library tests run in node without a GPU.
- Conventional Commits (`feat(gradient): ...`, `fix(shader): ...`), checked by commitlint.
