/**
 * Multi-channel signed distance fields from glyph outlines, after Chlumsky's msdfgen: edges are
 * coloured so every corner sits between two edges of different colours, each channel holds the
 * signed pseudo-distance to the nearest edge of its colour, and the shader takes the median, which
 * keeps corners sharp. Curves are flattened into short segments first. Pixels where the median
 * disagrees with the true inside test (overlapping contours, tight corners) fall back to the true
 * distance in all channels. Pure arithmetic, so the output is the same on every machine.
 */

/** A drawing command of a glyph outline, as HarfBuzz `glyphToJson` returns it (font units, y up). */
export interface PathCommand {
    /** `M`, `L`, `Q`, `C` or `Z`. */
    type: string;
    /** Coordinates. */
    values: number[];
}

/** Where the bitmap sits in the glyph's coordinates. */
export interface GlyphBox {
    /** Left of the bitmap, font units. */
    planeL: number;
    /** Bottom of the bitmap, font units. */
    planeB: number;
    /** Right, font units. */
    planeR: number;
    /** Top, font units. */
    planeT: number;
    /** Bitmap width in pixels. */
    width: number;
    /** Bitmap height in pixels. */
    height: number;
}

/** A generated glyph. */
export interface GlyphBitmap extends GlyphBox {
    /** Pixels, `channels` bytes each, rows top to bottom. */
    pixels: Uint8Array;
    /** 1 (sdf), 3 (msdf) or 4 (mtsdf). */
    channels: 1 | 3 | 4;
}

const RED = 1;
const GREEN = 2;
const BLUE = 4;
const YELLOW = RED | GREEN;
const MAGENTA = RED | BLUE;
const CYAN = GREEN | BLUE;
const WHITE = 7;

type Point = [number, number];

interface Edge {
    points: Point[];
    color: number;
}

function lerp(a: Point, b: Point, t: number): Point {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function pointAt(e: Edge, t: number): Point {
    let pts = e.points;

    while (pts.length > 1) {
        const next: Point[] = [];

        for (let i = 0; i < pts.length - 1; i++) next.push(lerp(pts[i], pts[i + 1], t));
        pts = next;
    }

    return pts[0];
}

function direction(e: Edge, end: 0 | 1): Point {
    const p = e.points;
    const n = p.length - 1;
    // the first control point that differs from the end point gives the tangent
    let d: Point = [0, 0];

    if (end === 0) {
        for (let i = 1; i <= n; i++) {
            d = [p[i][0] - p[0][0], p[i][1] - p[0][1]];
            if (d[0] || d[1]) break;
        }
    } else {
        for (let i = n - 1; i >= 0; i--) {
            d = [p[n][0] - p[i][0], p[n][1] - p[i][1]];
            if (d[0] || d[1]) break;
        }
    }
    const len = Math.hypot(d[0], d[1]) || 1;

    return [d[0] / len, d[1] / len];
}

function splitAt(pts: Point[], t: number): [Point[], Point[]] {
    const left: Point[] = [];
    const right: Point[] = [];
    let cur = pts;

    while (cur.length) {
        left.push(cur[0]);
        right.unshift(cur[cur.length - 1]);
        const next: Point[] = [];

        for (let i = 0; i < cur.length - 1; i++) next.push(lerp(cur[i], cur[i + 1], t));
        cur = next;
    }

    return [left, right];
}

/** The part of an edge between parameters `t0` and `t1`. */
function split(e: Edge, t0: number, t1: number): Edge {
    const [left] = splitAt(e.points, t1);
    const [, right] = splitAt(left, t1 > 0 ? t0 / t1 : 0);

    return { points: right, color: e.color };
}

/** Turns commands into closed contours of edges. Degenerate edges are dropped. */
export function contoursOf(commands: readonly PathCommand[]): Edge[][] {
    const contours: Edge[][] = [];
    let current: Edge[] = [];
    let pen: Point = [0, 0];
    let start: Point = [0, 0];
    const close = () => {
        if (pen[0] !== start[0] || pen[1] !== start[1]) current.push({ points: [pen, start], color: WHITE });
        if (current.length) contours.push(current);
        current = [];
        pen = start;
    };

    for (const c of commands) {
        const v = c.values;

        if (c.type === 'M') {
            if (current.length) close();
            pen = [v[0], v[1]];
            start = pen;
        } else if (c.type === 'L') {
            const p: Point = [v[0], v[1]];

            if (p[0] !== pen[0] || p[1] !== pen[1]) current.push({ points: [pen, p], color: WHITE });
            pen = p;
        } else if (c.type === 'Q') {
            const p: Point = [v[2], v[3]];

            current.push({ points: [pen, [v[0], v[1]], p], color: WHITE });
            pen = p;
        } else if (c.type === 'C') {
            const p: Point = [v[4], v[5]];

            current.push({ points: [pen, [v[0], v[1]], [v[2], v[3]], p], color: WHITE });
            pen = p;
        } else if (c.type === 'Z') {
            close();
        }
    }
    if (current.length) close();

    return contours;
}

function switchColor(color: number, banned = 0): number {
    const combined = color & banned;

    if (combined === RED || combined === GREEN || combined === BLUE) return combined ^ WHITE;
    if (color === 0 || color === WHITE) return CYAN;
    const shifted = color << 1;

    return (shifted | (shifted >> 3)) & WHITE;
}

/** Colours edges so channels disagree at corners (msdfgen's simple edge colouring, angle threshold 3 rad). */
export function colorEdges(contours: Edge[][], angleThreshold = 3): Edge[][] {
    const crossThreshold = Math.sin(angleThreshold);

    return contours.map((edges) => {
        const corners: number[] = [];

        for (let i = 0; i < edges.length; i++) {
            const a = direction(edges[(i + edges.length - 1) % edges.length], 1);
            const b = direction(edges[i], 0);
            const dot = a[0] * b[0] + a[1] * b[1];
            const cross = a[0] * b[1] - a[1] * b[0];

            if (dot <= 0 || Math.abs(cross) > crossThreshold) corners.push(i);
        }
        if (corners.length === 0) {
            for (const e of edges) e.color = WHITE;
            return edges;
        }
        if (corners.length === 1) {
            // teardrop: three colours along the contour, splitting edges when there are fewer than three
            let list = [...edges.slice(corners[0]), ...edges.slice(0, corners[0])];

            if (list.length < 3) {
                const parts: Edge[] = [];

                for (const e of list) {
                    const n = list.length === 1 ? 3 : 2;

                    for (let k = 0; k < n; k++) parts.push(split(e, k / n, (k + 1) / n));
                }
                list = parts;
            }
            const colors = [MAGENTA, WHITE, YELLOW];

            list.forEach((e, i) => {
                e.color = colors[Math.min(2, Math.floor((3 * i) / list.length))];
            });
            return list;
        }
        let spline = 0;
        let color = switchColor(WHITE);
        const initial = color;
        const m = edges.length;
        const start = corners[0];

        for (let i = 0; i < m; i++) {
            const index = (start + i) % m;

            if (spline + 1 < corners.length && corners[spline + 1] === index) {
                spline++;
                color = switchColor(color, spline === corners.length - 1 ? initial : 0);
            }
            edges[index].color = color;
        }
        return edges;
    });
}

/** Flattened segments: x0, y0, x1, y1, color, first, last (whether the segment ends its edge). */
function flatten(contours: Edge[][]): Float64Array {
    const out: number[] = [];

    for (const edges of contours) {
        for (const e of edges) {
            const n = e.points.length === 2 ? 1 : e.points.length === 3 ? 10 : 16;
            let prev = e.points[0];

            for (let k = 1; k <= n; k++) {
                const p = k === n ? e.points[e.points.length - 1] : pointAt(e, k / n);

                out.push(prev[0], prev[1], p[0], p[1], e.color, k === 1 ? 1 : 0, k === n ? 1 : 0);
                prev = p;
            }
        }
    }

    return new Float64Array(out);
}

const SEG = 7;

/** Signed area of the outline (positive: counter-clockwise in y-up coordinates). */
function signedArea(segs: Float64Array): number {
    let a = 0;

    for (let i = 0; i < segs.length; i += SEG) a += segs[i] * segs[i + 3] - segs[i + 2] * segs[i + 1];

    return a / 2;
}

/** Non-zero winding number of a point. */
function winding(segs: Float64Array, x: number, y: number): number {
    let w = 0;

    for (let i = 0; i < segs.length; i += SEG) {
        const x0 = segs[i];
        const y0 = segs[i + 1];
        const x1 = segs[i + 2];
        const y1 = segs[i + 3];

        if (y0 <= y) {
            if (y1 > y && (x1 - x0) * (y - y0) - (x - x0) * (y1 - y0) > 0) w++;
        } else if (y1 <= y && (x1 - x0) * (y - y0) - (x - x0) * (y1 - y0) < 0) w--;
    }

    return w;
}

/** Bounds of an outline in font units, or null when it has no ink. */
export function outlineBounds(commands: readonly PathCommand[]): [number, number, number, number] | null {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;

    for (const c of commands) {
        for (let i = 0; i + 1 < c.values.length; i += 2) {
            x0 = Math.min(x0, c.values[i]);
            x1 = Math.max(x1, c.values[i]);
            y0 = Math.min(y0, c.values[i + 1]);
            y1 = Math.max(y1, c.values[i + 1]);
        }
    }

    return x1 > x0 && y1 > y0 ? [x0, y0, x1, y1] : null;
}

/**
 * Generates one glyph. `scale` is atlas pixels per font unit, `range` the distance range in pixels:
 * a value of 0 or 255 is `range / 2` pixels outside or inside the edge. Returns null for a glyph
 * without ink.
 */
export function generateGlyph(
    commands: readonly PathCommand[],
    scale: number,
    range: number,
    kind: 'msdf' | 'sdf' | 'mtsdf' = 'msdf',
): GlyphBitmap | null {
    const bounds = outlineBounds(commands);

    if (!bounds) return null;
    const pad = Math.ceil(range / 2) + 1;
    const planeL = Math.floor(bounds[0] - pad / scale);
    const planeT = Math.ceil(bounds[3] + pad / scale);
    const width = Math.ceil((bounds[2] - planeL) * scale + pad);
    const height = Math.ceil((planeT - bounds[1]) * scale + pad);
    const planeR = planeL + width / scale;
    const planeB = planeT - height / scale;
    const contours = colorEdges(contoursOf(commands));
    const segs = flatten(contours);
    const orientation = signedArea(segs) >= 0 ? 1 : -1;
    const channels = kind === 'sdf' ? 1 : kind === 'mtsdf' ? 4 : 3;
    const pixels = new Uint8Array(width * height * channels);
    const encode = (d: number) => Math.max(0, Math.min(255, Math.round((0.5 + (d * scale) / range) * 255)));
    const best = new Float64Array(3);
    const bestOrtho = new Float64Array(3);
    const bestSigned = new Float64Array(3);

    for (let py = 0; py < height; py++) {
        const y = planeT - (py + 0.5) / scale;

        for (let px = 0; px < width; px++) {
            const x = planeL + (px + 0.5) / scale;

            best.fill(Infinity);
            bestOrtho.fill(0);
            bestSigned.fill(0);
            let trueMin = Infinity;

            for (let i = 0; i < segs.length; i += SEG) {
                const ax = segs[i];
                const ay = segs[i + 1];
                const dx = segs[i + 2] - ax;
                const dy = segs[i + 3] - ay;
                const len2 = dx * dx + dy * dy || 1;
                const tRaw = ((x - ax) * dx + (y - ay) * dy) / len2;
                const t = tRaw < 0 ? 0 : tRaw > 1 ? 1 : tRaw;
                const qx = ax + dx * t - x;
                const qy = ay + dy * t - y;
                const dist = Math.sqrt(qx * qx + qy * qy);
                const len = Math.sqrt(len2);
                const cross = (dx * (y - ay) - dy * (x - ax)) / len;
                const ortho = dist > 0 ? Math.abs(cross) / dist : 1;
                // pseudo-distance: past the ends of an edge, the distance to its tangent line
                let signed = (cross > 0 ? 1 : -1) * dist;

                if ((tRaw < 0 && segs[i + 5]) || (tRaw > 1 && segs[i + 6])) {
                    if (Math.abs(cross) <= dist) signed = cross;
                }
                if (dist < trueMin) trueMin = dist;
                const color = segs[i + 4];

                for (let c = 0; c < 3; c++) {
                    if (!(color & (1 << c))) continue;
                    if (dist < best[c] - 1e-9 || (Math.abs(dist - best[c]) <= 1e-9 && ortho > bestOrtho[c])) {
                        best[c] = dist;
                        bestOrtho[c] = ortho;
                        bestSigned[c] = signed;
                    }
                }
            }
            const inside = winding(segs, x, y) !== 0;
            const trueSigned = inside ? trueMin : -trueMin;
            let r = bestSigned[0] * orientation;
            let g = bestSigned[1] * orientation;
            let b = bestSigned[2] * orientation;
            const median = Math.max(Math.min(r, g), Math.min(Math.max(r, g), b));

            // where the median disagrees with the inside test, use the true distance
            if (median > 0 !== inside || !Number.isFinite(median)) {
                r = trueSigned;
                g = trueSigned;
                b = trueSigned;
            }
            const at = (py * width + px) * channels;

            if (channels === 1) {
                pixels[at] = encode(trueSigned);
            } else {
                pixels[at] = encode(r);
                pixels[at + 1] = encode(g);
                pixels[at + 2] = encode(b);
                if (channels === 4) pixels[at + 3] = encode(trueSigned);
            }
        }
    }

    return { planeL, planeB, planeR, planeT, width, height, pixels, channels };
}
