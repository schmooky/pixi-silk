import { horizontal, linear, type SilkGraphics, vertical } from 'pixi-silk';
import type { Cx, SheetWidget } from './cx';
import * as I from './icons';

/* Shared colours, layout and helpers of reference sheet 4. Each widget lives in lab/_cards. */

/*
 * Reference sheet 4 (1200×672): iPhone Live Activities on a light backdrop, drawn in reference pixels.
 * Card boxes, corner shape (r 34, smoothing 0.3), shadow falloff, colours and chart shapes were measured
 * from the reference image. Widgets cut by the sheet edge are marked `partial`.
 */

export const PI = Math.PI;

export const W = 0xffffff;

export const DEG = PI / 180;

export const osc = (t: number, f: number, ph = 0) => Math.sin((t - 3) * f + ph) - Math.sin(ph);

export function mix(a: number, b: number, t: number): number {
    const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);

    return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Piecewise-linear colour ramp over y. */
export function ramp(stops: [number, number][], y: number): number {
    if (y <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
        const [y1, c1] = stops[i];

        if (y <= y1) {
            const [y0, c0] = stops[i - 1];

            return mix(c0, c1, (y - y0) / (y1 - y0));
        }
    }

    return stops[stops.length - 1][1];
}

// ------------------------------------------------------------------------------ traced data

/** Glucose bars: x, top, bottom (outer extents). */
export const GLUCOSE = [
    [19, 80, 92],
    [29.5, 86, 98],
    [41, 83, 95],
    [52, 71, 91],
    [64, 81, 98],
    [75.5, 86, 103],
    [88.5, 69, 104],
    [101, 65, 82],
    [114, 67, 90],
    [127, 56, 97],
    [139.5, 70, 101],
    [152.5, 80, 113],
    [165.5, 66, 110],
    [178, 40, 98],
    [192, 44, 74],
    [206.5, 50, 80],
    [219, 67, 90],
    [231.5, 80, 97],
    [245, 81, 100],
    [257, 69, 89],
    [270, 80, 100],
];

export const GLUCOSE_RAMP: [number, number][] = [
    [44, 0xff3aa6],
    [51, 0xf040e0],
    [57, 0xa38cff],
    [90, 0x95a0fc],
    [102, 0x9cd7fb],
    [112, 0xa9f9c9],
];

export const GLUCOSE_GRADS = GLUCOSE.map(([, top, bottom]) =>
    linear(
        [
            [0, ramp(GLUCOSE_RAMP, top)],
            [1, ramp(GLUCOSE_RAMP, bottom)],
        ],
        { units: 'local', from: [0, top], to: [0, bottom] },
    ),
);

/** Cadence bar tops (bottom 84). */
export const CADENCE = [
    71.5, 70, 68, 66.5, 64, 60, 58, 54, 50, 42, 36, 32, 29, 32, 36, 42, 51, 53, 58, 63, 65, 65, 66.5, 65, 64, 63, 58,
];

/** Blood-pressure bars: x, top, bottom (outer extents incl. dots). */
export const PRESSURE = [
    [27, 83, 91],
    [39, 69, 92],
    [52.5, 57, 93],
    [65, 76, 101],
    [77.5, 72, 92],
    [90.5, 63, 99],
    [102.5, 51, 88],
    [114, 70, 103],
    [127, 59, 113],
    [139, 51, 115],
    [152, 66, 105],
    [163.5, 66, 90],
    [175, 59, 83],
    [187, 67, 91],
    [199, 59, 83],
    [211, 68, 77],
    [221, 75, 83],
    [232, 70, 90],
    [245.5, 56, 96],
    [257.5, 76, 101],
];

/** Race circuit centrelines: sectors 1+3 (bright) and sector 2 (dark). */
export const TRACK_BRIGHT = [
    100.5, 101.5, 98.5, 99, 93.5, 95, 85, 90, 77.5, 85, 70.5, 82, 65, 79, 59.5, 75, 53, 71, 47, 67.5, 42, 64.5, 37, 62,
    33, 60.5, 30, 57.5, 29, 53, 28.5, 48, 27.5, 44, 25, 40.5, 22.5, 36.5, 21.5, 32, 21.5, 28, 23, 24.5, 26.5, 22, 31,
    20.5, 36, 20.5, 41, 21.5, 46, 24, 51, 27, 55, 29.5, 58, 32,
];

export const TRACK_DARK = [
    58, 32, 63, 35, 65, 40, 63, 44, 57, 44, 50, 41.5, 43, 38, 38, 36, 35.5, 39, 36, 44, 37.5, 49, 40, 53.5, 44, 57.5,
    49, 60.5, 54, 61.5, 59, 59.5, 64, 55.5, 68, 51.5, 73, 48.5, 80, 47.5, 85, 49.5, 88, 53, 90.5, 57.5, 93, 62.5, 95.5,
    67.5, 98, 72.5, 101, 77, 103.5, 81.5, 106, 86, 108.5, 89.5, 111, 91, 113, 88, 112, 82, 111.5, 77, 112.5, 71.5, 115,
    68.5, 119, 68, 122, 70, 124, 74, 126, 78.5, 128, 83, 128, 87, 125.5, 91.5, 122, 95.5, 119, 99, 116, 102, 112, 105,
    107, 105.5, 103, 103.5, 100.5, 101.5,
];

export const FLIGHT_FILL = horizontal([
    [0, 0x1fe6f0],
    [0.75, 0x22f6f2],
    [1, 0xc4fff6],
]);

export const TRAIN_FILL = horizontal([
    [0, 0xb6fd6a],
    [1, 0xb0fb66],
]);

export const CONE = vertical([
    [0, 0x3a7cc0, 0.95],
    [0.5, 0x1f3f68, 0.9],
    [1, 0x1a2b49, 0.85],
]);

export const SUN_NOW = horizontal([
    [0, 0x85d2fc],
    [0.45, 0x70b5ff],
    [1, 0xffde94],
]);

export const SUN_SET = horizontal([
    [0, 0xffd28e],
    [1, 0xfe9168],
]);

export const SUN_DUSK = horizontal([
    [0, 0xf57a7c],
    [0.45, 0x3f83d4],
    [1, 0x2c3a8a],
]);

export const GREEN_LINE = vertical([
    [0, 0x5ef0b0],
    [1, 0x5ef0b0],
]);

export type G = SilkGraphics;

export function arcPoint(cx: number, cy: number, r: number, a: number): [number, number] {
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
}

export function avatar(g: G, x: number, y: number, r: number): void {
    g.circle(x, y, r).fill(0x8f9480);
    g.ellipse(x, y + r * 0.95, r * 0.8, r * 0.45).fill(0x3c4a5a);
    g.ellipse(x, y + r * 0.05, r * 0.46, r * 0.56).fill(0xd8a58a);
    g.ellipse(x, y - r * 0.46, r * 0.46, r * 0.2).fill(0x6b4a34);
    g.ellipse(x, y + r * 0.36, r * 0.36, r * 0.24).fill({ color: 0x8a6446, alpha: 0.85 });
}

// ------------------------------------------------------------------------------ column 2 (train card starts above the sheet)

export function train(c: Cx): void {
    const { g } = c;
    const light = 0xc8fa9a;
    const pos = 97 + osc(c.t, 0.1) * 8;

    g.pill(25, 71, 234, 12).fill(0x376910);
    g.pill(25, 71, 116, 12).fill(TRAIN_FILL);
    for (const x of [31, 141, 253.5]) g.circle(x, 77, 4).fill(0x0a1a04);
    g.circle(pos, 77, 4.5).fill(W);
    c.text('Harajuku', 24, 101.5, { size: 13, color: light, weight: '500' });
    c.text('Shibuya', 143, 101.5, { size: 13, color: light, weight: '500', align: 'center' });
    c.text('Ebisu', 257, 101.5, { size: 13, color: 0x7a9068, weight: '500', align: 'right' });
}

// ------------------------------------------------------------------------------ cropped edge widgets

export function edgeDashes(c: Cx): void {
    c.g.pill(167, 13, 8, 4).fill(0xff4a6a);
    c.g.pill(177, 19, 16, 4).fill(0xff4a6a);
}

export function edgeMt(c: Cx): void {
    c.text('5', 218, 42, { size: 28, weight: '300', align: 'right' });
    c.text('MT', 235, 38, { size: 15, color: 0x8c9cff, weight: '600' });
}

export function edgeParking(c: Cx): void {
    const { g } = c;

    c.text('45m left', 216, 34, { size: 14, weight: '500' });
    g.polyline([212, 41, 222, 51, 232, 65, 241, 74, 249, 78.5, 274, 80], { smooth: 'catmull' }).stroke({
        width: 3,
        gradient: GREEN_LINE,
        cap: 'round',
    });
    g.pill(219.5, 96.5, 55, 30).fill(0x3a3a3c);
    I.carFront(g, 247, 111.5, 15, W, 0x3a3a3c);
}

export function edgePlane(c: Cx): void {
    I.plane(c.g, 185, 16.5, 20, 0x5ad8f0);
}

export function edgeBox(c: Cx): void {
    c.g.roundRect(174.5, 7, 23, 23, 7).fill(0xc080f0);
    I.box(c.g, 186, 18.5, 12, 0xf6ecff, 0xc080f0);
}

export function edgeBike(c: Cx): void {
    I.bike(c.g, 23.5, 20, 20, 0xe0f050, true);
}

export function edgeBus(c: Cx): void {
    I.bus(c.g, 19.5, 17, 18, 0x6ae06a);
}

export function edgeHeart(c: Cx): void {
    c.g.heart(32, 34.5, 26, 0.12).fill(0xff4f8a);
    c.text('87', 51, 43, { size: 30, color: 0xff5a8c, weight: '400' });
}

export function edgeDropOff(c: Cx): void {
    const { g } = c;

    c.text('Drop off in', 25, 35, { size: 13, color: 0x9fa5bb, weight: '500' });
    g.pill(20, 53, 100, 9).fill(0x3a3a3c);
    g.pill(20, 53, 40, 9).fill(0x8cc8ff);
    g.pill(39, 49.5, 25, 17).fill(W);
    g.roundRect(46, 53, 3, 10, 1).fill(0x3a3a3c);
    g.roundRect(54, 53, 3, 10, 1).fill(0x3a3a3c);
    g.circle(35, 93, 12.5).fill(0x3a3f55);
    I.person(g, 35, 93, 14, 0x8a90b0);
    c.text('Mich', 59, 98, { size: 15.5, weight: '500' });
}

export function edgeF1(c: Cx): void {
    I.f1Car(c.g, 25.5, 18.5, 11, 0xe8403c);
}

export function edgeDrop(c: Cx): void {
    I.dropOutline(c.g, 14, 18, 14, 0xb4b0f0, 0.1);
    c.text('7.2', 21.5, 23, { size: 17, color: 0xb4b0f0, weight: '400' });
}

export function edgeEv(c: Cx): void {
    I.bolt(c.g, 17.5, 20, 14, 0x5ef0b0);
    c.text('45m', 190, 25, { size: 18, color: 0x5ef0b0, weight: '500', align: 'right' });
}

export const none = () => undefined;

export type Def = [
    id: string,
    name: string,
    x: number,
    y: number,
    w: number,
    h: number,
    draw: (c: Cx) => void,
    partial?: boolean,
    radius?: number,
];

/** Light backdrop measured from the reference. */
export function sheet4Backdrop(g: G): void {
    g.rect(0, 0, 1200, 672).fill(
        vertical([
            [0, 0xe8e8e8],
            [1, 0xe2e2e2],
        ]),
    );
}

/** Black card with the reference's continuous corners and its big soft shadow (σ 30.5, 37.5 px down, 45%). */
export function sheet4Card(g: G, w: SheetWidget): void {
    const r = w.radius ?? 34;
    const smooth = w.radius ? 0 : 0.3;

    g.roundRect(0, 37.5, w.w, w.h, r, smooth).fill({ color: 0x000000, alpha: 0.45, blur: 30.5 });
    g.roundRect(0, 0, w.w, w.h, r, smooth).fill(0x000000);
}
