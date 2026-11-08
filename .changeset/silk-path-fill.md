---
"pixi-silk": minor
---

`fill()` now fills free-form paths (`poly()`, `moveTo` and curves) as one exact shape, even-odd, so blur, spread, progressive blur and inner shadows work on any outline. Pointer hits follow the outline. `neon()` follows the five-layer Figma recipe. New in `pixi-silk/glow`: `bolt()`, `drop()` and `shadowStack()`.
