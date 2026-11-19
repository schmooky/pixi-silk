---
"pixi-silk": minor
---

SilkText: text that fits its box, full bidi, colour emoji. `maxLines`, `maxWidth` and `maxHeight` cut what does not fit and end it in `ellipsis`, and `shrinkToFit` shrinks the font first, down to `minFontSize` (`renderedFontSize` and `truncated` report it). `align: 'justify'` stretches wrapped lines, with kashida in Arabic. Tabs line up on `tabSize` stops. Letter spacing is not applied inside Arabic words or words of shaped scripts. The bidi pass now handles isolates, embeddings and overrides, and pairs brackets. A caret can stand at both places an offset has where the direction changes, and word jumps follow the screen. Emoji keep their colours, from a second texture. Thai and Lao are baked a cluster at a time, and `atlas.usage` reports how full the atlas is. Icons centre on the letters in text without capitals.
