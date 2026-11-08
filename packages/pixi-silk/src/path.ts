/**
 * Editable bezier paths as plain data: an array of anchors with optional curve handles and a
 * closed flag. The helpers never change their input. Each returns a new path, so a path fits in
 * a signal, in JSON and in an undo stack as it is. `drawPath` draws one into a `SilkGraphics`
 * (or any canvas-like path builder) for fill and stroke.
 */

/** A point or an offset. */
export interface Vec {
    x: number;
    y: number;
}

/**
 * How an anchor's two handles move together.
 * - `corner`: each handle moves on its own. Without handles it is a sharp corner.
 * - `smooth`: the handles stay on one line, each keeps its own length.
 * - `mirrored`: the handles stay on one line and have the same length.
 */
export type AnchorType = 'corner' | 'smooth' | 'mirrored';

/** One point of a path. `in` and `out` are handle offsets from the anchor, not positions. */
export interface PathAnchor {
    x: number;
    y: number;
    /** Handle that shapes the segment arriving at this anchor. */
    in?: Vec;
    /** Handle that shapes the segment leaving it. */
    out?: Vec;
    type: AnchorType;
}

/** A path: anchors in order. A closed path also joins the last anchor back to the first. */
export interface BezierPath {
    anchors: PathAnchor[];
    closed: boolean;
}

/** A cubic bezier segment: start, first control point, second control point, end. */
export type Cubic = [Vec, Vec, Vec, Vec];

/** Which handle of an anchor. */
export type HandleSide = 'in' | 'out';

/** The closest point of a path to a point, as {@link nearestOnPath} finds it. */
export interface PathHitPoint {
    /** Segment index: segment `i` runs from anchor `i` to the next one. */
    segment: number;
    /** Position along the segment, 0 to 1. */
    t: number;
    x: number;
    y: number;
    distance: number;
}

/** What {@link drawPath} draws into: `SilkGraphics`, Pixi `Graphics` or a canvas 2D context. */
export interface PathSink {
    moveTo(x: number, y: number): unknown;
    lineTo(x: number, y: number): unknown;
    bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): unknown;
    closePath(): unknown;
}

const live = (v: Vec | undefined): Vec | undefined => (v && (v.x !== 0 || v.y !== 0) ? v : undefined);
const len = (v: Vec | undefined): number => (v ? Math.hypot(v.x, v.y) : 0);
const lerp = (a: Vec, b: Vec, t: number): Vec => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const copyAnchor = (a: PathAnchor): PathAnchor => {
    const out: PathAnchor = { x: a.x, y: a.y, type: a.type };

    if (a.in) out.in = { x: a.in.x, y: a.in.y };
    if (a.out) out.out = { x: a.out.x, y: a.out.y };

    return out;
};

/** A deep copy of `path`. */
export function clonePath(path: BezierPath): BezierPath {
    return { anchors: path.anchors.map(copyAnchor), closed: path.closed };
}

/** A path through `points` with straight segments and corner anchors. */
export function pathFromPoints(points: readonly Vec[], closed = false): BezierPath {
    return { anchors: points.map((p) => ({ x: p.x, y: p.y, type: 'corner' })), closed };
}

/** Number of segments: one fewer than the anchors, or as many when closed. */
export function segmentCount(path: BezierPath): number {
    const n = path.anchors.length;

    if (n < 2) return 0;

    return path.closed ? n : n - 1;
}

/** Segment `i` as a cubic, from anchor `i` to the next one. A straight segment has its controls on its ends. */
export function segmentAt(path: BezierPath, i: number): Cubic {
    const n = path.anchors.length;
    const a = path.anchors[i];
    const b = path.anchors[(i + 1) % n];
    const ao = live(a.out);
    const bi = live(b.in);

    return [
        { x: a.x, y: a.y },
        ao ? { x: a.x + ao.x, y: a.y + ao.y } : { x: a.x, y: a.y },
        bi ? { x: b.x + bi.x, y: b.y + bi.y } : { x: b.x, y: b.y },
        { x: b.x, y: b.y },
    ];
}

/** True when segment `i` has no handles: a straight line. */
export function isStraight(path: BezierPath, i: number): boolean {
    const n = path.anchors.length;

    return !live(path.anchors[i].out) && !live(path.anchors[(i + 1) % n].in);
}

/** Point at `t` (0 to 1) along a cubic. */
export function cubicPoint(c: Cubic, t: number): Vec {
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const d = 3 * u * t * t;
    const e = t * t * t;

    return {
        x: a * c[0].x + b * c[1].x + d * c[2].x + e * c[3].x,
        y: a * c[0].y + b * c[1].y + d * c[2].y + e * c[3].y,
    };
}

/** Splits a cubic at `t` with de Casteljau's construction. The two halves trace the same curve exactly. */
export function splitCubic(c: Cubic, t: number): [Cubic, Cubic] {
    const p01 = lerp(c[0], c[1], t);
    const p12 = lerp(c[1], c[2], t);
    const p23 = lerp(c[2], c[3], t);
    const p012 = lerp(p01, p12, t);
    const p123 = lerp(p12, p23, t);
    const m = lerp(p012, p123, t);

    return [
        [{ ...c[0] }, p01, p012, m],
        [{ ...m }, p123, p23, { ...c[3] }],
    ];
}

/** The closest point of a cubic to `p`. */
export function nearestOnCubic(c: Cubic, p: Vec): { t: number; x: number; y: number; distance: number } {
    const d2 = (t: number) => {
        const q = cubicPoint(c, t);

        return (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    };
    const steps = 32;
    let best = 0;
    let bestD = Infinity;

    for (let i = 0; i <= steps; i++) {
        const d = d2(i / steps);

        if (d < bestD) {
            bestD = d;
            best = i / steps;
        }
    }
    // refine around the best sample by narrowing the interval
    let lo = Math.max(0, best - 1 / steps);
    let hi = Math.min(1, best + 1 / steps);

    for (let i = 0; i < 30; i++) {
        const a = lo + (hi - lo) / 3;
        const b = hi - (hi - lo) / 3;

        if (d2(a) < d2(b)) hi = b;
        else lo = a;
    }
    const t = (lo + hi) / 2;
    const q = cubicPoint(c, t);

    return { t, x: q.x, y: q.y, distance: Math.hypot(q.x - p.x, q.y - p.y) };
}

/** The closest point of the whole path to `p`, or null for a path without segments. */
export function nearestOnPath(path: BezierPath, p: Vec): PathHitPoint | null {
    let best: PathHitPoint | null = null;

    for (let i = 0; i < segmentCount(path); i++) {
        const hit = nearestOnCubic(segmentAt(path, i), p);

        if (!best || hit.distance < best.distance) best = { segment: i, ...hit };
    }

    return best;
}

/** Tight axis-aligned bounds of the path, curves included. */
export function pathBounds(path: BezierPath): { x: number; y: number; width: number; height: number } {
    const xs: number[] = [];
    const ys: number[] = [];

    for (const a of path.anchors) {
        xs.push(a.x);
        ys.push(a.y);
    }
    for (let i = 0; i < segmentCount(path); i++) {
        const c = segmentAt(path, i);

        for (const axis of ['x', 'y'] as const) {
            // roots of the derivative: where the curve turns along this axis
            const [p0, p1, p2, p3] = c.map((q) => q[axis]);
            const a = -p0 + 3 * p1 - 3 * p2 + p3;
            const b = 2 * (p0 - 2 * p1 + p2);
            const k = p1 - p0;
            const roots: number[] = [];

            if (Math.abs(a) < 1e-12) {
                if (Math.abs(b) > 1e-12) roots.push(-k / b);
            } else {
                const disc = b * b - 4 * a * k;

                if (disc >= 0) {
                    const s = Math.sqrt(disc);

                    roots.push((-b + s) / (2 * a), (-b - s) / (2 * a));
                }
            }
            for (const t of roots) {
                if (t <= 0 || t >= 1) continue;
                const q = cubicPoint(c, t);

                xs.push(q.x);
                ys.push(q.y);
            }
        }
    }
    if (!xs.length) return { x: 0, y: 0, width: 0, height: 0 };
    const x = Math.min(...xs);
    const y = Math.min(...ys);

    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/**
 * Draws `path` into `g` with moveTo, lineTo, bezierCurveTo and closePath, then returns `g` for
 * `.fill()` and `.stroke()`. A `SilkGraphics` fills the whole path as one exact shape.
 */
export function drawPath<G extends PathSink>(g: G, path: BezierPath): G {
    const n = path.anchors.length;

    if (!n) return g;
    const first = path.anchors[0];

    g.moveTo(first.x, first.y);
    const count = segmentCount(path);

    for (let i = 0; i < count; i++) {
        const closing = path.closed && i === n - 1;

        if (isStraight(path, i)) {
            // closePath draws the last straight edge itself
            if (!closing) {
                const b = path.anchors[i + 1];

                g.lineTo(b.x, b.y);
            }
            continue;
        }
        const [, c1, c2, end] = segmentAt(path, i);

        g.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, end.x, end.y);
    }
    if (path.closed && n > 1) g.closePath();

    return g;
}

/** Maps every anchor and handle through `fn`, such as a matrix's `apply`. Exact for affine maps. */
export function mapPath(path: BezierPath, fn: (p: Vec) => Vec): BezierPath {
    return {
        closed: path.closed,
        anchors: path.anchors.map((a) => {
            const p = fn({ x: a.x, y: a.y });
            const out: PathAnchor = { x: p.x, y: p.y, type: a.type };

            for (const side of ['in', 'out'] as const) {
                const h = a[side];

                if (!h) continue;
                const q = fn({ x: a.x + h.x, y: a.y + h.y });

                out[side] = { x: q.x - p.x, y: q.y - p.y };
            }

            return out;
        }),
    };
}

/** The same path traced the other way: anchors in reverse order, in and out handles swapped. */
export function reversePath(path: BezierPath): BezierPath {
    const anchors = path.anchors
        .map((a) => {
            const out: PathAnchor = { x: a.x, y: a.y, type: a.type };

            if (a.out) out.in = { ...a.out };
            if (a.in) out.out = { ...a.in };

            return out;
        })
        .reverse();

    return { anchors, closed: path.closed };
}

// ----------------------------------------------------------------------------------- editing

/**
 * Inserts an anchor on segment `segment` at `t` without changing the shape: the segment is split
 * exactly (de Casteljau) and the neighbours' handles shrink to match. Returns the new path and
 * the new anchor's index.
 */
export function insertAnchor(path: BezierPath, segment: number, t: number): { path: BezierPath; index: number } {
    const out = clonePath(path);
    const n = out.anchors.length;
    const ia = segment;
    const ib = (segment + 1) % n;
    const index = segment + 1;

    if (isStraight(path, segment)) {
        const [p0, , , p3] = segmentAt(path, segment);
        const m = lerp(p0, p3, t);

        out.anchors.splice(index, 0, { x: m.x, y: m.y, type: 'corner' });

        return { path: out, index };
    }
    const [left, right] = splitCubic(segmentAt(path, segment), t);
    const a = out.anchors[ia];
    const b = out.anchors[ib];
    const m = left[3];
    const sub = (p: Vec, o: Vec): Vec | undefined => live({ x: p.x - o.x, y: p.y - o.y });

    a.out = sub(left[1], a);
    b.in = sub(right[2], b);
    // the split scales the outer handles: they are no longer the same length as their twins
    if (a.type === 'mirrored') a.type = 'smooth';
    if (b.type === 'mirrored') b.type = 'smooth';
    const mid: PathAnchor = { x: m.x, y: m.y, type: 'smooth' };
    const hin = sub(left[2], m);
    const hout = sub(right[1], m);

    if (hin) mid.in = hin;
    if (hout) mid.out = hout;
    if (!hin || !hout) mid.type = 'corner';
    if (!a.out) delete a.out;
    if (!b.in) delete b.in;
    out.anchors.splice(index, 0, mid);

    return { path: out, index };
}

/** Removes the anchors at `indices`. A closed path left with fewer than two anchors opens. */
export function removeAnchors(path: BezierPath, indices: readonly number[]): BezierPath {
    const drop = new Set(indices);
    const anchors = path.anchors.filter((_, i) => !drop.has(i)).map(copyAnchor);

    return { anchors, closed: path.closed && anchors.length > 1 };
}

/** Moves the anchors at `indices` by (dx, dy). Their handles move with them. */
export function moveAnchors(path: BezierPath, indices: readonly number[], dx: number, dy: number): BezierPath {
    const out = clonePath(path);

    for (const i of new Set(indices)) {
        const a = out.anchors[i];

        if (!a) continue;
        a.x += dx;
        a.y += dy;
    }

    return out;
}

/**
 * Sets one handle of anchor `index` (an offset from the anchor, or null to remove it). The other
 * handle follows the anchor's type: a `mirrored` twin turns opposite with the same length, a
 * `smooth` one turns opposite and keeps its length. With `breakSymmetry` the anchor becomes a
 * `corner` and the twin stays where it is.
 */
export function setHandle(
    path: BezierPath,
    index: number,
    side: HandleSide,
    offset: Vec | null,
    breakSymmetry = false,
): BezierPath {
    const out = clonePath(path);
    const a = out.anchors[index];

    if (!a) return out;
    const twin: HandleSide = side === 'in' ? 'out' : 'in';
    const h = offset ? live({ x: offset.x, y: offset.y }) : undefined;

    if (h) a[side] = h;
    else delete a[side];
    if (breakSymmetry) {
        a.type = 'corner';

        return out;
    }
    if (!h || a.type === 'corner') return out;
    const l = len(h);

    if (a.type === 'mirrored') a[twin] = { x: -h.x || 0, y: -h.y || 0 };
    else {
        const keep = len(a[twin]);

        if (keep > 0) a[twin] = { x: (-h.x / l) * keep, y: (-h.y / l) * keep };
    }

    return out;
}

/** The type an anchor's handles imply: `mirrored`, `smooth` or `corner`. */
export function inferAnchorType(anchor: Pick<PathAnchor, 'in' | 'out'>, tolerance = 1e-3): AnchorType {
    const i = live(anchor.in);
    const o = live(anchor.out);

    if (!i || !o) return 'corner';
    const li = len(i);
    const lo = len(o);
    // opposite directions: the cross product is zero and the dot product negative
    const cross = (i.x * o.y - i.y * o.x) / (li * lo);
    const dot = (i.x * o.x + i.y * o.y) / (li * lo);

    if (Math.abs(cross) > tolerance || dot > 0) return 'corner';

    return Math.abs(li - lo) <= tolerance * Math.max(li, lo) ? 'mirrored' : 'smooth';
}

/**
 * Changes anchor `index` to `type`. To `corner` the handles are kept as they are (pass
 * `straighten` to drop them). To `smooth` or `mirrored` they line up, and an anchor without
 * handles gets them from its neighbours.
 */
export function setAnchorType(path: BezierPath, index: number, type: AnchorType, straighten = false): BezierPath {
    const out = clonePath(path);
    const a = out.anchors[index];

    if (!a) return out;
    a.type = type;
    if (type === 'corner') {
        if (straighten) {
            delete a.in;
            delete a.out;
        }

        return out;
    }
    const n = out.anchors.length;
    const prev = index > 0 || out.closed ? out.anchors[(index - 1 + n) % n] : null;
    const next = index < n - 1 || out.closed ? out.anchors[(index + 1) % n] : null;
    let dir: Vec;

    if (live(a.out) || live(a.in)) {
        // line the handles up along their mean direction
        const o = live(a.out) ?? { x: 0, y: 0 };
        const i = live(a.in) ?? { x: 0, y: 0 };

        dir = { x: o.x - i.x, y: o.y - i.y };
    } else {
        const p = prev ?? a;
        const q = next ?? a;

        dir = { x: q.x - p.x, y: q.y - p.y };
    }
    const l = Math.hypot(dir.x, dir.y);

    if (l < 1e-9) return out;
    const ux = dir.x / l;
    const uy = dir.y / l;
    const reach = (other: PathAnchor | null) => (other ? Math.hypot(other.x - a.x, other.y - a.y) / 3 : 0);
    let lin = len(live(a.in)) || reach(prev);
    let lout = len(live(a.out)) || reach(next);

    if (type === 'mirrored') lin = lout = (lin + lout) / 2;
    if (lin > 0) a.in = { x: -ux * lin, y: -uy * lin };
    if (lout > 0) a.out = { x: ux * lout, y: uy * lout };

    return out;
}

/** Switches anchor `index` between a sharp corner (handles removed) and a smooth curve. */
export function toggleAnchorType(path: BezierPath, index: number): BezierPath {
    const a = path.anchors[index];

    if (!a) return clonePath(path);
    const sharp = a.type === 'corner';

    return setAnchorType(path, index, sharp ? 'smooth' : 'corner', !sharp);
}

/** Indices of the anchors inside a rectangle, for marquee selection. */
export function anchorsInRect(
    path: BezierPath,
    rect: { x: number; y: number; width: number; height: number },
): number[] {
    const x0 = Math.min(rect.x, rect.x + rect.width);
    const x1 = Math.max(rect.x, rect.x + rect.width);
    const y0 = Math.min(rect.y, rect.y + rect.height);
    const y1 = Math.max(rect.y, rect.y + rect.height);
    const out: number[] = [];

    path.anchors.forEach((a, i) => {
        if (a.x >= x0 && a.x <= x1 && a.y >= y0 && a.y <= y1) out.push(i);
    });

    return out;
}

// ------------------------------------------------------------------------------------------ SVG

const fmt = (v: number, precision: number) => {
    const s = v.toFixed(precision);

    return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
};

/** The path as SVG path data (`M`, `L`, `C`, `Z`), rounded to `precision` decimals. */
export function pathToSvg(path: BezierPath, precision = 2): string {
    const n = path.anchors.length;

    if (!n) return '';
    const f = (v: number) => fmt(v, precision);
    const a0 = path.anchors[0];
    const parts = [`M${f(a0.x)} ${f(a0.y)}`];

    for (let i = 0; i < segmentCount(path); i++) {
        const closing = path.closed && i === n - 1;
        const [, c1, c2, end] = segmentAt(path, i);

        if (isStraight(path, i)) {
            if (!closing) parts.push(`L${f(end.x)} ${f(end.y)}`);
        } else parts.push(`C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(end.x)} ${f(end.y)}`);
    }
    if (path.closed) parts.push('Z');

    return parts.join(' ');
}

/** Cubic control points that trace an SVG elliptical arc. */
function arcToCubics(
    x1: number,
    y1: number,
    rx: number,
    ry: number,
    angle: number,
    large: boolean,
    sweep: boolean,
    x2: number,
    y2: number,
): [Vec, Vec, Vec][] {
    if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2))
        return [
            [
                { x: x1, y: y1 },
                { x: x2, y: y2 },
                { x: x2, y: y2 },
            ],
        ];
    const phi = (angle * Math.PI) / 180;
    const cos = Math.cos(phi);
    const sin = Math.sin(phi);
    const dx = (x1 - x2) / 2;
    const dy = (y1 - y2) / 2;
    const xp = cos * dx + sin * dy;
    const yp = -sin * dx + cos * dy;

    rx = Math.abs(rx);
    ry = Math.abs(ry);
    const lambda = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);

    if (lambda > 1) {
        rx *= Math.sqrt(lambda);
        ry *= Math.sqrt(lambda);
    }
    const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
    const den = rx * rx * yp * yp + ry * ry * xp * xp;
    const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
    const cxp = (coef * rx * yp) / ry;
    const cyp = (-coef * ry * xp) / rx;
    const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
    const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
    const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
    let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);

    if (!sweep && dt > 0) dt -= 2 * Math.PI;
    if (sweep && dt < 0) dt += 2 * Math.PI;
    const parts = Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9);
    const step = dt / parts;
    const k = (4 / 3) * Math.tan(step / 4);
    const at = (t: number, d: number): Vec => {
        // point (d = 0) or tangent (d = 1) of the ellipse at parameter t
        const ex = d ? -rx * Math.sin(t) : rx * Math.cos(t);
        const ey = d ? ry * Math.cos(t) : ry * Math.sin(t);

        return d
            ? { x: cos * ex - sin * ey, y: sin * ex + cos * ey }
            : { x: cx + cos * ex - sin * ey, y: cy + sin * ex + cos * ey };
    };
    const out: [Vec, Vec, Vec][] = [];

    for (let i = 0; i < parts; i++) {
        const a = t1 + i * step;
        const b = a + step;
        const pa = at(a, 0);
        const pb = at(b, 0);
        const ta = at(a, 1);
        const tb = at(b, 1);

        out.push([
            { x: pa.x + k * ta.x, y: pa.y + k * ta.y },
            { x: pb.x - k * tb.x, y: pb.y - k * tb.y },
            i === parts - 1 ? { x: x2, y: y2 } : pb,
        ]);
    }

    return out;
}

/**
 * Reads SVG path data into paths, one per subpath. Every command works, absolute and relative:
 * quadratics and arcs become cubics. Anchor types come from the handles.
 */
export function parseSvgPath(d: string): BezierPath[] {
    const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
    const paths: BezierPath[] = [];
    let cur: BezierPath | null = null;
    let x = 0;
    let y = 0;
    let sx = 0;
    let sy = 0;
    let cmd = '';
    let lastCubic: Vec | null = null;
    let lastQuad: Vec | null = null;
    let i = 0;
    const num = () => Number(tokens[i++]);
    const more = () => i < tokens.length && !/[a-zA-Z]/.test(tokens[i]);
    const start = (px: number, py: number) => {
        cur = { anchors: [{ x: px, y: py, type: 'corner' }], closed: false };
        paths.push(cur);
    };
    const cubic = (c1: Vec, c2: Vec, end: Vec) => {
        if (!cur) start(x, y);
        const path = cur as unknown as BezierPath;
        const prev = path.anchors[path.anchors.length - 1];
        const o = live({ x: c1.x - prev.x, y: c1.y - prev.y });

        if (o) prev.out = o;
        const anchor: PathAnchor = { x: end.x, y: end.y, type: 'corner' };
        const h = live({ x: c2.x - end.x, y: c2.y - end.y });

        if (h) anchor.in = h;
        path.anchors.push(anchor);
        x = end.x;
        y = end.y;
    };
    const line = (px: number, py: number) => {
        if (!cur) start(x, y);
        (cur as unknown as BezierPath).anchors.push({ x: px, y: py, type: 'corner' });
        x = px;
        y = py;
    };

    while (i < tokens.length) {
        if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
        else if (!cmd) {
            i++;
            continue;
        }
        const rel = cmd === cmd.toLowerCase();
        const ox = rel ? x : 0;
        const oy = rel ? y : 0;
        const C = cmd.toUpperCase();
        let cubicCtl: Vec | null = null;
        let quadCtl: Vec | null = null;

        if (C === 'Z') {
            const path = cur as BezierPath | null;

            if (path) {
                const first = path.anchors[0];
                const last = path.anchors[path.anchors.length - 1];

                // a final anchor on top of the first one is the same point: fold it in
                if (path.anchors.length > 1 && Math.hypot(last.x - first.x, last.y - first.y) < 1e-9) {
                    if (last.in) first.in = last.in;
                    path.anchors.pop();
                }
                path.closed = true;
                x = sx;
                y = sy;
            }
            cur = null;
            lastCubic = lastQuad = null;
            continue;
        }
        // a command without numbers: the next token is another command (or the end)
        if (!more()) continue;
        if (C === 'M') {
            x = num() + ox;
            y = num() + oy;
            sx = x;
            sy = y;
            start(x, y);
            // extra pairs after M are lines
            cmd = rel ? 'l' : 'L';
        } else if (C === 'L') line(num() + ox, num() + oy);
        else if (C === 'H') line(num() + ox, y);
        else if (C === 'V') line(x, num() + oy);
        else if (C === 'C') {
            const c1 = { x: num() + ox, y: num() + oy };
            const c2 = { x: num() + ox, y: num() + oy };

            cubic(c1, c2, { x: num() + ox, y: num() + oy });
            cubicCtl = c2;
        } else if (C === 'S') {
            const c1 = lastCubic ? { x: 2 * x - lastCubic.x, y: 2 * y - lastCubic.y } : { x, y };
            const c2 = { x: num() + ox, y: num() + oy };

            cubic(c1, c2, { x: num() + ox, y: num() + oy });
            cubicCtl = c2;
        } else if (C === 'Q' || C === 'T') {
            const q: Vec =
                C === 'Q'
                    ? { x: num() + ox, y: num() + oy }
                    : lastQuad
                      ? { x: 2 * x - lastQuad.x, y: 2 * y - lastQuad.y }
                      : { x, y };
            const end = { x: num() + ox, y: num() + oy };

            // a quadratic is a cubic with its controls two thirds of the way to the quadratic one
            cubic(lerp({ x, y }, q, 2 / 3), lerp(end, q, 2 / 3), end);
            quadCtl = q;
        } else if (C === 'A') {
            const rx = num();
            const ry = num();
            const rot = num();
            const large = num() !== 0;
            const sweep = num() !== 0;
            const ex = num() + ox;
            const ey = num() + oy;

            for (const [c1, c2, end] of arcToCubics(x, y, rx, ry, rot, large, sweep, ex, ey)) cubic(c1, c2, end);
        } else i++;
        lastCubic = cubicCtl;
        lastQuad = quadCtl;
    }
    for (const p of paths)
        for (const a of p.anchors) {
            a.type = inferAnchorType(a);
            if (!a.in) delete a.in;
            if (!a.out) delete a.out;
        }

    return paths;
}
