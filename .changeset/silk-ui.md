---
'pixi-silk': minor
---

Add tree-shakeable UI widgets, each under its own entry point.

- `pixi-silk/ui/radial`: radial and marking menus with nested rings, angular falloff and per-device input profiles.
- `pixi-silk/ui/button` and `pixi-silk/ui/dock`: buttons that animate in and out and refuse input while moving, and a row that reflows as they hide.
- `pixi-silk/ui/gizmo`, `pixi-silk/ui/outline` and `pixi-silk/ui/snap`: transform gizmos in every mode, animated selection outlines and smart guides.
- `pixi-silk/ui/color`: colour pickers that share one colour model. Hue triangle and square, wheel, OKLCH, channel sliders, swatches and an eyedropper.
- `pixi-silk/ui/halo`, `pixi-silk/ui/brush` and `pixi-silk/ui/modes`: a context halo, a brush cursor, a hold-to-show mode ring and a segmented switch.
- `pixi-silk/ui/dial`, `pixi-silk/ui/timeline` and `pixi-silk/ui/odometer`: jog dials, scrub fields, a mini timeline and rolling counters.
- `pixi-silk/ui/gesture`, `pixi-silk/ui/arc`, `pixi-silk/ui/keys` and `pixi-silk/ui/pill`: the shared building blocks.
- `pixi-silk/signal`: the tiny signal store the widgets keep their state in.
