---
"pixi-silk": minor
---

New `pixi-silk/layout`. `LayoutNode` is a small flex layout engine with no Pixi in it. It covers direction, wrap, gap, padding, margins, grow and shrink with min and max, justify and align, percents, aspect ratio, absolute anchors and measured leaves. Layout is incremental: clean subtrees are skipped and measured leaves cache their size.

New `pixi-silk/ui/layout`. `SmartContainer` places a design box in the window from `portraitData` and `landscapeData` records, with the option names and numbers of the SmartContainer slot games already use. It adds named breakpoints, a viewport source instead of window listeners, safe-area insets, `extendWidth` and `extendHeight`, and an optional glide when the breakpoint changes. `FlexContainer` lays out children with the flex engine, inside a SmartContainer or on its own, with fit modes, text shrink-to-fit, responsive styles and spring transitions. `layoutDebug` draws boxes, breakpoints, scales, anchors, safe areas, padding, gaps and overflow, with a hover readout. `simulateViewport` previews device sizes inside a page.
