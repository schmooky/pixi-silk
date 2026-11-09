import type { SilkGraphics } from '../../SilkGraphics';
import { hsvToRgb, type RGB, rgbToHex } from './model';

/** Pure hues around the wheel, interpolated in sRGB so every angle is an exact HSV hue. */
export const HUE_STOPS: number[] = [0xff0000, 0xffff00, 0x00ff00, 0x00ffff, 0x0000ff, 0xff00ff, 0xff0000];

/** Screen angle (radians, 12 o'clock is hue 0, clockwise) of a hue in degrees. */
export function hueToAngle(h: number): number {
    return -Math.PI / 2 + (h * Math.PI) / 180;
}

/** Hue in degrees, 0 to 360, of a screen angle in radians. The inverse of {@link hueToAngle}. */
export function angleToHue(a: number): number {
    const h = ((a + Math.PI / 2) * 180) / Math.PI;

    return ((h % 360) + 360) % 360;
}

/** The colour of a hue at full saturation and value, as 0xRRGGBB. */
export function pureHue(h: number): number {
    return rgbToHex(hsvToRgb(h, 1, 1));
}

/**
 * Checkerboard behind transparent colours, clipped to a rounded rectangle: the corner cells carry
 * the corner radius, so it works for pills and swatches without a mask. Needs `radius <= cell`.
 */
export function checker(
    g: SilkGraphics,
    x: number,
    y: number,
    w: number,
    h: number,
    radius: number,
    cell: number,
    light = 0xe5e5ea,
    dark = 0xaeaeb2,
): void {
    g.roundRect(x, y, w, h, radius).fill(light);
    const cols = Math.ceil(w / cell);
    const rows = Math.ceil(h / cell);
    const r = Math.min(radius, cell);

    for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
            if ((i + j) % 2 === 0) continue;
            const cx = x + i * cell;
            const cy = y + j * cell;
            const cw = Math.min(cell, x + w - cx);
            const ch = Math.min(cell, y + h - cy);
            const first = i === 0;
            const lastCol = i === cols - 1;
            const top = j === 0;
            const bottom = j === rows - 1;

            g.roundRect(cx, cy, cw, ch, [
                top && first ? r : 0,
                top && lastCol ? r : 0,
                bottom && lastCol ? r : 0,
                bottom && first ? r : 0,
            ]).fill(dark);
        }
    }
}

/**
 * A picker handle: the colour it points at inside a white ring, with a soft shadow and a thin dark
 * rim so it reads on light and dark colours alike. `alpha` below 1 shows a checker inside.
 */
export function drawHandle(g: SilkGraphics, x: number, y: number, r: number, rgb: RGB, alpha = 1): void {
    g.circle(x, y + 1, r + 2).fill({ color: 0x000000, alpha: 0.35, blur: 3 });
    if (alpha < 0.999) {
        g.circle(x, y, r).fill(0xe5e5ea);
        g.sector(x, y, r, -Math.PI / 2, 0).fill(0xaeaeb2);
        g.sector(x, y, r, Math.PI / 2, Math.PI).fill(0xaeaeb2);
    }
    g.circle(x, y, r)
        .fill({ color: rgbToHex(rgb), alpha })
        .stroke({ width: 2.5, color: 0xffffff, alignment: 'outside' });
    g.circle(x, y, r + 2.5).stroke({ width: 1, color: 0x000000, alpha: 0.3, alignment: 'outside' });
}

/** Closest point of triangle ABC to P, as barycentric weights (a, b, c), all >= 0 and summing to 1. */
export function closestBarycentric(
    px: number,
    py: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cx: number,
    cy: number,
): [number, number, number] {
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    const wa = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / det;
    const wb = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / det;
    const wc = 1 - wa - wb;

    if (wa >= 0 && wb >= 0 && wc >= 0) return [wa, wb, wc];
    // outside: the nearest point lies on one of the edges
    const edge = (x0: number, y0: number, x1: number, y1: number): [number, number] => {
        const dx = x1 - x0;
        const dy = y1 - y0;
        const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy || 1)));
        const qx = x0 + dx * t;
        const qy = y0 + dy * t;

        return [t, (qx - px) ** 2 + (qy - py) ** 2];
    };
    const [tab, dab] = edge(ax, ay, bx, by);
    const [tbc, dbc] = edge(bx, by, cx, cy);
    const [tca, dca] = edge(cx, cy, ax, ay);

    if (dab <= dbc && dab <= dca) return [1 - tab, tab, 0];
    if (dbc <= dca) return [0, 1 - tbc, tbc];

    return [tca, 0, 1 - tca];
}

/** Foot of the perpendicular from P onto the infinite line through A and B. Returns A when A and B coincide. */
export function foot(px: number, py: number, ax: number, ay: number, bx: number, by: number): [number, number] {
    const dx = bx - ax;
    const dy = by - ay;
    const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1);

    return [ax + dx * t, ay + dy * t];
}
