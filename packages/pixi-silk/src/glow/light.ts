import { Color, type ColorSource } from 'pixi.js';
import type { SilkGraphics } from '../SilkGraphics';

/** The visible spectrum, red to violet, as eight saturated `0xRRGGBB` stops. */
export const SPECTRUM: readonly number[] = [
    0xff1744, 0xff6d00, 0xffd600, 0x00e676, 0x00e5ff, 0x2979ff, 0x7c4dff, 0xd500f9,
];

/** `count` colours spread evenly along {@link SPECTRUM}, interpolated in sRGB. `count` is rounded, at least 1. */
export function spectrum(count: number): number[] {
    const n = Math.max(1, Math.round(count));
    const c = new Color();

    return Array.from({ length: n }, (_, i) => {
        const t = n === 1 ? 0 : (i / (n - 1)) * (SPECTRUM.length - 1);
        const a = Math.floor(t);
        const b = Math.min(SPECTRUM.length - 1, a + 1);
        const f = t - a;
        const ca = c.setValue(SPECTRUM[a]).toArray();
        const cb = new Color(SPECTRUM[b]).toArray();

        return c
            .setValue([ca[0] + (cb[0] - ca[0]) * f, ca[1] + (cb[1] - ca[1]) * f, ca[2] + (cb[2] - ca[2]) * f])
            .toNumber();
    });
}

/** A straight ray from (x0, y0) to (x1, y1), `w0` wide at the start and `w1` at the end. */
export interface Ray {
    /** Start x. */
    x0: number;
    /** Start y. */
    y0: number;
    /** End x. */
    x1: number;
    /** End y. */
    y1: number;
    /** Width at the start. */
    w0: number;
    /** Width at the end. */
    w1: number;
}

/** Corners of a tapered ray as a flat `[x, y]` list of four points: start left, start right, end right, end left. */
export function rayQuad(r: Ray): [number, number, number, number, number, number, number, number] {
    const dx = r.x1 - r.x0;
    const dy = r.y1 - r.y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;

    return [
        r.x0 + (nx * r.w0) / 2,
        r.y0 + (ny * r.w0) / 2,
        r.x0 - (nx * r.w0) / 2,
        r.y0 - (ny * r.w0) / 2,
        r.x1 - (nx * r.w1) / 2,
        r.y1 - (ny * r.w1) / 2,
        r.x1 + (nx * r.w1) / 2,
        r.y1 + (ny * r.w1) / 2,
    ];
}

/**
 * Adds a tapered ray to `g` as one polygon and returns `g`. Fill it afterwards, blurred for light.
 * One shape has no seam down its diagonal when it is blurred or translucent.
 */
export function ray(g: SilkGraphics, r: Ray): SilkGraphics {
    return g.poly(rayQuad(r));
}

/**
 * `count` rays fanning out from (x, y) around `angle` (radians), `spread` radians wide in all, each
 * `length` long. Neighbouring rays touch at their ends. `width` is the total width at the start,
 * shared between the rays (default 0, a point). Pair with {@link spectrum} for the colours.
 */
export function fan(
    x: number,
    y: number,
    angle: number,
    spread: number,
    length: number,
    count: number,
    width = 0,
): Ray[] {
    const n = Math.max(1, Math.round(count));
    const slice = spread / n;

    return Array.from({ length: n }, (_, i) => {
        const a = angle - spread / 2 + slice * (i + 0.5);
        const end = 2 * length * Math.tan(slice / 2) + width / n;

        return { x0: x, y0: y, x1: x + Math.cos(a) * length, y1: y + Math.sin(a) * length, w0: width / n, w1: end };
    });
}

/** Upper-case hex string of a colour without alpha, `#FF3636` style, for swatch labels. */
export function hexLabel(color: ColorSource): string {
    return `#${new Color(color).toHex().slice(1).toUpperCase()}`;
}
