import { Flag, Prim, STRIDE } from './constants';

/*
 * CPU versions of the main distance functions, so pointer events hit the real
 * shape (a ring is hollow, a line is only its stroke) instead of its bounding box.
 */

function roundBox(px: number, py: number, bx: number, by: number, r: number): number {
    const qx = Math.abs(px) - bx + r;
    const qy = Math.abs(py) - by + r;

    return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const abx = bx - ax;
    const aby = by - ay;
    const len2 = abx * abx + aby * aby;
    const h = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / len2)) : 0;

    return Math.hypot(px - ax - abx * h, py - ay - aby * h);
}

/** Angle of (x, y) relative to an arc: true when inside its sweep. */
function inSweep(x: number, y: number, start: number, sweep: number): boolean {
    if (Math.abs(sweep) >= Math.PI * 2 - 1e-6) return true;
    let a = (Math.atan2(y, x) - start) * Math.sign(sweep);

    a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

    return a <= Math.abs(sweep);
}

/** Undo a primitive's rotation. */
function local(x: number, y: number, rot: number): [number, number] {
    if (rot === 0) return [x, y];
    const c = Math.cos(-rot);
    const s = Math.sin(-rot);

    return [c * x - s * y, s * x + c * y];
}

/** Even-odd signed distance to edges `start .. start + n` of a path texture. */
function polyDist(e: Float32Array, start: number, n: number, x: number, y: number): number {
    let d = Infinity;
    let inside = false;

    for (let i = start; i < start + n; i++) {
        const ax = e[i * 4];
        const ay = e[i * 4 + 1];
        const bx = e[i * 4 + 2];
        const by = e[i * 4 + 3];

        d = Math.min(d, segDist(x, y, ax, ay, bx, by));
        if (ay <= y !== by <= y && x < ax + ((y - ay) * (bx - ax)) / (by - ay)) inside = !inside;
    }

    return inside ? -d : d;
}

export function hitTest(f: Float32Array, count: number, x: number, y: number, poly?: Float32Array): boolean {
    for (let i = count - 1; i >= 0; i--) {
        const o = i * STRIDE;

        if (x < f[o] || y < f[o + 1] || x > f[o + 2] || y > f[o + 3]) continue;
        const type = f[o + 16];
        const flags = f[o + 17];
        const hw = f[o + 18] / 2;
        const fill = (flags & Flag.Fill) !== 0;
        const stroke = (flags & Flag.Stroke) !== 0 && hw > 0;
        const off = f[o + 39] * hw;
        let d = Infinity; // closed distance

        switch (type) {
            case Prim.Rect: {
                const r = Math.max(f[o + 8], f[o + 9], f[o + 10], f[o + 11]);
                const [px, py] = local(x - f[o + 4], y - f[o + 5], f[o + 15]);

                d = roundBox(px, py, f[o + 6], f[o + 7], Math.min(r, f[o + 6], f[o + 7]));
                break;
            }
            case Prim.Ellipse: {
                const [px, py] = local(x - f[o + 4], y - f[o + 5], f[o + 15]);
                const qx = px / f[o + 6];
                const qy = py / f[o + 7];
                const k0 = Math.hypot(qx, qy);
                const k1 = Math.hypot(qx / f[o + 6], qy / f[o + 7]);

                d = k1 > 0 ? (k0 * (k0 - 1)) / k1 : -Math.min(f[o + 6], f[o + 7]);
                break;
            }
            case Prim.Arc: {
                const qx = x - f[o + 4];
                const qy = y - f[o + 5];

                if (inSweep(qx, qy, f[o + 7], f[o + 8]) && Math.abs(Math.hypot(qx, qy) - f[o + 6]) <= hw) return true;
                continue;
            }
            case Prim.Sector: {
                const qx = x - f[o + 4];
                const qy = y - f[o + 5];
                const len = Math.hypot(qx, qy);

                if (len <= f[o + 6] && len >= f[o + 9] && inSweep(qx, qy, f[o + 7], f[o + 8])) return true;
                continue;
            }
            case Prim.Segment:
                if (segDist(x, y, f[o + 4], f[o + 5], f[o + 6], f[o + 7]) <= Math.max(hw, 1)) return true;
                continue;
            case Prim.Area: {
                const ax = f[o + 4];
                const bx = f[o + 6];

                if (x < ax || x > bx) continue;
                const t = (x - ax) / (bx - ax || 1);
                const top = f[o + 5] + (f[o + 7] - f[o + 5]) * t;
                const bottom = f[o + 9] + (f[o + 11] - f[o + 9]) * t;

                if (y >= Math.min(top, bottom) && y <= Math.max(top, bottom)) return true;
                continue;
            }
            case Prim.Poly:
                if (!poly) return true;
                d = polyDist(poly, f[o + 4], f[o + 5], x, y);
                break;
            default:
                // hearts, stars, triangles: bounds are close enough for pointer events
                return true;
        }

        if ((fill && d <= 0) || (stroke && Math.abs(d - off) <= hw)) return true;
    }

    return false;
}
