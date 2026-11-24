# pixi-silk

## 1.3.0

### Minor Changes

- [#21](https://github.com/schmooky/pixi-silk/pull/21) [`0ceef04`](https://github.com/schmooky/pixi-silk/commit/0ceef04906a53623bbb1109ff12f81e76e7d0630) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - New `pixi-silk/i18n/shaper` entry point. It draws text slots such as player names with the font the bundle was baked from. The kb_text_shape shaper in WebAssembly (62 kB brotli) shapes them, and the outlines become a distance-field run sprite with no canvas. Pass `await createShapedText({ font })` as `dynamicText` to `Silk.create`.

- [#19](https://github.com/schmooky/pixi-silk/pull/19) [`6626014`](https://github.com/schmooky/pixi-silk/commit/6626014d6f2d0f20923605756712ce02586b4b6a) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - New `pixi-silk/i18n` entry point: the renderer-agnostic core of baked localized text. It reads `.silk` bundles written by the new `@pixi-silk/compiler` package (the `silk` command), which imports strings from .xlsx, lints them, shapes them with HarfBuzz at build time and bakes MSDF atlas pages. `pixi-silk/i18n/pixi` draws them in PixiJS on WebGL2 and WebGPU: `Silk`, `SilkMessage` and the `silkBundleLoader` for `Assets`. `pixi-silk/text/bidi` exposes the Unicode Bidirectional Algorithm on its own. `pixi-silk/text` is unchanged. `pixi-silk/i18n/canvas` draws text slots such as player names, and `SilkMessageLayer` draws many messages in one draw call.

### Patch Changes

- [#18](https://github.com/schmooky/pixi-silk/pull/18) [`bcbfdf1`](https://github.com/schmooky/pixi-silk/commit/bcbfdf1f1f9756a2145fb00b7fd56089fe1b60e9) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - SilkGraphics drawn by a WebGL renderer no longer fail after `enableWebGPU()` runs. The error read "Cannot read properties of undefined (reading 'resources')", on a page that started a WebGL app and then a WebGPU one. Shaders made before and after it now lay their resources out the same way, which Pixi's cached uniform sync code relies on.

- [#20](https://github.com/schmooky/pixi-silk/pull/20) [`7d7eb16`](https://github.com/schmooky/pixi-silk/commit/7d7eb167f305a9d1fd4b4f46c0a15bbaafde2827) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - The compiler writes atlas pages as lossless WebP by default when the optional `sharp` package is installed: about 28% smaller than PNG, with the same pixels. Without sharp it writes PNG and warns with `png-pages`. Set `atlas.format` to `"png"` to keep PNG. `Silk.addBundle` loads either format, as before.

## 1.2.0

### Minor Changes

- [#16](https://github.com/schmooky/pixi-silk/pull/16) [`5b6a88d`](https://github.com/schmooky/pixi-silk/commit/5b6a88df440cb281eb4c3249f0c327675e84c014) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - WebGL1 support as an opt-in: `enableWebGL1` from the new `pixi-silk/webgl1` entry point, or `createSilkApp({ webgl1: enableWebGL1 })`. When Pixi falls back to a WebGL1 context, SilkGraphics, SilkText and Glass draw with GLSL ES 1.00 shaders built from the WebGL2 sources. Apps without the import do not ship them. On WebGL1 nothing batches, and paths past 4096 edges draw in part with a warning. Without the opt-in, `createSilkApp` now logs an error on WebGL1 instead of failing to compile the shader. `enableWebGL1` returns `false` with an error on a device without `OES_texture_float`, `OES_texture_half_float`, `OES_standard_derivatives` or fragment `highp`, where the shaders cannot run. Without `OES_texture_half_float_linear` the gradient ramps filter nearest and the shaders blend them, so gradients look the same. The renderers guide lists the costs and limits of WebGL1.

## 1.1.0

### Minor Changes

- SilkText: text that fits its box, full bidi, colour emoji. `maxLines`, `maxWidth` and `maxHeight` cut what does not fit and end it in `ellipsis`, and `shrinkToFit` shrinks the font first, down to `minFontSize` (`renderedFontSize` and `truncated` report it). `align: 'justify'` stretches wrapped lines, with kashida in Arabic. Tabs line up on `tabSize` stops. Letter spacing is not applied inside Arabic words or words of shaped scripts. The bidi pass now handles isolates, embeddings and overrides, and pairs brackets. A caret can stand at both places an offset has where the direction changes, and word jumps follow the screen. Emoji keep their colours, from a second texture. Thai and Lao are baked a cluster at a time, and `atlas.usage` reports how full the atlas is. Icons centre on the letters in text without capitals.

- Inline objects and editing polish. `silkRichLabel()` gives widgets labels that hold icons. `SilkRichText` has an `anchor`, and its objects follow the anchor and the text object's position and scale. `TextEditor` takes `inlines`: typed `{name}` tokens show their object, the caret steps over a token and one Backspace deletes it. The arrow keys move by what is on screen in lines that mix directions (`caretVisual`). Lines break beside inline boxes next to Chinese, Japanese or Korean text, and a box stays with the letters and digits next to it. `tabularNumbers` covers every decimal digit set, and digits of Burmese, Thai and the Indic scripts are clusters of their own.

- SilkText lays out right-to-left text. Arabic and Hebrew paragraphs are reordered with the Unicode bidi algorithm, so numbers, prices, percentages and Latin words inside them keep reading left to right, and brackets are mirrored. Joined Arabic letters are baked as one glyph per run, so they shape with the font. New `direction` style (`ltr`, `rtl`, `auto`), and `align` takes `start` and `end` (the default is now `start`, which is `left` for left-to-right text). Carets, hit testing and selection boxes follow the visual order, and the left arrow in `TextEditor` moves forward in a right-to-left paragraph.

- SilkText handles every script without clipping. Glyphs are baked from the ink found in the pixels, not the `measureText` box, so stacked Burmese, Thai and Vietnamese marks are never cut. Lines grow to fit the tallest ink and the outline. Burmese, Thai, Khmer, Lao, the Indic scripts, emoji sequences and combining accents are baked a word or a cluster at a time so Canvas shapes them. Lines wrap between Chinese and Japanese characters (with kinsoku), Korean syllables (or only at spaces with the new `wordBreak: 'keep-all'`) and Thai or Burmese words. Outlines are drawn for every glyph before any fill, so they never cover a neighbouring letter. New inline objects: `{name}` tokens with `inlines` reserve aligned boxes (`inlineRects()`), and the new `SilkRichText` places sprites, SilkGraphics or any container in them.

## 1.0.2

### Patch Changes

- [#14](https://github.com/schmooky/pixi-silk/pull/14) [`2bc3024`](https://github.com/schmooky/pixi-silk/commit/2bc30243a749b18c02baeb07bc1c9a9c6120c878) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - `TransformGizmo.grab()` now ends its drag on the next release wherever it happens. Before, a drag started from a press on another object only ended when the release reached the gizmo itself, so the target kept following the pointer after the button was let go. The gizmo now listens for `pointerup`, `pointerupoutside` and `pointercancel` on the pressed object for the length of the drag, and also ends it when the window loses focus or cancels the pointer.

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
