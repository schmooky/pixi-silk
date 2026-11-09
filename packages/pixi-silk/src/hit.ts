import { CAP0_SHIFT, CAP1_SHIFT, type Cap, Flag, type Join, Prim, STRIDE } from './constants';
import { pathStrokeDist, polygonDist } from './stroke';

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

/** Distance to a wedge of half-aperture h around +y (the shader's sdWedge). */
function wedge(qx: number, qy: number, h: number): number {
    const cx = Math.sin(h);
    const cy = Math.cos(h);
    const ax = Math.abs(qx);
    const t = Math.max(ax * cx + qy * cy, 0);

    return Math.hypot(ax - cx * t, qy - cy * t) * Math.sign(cy * ax - cx * qy);
}

/** Annular sector with rounded corners (the shader's Prim.Sector). */
function sectorDist(s: Float32Array, at: number, x: number, y: number): number {
    const qx = x - s[at];
    const qy = y - s[at + 1];
    const sweep = s[at + 4];
    const h = Math.min(Math.abs(sweep) * 0.5, Math.PI);
    const mid = s[at + 3] + 0.5 * sweep;
    const cm = Math.cos(mid);
    const sm = Math.sin(mid);
    const rx = sm * qx - cm * qy;
    const ry = cm * qx + sm * qy;
    const len = Math.hypot(qx, qy);
    const rc = s[at + 6];
    let dA = len - (s[at + 2] - rc);

    if (s[at + 5] > 0) dA = Math.max(dA, s[at + 5] + rc - len);
    const dW = h >= Math.PI - 1e-4 ? -1e6 : wedge(rx, ry, h) + rc;

    return Math.hypot(Math.max(dA, 0), Math.max(dW, 0)) + Math.min(Math.max(dA, dW), 0) - rc;
}

/** The unit heart of the shader's Prim.Heart, scaled and rounded. */
function heartDist(s: Float32Array, at: number, x: number, y: number): number {
    const k = s[at + 2];
    const [lx, ly] = local(x - s[at], y - s[at + 1], s[at + 11]);
    const px = Math.abs(lx / k);
    const py = 0.552 - ly / k;
    let d: number;

    if (py + px > 1) d = Math.hypot(px - 0.25, py - 0.75) - 0.35355339;
    else {
        const m = 0.5 * Math.max(px + py, 0);

        d = Math.sqrt(Math.min(px * px + (py - 1) ** 2, (px - m) ** 2 + (py - m) ** 2)) * Math.sign(px - py);
    }

    return (d - s[at + 3]) * k;
}

/** Star with n points and rounded tips (the shader's Prim.Star). */
function starDist(s: Float32Array, at: number, x: number, y: number): number {
    const [lx, ly] = local(x - s[at], y - s[at + 1], s[at + 3]);
    const rc = s[at + 6];
    const r = s[at + 2] - rc;
    const n = s[at + 4];
    const en = s[at + 5];
    const an = Math.PI / n;
    const acx = Math.cos(an);
    const acy = Math.sin(an);
    const ecx = Math.cos(en);
    const ecy = Math.sin(en);
    const py = -ly;
    const a = Math.atan2(lx, py);
    let bn = (((a % (2 * an)) + 2 * an) % (2 * an)) - an;
    const l = Math.hypot(lx, py);

    bn = Number.isFinite(bn) ? bn : 0;
    let qx = l * Math.cos(bn) - r * acx;
    let qy = l * Math.abs(Math.sin(bn)) - r * acy;
    const t = Math.max(0, Math.min(-(qx * ecx + qy * ecy), (r * acy) / ecy));

    qx += ecx * t;
    qy += ecy * t;

    return Math.hypot(qx, qy) * Math.sign(qx) - rc;
}

/** Two operands combined as the shader's combineSD does: union, subtract, intersect or exclude. */
function combine(a: number, b: number, op: number): number {
    if (op === 1) return Math.max(a, -b);
    if (op === 2) return Math.max(a, b);
    if (op === 3) return Math.max(Math.min(a, b), -Math.max(a, b));

    return Math.min(a, b);
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

/**
 * Signed distance of a closed shape with parameters `s[at .. at + 12]` (an instance's aShape0..2
 * or a union record), or NaN for an unknown type.
 */
function shapeDist(type: number, s: Float32Array, at: number, x: number, y: number, poly?: Float32Array): number {
    switch (type) {
        case Prim.Rect: {
            const r = Math.max(s[at + 4], s[at + 5], s[at + 6], s[at + 7]);
            const [px, py] = local(x - s[at], y - s[at + 1], s[at + 11]);

            return roundBox(px, py, s[at + 2], s[at + 3], Math.min(r, s[at + 2], s[at + 3]));
        }
        case Prim.Ellipse: {
            const [px, py] = local(x - s[at], y - s[at + 1], s[at + 11]);
            const qx = px / s[at + 2];
            const qy = py / s[at + 3];
            const k0 = Math.hypot(qx, qy);
            const k1 = Math.hypot(qx / s[at + 2], qy / s[at + 3]);

            return k1 > 0 ? (k0 * (k0 - 1)) / k1 : -Math.min(s[at + 2], s[at + 3]);
        }
        case Prim.Sector:
            return sectorDist(s, at, x, y);
        case Prim.Heart:
            return heartDist(s, at, x, y);
        case Prim.Star:
            return starDist(s, at, x, y);
        case Prim.Triangle:
            return polygonDist(Array.from(s.subarray(at, at + 6)), x, y) - s[at + 6];
        case Prim.Poly:
            return poly ? polyDist(poly, s[at], s[at + 1], x, y) : Number.NaN;
        default:
            return Number.NaN;
    }
}

/**
 * Distance of a combined shape: `n` records of 4 texels from texel `start`, folded on a stack as
 * the shader's closedSD does. Op 4 pushes a shape, ops 0 to 3 fold it in, type 255 pops.
 */
function unionDist(poly: Float32Array, start: number, n: number, x: number, y: number): number {
    const st: number[] = [];

    for (let r = 0; r < n; r++) {
        const t = (start + r * 4) * 4;
        const type = Math.round(poly[t]);
        const op = Math.round(poly[t + 1]);

        if (type === 255) {
            const b = st.pop() ?? Infinity;

            st[st.length - 1] = combine(st[st.length - 1], b, op);
            continue;
        }
        const d = shapeDist(type, poly, t + 4, x, y, poly);

        if (op === 4 || !st.length) st.push(d);
        else st[st.length - 1] = combine(st[st.length - 1], d, op);
    }

    return st.length ? st[0] : Infinity;
}

/**
 * Tests a local point against `count` instances of `f` (STRIDE floats each), topmost first.
 * `poly` is the path texture data. Without it, every path and combined shape counts as a hit
 * inside its bounds. Blur and spread are not taken into account.
 */
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
        let d: number; // closed distance

        switch (type) {
            case Prim.Arc: {
                const qx = x - f[o + 4];
                const qy = y - f[o + 5];

                if (inSweep(qx, qy, f[o + 7], f[o + 8]) && Math.abs(Math.hypot(qx, qy) - f[o + 6]) <= hw) return true;
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
            case Prim.Path: {
                if (!poly) return true;
                const sd = pathStrokeDist(
                    poly,
                    {
                        windows: f[o + 4],
                        count: f[o + 5],
                        join: f[o + 8] as Join,
                        miterLimit: f[o + 9],
                        cap0: ((flags >> CAP0_SHIFT) & 3) as Cap,
                        cap1: ((flags >> CAP1_SHIFT) & 3) as Cap,
                        hw,
                    },
                    x,
                    y,
                );

                // thin lines keep a hit area at least 1 unit to each side
                if (sd <= Math.max(0, 1 - hw)) return true;
                continue;
            }
            case Prim.Union: {
                if (!poly) return true;
                d = unionDist(poly, f[o + 4], f[o + 5], x, y);
                break;
            }
            default:
                d = shapeDist(type, f, o + 4, x, y, poly);
                if (Number.isNaN(d)) return true;
        }

        if ((fill && d <= 0) || (stroke && Math.abs(d - off) <= hw)) return true;
    }

    return false;
}
