---
name: pixi-silk-i18n
description: "Use this skill when showing translated or localized text with pixi-silk in PixiJS v8: baked messages from pixi-silk/i18n and pixi-silk/i18n/pixi, compiled by @pixi-silk/compiler (the silk command). Covers the strings sheet, placeholders, tags and inline objects, plural forms, theme.json, Silk.create, addBundle, silkBundleLoader, prepare, SilkMessage, set() update tiers, theme.set, SilkMessageLayer batching, text slots (player names) with pixi-silk/i18n/canvas, app locale codes and BCP 47, right-to-left and complex scripts without fonts at runtime. Triggers on: localization, i18n, translation, translated text, Arabic, Hebrew, Persian, Thai, Hindi, Chinese, Japanese, Korean text in PixiJS, plural forms, silk compile, .silk bundle, SilkMessage, pixi-silk/i18n."
license: MIT
---

`pixi-silk/i18n` draws translated rich text from `.silk` bundles. `@pixi-silk/compiler` builds them at build time: it shapes every message with HarfBuzz, bakes line breaks and bidi levels, and writes MSDF atlas pages. The browser downloads no font and no shaper. Use `SilkText` from `pixi-silk/text` for text typed at runtime.

## Quick Start

```bash
npx silk compile --config silk.config.json --strings strings.xlsx --theme theme.json --out public/i18n
```

```ts
import { Assets, extensions } from 'pixi.js';
import type { ThemeData } from 'pixi-silk/i18n';
import { Silk, SilkMessage, silkBundleLoader } from 'pixi-silk/i18n/pixi';

extensions.add(silkBundleLoader); // once, before Assets.load of a .silk file
const silk = await Silk.create({ dynamicText: { mode: 'canvas' } });

await silk.addBundle(await Assets.load('/i18n/ar.silk'));
const theme = silk.createTheme((await (await fetch('/i18n/theme.json')).json()) as ThemeData);
const set = await silk.prepare({
    locale: 'ar', // the app's code, as the bundle is named
    fallbackLocale: 'en',
    theme,
    defaults: { size: 24, maxWidth: 320 },
    messages: { coins: { key: 'shop.coins', values: { count: 0 } } },
});
const coins = new SilkMessage(set.get('coins'));

app.stage.addChild(coins);
coins.set({ count: 1250 }); // same length as before: only the digits change
theme.set('gold', { fill: '#FFF4B0' }); // paint only: no relayout
```

## Core Patterns

### Many messages, one draw call

```ts
import { type PreparedSet, SilkMessage, SilkMessageLayer } from 'pixi-silk/i18n/pixi';

declare const set: PreparedSet;
const layer = new SilkMessageLayer(); // one draw per bundle and theme

set.names().forEach((name, i) => {
    const m = new SilkMessage(set.get(name));

    m.y = i * 40;
    layer.addChild(m);
});
app.stage.addChild(layer);
```

### Text slots in the baked font

`{ mode: 'canvas' }` draws player names with the system font. For the baked font on every platform, install `@pixi-silk/shaper-kb` and pass `await createShapedText({ font: '/fonts/NotoSans-Regular.ttf', fallback: await createCanvasText() })` as `dynamicText`. Use the TrueType file the bundle was baked from. `provider.checkBundle(bundle)` warns when the hashes differ.

### Icons and taps

```ts
import { Texture } from 'pixi.js';
import { type PreparedSet, type Silk, SilkMessage, type TagTapEvent } from 'pixi-silk/i18n/pixi';

declare const silk: Silk;
declare const set: PreparedSet;

silk.registerInline({ coin: { texture: Texture.WHITE, size: '1.1em', baseline: 0.15 } }); // <coin/> in messages
const terms = new SilkMessage(set.get('terms'));

terms.on('tagtap', (e: TagTapEvent) => console.log('tapped', e.tag)); // spans whose style is interactive
```

## Common Mistakes

### [CRITICAL] Loading a .silk file without the loader

Symptom: `Assets.load('/i18n/ar.silk')` returns raw data or fails to parse. Call `extensions.add(silkBundleLoader)` once first. Nothing registers itself at import time.

### [HIGH] Using `{name}` for an icon

Symptom: the lint reports `undeclared-slot`. In messages `{name}` is a value slot. Inline objects are written `<coin/>` and listed in `objects` of the config. `{icon}` is the `SilkText` syntax.

### [HIGH] Changing family or features with theme.set

Symptom: a console warning says to run silk compile again, and the text keeps its old shapes. Paint properties change at once, `size` and `letterSpacing` lay out again, and `weight` is only approximated with the weight bias. A new family or OpenType feature needs theme.json edited and a new compile.

### [MEDIUM] Treating app codes as BCP 47

Symptom: Canadian English gets Catalan plurals, or Kurdish Badini reads left to right. App codes such as `ca`, `sd`, `aa`, `am`, `ne`, `zu` mean other languages in ISO 639. The compiler maps them through `APP_LOCALES`, or `bcp47` in the config. Pass the app code to `prepare`.

## API Reference

- [pixi-silk/i18n](https://pixi-silk.schmooky.dev/api/i18n.md), [SilkBundle](https://pixi-silk.schmooky.dev/api/i18n/classes/SilkBundle.md), [ThemeData](https://pixi-silk.schmooky.dev/api/i18n/interfaces/ThemeData.md)
- [pixi-silk/i18n/pixi](https://pixi-silk.schmooky.dev/api/i18n/pixi.md), [Silk](https://pixi-silk.schmooky.dev/api/i18n/pixi/classes/Silk.md), [SilkMessage](https://pixi-silk.schmooky.dev/api/i18n/pixi/classes/SilkMessage.md), [SilkMessageLayer](https://pixi-silk.schmooky.dev/api/i18n/pixi/classes/SilkMessageLayer.md), [SilkTheme](https://pixi-silk.schmooky.dev/api/i18n/pixi/classes/SilkTheme.md)
- [pixi-silk/i18n/canvas](https://pixi-silk.schmooky.dev/api/i18n/canvas.md)
- Guides: [Localized text](https://pixi-silk.schmooky.dev/docs/localized-text.md), [Translating text](https://pixi-silk.schmooky.dev/docs/translating-text.md), [Text themes](https://pixi-silk.schmooky.dev/docs/text-themes.md), [SilkText to baked text](https://pixi-silk.schmooky.dev/docs/localized-text-migration.md)
