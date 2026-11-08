---
"pixi-silk": patch
---

Fix touch input and a WebGPU text warning found in Safari and Firefox checks.

- `Camera` sets the CSS `touch-action` of its element to `none` while it lives. Before, the default `pan-y pinch-zoom` of `createSilkApp` let the browser zoom the page on a pinch and cancel the camera's pointers.
- `Camera` measures the fling speed of a two-finger pan per frame. Before, the second finger's move in the same frame counted as a jump in 1 ms, and the view glided about 5 times too far.
- `createSilkApp` ends drags when the browser cancels a pointer. Pixi ignores `pointercancel`, so a touch the page took over for a scroll left scrubbers, gizmos and panels stuck mid-drag.
- `SdfAtlas` moves to a new texture when it grows and frees the old one after the frame. Before, growing mid-frame freed a texture that texts drawn earlier still used, and WebGPU warned "Destroyed texture used in a submit".
