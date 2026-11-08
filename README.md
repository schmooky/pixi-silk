# pixi-silk

Smooth vector graphics for PixiJS v8. `SilkGraphics` has an API close to `Graphics`, and it
draws each shape as a distance field that the shader anti-aliases per pixel.

[Docs](https://pixi-silk.schmooky.dev/docs/) |
[Getting started](https://pixi-silk.schmooky.dev/docs/getting-started/) |
[API reference](https://pixi-silk.schmooky.dev/api/) |
[Studio](https://pixi-silk.schmooky.dev/studio/) |
[FAQ](https://pixi-silk.schmooky.dev/faq/)

```bash
npm install pixi-silk pixi.js
```

```ts
import { conic, createSilkApp, SilkGraphics, vertical } from 'pixi-silk';

const { app } = await createSilkApp({ parent: document.getElementById('stage')!, background: 0x000000 });
const g = new SilkGraphics();

g.roundRect(10, 10, 340, 140, 22, 0.6).fill(0x1c1c1e); // radius 22, squircle smoothing 0.6
g.arcSweep(80, 80, 44, -Math.PI / 2, Math.PI * 1.5)
    .stroke({ width: 12, cap: 'round', gradient: conic([0x30d158, 0xffd60a, 0xff453a]) });
g.area([120, 100, 170, 80, 220, 92, 270, 60, 320, 70], 130, { smooth: 'monotone' })
    .fill(vertical([[0, 0xff9f0a, 0.8], [1, 0xff9f0a, 0]]))
    .stroke({ width: 2, color: 0xff9f0a, cap: 'round' });

app.stage.addChild(g);
```

That draws a squircle card, a gauge with a conic gradient and a smoothed area chart.
`createSilkApp` turns MSAA off and maps one canvas pixel to one device pixel.

## What is in the package

The root import holds `SilkGraphics`, gradients, `createSilkApp`, motion helpers and
`enableSilkBatching()`. Everything else is its own entry point, so an app bundles only what it
imports.

| Import | What it holds |
|---|---|
| `pixi-silk` | Shapes, lines, free paths, shape operations, gradients, blur and shadows |
| `pixi-silk/text` | `SilkText`, distance field text |
| `pixi-silk/layout`, `pixi-silk/ui/layout` | A flex layout engine and the Pixi containers built on it |
| `pixi-silk/glass`, `pixi-silk/glow` | Glass and glow filters |
| `pixi-silk/webgpu` | The WGSL shader, for WebGPU in your own Pixi app |
| `pixi-silk/ui/*` | Buttons, radial menus, slot HUD pieces and the editor kit |

[Choose an entry point](https://pixi-silk.schmooky.dev/docs/choose-an-entry-point/) lists every
subpath. The editor kit (camera, rulers, gizmos, pickers, panels) is experimental in 1.0: its API
may change in a minor release.

## Requirements

- `pixi.js` 8.6 or newer, as a peer dependency
- WebGL2 or WebGPU. WebGL2 is the default. For WebGPU, pass `preference: 'webgpu'` to
  `createSilkApp`, or call `enableWebGPU()` from `pixi-silk/webgpu` before the first
  `SilkGraphics` in your own Pixi app

It does not do texture fills or SVG documents, and `SilkText` has no shaping for right-to-left
scripts. The [FAQ](https://pixi-silk.schmooky.dev/faq/) lists the other limits.

## For AI agents

- [AGENTS.md](AGENTS.md) explains how to work in this repository.
- [llms.txt](https://pixi-silk.schmooky.dev/llms.txt) indexes the docs in plain text.

## Repository

A pnpm workspace. `packages/pixi-silk` is the library and `apps/site` is the docs site.

```bash
pnpm install
pnpm site:dev                   # docs at http://localhost:5178
pnpm --filter pixi-silk test    # unit tests
pnpm build                      # library build
```

[CONTRIBUTING.md](CONTRIBUTING.md) covers checks, changesets and releases.

## License

MIT
