---
"pixi-silk": minor
---

SilkText handles every script without clipping. Glyphs are baked from the ink found in the pixels, not the `measureText` box, so stacked Burmese, Thai and Vietnamese marks are never cut. Lines grow to fit the tallest ink and the outline. Burmese, Thai, Khmer, Lao, the Indic scripts, emoji sequences and combining accents are baked a word or a cluster at a time so Canvas shapes them. Lines wrap between Chinese and Japanese characters (with kinsoku), Korean syllables (or only at spaces with the new `wordBreak: 'keep-all'`) and Thai or Burmese words. Outlines are drawn for every glyph before any fill, so they never cover a neighbouring letter. New inline objects: `{name}` tokens with `inlines` reserve aligned boxes (`inlineRects()`), and the new `SilkRichText` places sprites, SilkGraphics or any container in them.
