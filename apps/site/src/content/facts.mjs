/**
 * Facts about pixi-silk that AI assistants and readers most often get wrong, in one place.
 *
 * llms.txt, llms-full.txt, the API overview and the agent skills in packages/pixi-silk/skills
 * read from here, so a number or a default changes once. Every fact below was checked against
 * packages/pixi-silk/src; the comment after each one names the file that proves it.
 *
 * `scripts/check-skills.mjs` (repo root) fails when a subpath export of the package has no entry
 * in ENTRY_POINTS, or when the router skill does not list it.
 */

/** One-line summary for headers. */
export const SUMMARY =
    'Smooth vector graphics for PixiJS v8. Every shape is an exact signed distance field, anti-aliased per pixel in the shader, so edges stay smooth at any zoom, rotation and device pixel ratio without MSAA.';

/** What the package needs. */
export const REQUIRES = 'pixi.js ^8.6 as a peer dependency, and a browser with WebGL2 or WebGPU';

/**
 * Every entry point of the package, keyed by its subpath in package.json `exports`.
 * `area` groups them: core (root and its helpers), paint, rendering, text, layout, widgets, editor.
 *
 * @type {Record<string, { area: string, description: string }>}
 */
export const ENTRY_POINTS = {
    '.': {
        area: 'core',
        description:
            'SilkGraphics, createSilkApp, gradients (linear, radial, conic, along, mesh), colour and curve helpers, motion helpers, enableSilkBatching.',
    },
    './webgpu': {
        area: 'rendering',
        description: 'enableWebGPU: installs the WGSL shader for your own WebGPU Application.',
    },
    './glass': { area: 'paint', description: 'Glass: a frosted pane that blurs and bends what is behind it.' },
    './glow': { area: 'paint', description: 'Glow, Aurora and light helpers (neon, halo, rays, spectrum).' },
    './text': {
        area: 'text',
        description:
            'SilkText: distance-field text with outline, shadow and gradient fill. SdfAtlas, layoutText, caret helpers.',
    },
    './layout': { area: 'layout', description: 'LayoutNode: a headless flex layout engine with no Pixi in it.' },
    './ui/layout': {
        area: 'layout',
        description:
            'SmartContainer and FlexContainer: place and scale a design box in the window, flex children inside it.',
    },
    './signal': {
        area: 'widgets',
        description: 'signal, computed, watch, batch: the small reactive store every widget state uses.',
    },
    './ui': {
        area: 'widgets',
        description: 'Every widget and editor tool in one import. The per-widget subpaths ship less code.',
    },
    './ui/button': {
        area: 'widgets',
        description: 'SilkButton: pill, circle or squircle button with press, hold, busy and appear animations.',
    },
    './ui/radial': { area: 'widgets', description: 'RadialMenu and bindRadialTrigger: a ring menu with submenus.' },
    './ui/dock': {
        area: 'widgets',
        description: 'ButtonDock: a row or column of SilkButtons that closes the gap when one hides.',
    },
    './ui/pill': {
        area: 'widgets',
        description: 'ValuePill: a small rounded label for live readouts (angles, sizes, distances).',
    },
    './ui/odometer': {
        area: 'widgets',
        description: 'Odometer: a rolling number counter with prefix, decimals and count-up timing.',
    },
    './ui/dial': { area: 'widgets', description: 'JogDial and Scrubber: rotary and drag-to-change number inputs.' },
    './ui/modes': {
        area: 'widgets',
        description: 'SegmentedSwitch and ModeSwitcher: tool mode pickers, including the hold-a-key ring.',
    },
    './ui/gesture': {
        area: 'widgets',
        description: 'trackGesture: tap, hold, flick and drag from one target, with slop per pointer kind.',
    },
    './ui/arc': {
        area: 'widgets',
        description: 'Angle maths for ring widgets: angleDelta, wrapAngle, snapTo, rubberBand.',
    },
    './ui/keys': {
        area: 'widgets',
        description: 'Shared keyboard state: isKeyDown, modifier checks, onKey, isTypingTarget.',
    },
    './ui/halo': { area: 'widgets', description: 'ContextHalo: a ring of actions around a selected object.' },
    './ui/brush': { area: 'editor', description: 'BrushCursor: a brush size and hardness cursor.' },
    './selection': { area: 'editor', description: 'Selection store and bindOutline, bindGizmo, bindMeasure.' },
    './history': {
        area: 'editor',
        description: 'History (undo and redo), recordSignals, recordGizmo, bindHistoryKeys.',
    },
    './path': {
        area: 'editor',
        description: 'Bezier path model: BezierPath, drawPath, parseSvgPath, pathToSvg and edit operations.',
    },
    './ui/camera': { area: 'editor', description: 'Camera: pan and zoom a world container, ZoomControl.' },
    './ui/grid': { area: 'editor', description: 'CanvasGrid: dots or lines that follow the camera.' },
    './ui/ruler': { area: 'editor', description: 'Ruler: screen-edge rulers that follow the camera.' },
    './ui/guides': { area: 'editor', description: 'Guides: draggable guide lines from the rulers.' },
    './ui/measure': { area: 'editor', description: 'Measure: size labels and red lines between objects.' },
    './ui/marquee': { area: 'editor', description: 'Marquee: drag a box to select.' },
    './ui/outline': { area: 'editor', description: 'SelectionOutline: hover and selection outlines.' },
    './ui/gizmo': { area: 'editor', description: 'TransformGizmo: move, rotate, scale and box handles.' },
    './ui/group': { area: 'editor', description: 'SelectionGroup: transform several objects as one.' },
    './ui/snap': { area: 'editor', description: 'SnapEngine and SnapGuides: snap boxes to edges, centres and lines.' },
    './ui/spacing': { area: 'editor', description: 'SpacingMarkers and findSpacing: equal-gap hints.' },
    './ui/pathgizmo': { area: 'editor', description: 'PathGizmo and PenTool: edit and draw Bezier paths.' },
    './ui/color': { area: 'editor', description: 'Colour pickers: wheels, rings, OKLCH, channel sliders.' },
    './ui/timeline': { area: 'editor', description: 'MiniTimeline: frames, keys, loop range and playback.' },
    './ui/textedit': {
        area: 'editor',
        description: 'TextEditor: an editable SilkText field with caret, selection and IME.',
    },
    './ui/panel': { area: 'editor', description: 'Panel: a docked, scrolling side panel drawn on the canvas.' },
    './ui/layers': {
        area: 'editor',
        description: 'LayerTree: a layer tree over any data through an adapter, with selection and history.',
    },
    './ui/inspector': { area: 'editor', description: 'Inspector: property fields bound to the selection.' },
    './ui/minimap': { area: 'editor', description: 'Minimap: an overview of the world with the camera frame.' },
};

/**
 * Exports llms-full.txt leaves out: plumbing an app rarely touches. Their API pages stay on the
 * site and in the Markdown twins.
 */
export const LLMS_SKIP_API = ['SilkGeometry', 'SilkPipe', 'GradientAtlas', 'GlassFilter'];

/** Area order and titles for tables. */
export const ENTRY_AREAS = [
    ['core', 'Core'],
    ['paint', 'Paint'],
    ['rendering', 'Rendering'],
    ['text', 'Text'],
    ['layout', 'Layout'],
    ['widgets', 'UI widgets'],
    ['editor', 'Editor kit'],
];

/**
 * The facts, as short statements. `id` is stable: skills and tests refer to it.
 * Each `text` is one or two plain sentences that stand on their own.
 *
 * @type {{ id: string, text: string }[]}
 */
export const FACTS = [
    {
        id: 'renderers',
        // app.ts: preference 'webgl' default; webgpu.ts: enableWebGPU
        text: "WebGL2 is the default renderer. For WebGPU pass `createSilkApp({ preference: 'webgpu' })`, or in your own Pixi app call `enableWebGPU()` from `pixi-silk/webgpu` before you create the first SilkGraphics.",
    },
    {
        id: 'joins',
        // SilkGraphics.ts: JOINS[p.join ?? 'miter'], miterLimit ?? 10
        text: 'Stroke joins are `miter` by default, as in Canvas 2D and Pixi. `bevel` and `round` are the others. `miterLimit` defaults to 10.',
    },
    {
        id: 'paths',
        // SilkGraphics.ts: fill() emits paths as closed shapes; shader.ts: even-odd crossings
        text: 'Free-form paths (`moveTo`, `lineTo`, Bezier curves, `poly`, `svgPath`) both fill and stroke. A fill paints a path as one exact even-odd shape.',
    },
    {
        id: 'shape-ops',
        // SilkGraphics.ts: FillStyle.op, union; boolean(); svgPath()
        text: "Shape operations: `fill({ op: 'union' | 'subtract' | 'intersect' | 'exclude' })` on the shapes of the active path, `g.boolean(op, a, b)` to nest them, and `g.svgPath(d)` for SVG path data.",
    },
    {
        id: 'batching',
        // SilkGraphics._pipeId = 'mesh' until batch.ts enableSilkBatching()
        text: 'Batching is off by default: each SilkGraphics is one draw call. Call `enableSilkBatching()` before you create the objects to batch runs of them, on WebGL2 and WebGPU. `{ batch: false }` keeps one object out.',
    },
    {
        id: 'stride',
        // constants.ts: STRIDE = 44
        text: 'Each primitive is one instance of 44 floats (11 vec4, 176 bytes).',
    },
    {
        id: 'entry-points',
        // index.ts exports only the core; package.json exports the rest
        text: 'The root import holds the core only. UI widgets, editor tools, text, layout, glass, glow and WebGPU are separate entry points such as `pixi-silk/ui/button` or `pixi-silk/text`.',
    },
    {
        id: 'smart-container',
        // ui/layout/smart-container.ts: updateContainer() returns without a source
        text: 'A SmartContainer does nothing until it has a `viewport` (the Application, its renderer, a signal or a rectangle).',
    },
    {
        id: 'redraw',
        // SilkGraphics.ts: clear() keeps the buffers
        text: '`clear()` keeps the GPU buffers, so clearing and redrawing a SilkGraphics every frame is cheap.',
    },
    {
        id: 'no-texture-fill',
        // SilkGraphics.ts: FillStyle has no texture; no svg()
        text: 'There are no texture fills and no `svg()` import. Use gradients, and `svgPath(d)` for path data.',
    },
];

/** A fact's text by id. */
export const fact = (/** @type {string} */ id) => {
    const f = FACTS.find((x) => x.id === id);

    if (!f) throw new Error(`facts: no fact "${id}"`);

    return f.text;
};
