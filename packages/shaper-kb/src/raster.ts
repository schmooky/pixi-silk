import type { Contour } from './font';

/**
 * Fills polygons into a coverage bitmap with exact area anti-aliasing: each edge adds its signed
 * area to an accumulation buffer, and a running sum gives the coverage. Overlapping contours of the
 * same direction (variable fonts) clamp to full coverage. Coordinates are in pixels, y down.
 */
export function fillContours(contours: readonly Contour[], width: number, height: number): Uint8Array {
    const acc = new Float32Array(width * height + 4);

    for (const contour of contours) {
        for (let i = 0; i < contour.length; i++) {
            const a = contour[i];
            const b = contour[(i + 1) % contour.length];

            line(acc, width, height, a.x, a.y, b.x, b.y);
        }
    }
    const out = new Uint8Array(width * height);
    let sum = 0;

    for (let i = 0; i < out.length; i++) {
        sum += acc[i];
        out[i] = Math.round(Math.min(1, Math.abs(sum)) * 255);
    }

    return out;
}

function line(acc: Float32Array, w: number, h: number, ax: number, ay: number, bx: number, by: number): void {
    if (ay === by) return;
    const dir = ay < by ? 1 : -1;
    const [x0, y0, x1, y1] = ay < by ? [ax, ay, bx, by] : [bx, by, ax, ay];
    const dxdy = (x1 - x0) / (y1 - y0);
    let x = x0;

    if (y0 < 0) x -= y0 * dxdy;
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(h, Math.ceil(y1)); y++) {
        const row = y * w;
        const dy = Math.min(y + 1, y1) - Math.max(y, y0);
        const xnext = x + dxdy * dy;
        const d = dy * dir;
        const lo = Math.max(0, Math.min(x, xnext));
        const hi = Math.min(w - 1, Math.max(x, xnext));
        const lof = Math.floor(lo);
        const loi = lof;
        const hii = Math.ceil(hi);

        if (hii <= loi + 1) {
            const xmf = 0.5 * (x + xnext) - lof;

            acc[row + loi] += d - d * xmf;
            acc[row + loi + 1] += d * xmf;
        } else {
            const s = 1 / (hi - lo);
            const x0f = lo - lof;
            const a0 = 0.5 * s * (1 - x0f) * (1 - x0f);
            const x1f = hi - hii + 1;
            const am = 0.5 * s * x1f * x1f;

            acc[row + loi] += d * a0;
            if (hii === loi + 2) acc[row + loi + 1] += d * (1 - a0 - am);
            else {
                const a1 = s * (1.5 - x0f);

                acc[row + loi + 1] += d * (a1 - a0);
                for (let xi = loi + 2; xi < hii - 1; xi++) acc[row + xi] += d * s;
                const a2 = a1 + (hii - loi - 3) * s;

                acc[row + hii - 1] += d * (1 - a2 - am);
            }
            acc[row + hii] += d * am;
        }
        x = xnext;
    }
}
