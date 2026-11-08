---
'pixi-silk': minor
---

Add `pixi-silk/ui/textedit`: text you can click and edit on the canvas, like a design tool text layer.

- `TextEditor` wraps a `SilkText` with a caret and rounded selection boxes drawn with silk, so both stay crisp under a zooming camera. The caret moves by grapheme cluster, blinks softly and holds still while you type.
- Typing goes through a hidden `<textarea>` at the caret, so input methods, dead keys, mobile keyboards, autocorrect, the emoji picker and the clipboard work. Composed text shows underlined.
- Click, drag, Shift + click, double click for a word and triple click for a paragraph. Touch taps place the caret and a long press selects a word, with optional handles.
- Arrows, Home and End, word jumps, select all, word deletes, Enter, Tab and Escape. Undo merges consecutive typing, and the `history` option shares the app's undo stack.
- Single-line inputs that scroll, text areas, placeholders, `maxLength`, read-only text and `TextEditor.chain()` for Tab order. Events `focus`, `blur`, `input`, `change` and `submit`, and the same state as signals.
- `SilkText` gains `layout`, `caretAt()`, `caretRect()` and `rangeRects()`. `pixi-silk/text` exports the layout hit testing (`caretAtPoint`, `caretRect`, `rangeRects`, `lineOfIndex`) and grapheme and word helpers. Layout lines and glyphs now carry their source offsets and caret stops.
