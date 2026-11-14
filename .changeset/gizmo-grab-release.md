---
"pixi-silk": patch
---

`TransformGizmo.grab()` now ends its drag on the next release wherever it happens. Before, a drag started from a press on another object only ended when the release reached the gizmo itself, so the target kept following the pointer after the button was let go. The gizmo now listens for `pointerup`, `pointerupoutside` and `pointercancel` on the pressed object for the length of the drag, and also ends it when the window loses focus or cancels the pointer.
