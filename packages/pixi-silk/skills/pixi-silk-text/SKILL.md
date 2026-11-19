---
name: pixi-silk-text
description: "Use this skill when drawing text with pixi-silk in PixiJS v8: SilkText from pixi-silk/text. Covers SilkText options and setters (fontFamily, fontSize, fontWeight, fill colour or gradient, letterSpacing, lineHeight, align, wordWrap, tabularNumbers, kerning, outline, shadow, dilate, aaWidth, anchor, direction, wordBreak, inlines, maxLines, maxWidth, maxHeight, ellipsis, shrinkToFit, tabSize), set(), right-to-left and complex scripts (Arabic, Hebrew, Burmese, Thai, Indic, Chinese, Japanese, Korean), SilkRichText for sprites and icons inside text, the shared SdfAtlas and custom atlases (size, radius), silkLabel and silkRichLabel for widgets, caretAt, caretRect, rangeRects, layoutText. Triggers on: SilkText, sharp text, text overflow, ellipsis, shrink to fit, justify, SDF text, distance field text, text blurry when zoomed, text outline, text glow, tabular numbers, Arabic text, RTL, clipped marks, icon in text, sprite in text, SdfAtlas, silkLabel, pixi-silk/text."
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

### Icons and sprites inside text

```ts
import { Sprite, Texture } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { SilkRichText } from 'pixi-silk/text';

const status = new SilkRichText({
    text: 'Synced {dot} 2 min ago, rated {star} 4.8',
    fontSize: 24,
    inlines: {
        dot: { object: new Sprite(Texture.WHITE), height: 'cap', margin: 2 },
        star: { object: () => new SilkGraphics().star(0, 0, 5, 10, 4).fill(0xffd60a), height: 'em', align: 'center' },
    },
});

app.stage.addChild(status);
status.textObject.wordWrap = true; // style the text through textObject
```

`{name}` takes a box that flows, wraps and follows right-to-left order like a character. `align` is `middle` (centred on capital letters and digits, the default), `center`, `baseline`, `top` or `bottom`. Pass a function to show an object more than once. `anchor` moves the objects with the text. A box sticks to the letters and digits next to it. `TextEditor` takes the same `inlines`: typed tokens become objects, and one Backspace deletes a token. Plain `SilkText` takes the same boxes as `inlines: { icon: { width, height } }` and reports them through `inlineRects()`.

### Any script

```ts
import { SilkText } from 'pixi-silk/text';

const ar = new SilkText({ text: 'السعر 1,234.56', fontSize: 20 }); // right to left, number stays in order
const my = new SilkText({ text: 'မင်္ဂလာပါ ကမ္ဘာ', fontSize: 20, wordWrap: true, wordWrapWidth: 200 });
const ko = new SilkText({ text: '변경 사항은 저장 버튼을 누른 뒤에 적용됩니다', wordBreak: 'keep-all', wordWrap: true, wordWrapWidth: 160 });
```

Arabic, Hebrew, Burmese, Thai, Khmer, the Indic scripts and emoji sequences shape, and emoji keep their colours. Wrap inserted values of unknown direction in U+2068 and U+2069. Lines grow to fit stacked marks, so nothing is cut or overlaps the next line. Chinese and Japanese wrap between characters, Thai and Burmese between words.

### Text that has to fit a box

```ts
import { SilkText } from 'pixi-silk/text';

const title = new SilkText({ text: 'Settings', fontSize: 24, maxWidth: 160, shrinkToFit: true, minFontSize: 14 });
const note = new SilkText({ text: 'A long description', wordWrap: true, wordWrapWidth: 200, maxLines: 2 });
const body = new SilkText({ text: 'Paragraph', wordWrap: true, wordWrapWidth: 300, align: 'justify' });
```

`maxLines`, `maxWidth` and `maxHeight` cut what does not fit and end it in `ellipsis` (`null` for no mark). `shrinkToFit` shrinks the font first, down to `minFontSize`. `renderedFontSize` and `truncated` report what happened. `justify` uses kashida in Arabic (`kashida: false` to turn it off). `tabSize` sets tab stops.

### Sharp labels in widgets

```ts
import { silkLabel } from 'pixi-silk/text';
import { ValuePill } from 'pixi-silk/ui/pill';

const pill = new ValuePill({ label: silkLabel({ tabularNumbers: true }) });

pill.show('42 px');
```

Widgets draw their labels with Pixi `Text` by default. `silkLabel()` swaps in SilkText, which stays sharp under a zooming camera. `silkRichLabel({ up: { object, height: 'cap' } })` makes labels that can show `{up}` icons, and the widget sizes itself to them.

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

### [MEDIUM] Raising `lineHeight` or `padding` per language to stop clipped marks

Symptom: Burmese, Thai or Vietnamese marks cut at the top or overlapping the next line, with Pixi `Text`. SilkText finds the ink of every glyph and grows the line box to fit it, outlines included. Leave `lineHeight` at 0. A fixed `lineHeight` is kept as given, so tall stacks can then touch.

### [MEDIUM] Adding a sprite as a child of SilkText

Symptom: the icon does not move when the text changes, or Pixi warns that a leaf cannot have children. Use `SilkRichText` with `{name}` tokens, which places the object in the text and moves it with every change.

### [MEDIUM] Expecting `\n` handling from `wordWrap` alone

Symptom: one long line. `wordWrap` only breaks when `wordWrapWidth` is set to the width you want (default 100). `\n` always starts a new line.

## API Reference

- [pixi-silk/text](https://pixi-silk.schmooky.dev/api/text.md)
- [SilkText](https://pixi-silk.schmooky.dev/api/text/classes/SilkText.md), [SilkTextStyle](https://pixi-silk.schmooky.dev/api/text/interfaces/SilkTextStyle.md), [SilkTextOptions](https://pixi-silk.schmooky.dev/api/text/interfaces/SilkTextOptions.md)
- [SilkRichText](https://pixi-silk.schmooky.dev/api/text/classes/SilkRichText.md), [RichInline](https://pixi-silk.schmooky.dev/api/text/interfaces/RichInline.md)
- [SdfAtlas](https://pixi-silk.schmooky.dev/api/text/classes/SdfAtlas.md), [silkLabel](https://pixi-silk.schmooky.dev/api/text/functions/silkLabel.md)
- Guides: [Text](https://pixi-silk.schmooky.dev/docs/text.md), [Editing text](https://pixi-silk.schmooky.dev/docs/editing-text.md)
