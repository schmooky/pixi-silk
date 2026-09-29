---
"pixi-silk": minor
---

Every gradient now accepts `range` to use a slice of its palette. Backward slices invert the colour order, and matching endpoints produce a single colour. Values outside 0..1 are limited to those bounds. Non-finite values select the entire palette.
