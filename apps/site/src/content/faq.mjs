/**
 * Frequently asked questions. Answers lead with the answer (they are quoted by search and AI
 * engines), may use `code`, and stay short. Rendered on /faq/ with FAQPage structured data.
 *
 * Each answer belongs to one docs area: its hub lists it, and /faq/ groups the answers by area.
 *
 * @type {{ area: string, q: string, a: string }[]}
 */
export const FAQ = [
    {
        area: 'rendering',
        q: 'How do I enable anti-aliasing in PixiJS v8?',
        a: 'Pass `antialias: true` to `app.init()` for MSAA on the main canvas. For sharp output on retina screens, add `resolution: window.devicePixelRatio`. Set `autoDensity: true` too. MSAA uses four samples per pixel. It skips filters and render textures unless you opt them in. For exact anti-aliasing everywhere, draw vector shapes with `SilkGraphics` from pixi-silk and keep `antialias: false`.',
    },
    {
        area: 'rendering',
        q: 'Why do PixiJS v8 Graphics look jagged or blurry?',
        a: 'PixiJS v8 tessellates Graphics into triangles when you draw, and only MSAA (`antialias: true`) anti-aliases them. Scaled curves show facets, and thin lines crawl between pixels. Filters and render textures stay aliased unless you opt them into MSAA. Filters default to resolution 1, which blurs them on retina screens. pixi-silk replaces the triangles with exact per-pixel distance fields.',
    },
    {
        area: 'start',
        q: 'What is pixi-silk?',
        a: 'pixi-silk is an MIT-licensed TypeScript library for PixiJS v8. Its `SilkGraphics` display object has a Graphics-like API. It draws rects, squircles, circles, arcs, lines, paths, areas and more as signed distance fields with analytic anti-aliasing. You also get OKLab gradients, glows, dashes and a DPR-exact app helper, `createSilkApp`.',
    },
    {
        area: 'rendering',
        q: 'What is analytic anti-aliasing?',
        a: "Analytic anti-aliasing computes each edge pixel's coverage exactly from the shape's geometry, not from a few samples. For each pixel, pixi-silk divides the signed distance to the shape by the size of one device pixel. Edges stay smooth and exact at any zoom, rotation and resolution.",
    },
    {
        area: 'rendering',
        q: 'MSAA or SDF anti-aliasing: which is better for 2D graphics?',
        a: "SDF (signed distance field) anti-aliasing is better for vector UI, charts and icons. It gives continuous coverage, not MSAA's five levels per pixel. It handles hairlines and zoom, and works inside filters and render textures without extra memory. MSAA is simpler for arbitrary triangle meshes.",
    },
    {
        area: 'rendering',
        q: 'Is there a PixiJS v8 version of @pixi/graphics-smooth?',
        a: "Not as of September 2026. `@pixi/graphics-smooth` targets PixiJS v7 (its 1.1 line requires PixiJS 7.2 or newer v7). For smooth, anti-aliased Graphics on PixiJS v8, use pixi-silk's `SilkGraphics`. It has a v8-style `fill()` and `stroke()` API.",
    },
    {
        area: 'drawing',
        q: 'How do I draw smooth circles and curves in PixiJS?',
        a: 'Use `SilkGraphics`. It evaluates `circle`, `ellipse`, `arc` and rounded corners exactly per pixel, so they stay round at any zoom. With plain Graphics, raise `bezierSmoothness` in `app.init()` and enable MSAA. Curves get finer but stay polygons.',
    },
    {
        area: 'drawing',
        q: 'Why do thin lines flicker or disappear in PixiJS?',
        a: 'A line thinner than one device pixel covers only part of each pixel. Sampling hits it on some pixels and misses it on others. pixi-silk keeps these hairlines one pixel wide and scales their opacity with their width. They fade smoothly instead of breaking up.',
    },
    {
        area: 'start',
        q: 'Is pixi-silk a replacement for Graphics?',
        a: 'Yes, for most UI and chart drawing. `SilkGraphics` has the same active-path, fill and stroke API. It supports miter, bevel and round joins. It does not support texture fills or `svg()`. You can use Graphics and SilkGraphics side by side.',
    },
    {
        area: 'rendering',
        q: 'Does pixi-silk need MSAA or antialias: true?',
        a: "No. pixi-silk computes coverage analytically per pixel, so create the app with `antialias: false` (`createSilkApp` does). MSAA only adds memory bandwidth and does not improve Silk's edges.",
    },
    {
        area: 'rendering',
        q: 'How fast is pixi-silk?',
        a: 'Each SilkGraphics is one instanced draw call. Every primitive writes 40 floats. Rebuilding 50,000 primitives every frame costs about 12 ms of CPU on a laptop. Typical UIs with a few hundred primitives cost well under half a millisecond.',
    },
    {
        area: 'rendering',
        q: 'Does pixi-silk work with WebGPU?',
        a: "Not yet. The shader is GLSL for WebGL2, so create your app with `preference: 'webgl'` (`createSilkApp` does). A WGSL version is planned.",
    },
    {
        area: 'drawing',
        q: 'How do I draw a squircle (iOS-style rounded rectangle) in PixiJS?',
        a: 'Use `g.roundRect(x, y, width, height, radius, smoothing)` with smoothing between 0 and 1. iOS uses about 0.6. The corners become superellipse arcs with continuous curvature. At 45 degrees, they are exactly as deep as a circular corner of the same radius.',
    },
    {
        area: 'paint',
        q: 'How do I make gradients in PixiJS without banding?',
        a: "Use pixi-silk's `linear`, `vertical`, `radial`, `conic` or `along`, and pass the gradient to `fill` or `stroke`. pixi-silk bakes every gradient into a half-float atlas. Dithering each sample by half an 8-bit step hides banding in dark, wide gradients. Interpolation happens in OKLab by default, so mixes stay bright and even.",
    },
    {
        area: 'paint',
        q: 'How do I add a glow or soft shadow to a shape in PixiJS without filters?',
        a: "Give the paint a `blur`: `g.circle(0, 0, 40).fill({ color: 0xff375f, blur: 12 })`. pixi-silk blurs the shape's distance field analytically with a gaussian. Glows and soft shadows cost the same as a normal shape and need no filter or render texture.",
    },
    {
        area: 'rendering',
        q: 'Why is my PixiJS canvas blurry on retina or high-DPI screens?',
        a: 'Usually the canvas backing store does not match the device pixels, or a filter renders at resolution 1. Use `createSilkApp`. It sizes the canvas from `devicePixelContentBoxSize`, so each canvas pixel is one screen pixel, even at fractional ratios like 1.5. It also makes filters inherit the screen resolution.',
    },
    {
        area: 'start',
        q: 'Can I use pixi-silk in React, Vue or Svelte?',
        a: 'Yes. SilkGraphics is a plain PixiJS display object. Create the app in an effect or mount hook with `createSilkApp({ parent: element })`. Keep references to your SilkGraphics objects and call `destroy()` on unmount. The docs site mounts its live demos from React components this way.',
    },
    {
        area: 'ui',
        q: 'Do pointer events work on SilkGraphics?',
        a: "Yes. Set `eventMode = 'static'` and listen as usual. Hit tests evaluate the real distance fields on the CPU. A stroked circle is hollow, and a line reacts only within its stroke width.",
    },
    {
        area: 'ui',
        q: 'How do I draw charts with PixiJS?',
        a: "With `SilkGraphics`, use `area(points, baseline, { smooth: 'monotone' })` for filled areas, `polyline` for lines, `roundRect` for bars and dashed `line`s for guides. Monotone smoothing never overshoots the data. A typical area fill is a vertical gradient that fades to transparent.",
    },
    {
        area: 'start',
        q: 'What license is pixi-silk under?',
        a: 'MIT. It is free for commercial and open-source use.',
    },
    {
        area: 'ui',
        q: 'Does pixi-silk come with UI widgets?',
        a: 'Yes. Radial menus, animated buttons and a button dock ship under `pixi-silk/ui/*`, each as its own entry point, so an app bundles only what it imports. Their state lives in tiny signals from `pixi-silk/signal`, which plug into React, MobX or plain callbacks.',
    },
    {
        area: 'editor-ui',
        q: 'Can I build an editor or design tool with pixi-silk?',
        a: 'Yes. `pixi-silk/ui/gizmo` has transform gizmos, selection outlines and smart guides. `pixi-silk/ui/color` has colour pickers, `pixi-silk/ui/halo`, `brush` and `modes` the tools around a selection, and `pixi-silk/ui/dial` and `timeline` the value controls. All of it draws on the canvas, with no DOM.',
    },
    {
        area: 'examples',
        q: 'Are the slot game HUD controls part of pixi-silk?',
        a: 'No. The spin button, autoplay picker, meters and wallet on the slot HUD page are examples. Each is one demo file built from library pieces such as `RadialMenu`, `Odometer` and `JogDial`. Copy the file into your game and restyle it.',
    },
];
