import type { SilkGraphics } from '../SilkGraphics';

/** Corners of a lightning bolt in a 1 x 1 box, clockwise from the top tip. */
const BOLT = [0.64, 0, 0.06, 0.58, 0.44, 0.58, 0.3, 1, 0.94, 0.4, 0.56, 0.4];

/**
 * Adds a lightning bolt filling the box (x, y, w, h) to `g` as one polygon. Fill it once and
 * blur, spread and inner shadows treat it as a single shape.
 */
export function bolt(g: SilkGraphics, x: number, y: number, w: number, h: number): SilkGraphics {
    return g.poly(BOLT.map((v, i) => (i % 2 === 0 ? x + v * w : y + v * h)));
}

/** Adds a drop with its tip up: a circle of radius `r` around (cx, cy) pulled into a point `tip` above. */
export function drop(g: SilkGraphics, cx: number, cy: number, r: number, tip: number = r * 1.6): SilkGraphics {
    const k = 0.5523 * r;
    const ty = cy - tip;

    return g
        .beginPath()
        .moveTo(cx, ty)
        .bezierCurveTo(cx + r * 0.2, ty + tip * 0.35, cx + r, cy - k, cx + r, cy)
        .bezierCurveTo(cx + r, cy + k, cx + k, cy + r, cx, cy + r)
        .bezierCurveTo(cx - k, cy + r, cx - r, cy + k, cx - r, cy)
        .bezierCurveTo(cx - r, cy - k, cx - r * 0.2, ty + tip * 0.35, cx, ty)
        .closePath();
}
