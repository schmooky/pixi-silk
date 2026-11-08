import type { PointData } from 'pixi.js';

/** Points as a flat `[x0, y0, x1, y1, ...]` array, a typed array, or an array of `{ x, y }` objects. */
export type PointsInput = number[] | Float32Array | Float64Array | PointData[];

/** Copies any {@link PointsInput} into a new flat `[x0, y0, x1, y1, ...]` array. */
export function toFlat(points: PointsInput): number[] {
    if (points.length === 0) return [];
    if (typeof points[0] === 'number') return Array.from(points as ArrayLike<number>);
    const out: number[] = [];

    for (const p of points as PointData[]) out.push(p.x, p.y);

    return out;
}

/**
 * Monotone cubic interpolation in x (Steffen's method, same family as d3's monotoneX).
 * Never overshoots the data: peaks stay at the data points, flat runs stay flat.
 * `step` is the target spacing of the output samples in local units, at most 64 per segment.
 * Points must be sorted by x. Fewer than 3 points come back as a copy.
 */
export function monotoneX(flat: number[], step = 2): number[] {
    const n = flat.length / 2;

    if (n < 3) return flat.slice();
    const x = (i: number) => flat[i * 2];
    const y = (i: number) => flat[i * 2 + 1];
    const tangents = new Array<number>(n).fill(0);
    const slope = (i: number) => {
        const h = x(i + 1) - x(i);

        return h !== 0 ? (y(i + 1) - y(i)) / h : 0;
    };

    for (let i = 1; i < n - 1; i++) {
        const h0 = x(i) - x(i - 1);
        const h1 = x(i + 1) - x(i);
        const s0 = slope(i - 1);
        const s1 = slope(i);
        const p = (s0 * h1 + s1 * h0) / (h0 + h1 || 1);

        tangents[i] = (Math.sign(s0) + Math.sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
    }
    // one-sided end tangents (d3 style)
    const endTangent = (h: number, s: number, t: number) => (h ? (3 * s - t) / 2 : t);

    tangents[0] = endTangent(x(1) - x(0), slope(0), tangents[1]);
    tangents[n - 1] = endTangent(x(n - 1) - x(n - 2), slope(n - 2), tangents[n - 2]);

    const out: number[] = [x(0), y(0)];

    for (let i = 0; i < n - 1; i++) {
        const h = x(i + 1) - x(i);
        const count = Math.max(1, Math.min(64, Math.ceil(Math.hypot(h, y(i + 1) - y(i)) / step)));

        for (let k = 1; k <= count; k++) {
            const s = k / count;
            const s2 = s * s;
            const s3 = s2 * s;
            const yy =
                (2 * s3 - 3 * s2 + 1) * y(i) +
                (s3 - 2 * s2 + s) * h * tangents[i] +
                (-2 * s3 + 3 * s2) * y(i + 1) +
                (s3 - s2) * h * tangents[i + 1];

            out.push(x(i) + h * s, yy);
        }
    }

    return out;
}

/**
 * Samples a centripetal Catmull-Rom spline through flat points. It has no cusps or self-loops
 * within a segment. `closed` adds the segment back to the first point. `step` is the target sample
 * spacing in local units, at most 64 per segment. `alpha` 0.5 is centripetal (0 uniform, 1
 * chordal). Fewer than 3 points come back as a copy.
 */
export function catmullRom(flat: number[], closed = false, step = 2, alpha = 0.5): number[] {
    const n = flat.length / 2;

    if (n < 3) return flat.slice();
    const px = (i: number) => flat[(((i % n) + n) % n) * 2];
    const py = (i: number) => flat[(((i % n) + n) % n) * 2 + 1];
    const get = (i: number): [number, number] => {
        if (!closed) {
            if (i < 0) return [2 * px(0) - px(1), 2 * py(0) - py(1)];
            if (i > n - 1) return [2 * px(n - 1) - px(n - 2), 2 * py(n - 1) - py(n - 2)];
        }

        return [px(i), py(i)];
    };
    const out: number[] = [];
    const segs = closed ? n : n - 1;

    out.push(px(0), py(0));

    for (let i = 0; i < segs; i++) {
        const p0 = get(i - 1);
        const p1 = get(i);
        const p2 = get(i + 1);
        const p3 = get(i + 2);
        const knot = (a: [number, number], b: [number, number]) =>
            Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]) ** alpha, 1e-6);
        const t1 = knot(p0, p1);
        const t2 = t1 + knot(p1, p2);
        const t3 = t2 + knot(p2, p3);
        const count = Math.max(1, Math.min(64, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step)));

        for (let k = 1; k <= count; k++) {
            const t = t1 + (t2 - t1) * (k / count);
            const lerp = (a: [number, number], b: [number, number], ta: number, tb: number): [number, number] => {
                const w = (t - ta) / (tb - ta);

                return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];
            };
            const a1 = lerp(p0, p1, 0, t1);
            const a2 = lerp(p1, p2, t1, t2);
            const a3 = lerp(p2, p3, t2, t3);
            const b1 = lerp(a1, a2, 0, t2);
            const b2 = lerp(a2, a3, t1, t3);
            const c = lerp(b1, b2, t1, t2);

            out.push(c[0], c[1]);
        }
    }
    if (closed) out.splice(out.length - 2, 2);

    return out;
}

/** Appends a cubic Bezier to `out` as 2 to 256 points, about one per `step` units of its control polygon. The start point is not added. */
export function flattenCubic(
    out: number[],
    x0: number,
    y0: number,
    c1x: number,
    c1y: number,
    c2x: number,
    c2y: number,
    x1: number,
    y1: number,
    step = 2,
): void {
    const len = Math.hypot(c1x - x0, c1y - y0) + Math.hypot(c2x - c1x, c2y - c1y) + Math.hypot(x1 - c2x, y1 - c2y);
    const count = Math.max(2, Math.min(256, Math.ceil(len / step)));

    for (let k = 1; k <= count; k++) {
        const t = k / count;
        const mt = 1 - t;
        const a = mt * mt * mt;
        const b = 3 * mt * mt * t;
        const c = 3 * mt * t * t;
        const d = t * t * t;

        out.push(a * x0 + b * c1x + c * c2x + d * x1, a * y0 + b * c1y + c * c2y + d * y1);
    }
}

/** Appends a quadratic Bezier to `out` as 2 to 256 points, about one per `step` units of its control polygon. The start point is not added. */
export function flattenQuadratic(
    out: number[],
    x0: number,
    y0: number,
    cx: number,
    cy: number,
    x1: number,
    y1: number,
    step = 2,
): void {
    const len = Math.hypot(cx - x0, cy - y0) + Math.hypot(x1 - cx, y1 - cy);
    const count = Math.max(2, Math.min(256, Math.ceil(len / step)));

    for (let k = 1; k <= count; k++) {
        const t = k / count;
        const mt = 1 - t;

        out.push(mt * mt * x0 + 2 * mt * t * cx + t * t * x1, mt * mt * y0 + 2 * mt * t * cy + t * t * y1);
    }
}
