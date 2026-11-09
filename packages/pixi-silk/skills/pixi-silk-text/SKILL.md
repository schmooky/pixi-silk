---
name: pixi-silk-text
description: "Use this skill when drawing text with pixi-silk in PixiJS v8: SilkText from pixi-silk/text. Covers SilkText options and setters (fontFamily, fontSize, fontWeight, fill colour or gradient, letterSpacing, lineHeight, align, wordWrap, tabularNumbers, kerning, outline, shadow, dilate, aaWidth, anchor), set(), the shared SdfAtlas and custom atlases (size, radius), silkLabel for widgets, caretAt, caretRect, rangeRects, layoutText. Triggers on: SilkText, sharp text, SDF text, distance field text, text blurry when zoomed, text outline, text glow, tabular numbers, SdfAtlas, silkLabel, pixi-silk/text."
license: MIT
---

`SilkText` draws text from a signed distance field atlas, so it stays sharp from small sizes to deep zoom, with the same per-pixel anti-aliasing as SilkGraphics. Glyphs come from any CSS font and are baked once into a shared atlas. Outlines, shadows and glows read the same field and cost nothing extra. A text is one draw call. Layout uses Canvas `measureText`, so widths and line breaks match PixiJS `Text`.

## Quick Start

```ts
import { SilkText } from 'pixi-silk/text';

const label = new SilkText({
    text: 'Frame 1',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 13,
    fontWeight: 600,
    fill: 0xffffff,
    anchor: 0.5,
});

label.position.set(200, 100);
app.stage.addChild(label);
label.text = 'Frame 2'; // laid out again before the next frame
```

## Core Patterns

### Outline, shadow, gradient fill, tabular numbers

```ts
import { horizontal } from 'pixi-silk';
import { SilkText } from 'pixi-silk/text';

const title = new SilkText({
    text: 'Overview',
    fontSize: 48,
    fontWeight: 800,
    fill: horizontal(['#64d2ff', '#0a84ff']),
    outline: { width: 3, color: 0x001a33 },
    shadow: { color: 0x000000, alpha: 0.6, blur: 6, offsetY: 4 },
});
const readout = new SilkText({ text: '72.4', fontSize: 32, tabularNumbers: true }); // digits keep one width

title.set({ fontSize: 40, letterSpacing: 1 }); // change several style fields at once
readout.text = 72.5;
```

### Wrapping and caret geometry

```ts
import { SilkText } from 'pixi-silk/text';

const note = new SilkText({ text: 'Hello world', wordWrap: true, wordWrapWidth: 60, align: 'center' });
const hit = note.caretAt({ x: 30, y: 8 }); // nearest caret position to a local point
const caret = note.caretRect(hit.index, hit.upstream);

console.log(hit.index, caret.x, note.rangeRects(0, 5)); // selection boxes for characters 0 to 5
```

For an editable field, use `TextEditor` from `pixi-silk/ui/textedit` (see the pixi-silk-editor skill).

### Sharp labels in widgets

```ts
import { silkLabel } from 'pixi-silk/text';
import { ValuePill } from 'pixi-silk/ui/pill';

const pill = new ValuePill({ label: silkLabel({ tabularNumbers: true }) });

pill.show('42 px');
```

Widgets draw their labels with Pixi `Text` by default. `silkLabel()` swaps in SilkText, which stays sharp under a zooming camera.

### A bigger atlas for large glows

```ts
import { SdfAtlas, SilkText } from 'pixi-silk/text';

const big = new SdfAtlas({ size: 64, radius: 24 }); // sharper corners deep in, outlines and glows reach further
const heading = new SilkText({ text: 'Overview', fontSize: 40, atlas: big, shadow: { blur: 14, color: 0x0a84ff } });
```

## Common Mistakes

### [CRITICAL] Importing SilkText from the root

Symptom: `Module '"pixi-silk"' has no exported member 'SilkText'`. Text is its own entry point: `import { SilkText } from 'pixi-silk/text'`.

### [HIGH] Using Pixi `Text` under a zooming camera

Symptom: labels turn soft or pixelated when the world scales. Pixi `Text` is a texture at one resolution. Use `SilkText`, or `silkLabel()` for widget labels.

Wrong:

```ts nocheck
world.addChild(new Text({ text: 'Layer 1' })); // world is scaled by a Camera
```

Correct:

```ts
import { Container } from 'pixi.js';
import { SilkText } from 'pixi-silk/text';

const world = new Container();

world.addChild(new SilkText({ text: 'Layer 1', fontSize: 12 }));
world.scale.set(8); // still sharp
```

### [MEDIUM] Glows and outlines that stop short

Symptom: a large `shadow.blur` or `outline.width` is clipped to a hard edge. The default atlas field reaches about a quarter of the font size. Give the text an `SdfAtlas` with a larger `radius`.

### [MEDIUM] Expecting `\n` handling from `wordWrap` alone

Symptom: one long line. `wordWrap` only breaks when `wordWrapWidth` is set to the width you want (default 100). `\n` always starts a new line.

## API Reference

- [pixi-silk/text](https://pixi-silk.schmooky.dev/api/text.md)
- [SilkText](https://pixi-silk.schmooky.dev/api/text/classes/SilkText.md), [SilkTextStyle](https://pixi-silk.schmooky.dev/api/text/interfaces/SilkTextStyle.md), [SilkTextOptions](https://pixi-silk.schmooky.dev/api/text/interfaces/SilkTextOptions.md)
- [SdfAtlas](https://pixi-silk.schmooky.dev/api/text/classes/SdfAtlas.md), [silkLabel](https://pixi-silk.schmooky.dev/api/text/functions/silkLabel.md)
- Guides: [Text](https://pixi-silk.schmooky.dev/docs/text.md), [Editing text](https://pixi-silk.schmooky.dev/docs/editing-text.md)
