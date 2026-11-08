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

/**
 * Distance of one straight piece in its own frame (qx along, qy across) covering [0, len]. End
 * kinds are the Cap ids (0 butt, 1 round, 2 square). At the start, 3 is the round join of an inner
 * vertex. That disc is cut to the stroke: at most `back` before the start and no further than the
 * piece's end. The shader's `pieceSD` does the same.
 */
function pieceDist(qx: number, qy: number, len: number, k0: number, k1: number, hw: number, back: number): number {
    const lo = k0 === Cap.Square ? -hw : 0;
    const hi = len + (k1 === Cap.Square ? hw : 0);
    const bx = Math.abs(qx - 0.5 * (lo + hi)) - 0.5 * (hi - lo);
    const by = Math.abs(qy) - hw;
    let d = Math.hypot(Math.max(bx, 0), Math.max(by, 0)) + Math.min(Math.max(bx, by), 0);
    const disc = Math.hypot(qx, qy) - hw;

    if (k0 === Cap.Round) d = Math.min(d, disc);
    if (k0 === 3) d = Math.min(d, Math.max(disc, -back - qx, qx - hi));
    if (k1 === Cap.Round) d = Math.min(d, Math.hypot(qx - len, qy) - hw);

    return d;
}

/**
 * Options of {@link pathStrokeDist}, as a Prim.Path instance stores them. Its window texels
 * (header texel, first segment, count, owner key) list the windows it owns first.
 */
export interface PathRef {
    /** First window texel. */
    windows: number;
    /** Windows the instance owns. */
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
 * How the shader joins two pieces with directions d0 and d1. 0 is butt ends only, where the path
 * folds back. 1 is a round disc: round joins, and miters or bevels within a tenth of a pixel `px`
 * of one. 2 is a miter, 3 a bevel.
 */
export function joinKind(
    d0x: number,
    d0y: number,
    d1x: number,
    d1y: number,
    hw: number,
    join: Join,
    limit: number,
    px: number,
): number {
    if (join === Join.Round) return 1;
    const ch = Math.sqrt(Math.max(0.5 * (1 + d0x * d1x + d0y * d1y), 0));

    if (ch < 1e-4) return 0;
    const miter = join === Join.Miter && 1 / ch <= limit;
    const diff = miter ? hw * (1 / ch - 1) : hw * (1 - ch);

    if (diff < 0.1 * px) return 1;

    return miter ? 2 : 3;
}

/**
 * Signed distance to the stroke of the segments a Prim.Path instance owns (no dashes): negative
 * inside. The piece after a vertex owns its join, as in the shader. `px` is the size of a pixel in
 * local units: joins closer than a tenth of it to round are drawn round, as the shader does.
 *
 * Path texture layout of a subpath: a header (segments, closed, length, dash scale), one
 * (ax, ay, bx, by) texel per segment, then the length before each segment, four per texel.
 */
export function pathStrokeDist(e: Float32Array, ref: PathRef, x: number, y: number, px = 0): number {
    const { hw, join } = ref;
    let best = Infinity;

    for (let w = 0; w < ref.count; w++) {
        const wt = (ref.windows + w) * 4;
        const hdr = Math.round(e[wt]);
        const s = Math.round(e[wt + 1]);
        const m = Math.round(e[wt + 2]);
        const n = Math.round(e[hdr * 4]);
        const closed = e[hdr * 4 + 1] > 0.5;
        const first = hdr + 1;
        const cumAt = (first + n) * 4;

        for (let i = s; i < s + m && i < n; i++) {
            const t = first + i;
            const ax = e[t * 4];
            const ay = e[t * 4 + 1];
            const len = Math.hypot(e[t * 4 + 2] - ax, e[t * 4 + 3] - ay);
            const [dx, dy] = dirOf(e, t);
            const hasPrev = closed || i > 0;
            const hasNext = closed || i < n - 1;
            const wx = x - ax;
            const wy = y - ay;
            const back = closed ? Infinity : e[cumAt + i] + (ref.cap0 !== Cap.Butt ? hw : 0);
            const [ux, uy] = hasPrev ? dirOf(e, first + ((i - 1 + n) % n)) : [dx, dy];
            const kind = hasPrev ? joinKind(ux, uy, dx, dy, hw, join, ref.miterLimit, px) : -1;
            const k0 = kind < 0 ? ref.cap0 : kind === 1 ? 3 : Cap.Butt;
            let d = pieceDist(wx * dx + wy * dy, dx * wy - dy * wx, len, k0, hasNext ? Cap.Butt : ref.cap1, hw, back);

            if (kind >= 2) {
                const poly = joinPolygon(ax, ay, ux, uy, dx, dy, hw, join, ref.miterLimit);

                if (poly) d = Math.min(d, polygonDist(poly, x, y));
            }
            best = Math.min(best, d);
        }
    }

    return best;
}

/** A run of segments `s .. s + count` of a subpath whose points are `sub.pts` (flat, cleaned). */
export interface StrokeWindow<S extends { pts: number[] }> {
    sub: S;
    s: number;
    count: number;
}

/** A window another instance owns, with that instance's key (its index). */
export interface NearWindow<S extends { pts: number[] }> extends StrokeWindow<S> {
    key: number;
}

function pointSegDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const abx = bx - ax;
    const aby = by - ay;
    const len2 = abx * abx + aby * aby;
    const h = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / len2)) : 0;

    return Math.hypot(px - ax - abx * h, py - ay - aby * h);
}

const cross = (ox: number, oy: number, px: number, py: number, qx: number, qy: number) =>
    (px - ox) * (qy - oy) - (py - oy) * (qx - ox);

/** Distance between segment `a` of `ca` and segment `b` of `cb` (4 floats each: ax, ay, bx, by). */
export function segSegDist(ca: number[], a: number, cb: number[], b: number): number {
    const ax = ca[a];
    const ay = ca[a + 1];
    const bx = ca[a + 2];
    const by = ca[a + 3];
    const cx = cb[b];
    const cy = cb[b + 1];
    const dx = cb[b + 2];
    const dy = cb[b + 3];

    if (
        cross(ax, ay, bx, by, cx, cy) * cross(ax, ay, bx, by, dx, dy) < 0 &&
        cross(cx, cy, dx, dy, ax, ay) * cross(cx, cy, dx, dy, bx, by) < 0
    )
        return 0;

    return Math.min(
        pointSegDist(ax, ay, cx, cy, dx, dy),
        pointSegDist(bx, by, cx, cy, dx, dy),
        pointSegDist(cx, cy, ax, ay, bx, by),
        pointSegDist(dx, dy, ax, ay, bx, by),
    );
}

/**
 * For every instance of a stroked path, given as the windows it owns, the windows of the other
 * instances whose segments come within `2 r` of its own. There their strokes, `r` wide on each
 * side, can meet. The test is symmetric, so two instances that can paint the same pixel always see each
 * other's segments and agree on which of them shades it.
 */
export function nearWindows<S extends { pts: number[] }>(owned: StrokeWindow<S>[][], r: number): NearWindow<S>[][] {
    const reach = 2 * r;
    const coords: number[][] = [];
    const refs: { sub: S; i: number }[][] = [];
    const boxes: number[][] = [];

    for (const wins of owned) {
        const c: number[] = [];
        const ref: { sub: S; i: number }[] = [];
        const box = [Infinity, Infinity, -Infinity, -Infinity];

        for (const { sub, s, count } of wins) {
            const n = sub.pts.length / 2;

            for (let i = s; i < s + count; i++) {
                const j = n === 1 ? 0 : (i + 1) % n;

                c.push(sub.pts[i * 2], sub.pts[i * 2 + 1], sub.pts[j * 2], sub.pts[j * 2 + 1]);
                ref.push({ sub, i });
            }
        }
        for (let k = 0; k < c.length; k += 2) {
            box[0] = Math.min(box[0], c[k]);
            box[1] = Math.min(box[1], c[k + 1]);
            box[2] = Math.max(box[2], c[k]);
            box[3] = Math.max(box[3], c[k + 1]);
        }
        coords.push(c);
        refs.push(ref);
        boxes.push(box);
    }
    const marks = owned.map(() => new Map<number, Set<number>>());
    const mark = (to: number, from: number, seg: number) => {
        let set = marks[to].get(from);

        if (!set) {
            set = new Set();
            marks[to].set(from, set);
        }
        set.add(seg);
    };

    for (let a = 0; a < owned.length; a++) {
        const A = boxes[a];
        const ca = coords[a];

        for (let b = a + 1; b < owned.length; b++) {
            const B = boxes[b];

            if (A[0] - reach > B[2] || B[0] - reach > A[2] || A[1] - reach > B[3] || B[1] - reach > A[3]) continue;
            const cb = coords[b];

            for (let u = 0; u < ca.length; u += 4) {
                const x0 = Math.min(ca[u], ca[u + 2]) - reach;
                const x1 = Math.max(ca[u], ca[u + 2]) + reach;
                const y0 = Math.min(ca[u + 1], ca[u + 3]) - reach;
                const y1 = Math.max(ca[u + 1], ca[u + 3]) + reach;

                if (x0 > B[2] || x1 < B[0] || y0 > B[3] || y1 < B[1]) continue;
                for (let t = 0; t < cb.length; t += 4) {
                    if (Math.max(cb[t], cb[t + 2]) < x0 || Math.min(cb[t], cb[t + 2]) > x1) continue;
                    if (Math.max(cb[t + 1], cb[t + 3]) < y0 || Math.min(cb[t + 1], cb[t + 3]) > y1) continue;
                    if (segSegDist(ca, u, cb, t) > reach) continue;
                    mark(a, b, t / 4);
                    mark(b, a, u / 4);
                }
            }
        }
    }

    // marked segments of each other instance, as runs of consecutive segments of one subpath
    return marks.map((byOwner) => {
        const out: NearWindow<S>[] = [];

        for (const [key, set] of byOwner) {
            let cur: NearWindow<S> | null = null;

            for (const idx of [...set].sort((x, y) => x - y)) {
                const { sub, i } = refs[key][idx];

                if (cur && cur.sub === sub && cur.s + cur.count === i) cur.count++;
                else {
                    cur = { sub, s: i, count: 1, key };
                    out.push(cur);
                }
            }
        }

        return out;
    });
}
