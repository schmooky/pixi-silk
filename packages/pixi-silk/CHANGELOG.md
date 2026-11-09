# pixi-silk

## 1.0.1

### Patch Changes

- [#12](https://github.com/schmooky/pixi-silk/pull/12) [`4ef6597`](https://github.com/schmooky/pixi-silk/commit/4ef65970955dc8e8f4ad92892d12a65fa5120968) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - SilkGraphics render on Chrome and Edge for Windows again. ANGLE's Direct3D 11 backend could not compile the WebGL2 program and lost the context: FXC failed on the discard inside the path stroke loop. The shader now discards after the loop.

- [#12](https://github.com/schmooky/pixi-silk/pull/12) [`4ef6597`](https://github.com/schmooky/pixi-silk/commit/4ef65970955dc8e8f4ad92892d12a65fa5120968) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - `createSilkApp({ preference: 'webgpu' })` retries on WebGL2 when WebGPU is offered but fails to start, and logs a warning, instead of rejecting.

## 1.0.0

### Major Changes

- pixi-silk 1.0. The core API (`SilkGraphics`, `createSilkApp`, gradients, paint effects, `pixi-silk/glass`, `pixi-silk/glow`, `pixi-silk/text`, `pixi-silk/layout`, `pixi-silk/webgpu`) is now stable and follows semver. The editor kit under `pixi-silk/ui` (camera, rulers, guides, marquee, gizmos, text editor, path gizmo, panels and the other editor widgets) is marked `@experimental` and may change in a minor release. The package ships agent skills in `skills/`.

### Fixes in 1.0.0

- `Glass` panes rotate and take an uneven scale: the shape, rim and refraction follow the transform on WebGL2 and WebGPU. `GlassFilter.setRotation()` sets the angle when you use the filter alone.
- `ChannelSliders` built without a `model` share one model across their tracks and expose it as `model`.
- `MiniTimeline` takes `fontSize`, `fontFamily` and a `label` factory for its ruler numbers.
- `Camera` sets the CSS `touch-action` of its element to `none` while it lives, so a pinch zooms the camera, not the page. Two-finger flings glide at finger speed.
- `createSilkApp` ends drags when the browser cancels a pointer, so a touch the page takes over for a scroll no longer leaves a scrubber, gizmo or panel stuck mid-drag.
- `SdfAtlas` moves to a new texture when it grows and frees the old one after the frame, which removes a WebGPU "Destroyed texture used in a submit" warning.

### Minor Changes

- New `pixi-silk/ui/camera`. `Camera` pans and zooms a world container like a design tool: pinch, ctrl or cmd + wheel, scroll, middle, right and Space drags, two-finger touch and flings. `fit`, `zoomTo` and `centerOn` animate, and zoom and position are signals. `ZoomControl` draws a `- 100% +` bar for it.
  
  New `pixi-silk/ui/measure`. `Measure` draws Figma-style redlines between two objects and a `W x H` size badge, in world units at any zoom.
- `Camera` leaves plain scrolls to a scrolling page until the canvas is clicked (`pageScroll`, default `auto`), and `fit()` takes padding per side to centre content between docked panels. The layout debug overlay stays on its boxes under a camera.
- Canvas tools for the camera, each its own entry point. `pixi-silk/ui/grid`: `CanvasGrid` draws an infinite lines or dots grid whose levels fade with the zoom, two silk shapes per level. `pixi-silk/ui/ruler`: `Ruler` draws top and left rulers with 1, 2, 5 labels, a selection band and a cursor marker. `pixi-silk/ui/guides`: `Guides` are dragged out of the rulers, snap to a `SnapEngine` and feed it back.
  
  `pixi-silk/ui/marquee`: `Marquee` is rubber-band selection on empty canvas, with Shift to add, Alt to take away, and intersect or contain modes. `pixi-silk/ui/group`: `SelectionGroup` lets the `TransformGizmo` move, resize and rotate several objects about a common pivot. `pixi-silk/ui/spacing`: `findSpacing` and `SpacingMarkers` show Figma-style equal gaps and alignment lines. `Camera` gains `world` and `element` getters and `state.width` and `state.height` signals that follow resizes.
- Add effects drawn from the distance field in the same draw call, plus glass and glow.
  
  - Fills and strokes take `spread` (grow before blur), `blend: 'add'` (plus lighter) and a progressive `blur: { from, to, angle }`.
  - `innerShadow` draws one or more inset shadows with offset, blur, spread, colour and blend on any closed shape.
  - `mesh(cols, rows, colors)` is a smooth gradient mesh, blended in OKLab.
  - `pixi-silk/glass`: a frosted glass pane with backdrop blur, refraction, dispersion, a lit rim and grain.
  - `pixi-silk/glow`: stacked glow passes, neon and halo recipes, an animated aurora, light rays and spectrum helpers.
- Strokes support `join: 'miter' | 'bevel' | 'round'` and `miterLimit`, as in Canvas 2D. The default is now `miter`, so stroked rects without a radius have sharp corners. Use `join: 'round'` for the old look. A stroked path is one distance field, with caps, joins and dashes, and no double blending at its corners. `union: true` on a fill or stroke paints several shapes as one, with no seam where they meet. The gizmo arrows and handles use it. `enableSilkBatching()` draws runs of consecutive SilkGraphics in one draw call. `new SilkGraphics({ batch: false })` opts an object out.
- New `pixi-silk/layout`. `LayoutNode` is a small flex layout engine with no Pixi in it. It covers direction, wrap, gap, padding, margins, grow and shrink with min and max, justify and align, percents, aspect ratio, absolute anchors and measured leaves. Layout is incremental: clean subtrees are skipped and measured leaves cache their size.
  
  New `pixi-silk/ui/layout`. `SmartContainer` places a design box in the window from `portraitData` and `landscapeData` records, for portrait and landscape screens against a reference resolution. It adds named breakpoints, a viewport source instead of window listeners, safe-area insets, `extendWidth` and `extendHeight`, and an optional glide when the breakpoint changes. `FlexContainer` lays out children with the flex engine, inside a SmartContainer or on its own, with fit modes, text shrink-to-fit, responsive styles and spring transitions. `layoutDebug` draws boxes, breakpoints, scales, anchors, safe areas, padding, gaps and overflow, with a hover readout. `simulateViewport` previews device sizes inside a page.
- New editor panels, drawn on the canvas with no DOM. Each has its own entry point.
  
  `pixi-silk/ui/panel` has `Panel`: a title bar, a body that scrolls, edges to resize and a chevron that folds it. Drag it by the title, and drop it near a screen edge or corner to dock it there. `ScrollView` scrolls with glide, flings and a slim scrollbar. `panelHitTest` keeps camera wheels and pans off the panels.
  
  `pixi-silk/ui/layers` has `LayerTree`, a virtualised layer list over any tree through a `TreeAdapter`. It selects with a `Selection` store, drags rows to reorder and reparent them, renames in place and moves with the arrow keys. `pixiTreeAdapter` shows a Pixi scene graph.
  
  `pixi-silk/ui/inspector` has `Inspector`, built from a schema of number, text, toggle, choice, colour and vector fields in folding sections. It edits objects or signals, shows Mixed for differing values and records one undo step per drag.
  
  `pixi-silk/ui/minimap` has `Minimap`, a view of a camera's world with a frame you drag, click and scroll.
  
  `Camera` takes an `ignore` option for points it should leave alone.
- `fill()` now fills free-form paths (`poly()`, `moveTo` and curves) as one exact shape, even-odd, so blur, spread, progressive blur and inner shadows work on any outline. Pointer hits follow the outline. `neon()` follows the five-layer Figma recipe. New in `pixi-silk/glow`: `bolt()`, `drop()` and `shadowStack()`.
- Add `pixi-silk/text`: text that stays sharp at any zoom, drawn from signed distance fields.
  
  - `SilkText` is a display object with the PixiJS `Text` options you use for labels: font, size, weight, style, fill (colour or gradient), letter spacing, line height, alignment and word wrap. It is one instanced draw call per text, on WebGL2 and WebGPU.
  - Outlines, drop shadows, glows, weight changes and tabular numbers come from the same distance field, with no filters.
  - `SdfAtlas` bakes glyphs of any CSS font at runtime with Canvas2D and an exact distance transform, into one shared texture that grows as needed. `layoutText` and `sdfFromAlpha` are exported too.
  - `ValuePill` takes a `label` factory. Pass `silkLabel()` for pills that stay sharp under a zooming camera. Widgets keep PixiJS `Text` by default and never import SilkText on their own.
- New `pixi-silk/selection`. `Selection` keeps the selected items in order, the primary item and the hovered one as signals. `bindOutline`, `bindGizmo` and `bindMeasure` make the widgets follow it with one call each.
  
  New `pixi-silk/history`. `History` is an undo stack with transactions, merging, labels, a depth limit and `canUndo` and `canRedo` signals. `recordSignals` makes signal changes undoable without commands, `recordGizmo` turns each gizmo drag into one step, and `bindHistoryKeys` binds cmd or ctrl + Z. Widgets take any `HistoryLike`, so an app can bring its own store.
  
  New `pixi-silk/path` and `pixi-silk/ui/pathgizmo`. Bezier paths are plain data with helpers to draw, split, insert, delete and convert from and to SVG. `PathGizmo` edits them like a design tool, with a pen tool, and every edit is undoable.
- Shape operations. `fill({ op })` and `stroke({ op })` combine the closed shapes of the active path with `union`, `subtract`, `intersect` or `exclude` into one exact shape. `boolean(op, a, b)` combines what two callbacks draw and nests. The result is one instance with a sharp outline, and it takes strokes, gradients, blur, spread and inner shadows. Hit tests follow it.
  
  `svgPath(d)` reads an SVG path string into the active path, for fills, strokes and shape operations.
  
  Hit tests of hearts, stars and sectors now follow their exact shape instead of their bounds.
- Add `pixi-silk/ui/textedit`: text you can click and edit on the canvas, like a design tool text layer.
  
  - `TextEditor` wraps a `SilkText` with a caret and rounded selection boxes drawn with silk, so both stay crisp under a zooming camera. The caret moves by grapheme cluster, blinks softly and holds still while you type.
  - Typing goes through a hidden `<textarea>` at the caret, so input methods, dead keys, mobile keyboards, autocorrect, the emoji picker and the clipboard work. Composed text shows underlined.
  - Click, drag, Shift + click, double click for a word and triple click for a paragraph. Touch taps place the caret and a long press selects a word, with optional handles.
  - Arrows, Home and End, word jumps, select all, word deletes, Enter, Tab and Escape. Undo merges consecutive typing, and the `history` option shares the app's undo stack.
  - Single-line inputs that scroll, text areas, placeholders, `maxLength`, read-only text and `TextEditor.chain()` for Tab order. Events `focus`, `blur`, `input`, `change` and `submit`, and the same state as signals.
  - `SilkText` gains `layout`, `caretAt()`, `caretRect()` and `rangeRects()`. `pixi-silk/text` exports the layout hit testing (`caretAtPoint`, `caretRect`, `rangeRects`, `lineOfIndex`) and grapheme and word helpers. Layout lines and glyphs now carry their source offsets and caret stops.
- Add tree-shakeable UI widgets, each under its own entry point.
  
  - `pixi-silk/ui/radial`: radial and marking menus with nested rings, angular falloff and per-device input profiles.
  - `pixi-silk/ui/button` and `pixi-silk/ui/dock`: buttons that animate in and out and refuse input while moving, and a row that reflows as they hide.
  - `pixi-silk/ui/gizmo`, `pixi-silk/ui/outline` and `pixi-silk/ui/snap`: transform gizmos in every mode, animated selection outlines and smart guides.
  - `pixi-silk/ui/color`: colour pickers that share one colour model. Hue triangle and square, wheel, OKLCH, channel sliders, swatches and an eyedropper.
  - `pixi-silk/ui/halo`, `pixi-silk/ui/brush` and `pixi-silk/ui/modes`: a context halo, a brush cursor, a hold-to-show mode ring and a segmented switch.
  - `pixi-silk/ui/dial`, `pixi-silk/ui/timeline` and `pixi-silk/ui/odometer`: jog dials, scrub fields, a mini timeline and rolling counters.
  - `pixi-silk/ui/gesture`, `pixi-silk/ui/arc`, `pixi-silk/ui/keys` and `pixi-silk/ui/pill`: the shared building blocks.
  - `pixi-silk/signal`: the tiny signal store the widgets keep their state in.
- `enableSilkBatching()` batches on WebGPU too. Runs of SilkGraphics share one draw call under Pixi's WebGPU renderer, with the same packing as on WebGL2 and the same pixels. It needs the WGSL shader from `enableWebGPU()`, which `createSilkApp` loads for you.
- Render on Pixi's WebGPU renderer. WebGL2 stays the default and the fallback.
  
  - The uber shader has a WGSL port with the same shapes, strokes, dashes, effects and gradients as the GLSL one.
  - `createSilkApp({ preference: 'webgpu' })` uses WebGPU where the browser has it. It loads the WGSL shader on demand, so WebGL2 apps do not download it.
  - `pixi-silk/webgpu` exports `enableWebGPU()` for apps that create the Pixi application themselves.
  - `Glass` now frosts the backdrop on WebGPU too, instead of drawing a plain fill.
- WebGPU draws joined path strokes and shape unions the same as WebGL2. `Measure`, `ZoomControl`, `Ruler` and `Guides` take a `label` option. Pass `silkLabel()` from `pixi-silk/text` and their text is drawn with SilkText, sharp at any zoom.

### Patch Changes

- The package ships agent skills in `skills/`. Point your coding agent at `node_modules/pixi-silk/skills/pixi-silk/SKILL.md`: it routes to skills for drawing, paint, app setup and rendering, text, layout, widgets, the editor kit and migrating from PixiJS Graphics.
- Glass no longer triggers a WebGL `GL_INVALID_OPERATION` warning on its first frame over an opaque canvas. It skips that one frame while the back buffer turns on.
  
  The editor kit is marked experimental for 1.0: camera, measure, grid, ruler, guides, marquee, group, spacing, snap, halo, brush, modes, dial, timeline, textedit, the panels and pathgizmo. Their API may change in a minor release.
  
  The JSDoc now states units, defaults and side effects, and fixes wrong facts. For example, the instance stride is 44 floats.
- Stroked paths shade every pixel once in the hard cases too. A long translucent path that crosses itself far along its length no longer blends twice where it overlaps: each chunk of a path also checks the segments of other chunks near it. Fold-backs on chunk boundaries keep exact coverage. Square dash caps that run through a round corner keep the corner round.

## 0.1.0

### Minor Changes

- First release. `SilkGraphics`: analytic anti-aliased rects, squircles, circles, ellipses, arcs, sectors,
  lines, polylines (smoothed, tapered), paths, areas, hearts, stars, polygons and triangles, drawn as one
  instanced draw call per object. Fill + stroke with exact coverage partition, shader-side dashes, gaussian
  blur on any paint, energy-conserving hairlines, transform stack and CPU hit testing.
- Gradients: linear, radial, conic and along-the-path, interpolated in OKLab (or linear / sRGB), baked into a
  half-float atlas and dithered at ±½ LSB.
- `createSilkApp`: a Pixi `Application` whose backing store maps 1:1 to device pixels (even at fractional
  DPRs), follows DPR changes, keeps sub-pixel positions and makes filters inherit the screen resolution.
- Motion helpers: `damp`, `dampAngle`, `Spring`, `ease`.
- ESM only, built one file per module and free of side effects, so bundlers keep only what an app imports.
  `SilkGraphics` with its shader is 14.8 kB gzipped and the motion helpers alone 0.4 kB. CommonJS code can
  still `require()` the package on Node 20.19+ and 22.12+.
- Works in Safari: the gradient atlas is uploaded as the premultiplied data it is.
