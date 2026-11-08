/*
 * Every lab page: full-screen experiments, widget showcases and the 1:1 reference sheets. Slugs
 * match the module names in this folder. src/content/nav.mjs attaches each one to the docs page it
 * deepens. A removed experiment needs a redirect in astro.config.mjs.
 */

/** @type {[title: string, items: [slug: string, name: string, description: string][]][]} */
export const LAB_SECTIONS = [
    [
        'Shapes',
        [
            [
                '01-primitives',
                'Primitives',
                'Every shape kind side by side: rects, squircles, circles, arcs, sectors, lines, areas, dashes, icons and blur.',
            ],
            [
                '07-rounded-rects',
                'Rounded rects & squircles',
                'Per-corner radii and continuous-curvature corners. Drag the smoothing slider to move from a circular corner to a squircle.',
            ],
            [
                '11-icons',
                'Icons',
                'Sixteen glyphs built from primitives with save and translateTransform, drawn at 16, 28 and 56 px.',
            ],
        ],
    ],
    [
        'Paint',
        [
            [
                '13-banding',
                'Banding',
                'Dark, wide gradients with and without dither. Turn on the 8x reveal to see the contour lines the dither hides.',
            ],
        ],
    ],
    [
        'Anti-aliasing and resolution',
        [
            [
                '03-zoom',
                'Infinite zoom',
                'Five nested levels, each 3000 times smaller than the last. Zoom in to see curves and hairlines at every scale.',
            ],
            [
                '04-subpixel',
                'Sub-pixel motion',
                'Shapes drifting at 2 px per second. Compare how tessellated edges step between pixels and distance fields glide.',
            ],
            [
                '05-resolution',
                'Resolution & device pixels',
                'A Siemens star and a one-device-pixel grating. Switch between 1x, 1.5x, 2x and 3x and check the 1:1 pixel mapping.',
            ],
            [
                '06-render-texture',
                'Filters & render textures',
                'Graphics and SilkGraphics behind a filter and in a render texture, side by side at the screen resolution.',
            ],
        ],
    ],
    [
        'Charts',
        [
            [
                '15-area-chart',
                'Area chart',
                'A smoothed series with a gradient fill, dotted guides, a dashed forecast and a NOW marker. Values ease on update.',
            ],
            [
                '16-bar-charts',
                'Bar charts',
                'Slim bars split into past and future, and chunky stepped bars that grow in.',
            ],
            [
                '18-ranges',
                'Ranges & levels',
                'Progress bars with markers, range segments and signal bars, at several sizes and pixel ratios.',
            ],
            [
                '20-gauges',
                'Gauges',
                'An ISS flyover, a car battery, a heading dial with ticks, a barometer, a UV week and a dimmer.',
            ],
            [
                '21-sparklines',
                'Sparklines',
                'Strokes coloured by value, gradient markers and threshold stops. Move the pointer over a line for the crosshair.',
            ],
        ],
    ],
    [
        'Widgets from the references',
        [
            [
                '17-pills-waves',
                'Pills & waveforms',
                'Heart-rate pills and a live pressure waveform that share one gradient.',
            ],
            [
                '19-health-cards',
                'Health cards',
                'Ten Apple Health style cards with area, bar, candle and range charts.',
            ],
            ['22-sleep', 'Sleep', 'Sleep stage blocks with transitions, a night strip and a marching dotted arc.'],
            ['23-timers', 'Timers', 'Espresso ticks with analytic motion blur, run cadence bars and their controls.'],
            [
                '24-journeys',
                'Journeys',
                'Flight progress, train stations, a delivery route, a ride pickup and a race track.',
            ],
            ['25-sky', 'Sky', 'Sunset pills with a glowing sun and stars, a golden-hour curve and a daylight bar.'],
        ],
    ],
    [
        'Reference sheets, rebuilt 1:1',
        [
            [
                '30-sheet-health',
                'Health cards (sheet 1)',
                'Ten Health cards over the first reference sheet. Drag the compare slider to check them against it.',
            ],
            [
                '31-sheet-complications',
                'Complications (sheet 2)',
                'Twenty watch complications from the second reference sheet, laid out at its exact pixels.',
            ],
            [
                '32-sheet-fitness',
                'Fitness & home (sheet 3)',
                'Twenty more widgets: calendar week, hike map, sound levels, elevation, water, wind and a boarding pass.',
            ],
            [
                '33-sheet-live-activities',
                'Live Activities (sheet 4)',
                'Black cards with continuous corners and measured soft shadows on a light sheet, cropped like the reference.',
            ],
            [
                '34-sheet-watch',
                'Watch widgets (sheet 5)',
                'Cycling, 2FA, now playing, crosshair, garage, AirPods compass, barometer and moon phase widgets.',
            ],
            [
                '35-widget-viewer',
                'Widget viewer',
                'Pick any of the 81 widgets to see it large next to its crop of the reference, or laid over it.',
            ],
        ],
    ],
    [
        'All together',
        [
            [
                '26-dashboard',
                'Dashboard',
                'Thirty live widgets in a masonry layout. Scroll to see the frame-rate independent smoothing.',
            ],
        ],
    ],
];
