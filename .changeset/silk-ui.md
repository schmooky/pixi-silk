---
'pixi-silk': minor
---

Add tree-shakeable UI widgets under new entry points: `pixi-silk/ui/radial` (radial and marking menus with nested rings, angular falloff, hysteresis and per-device input profiles), `pixi-silk/ui/button` (buttons that animate in and out, refuse input while moving, long-press and busy states) and `pixi-silk/ui/dock` (a row that reflows as buttons hide). Widget state lives in tiny signals from the new `pixi-silk/signal` entry point.
