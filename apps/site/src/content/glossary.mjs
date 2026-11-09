/**
 * Terms used across the docs, rendered by <Glossary /> on /docs/glossary/ with DefinedTermSet
 * structured data. Definitions lead with the definition itself (they are quoted by search and AI engines).
 *
 * @type {{ term: string, aka?: string[], definition: string, see?: string }[]}
 */
export const GLOSSARY = [
    {
        term: 'Anti-aliasing',
        aka: ['antialiasing', 'AA'],
        definition:
            'Techniques that remove the jagged "staircase" look of edges on a pixel grid. Each edge pixel gets a partial colour proportional to how much of it the shape covers.',
        see: '/docs/anti-aliasing-compared/',
    },
    {
        term: 'Aliasing',
        aka: ['jaggies', 'staircase artifacts'],
        definition:
            'The jagged or crawling edges that appear when you sample a continuous shape at only one point per pixel. Each pixel is then either fully in or fully out.',
    },
    {
        term: 'Analytic anti-aliasing',
        definition:
            "Anti-aliasing computed exactly per pixel from the shape's geometry, not from extra samples. pixi-silk derives coverage from the signed distance to the shape and the size of one device pixel.",
        see: '/docs/how-it-works/',
    },
    {
        term: 'MSAA',
        aka: ['multisample anti-aliasing'],
        definition:
            'A GPU technique that stores several coverage samples per pixel (typically 4) and averages them. In PixiJS, you enable it with antialias: true. By default it covers only the main canvas. Filters and render textures must opt in one by one.',
        see: '/docs/anti-aliasing-compared/',
    },
    {
        term: 'SSAA',
        aka: ['supersampling'],
        definition:
            'Anti-aliasing by rendering at a higher resolution and downscaling. It is simple and high quality. Memory and fill-rate costs grow with the scale factor squared.',
    },
    {
        term: 'FXAA',
        aka: ['fast approximate anti-aliasing'],
        definition:
            'A cheap post-processing filter that detects and blurs high-contrast edges in the finished image. It softens detail and text and cannot recover geometry lost between pixels.',
    },
    {
        term: 'Signed distance field',
        aka: ['SDF'],
        definition:
            'A function that returns the distance from any point to the nearest edge of a shape: negative inside, positive outside. Rendering a shape from its SDF gives exact edges at any scale.',
        see: '/docs/how-it-works/',
    },
    {
        term: 'Coverage',
        definition:
            "The fraction of a pixel's area covered by a shape, from 0 to 1. Anti-aliasing uses coverage as the pixel's opacity along edges.",
    },
    {
        term: 'Tessellation',
        definition:
            'Converting curves and shapes into triangles for the GPU. PixiJS Graphics tessellates when you draw, so curves become polygons with a fixed number of segments.',
    },
    {
        term: 'Device pixel ratio',
        aka: ['DPR', 'devicePixelRatio'],
        definition:
            'The number of physical screen pixels per CSS pixel: 1 on standard displays, 2 or 3 on retina or HiDPI screens. Many laptops and phones have fractional ratios such as 1.25 or 1.5.',
        see: '/docs/resolution/',
    },
    {
        term: 'Device pixel',
        definition:
            'One physical pixel of the display. A canvas is sharp only when each of its pixels maps to exactly one device pixel.',
    },
    {
        term: 'Hairline',
        definition:
            'A line thinner than one device pixel. pixi-silk keeps hairlines one pixel wide and scales their opacity with their width, so they fade instead of breaking up.',
        see: '/docs/strokes-and-dashes/',
    },
    {
        term: 'Squircle',
        aka: ['superellipse corner', 'continuous corner'],
        definition:
            'A rounded rectangle whose corners are superellipse arcs, so curvature grows gradually from the straight edge instead of jumping. iOS app icons and cards use it.',
        see: '/docs/shapes/',
    },
    {
        term: 'OKLab',
        definition:
            'A perceptual colour space by Björn Ottosson, where equal steps look equally different. Gradients interpolated in OKLab stay bright and even, without muddy midpoints.',
        see: '/docs/gradients/',
    },
    {
        term: 'Gradient banding',
        aka: ['colour banding'],
        definition:
            'Visible steps in a smooth gradient caused by 8-bit colour precision, most obvious in dark, wide gradients.',
        see: '/docs/gradients/',
    },
    {
        term: 'Dithering',
        definition:
            'Adding a little structured noise (here ±½ of an 8-bit step) before quantising. It hides banding and leaves exact colours unchanged.',
    },
    {
        term: 'Premultiplied alpha',
        definition:
            'Storing colour already multiplied by opacity. Interpolating premultiplied colours prevents dark fringes when a gradient fades to transparent.',
    },
    {
        term: 'Instanced rendering',
        aka: ['instancing'],
        definition:
            'Drawing many copies of one mesh in a single draw call, each with its own data. pixi-silk draws every primitive of a SilkGraphics as one instance of a quad.',
        see: '/docs/performance/',
    },
    {
        term: 'Draw call',
        definition:
            'One command from the CPU telling the GPU to draw. Fewer draw calls usually mean better performance. Each SilkGraphics is one draw call.',
    },
    {
        term: 'Monotone interpolation',
        definition:
            "A curve through data points that never overshoots them. Peaks stay on the data and flat runs stay flat. pixi-silk uses Steffen's method (like d3's curveMonotoneX) for charts.",
        see: '/docs/charts/',
    },
];
