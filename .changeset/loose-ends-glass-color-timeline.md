---
'pixi-silk': patch
---

`Glass` panes now rotate and take an uneven scale: the shape, rim and refraction follow the transform on WebGL2 and WebGPU. `GlassFilter.setRotation()` sets the angle when you use the filter alone. `ChannelSliders` built without a `model` share one model across their tracks and expose it as `model`. `MiniTimeline` takes `fontSize`, `fontFamily` and a `label` factory for its ruler numbers.
