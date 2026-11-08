/**
 * Frequently asked questions. Answers lead with the answer (they are quoted by search and AI
 * engines), may use `code`, and stay at one to three sentences. Name the limit, skip the plug.
 *
 * Each answer belongs to one docs area: its hub lists it, and /faq/ groups the answers by area.
 *
 * @type {{ area: string, q: string, a: string }[]}
 */
export const FAQ = [
    // Learn
    {
        area: 'learn',
        q: 'What is pixi-silk?',
        a: 'An MIT-licensed TypeScript library for PixiJS v8. Its `SilkGraphics` display object has a Graphics-like API and draws each shape as a distance field, anti-aliased per pixel in the shader.',
    },
    {
        area: 'learn',
        q: 'Is pixi-silk a replacement for Graphics?',
        a: 'For UI, chart and icon drawing, yes: `SilkGraphics` keeps the active path, `fill()` and `stroke()`. It has no texture fills and no `svg()` import (`svgPath(d)` reads one path string), and both classes work side by side.',
    },
    {
        area: 'learn',
        q: 'Which entry point do I import?',
        a: 'The root `pixi-silk` import holds SilkGraphics, gradients, `createSilkApp` and batching. Text, layout, glass, glow, WebGPU and every UI widget are separate entry points, such as `pixi-silk/text` or `pixi-silk/ui/gizmo`, so an app bundles only what it imports.',
    },
    {
        area: 'learn',
        q: 'Can I use pixi-silk in React, Vue or Svelte?',
        a: 'Yes. Create the app in a mount hook with `createSilkApp({ parent: element })` and call its `destroy()` on unmount.',
    },
    {
        area: 'learn',
        q: 'What license is pixi-silk under?',
        a: 'MIT, for commercial and open-source use.',
    },
    // Shapes & strokes
    {
        area: 'shapes-and-strokes',
        q: 'How do I draw a squircle (iOS-style rounded rectangle) in PixiJS?',
        a: 'Call `g.roundRect(x, y, width, height, radius, smoothing)` with smoothing between 0 and 1. iOS uses about 0.6.',
    },
    {
        area: 'shapes-and-strokes',
        q: 'Why do thin lines flicker or disappear in PixiJS?',
        a: 'A line thinner than one device pixel covers only part of each pixel, so sampling hits some pixels and misses others. SilkGraphics keeps such hairlines one pixel wide and lowers their opacity with their width.',
    },
    {
        area: 'shapes-and-strokes',
        q: 'Can SilkGraphics fill a free-form path?',
        a: 'Yes. A path from `moveTo()`, `lineTo()`, the curve calls or `svgPath(d)` fills with the even-odd rule and strokes with miter, bevel or round joins.',
    },
    {
        area: 'shapes-and-strokes',
        q: 'How do I cut one shape out of another?',
        a: "Use `g.boolean('subtract', a, b)` with two callbacks that draw the shapes, or pass `op` to `fill()`. Union, intersect, subtract and exclude are supported.",
    },
    // Paint
    {
        area: 'paint',
        q: 'How do I make gradients in PixiJS without banding?',
        a: 'Fill with `linear`, `radial`, `conic` or `along` from pixi-silk. Gradients are baked into a half-float atlas and dithered by half an 8-bit step, which hides the bands in dark, wide ramps.',
    },
    {
        area: 'paint',
        q: 'How do I add a glow or soft shadow without a filter?',
        a: 'Give the paint a `blur`, for example `g.circle(0, 0, 40).fill({ color: 0xff375f, blur: 12 })`. Add `spread` to grow the shape before the blur.',
    },
    {
        area: 'paint',
        q: 'Are glass and glow part of the root import?',
        a: 'No. Glass lives in `pixi-silk/glass` and glow in `pixi-silk/glow`. Both are filters, so they cost a render pass where plain blur does not.',
    },
    // Text
    {
        area: 'typography',
        q: 'Why is PixiJS Text blurry when I zoom in?',
        a: 'PixiJS `Text` is a bitmap, so scaling it stretches its pixels. `SilkText` from `pixi-silk/text` draws glyphs from a distance field atlas and keeps its edges under a zooming camera.',
    },
    {
        area: 'typography',
        q: 'Which scripts does SilkText support?',
        a: 'Latin, Greek and Cyrillic UI text. There is no shaping, so right-to-left text, ligatures and combining marks do not work, and emoji come out as one-colour silhouettes. Use PixiJS `Text` for those.',
    },
    {
        area: 'typography',
        q: 'Do IME and mobile keyboards work in the text editor?',
        a: '`TextEditor` types through a hidden `<textarea>` that follows the caret, so input methods, mobile keyboards, autocorrect and the clipboard work. Spell check underlines do not show.',
    },
    // Game UI
    {
        area: 'game-ui',
        q: 'Do pointer events work on SilkGraphics?',
        a: "Yes. Set `eventMode = 'static'` and listen as usual. Hit tests use the real shapes, so a stroked circle is hollow and a line reacts only within its stroke width.",
    },
    {
        area: 'game-ui',
        q: 'Why does my SmartContainer not move or scale?',
        a: 'It needs a `viewport`: pass the Pixi `Application`, a signal or a rectangle as `viewport` or call `setViewport()`. Without one it has no window to place itself in.',
    },
    {
        area: 'game-ui',
        q: 'How close is the layout engine to CSS flexbox?',
        a: "It follows flexbox for direction, wrap, grow, shrink, gaps and alignment. It has no `order`, `overflow` or borders, and an item's default minimum size is 0, not its content size.",
    },
    {
        area: 'game-ui',
        q: 'Are the slot game HUD controls part of pixi-silk?',
        a: 'The spin button, autoplay picker, meters and wallet are site examples built from library pieces such as `RadialMenu`, `Odometer` and `JogDial`. Copy the demo file and restyle it.',
    },
    // Editor kit
    {
        area: 'editor-kit',
        q: 'Is the editor kit stable?',
        a: 'No. The editor kit is experimental in 1.0, and its API may change in a minor release.',
    },
    {
        area: 'editor-kit',
        q: 'Does the editor kit keep my document?',
        a: 'No. The widgets draw and report. You keep the document, and `pixi-silk/selection` and `pixi-silk/history` hold the selection and the undo stack if you want them.',
    },
    {
        area: 'editor-kit',
        q: 'Do I need DOM panels over the canvas for a scene editor?',
        a: 'No. `pixi-silk/ui/panel` draws dockable panels on the canvas, and `layers`, `inspector` and `minimap` fill them. They are Pixi containers, so they share the scene, its pointer events and its undo history.',
    },
    // Examples
    {
        area: 'examples',
        q: 'How do I draw charts with PixiJS?',
        a: "Use `area(points, baseline, { smooth: 'monotone' })` for filled areas, `polyline` for lines and `roundRect` for bars. Monotone smoothing never overshoots the data.",
    },
    {
        area: 'examples',
        q: 'Can I copy the showcase widgets into my app?',
        a: 'Yes, they are MIT like the library. They are site code, not exports, so copy the lab file you need from the repository.',
    },
    // Reference
    {
        area: 'reference',
        q: 'Does pixi-silk work with WebGPU?',
        a: "Yes. Pass `preference: 'webgpu'` to `createSilkApp`, or call `enableWebGPU()` from `pixi-silk/webgpu` before the first SilkGraphics in your own Pixi app. WebGL2 is the default and the fallback.",
    },
    {
        area: 'reference',
        q: 'How do I draw many SilkGraphics in one draw call?',
        a: 'Call `enableSilkBatching()` before you create the objects. It is off by default and works on WebGL2 and WebGPU. Without it, each SilkGraphics is one instanced draw call.',
    },
    {
        area: 'reference',
        q: 'Why is my PixiJS canvas blurry on retina or high-DPI screens?',
        a: 'The canvas backing store does not match the device pixels, or a filter renders at resolution 1. `createSilkApp` sizes the canvas from `devicePixelContentBoxSize` and makes filters inherit the screen resolution.',
    },
    {
        area: 'reference',
        q: 'Does pixi-silk need antialias: true?',
        a: 'No. Coverage is computed per pixel, so create the app with `antialias: false`, as `createSilkApp` does. MSAA would only cost memory bandwidth.',
    },
    // Architecture
    {
        area: 'architecture',
        q: 'How do I enable anti-aliasing in PixiJS v8?',
        a: 'Pass `antialias: true` to `app.init()` for MSAA on the main canvas, with `resolution: window.devicePixelRatio` and `autoDensity: true` for retina screens. MSAA skips filters and render textures unless you opt them in.',
    },
    {
        area: 'architecture',
        q: 'Why do PixiJS v8 Graphics look jagged or blurry?',
        a: 'Graphics are tessellated into triangles, and only MSAA smooths their edges. Scaled curves show facets, thin lines crawl between pixels, and filters render at resolution 1 by default.',
    },
    {
        area: 'architecture',
        q: 'What is analytic anti-aliasing?',
        a: "Each edge pixel's coverage is computed from the shape's geometry, not from a few samples. pixi-silk divides the signed distance to the shape by the size of one device pixel.",
    },
    {
        area: 'architecture',
        q: 'Is there a PixiJS v8 version of @pixi/graphics-smooth?',
        a: '`@pixi/graphics-smooth` targets PixiJS v7, and its 1.1 line needs PixiJS 7.2 or a newer v7. SilkGraphics has a v8-style `fill()` and `stroke()` API.',
    },
];
