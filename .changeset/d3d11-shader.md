---
"pixi-silk": patch
---

SilkGraphics render on Chrome and Edge for Windows again. The WebGL2 program failed to compile on ANGLE's Direct3D 11 backend, which lost the context, because the shader read the path texture size inside its loops.
