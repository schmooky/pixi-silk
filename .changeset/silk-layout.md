---
"pixi-silk": minor
---

New `pixi-silk/layout`. `LayoutNode` is a small flex layout engine with no Pixi in it. It covers direction, wrap, gap, padding, margins, grow and shrink with min and max, justify and align, percents, aspect ratio, absolute anchors and measured leaves. Layout is incremental: clean subtrees are skipped and measured leaves cache their size.

New `pixi-silk/ui/layout`. `SmartContainer` lays out its Pixi children with flexbox once per frame, only after a change. It has fit modes, text shrink-to-fit, portrait and landscape styles, width breakpoints, safe-area insets, a reference resolution that scales to the screen, spring transitions to new slots and a debug overlay.
