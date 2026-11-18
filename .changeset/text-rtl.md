---
"pixi-silk": minor
---

SilkText lays out right-to-left text. Arabic and Hebrew paragraphs are reordered with the Unicode bidi algorithm, so numbers, prices, percentages and Latin words inside them keep reading left to right, and brackets are mirrored. Joined Arabic letters are baked as one glyph per run, so they shape with the font. New `direction` style (`ltr`, `rtl`, `auto`), and `align` takes `start` and `end` (the default is now `start`, which is `left` for left-to-right text). Carets, hit testing and selection boxes follow the visual order, and the left arrow in `TextEditor` moves forward in a right-to-left paragraph.
