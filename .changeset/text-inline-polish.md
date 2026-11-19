---
"pixi-silk": minor
---

Inline objects and editing polish. `silkRichLabel()` gives widgets labels that hold icons. `SilkRichText` has an `anchor`, and its objects follow the anchor and the text object's position and scale. `TextEditor` takes `inlines`: typed `{name}` tokens show their object, the caret steps over a token and one Backspace deletes it. The arrow keys move by what is on screen in lines that mix directions (`caretVisual`). Lines break beside inline boxes next to Chinese, Japanese or Korean text, and a box stays with the letters and digits next to it. `tabularNumbers` covers every decimal digit set, and digits of Burmese, Thai and the Indic scripts are clusters of their own.
