import type { SilkGraphics } from 'pixi-silk';
import type { Cx } from './cx';
import * as I from './icons';

/* Shared colours, layout and helpers of reference sheet 5. Each widget lives in lab/_cards. */

/*
 * Reference sheet 5 (1200×900): twenty more complications, drawn in reference pixels.
 */

export const PI = Math.PI;

export const W = 0xffffff;

export const GRAY = 0x8e8e93;

export const DIM = 0x48484a;

export const RED = 0xff453a;

export const XS = [102, 369, 637, 903];

export const YS = [111, 260, 407, 556, 705];

/** Zero at t = 3 (the reference frame). */
export const osc = (t: number, f: number, ph = 0) => Math.sin((t - 3) * f + ph) - Math.sin(ph);

export type G = SilkGraphics;

export function vlines(g: G, x0: number, x1: number, step: number, y0: number, y1: number, color = 0x1f1f21): void {
    for (let x = x0; x <= x1 + 0.01; x += step) g.line(x, y0, x, y1).stroke({ width: 0.8, color });
}

export function axis(c: Cx, labels: [string, number, number?][], y: number, seps: number[] = []): void {
    for (const s of seps) c.g.line(s, y - 14, s, y + 3).stroke({ width: 1, color: 0x2c2c2e });
    for (const [s, x, color] of labels) c.text(s, x, y, { size: 12.5, color: color ?? GRAY, weight: '500' });
}

export function googleG(g: G, x: number, y: number, r: number): void {
    const w = r * 0.42;

    g.arcSweep(x, y, r, -2.55, 1.85).stroke({ width: w, color: 0xea4335 });
    g.arcSweep(x, y, r, 2.55, 1.05).stroke({ width: w, color: 0xfbbc05 });
    g.arcSweep(x, y, r, 0.72, 1.85).stroke({ width: w, color: 0x34a853 });
    g.arcSweep(x, y, r, -0.12, 0.86).stroke({ width: w, color: 0x4285f4 });
    g.rect(x + 0.2, y - w / 2, r + w / 2 - 0.2, w).fill(0x4285f4);
}

export function aqiDots(g: G, x: number, y: number, s: number, color: number): void {
    for (let i = -2; i <= 2; i++) {
        for (let j = -2; j <= 2; j++) {
            if (Math.hypot(i, j) > 2.3) continue;
            g.circle(x + i * s * 0.2, y + j * s * 0.2, s * 0.065).fill(color);
        }
    }
}

export function carBolt(g: G, x: number, y: number, s: number, color: number): void {
    g.roundRect(x - s * 0.5, y - s * 0.28, s, s * 0.56, s * 0.14).fill(color);
    g.roundRect(x - s * 0.36, y - s * 0.44, s * 0.72, s * 0.3, s * 0.1).fill(color);
    g.roundRect(x - s * 0.46, y + s * 0.22, s * 0.16, s * 0.18, s * 0.04).fill(color);
    g.roundRect(x + s * 0.3, y + s * 0.22, s * 0.16, s * 0.18, s * 0.04).fill(color);
    I.bolt(g, x, y + s * 0.02, s * 0.42, 0x000000);
}
