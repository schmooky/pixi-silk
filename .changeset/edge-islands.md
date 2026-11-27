---
'pixi-silk': minor
---

`pixi-silk/ui/island`: surfaces that grow out of the edges of the viewport.

- `Island`: a rounded body joined to an edge by concave flares, drawn as one exact shape. It rests as a lip, opens on a tap, a hover or a drag, and springs between named sizes, so a notch morphs from a lip to a pill to a panel. Views fade in per state, and it keeps clear of safe-area insets.
- Finding and pulling an island. `grab` widens the touch zone around the lip, and `magnet` leans the lip toward a nearby pointer or finger. `hint()` pulses or wiggles it, and `hintEvery` plays that on a timer. `peek: 0` makes an edge swipe, and `flash(name, ms)` shows a notification that leaves.
- `IslandFrame`: bands along the edges with a rounded window cut out, an optional rail of icons, and bands that spring to new sizes. `radius` can change live. `frame.inner` is the window as a signal, for a SmartContainer and for islands on the bezel.
- `IslandGauge`, `IslandMeter`, `IslandMenu` (with `gearIcon`) and `IslandStack` to fill them.
- `createRenderStats`: frames per second, CPU time per render and draw calls per frame as signals, on WebGL and WebGPU.
