---
"pixi-silk": patch
---

Glass no longer triggers a WebGL `GL_INVALID_OPERATION` warning on its first frame over an opaque canvas. It skips that one frame while the back buffer turns on.

The editor kit is marked experimental for 1.0: camera, measure, grid, ruler, guides, marquee, group, spacing, snap, halo, brush, modes, dial, timeline, textedit, the panels and pathgizmo. Their API may change in a minor release.

The JSDoc now states units, defaults and side effects, and fixes wrong facts. For example, the instance stride is 44 floats.
