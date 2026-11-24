# @pixi-silk/shaper-kb

The runtime shaper for text slots of [pixi-silk](https://pixi-silk.schmooky.dev) localized text.
kb_text_shape, compiled to WebAssembly, shapes a slot's value (a player name) with the font the
bundle was baked from. The outlines are filled in JavaScript and turned into a distance field, so
the slot keeps its outline, glow and shadow, and matches the baked text on every platform.

```ts
import { createShapedText } from '@pixi-silk/shaper-kb';
import { createCanvasText } from 'pixi-silk/i18n/canvas';
import { Silk } from 'pixi-silk/i18n/pixi';

const text = await createShapedText({
    font: '/fonts/NotoSansArabic-Regular.ttf',
    // values the font cannot draw, such as emoji
    fallback: await createCanvasText(),
});
const silk = await Silk.create({ dynamicText: text });
```

- `kb.wasm` is 62 kB with brotli. Bundlers that handle `new URL('./kb.wasm', import.meta.url)` copy
  it. Otherwise pass `wasm` with its URL or bytes.
- TrueType (`glyf`) fonts only. CFF fonts throw.
- `text.checkBundle(bundle)` warns when the font is not one the bundle was baked from.
- `createKbShaper(fontBytes)` gives the shaper alone (`RuntimeShaper` of `pixi-silk/i18n`).

## Building kb.wasm

`dist/kb.wasm` is built from the committed `wasm/kb.wasm`. To rebuild it, put `kb_text_shape.h`
v2.32 in `packages/compiler/.cache/kb` and run `pnpm build:wasm` with clang and lld 18 or newer:

```bash
CLANG=/opt/homebrew/opt/llvm/bin/clang pnpm --filter @pixi-silk/shaper-kb build:wasm
```

kb_text_shape is by Jimmy Lefevre, under the zlib License (see LICENSE).
