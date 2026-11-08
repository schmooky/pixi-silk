import { Cap, Join } from './constants';

/*
 * CPU side of stroked paths (Prim.Path): join geometry for bounds and hit tests, and the exact
 * stroke distance. It follows the Canvas 2D definition of a stroke: one butt rectangle per segment,
 * a join on the outer side of every inner vertex, caps at the open ends.
 *
 * Path texture layout, one RGBA32F texel each: a header (segmentCount, closed, length, 0) and then
 * one (ax, ay, bx, by) texel per segment. Subpaths of one instance follow each other.
 */

/** Miter ratio of a join: the miter length over half the line width, as Canvas and SVG define it. */
export function miterRatio(d0x: number, d0y: number, d1x: number, d1y: number): number {
    const ch = Math.sqrt(Math.max(0.5 * (1 + d0x * d1x + d0y * d1y), 0));

    return ch > 1e-9 ? 1 / ch : Infinity;
}

/**
 * The region a miter or bevel join adds at vertex (vx, vy), between the incoming direction d0 and
 * the outgoing direction d1 (unit vectors). Returns a flat polygon: the vertex, the two outer
 * corners and, for a miter within the limit, the miter tip. Returns null for round joins and for
 * straight or fully reversed segments, where nothing is added.
 */
export function joinPolygon(
    vx: number,
    vy: number,
    d0x: number,
    d0y: number,
    d1x: number,
    d1y: number,
    hw: number,
    join: Join,
    miterLimit: number,
): number[] | null {
    if (join === Join.Round) return null;
    const cr = d0x * d1y - d0y * d1x;

    if (Math.abs(cr) < 1e-9) return null;
    const s = cr > 0 ? -1 : 1;
    // outer normals of both segments
    const n0x = -d0y * s;
    const n0y = d0x * s;
    const n1x = -d1y * s;
    const n1y = d1x * s;
    const ax = vx + n0x * hw;
    const ay = vy + n0y * hw;
    const bx = vx + n1x * hw;
    const by = vy + n1y * hw;
    const ratio = miterRatio(d0x, d0y, d1x, d1y);

    if (join === Join.Miter && ratio <= miterLimit) {
        const ml = Math.hypot(n0x + n1x, n0y + n1y);
        const k = (hw * ratio) / ml;

        return [vx, vy, ax, ay, vx + (n0x + n1x) * k, vy + (n0y + n1y) * k, bx, by];
    }

    return [vx, vy, ax, ay, bx, by];
}

/** Signed distance to a simple polygon given as flat points (any winding). */
export function polygonDist(pts: number[], x: number, y: number): number {
    const n = pts.length >> 1;
    let d = (x - pts[0]) ** 2 + (y - pts[1]) ** 2;
    let sign = 1;

    for (let i = 0, j = n - 1; i < n; j = i, i++) {
        const vix = pts[i * 2];
        const viy = pts[i * 2 + 1];
        const ex = pts[j * 2] - vix;
        const ey = pts[j * 2 + 1] - viy;
        const wx = x - vix;
        const wy = y - viy;
        const h = Math.max(0, Math.min(1, (wx * ex + wy * ey) / Math.max(ex * ex + ey * ey, 1e-12)));
        const bx = wx - ex * h;
        const by = wy - ey * h;

        d = Math.min(d, bx * bx + by * by);
        const c1 = y >= viy;
        const c2 = y < pts[j * 2 + 1];
        const c3 = ex * wy > ey * wx;

        if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) sign = -sign;
    }

    return sign * Math.sqrt(d);
}

/** End kinds of one straight piece: 0 butt, 1 round, 2 square (the Cap ids). */
function pieceDist(qx: number, qy: number, len: number, k0: number, k1: number, hw: number): number {
    const lo = k0 === Cap.Square ? -hw : 0;
    const hi = len + (k1 === Cap.Square ? hw : 0);
    const bx = Math.abs(qx - 0.5 * (lo + hi)) - 0.5 * (hi - lo);
    const by = Math.abs(qy) - hw;
    let d = Math.hypot(Math.max(bx, 0), Math.max(by, 0)) + Math.min(Math.max(bx, by), 0);

    if (k0 === Cap.Round) d = Math.min(d, Math.hypot(qx, qy) - hw);
    if (k1 === Cap.Round) d = Math.min(d, Math.hypot(qx - len, qy) - hw);

    return d;
}

/** Options of {@link pathStrokeDist}, in the order a Prim.Path instance stores them. */
export interface PathRef {
    /** First header texel. */
    header: number;
    /** Subpaths in the instance. */
    subpaths: number;
    /** First segment of a chunk (ignored when `count` is negative). */
    first: number;
    /** Segments of a chunk, or -1 for every segment of every subpath. */
    count: number;
    join: Join;
    miterLimit: number;
    cap0: Cap;
    cap1: Cap;
    /** Half the line width. */
    hw: number;
}

function dirOf(e: Float32Array, t: number): [number, number] {
    const dx = e[t * 4 + 2] - e[t * 4];
    const dy = e[t * 4 + 3] - e[t * 4 + 1];
    const len = Math.hypot(dx, dy);

    return len > 1e-9 ? [dx / len, dy / len] : [1, 0];
}

/**
 * Signed distance to the stroke of the segments a Prim.Path instance owns (no dashes): negative
 * inside. Every chunk owns the join at the start of its segments, as the shader does.
 */
export function pathStrokeDist(e: Float32Array, ref: PathRef, x: number, y: number): number {
    const { hw, join } = ref;
    const whole = ref.count < 0;
    const interior = join === Join.Round ? Cap.Round : Cap.Butt;
    let hdr = ref.header;
    let best = Infinity;

    for (let sp = 0; sp < ref.subpaths; sp++) {
        const n = Math.round(e[hdr * 4]);
        const closed = e[hdr * 4 + 1] > 0.5;
        const first = hdr + 1;
        const a = whole ? 0 : ref.first;
        const m = whole ? n : ref.count;

        hdr += 1 + n;
        for (let k = 0; k < m; k++) {
            const i = a + k;

            if (i >= n) break;
            const t = first + i;
            const ax = e[t * 4];
            const ay = e[t * 4 + 1];
            const len = Math.hypot(e[t * 4 + 2] - ax, e[t * 4 + 3] - ay);
            const [dx, dy] = dirOf(e, t);
            const hasPrev = closed || i > 0;
            const hasNext = closed || i < n - 1;
            const wx = x - ax;
            const wy = y - ay;
            let d = pieceDist(
                wx * dx + wy * dy,
                dx * wy - dy * wx,
                len,
                hasPrev ? interior : ref.cap0,
                hasNext ? interior : ref.cap1,
                hw,
            );

            if (hasPrev && join !== Join.Round) {
                const [px, py] = dirOf(e, first + ((i - 1 + n) % n));
                const poly = joinPolygon(ax, ay, px, py, dx, dy, hw, join, ref.miterLimit);

                if (poly) d = Math.min(d, polygonDist(poly, x, y));
            }
            best = Math.min(best, d);
        }
    }

    return best;
}
