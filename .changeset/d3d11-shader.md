---
"pixi-silk": patch
---

SilkGraphics render on Chrome and Edge for Windows again. ANGLE's Direct3D 11 backend could not compile the WebGL2 program and lost the context: FXC failed on the discard inside the path stroke loop. The shader now discards after the loop.
