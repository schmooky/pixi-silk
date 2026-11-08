import { horizontal, linear, radial, type SilkGraphics, vertical } from 'pixi-silk';
import type { Cx } from './cx';

/* Shared colours, layout and helpers of reference sheet 3. Each widget lives in lab/_cards. */

/*
 * Reference sheet 3 (1080×1080): twenty fitness / home complications, drawn in reference pixels.
 * Text sizes, baselines and chart shapes were measured from the reference image.
 */

export const PI = Math.PI;

export const W = 0xffffff;

export const GRAY = 0x8e8e93;

export const AXIS = 0x7c7c80;

export const DIM = 0x48484a;

export const PALE = 0xf5e6a0;

export const RED = 0xff5a5f;

export const XS = [57, 315, 574, 832];

export const YS = [212, 354, 495, 640, 784];

export const osc = (t: number, f: number, ph = 0) => Math.sin((t - 3) * f + ph) - Math.sin(ph);

/** Deterministic 0..1 noise. */
export const hash = (i: number) => {
    const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;

    return s - Math.floor(s);
};

export const GOLDEN_BAR = horizontal([
    [0, 0xdcc9ae],
    [0.27, 0x8fc0ec],
    [0.52, 0x5aa0e8],
    [0.74, 0x8aa8c8],
    [0.86, 0xc9b9a6],
    [0.9, 0xd8a060],
    [1, 0xe8a040],
]);

export const KNOB_GLOW = radial([
    [0, 0x9cc4f0, 0.35],
    [1, 0x9cc4f0, 0],
]);

export const BPM_HIGH = vertical([
    [0, 0x3a1f5a, 0.9],
    [1, 0x3a1f5a, 0.1],
]);

export const BPM_LOW = vertical([
    [0, 0x0f3a4a, 0.1],
    [1, 0x0f3a4a, 0.9],
]);

export const ALERT_GLOW = vertical([
    [0, 0x5a1414, 0.25],
    [1, 0x8a1a1a, 0.75],
]);

export const POWER_FILL = vertical([
    [0, 0x2e5a14, 0.95],
    [1, 0x2e5a14, 0.08],
]);

export const WATER_GLOW = vertical([
    [0, 0x3ad0f5, 0],
    [1, 0x3ad0f5, 0.35],
]);

export const TEMP_LINE = linear(
    [
        [0, 0x6fd66f],
        [1, 0x4a6ae8],
    ],
    { units: 'local', from: [0, 30], to: [0, 60] },
);

export const LAMP_TRACK = horizontal([
    [0, 0x3a3a3c],
    [1, 0x1c1c1e],
]);

export const EDGE_FADE = horizontal([
    [0, 0x000000, 0],
    [0.6, 0x000000, 1],
]);

/** Run heart-rate candles traced from the reference: x, top, bottom. */
export const CANDLES = [
    [36.5, 40, 44],
    [42.5, 46, 52],
    [49, 44, 55],
    [55.5, 46, 52],
    [62, 53, 57],
    [68.5, 45, 54],
    [75, 48, 56],
    [81.5, 49, 52],
    [88, 43, 51],
    [94.5, 42, 45],
    [101, 50, 53],
    [107.5, 45, 48],
    [114, 40, 44],
    [120.5, 46, 54],
    [127, 48, 60],
    [133.5, 44, 59],
    [140, 47, 53],
    [146.5, 34, 45],
    [153, 53, 58],
    [159.5, 48, 55],
    [166, 45, 50],
    [172.5, 44, 49],
    [179, 38, 44],
];

/** Wind speed curve traced from the reference. */
export const WIND = [
    31, 54.5, 38, 55, 44, 54, 50, 52.5, 56, 53.5, 65, 53, 71, 53, 77, 55, 80, 50.5, 83, 45, 86, 42.5, 89, 42, 92, 44,
    95, 46, 98, 48, 101, 48.5, 104, 48, 110, 47, 113, 50, 116, 52, 122.7, 52, 131, 52, 134, 51, 137, 52, 143, 54.5, 149,
    54.5, 155, 56, 161, 57, 170, 56.5, 179, 57, 188, 58,
];

/** Hike route traced from the reference map. */
export const ROUTE = [
    89, 65.7, 89, 28, 97, 28, 98, 25, 100, 27, 102, 33, 112, 33, 114, 13, 125, 13, 128, 29, 145, 29, 147, 23, 150, 16,
    173.3, 15.7,
];

export type G = SilkGraphics;

export function stripes(g: G, x0: number, x1: number, step: number, y0: number, y1: number, color = 0x262628): void {
    for (let x = x0; x <= x1 + 0.01; x += step) g.line(x, y0, x, y1).stroke({ width: 0.8, color });
}

export function axis(c: Cx, labels: [string, number, number?][], y: number, seps: number[] = [], size = 11.5): void {
    for (const s of seps) c.g.line(s, y - 13, s, y + 3).stroke({ width: 1, color: 0x2c2c2e });
    for (const [s, x, color] of labels) c.text(s, x, y, { size, color: color ?? AXIS, weight: '500' });
}

export function days(c: Cx, xs: number[], y: number, highlight = -1, dim = GRAY): void {
    ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach((d, i) =>
        c.text(d, xs[i], y, {
            size: 11.5,
            color: i === highlight ? W : dim,
            weight: i === highlight ? '700' : '500',
            align: 'center',
        }),
    );
}

// ---------------------------------------------------------------------------------- icons

export function tableLamp(g: G, x: number, y: number, s: number, color: number): void {
    g.save().translateTransform(x, y).scaleTransform(s);
    g.area([-0.36, -0.06, -0.2, -0.5, 0.2, -0.5, 0.36, -0.06], -0.06).fill(color);
    g.line(0, -0.06, 0, 0.4).stroke({ width: 0.1, color });
    g.pill(-0.2, 0.36, 0.4, 0.12).fill(color);
    g.restore();
}

export function timer(g: G, x: number, y: number, s: number, color: number): void {
    g.save().translateTransform(x, y).scaleTransform(s);
    g.arcSweep(0, 0.04, 0.42, -PI * 0.35, PI * 1.7).stroke({ width: 0.1, color, cap: 'round' });
    g.line(0, 0.04, 0.18, -0.16).stroke({ width: 0.1, color, cap: 'round' });
    g.restore();
}

export function walker(g: G, x: number, y: number, s: number, color: number, poles = false): void {
    g.save().translateTransform(x, y).scaleTransform(s);
    const w = { width: 0.13, color, cap: 'round' as const };

    g.circle(0.06, -0.4, 0.11).fill(color);
    g.line(0.02, -0.22, -0.04, 0.1).stroke({ ...w, width: 0.17 });
    g.polyline([-0.2, -0.02, 0, -0.18, 0.2, 0.02]).stroke(w);
    g.polyline([-0.04, 0.1, 0.16, 0.28, 0.14, 0.5]).stroke(w);
    g.polyline([-0.04, 0.1, -0.16, 0.32, -0.3, 0.46]).stroke(w);
    if (poles) g.line(0.28, -0.08, 0.36, 0.5).stroke({ width: 0.07, color, cap: 'round' });
    g.restore();
}

export function pin(g: G, x: number, y: number, s: number, color: number): void {
    g.save().translateTransform(x, y).scaleTransform(s);
    g.circle(0, -0.14, 0.3).stroke({ width: 0.1, color });
    g.circle(0, -0.14, 0.1).fill(color);
    g.line(0, 0.16, 0, 0.48).stroke({ width: 0.1, color, cap: 'round' });
    g.restore();
}

export function ear(g: G, x: number, y: number, s: number, color: number): void {
    g.save().translateTransform(x, y).scaleTransform(s);
    const w = { width: 0.1, color, cap: 'round' as const };

    g.moveTo(-0.16, 0.44)
        .bezierCurveTo(-0.38, 0.2, -0.4, -0.46, 0.02, -0.46)
        .bezierCurveTo(0.36, -0.46, 0.4, -0.08, 0.18, 0.1)
        .quadraticCurveTo(0.06, 0.2, 0.04, 0.34)
        .stroke(w);
    g.moveTo(-0.12, -0.02).bezierCurveTo(-0.14, -0.28, 0.16, -0.3, 0.14, -0.1).stroke(w);
    g.restore();
}

export function windLines(g: G, x: number, y: number, s: number, color: number): void {
    g.save().translateTransform(x, y).scaleTransform(s);
    const w = { width: 0.1, color, cap: 'round' as const };

    g.moveTo(-0.48, -0.2).lineTo(0.18, -0.2).quadraticCurveTo(0.42, -0.2, 0.36, -0.38).stroke(w);
    g.line(-0.48, 0.02, 0.4, 0.02).stroke(w);
    g.moveTo(-0.48, 0.24).lineTo(0.12, 0.24).quadraticCurveTo(0.34, 0.26, 0.28, 0.44).stroke(w);
    g.restore();
}
