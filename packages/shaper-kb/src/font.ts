/** A point of a flattened outline, in font units, y up. */
export interface OutlinePoint {
    x: number;
    y: number;
}

/** One closed contour as a polyline: quadratic curves are flattened. */
export type Contour = OutlinePoint[];

/** The tables of a TrueType font a run sprite needs. */
export interface FontTables {
    /** Units per em (`head`). */
    unitsPerEm: number;
    /** Number of glyphs (`maxp`). */
    numGlyphs: number;
    /** Ascender in font units (`hhea`). */
    ascender: number;
    /** Descender in font units, negative (`hhea`). */
    descender: number;
    /** The outline of a glyph, as flattened contours. Empty for a space or a missing glyph. */
    outline(glyph: number): Contour[];
}

/** Line segments per quadratic curve. Enough for text up to a few hundred pixels. */
const CURVE_STEPS = 6;

/**
 * Reads the outlines of a TrueType (`glyf`) font. CFF fonts (`.otf` with a `CFF ` table) have no
 * `glyf` table and throw, as do font collections.
 */
export function readFont(bytes: Uint8Array): FontTables {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const tables = new Map<string, number>();
    const count = view.getUint16(4);

    for (let i = 0; i < count; i++) {
        const at = 12 + i * 16;
        const tag = String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);

        tables.set(tag, view.getUint32(at + 8));
    }
    const head = tables.get('head');
    const maxp = tables.get('maxp');
    const hhea = tables.get('hhea');
    const loca = tables.get('loca');
    const glyf = tables.get('glyf');

    if (head === undefined || maxp === undefined || hhea === undefined) {
        throw new Error('@pixi-silk/shaper-kb: not a TrueType or OpenType font');
    }
    if (loca === undefined || glyf === undefined) {
        throw new Error('@pixi-silk/shaper-kb: the font has no glyf outlines (a CFF font?). Use a TrueType font');
    }
    const unitsPerEm = view.getUint16(head + 18);
    const longLoca = view.getInt16(head + 50) === 1;
    const numGlyphs = view.getUint16(maxp + 4);
    const offset = (g: number) => (longLoca ? view.getUint32(loca + g * 4) : view.getUint16(loca + g * 2) * 2);
    const cache = new Map<number, Contour[]>();

    const outline = (glyph: number, depth = 0): Contour[] => {
        if (glyph < 0 || glyph >= numGlyphs || depth > 8) return [];
        const hit = cache.get(glyph);

        if (hit) return hit;
        const start = offset(glyph);
        const end = offset(glyph + 1);
        const contours = end > start ? readGlyph(view, glyf + start, (g) => outline(g, depth + 1)) : [];

        cache.set(glyph, contours);
        return contours;
    };

    return {
        unitsPerEm,
        numGlyphs,
        ascender: view.getInt16(hhea + 4),
        descender: view.getInt16(hhea + 6),
        outline: (glyph) => outline(glyph),
    };
}

function readGlyph(view: DataView, at: number, component: (glyph: number) => Contour[]): Contour[] {
    const contours = view.getInt16(at);

    return contours >= 0 ? readSimple(view, at, contours) : readComposite(view, at + 10, component);
}

function readSimple(view: DataView, at: number, contours: number): Contour[] {
    const ends: number[] = [];
    let p = at + 10;

    for (let i = 0; i < contours; i++, p += 2) ends.push(view.getUint16(p));
    const points = contours ? ends[contours - 1] + 1 : 0;

    p += 2 + view.getUint16(p);
    const flags = new Uint8Array(points);

    for (let i = 0; i < points; ) {
        const f = view.getUint8(p++);
        let repeat = f & 8 ? view.getUint8(p++) : 0;

        flags[i++] = f;
        while (repeat-- > 0 && i < points) flags[i++] = f;
    }
    const xs = new Float64Array(points);
    const ys = new Float64Array(points);

    for (const [values, short, same] of [
        [xs, 2, 16],
        [ys, 4, 32],
    ] as const) {
        let v = 0;

        for (let i = 0; i < points; i++) {
            const f = flags[i];

            if (f & short) v += f & same ? view.getUint8(p++) : -view.getUint8(p++);
            else if (!(f & same)) {
                v += view.getInt16(p);
                p += 2;
            }
            values[i] = v;
        }
    }
    const out: Contour[] = [];
    let first = 0;

    for (const last of ends) {
        out.push(flatten(xs, ys, flags, first, last));
        first = last + 1;
    }

    return out;
}

/** On-curve and off-curve points to a polyline, with the implied on-curve midpoints. */
function flatten(xs: Float64Array, ys: Float64Array, flags: Uint8Array, first: number, last: number): Contour {
    const n = last - first + 1;
    const pts: { x: number; y: number; on: boolean }[] = [];

    for (let i = 0; i < n; i++) {
        const a = first + i;
        const b = first + ((i + 1) % n);
        const on = (flags[a] & 1) === 1;

        pts.push({ x: xs[a], y: ys[a], on });
        // two off-curve points in a row imply an on-curve point between them
        if (!on && (flags[b] & 1) === 0) pts.push({ x: (xs[a] + xs[b]) / 2, y: (ys[a] + ys[b]) / 2, on: true });
    }
    const m = pts.length;
    const s = pts.findIndex((q) => q.on);

    if (m < 2 || s < 0) return [];
    const at = (i: number) => pts[(s + i) % m];
    let prev = at(0);
    const out: Contour = [{ x: prev.x, y: prev.y }];

    for (let i = 1; i <= m; ) {
        const cur = at(i);

        if (cur.on) {
            out.push({ x: cur.x, y: cur.y });
            prev = cur;
            i++;
            continue;
        }
        const end = at(i + 1);

        for (let t = 1; t <= CURVE_STEPS; t++) {
            const u = t / CURVE_STEPS;
            const a = (1 - u) * (1 - u);
            const b = 2 * u * (1 - u);
            const c = u * u;

            out.push({ x: a * prev.x + b * cur.x + c * end.x, y: a * prev.y + b * cur.y + c * end.y });
        }
        prev = end;
        i += 2;
    }

    return out;
}

function readComposite(view: DataView, at: number, component: (glyph: number) => Contour[]): Contour[] {
    const out: Contour[] = [];
    let p = at;
    let more = true;

    while (more) {
        const flags = view.getUint16(p);
        const glyph = view.getUint16(p + 2);

        p += 4;
        let dx = 0;
        let dy = 0;

        if (flags & 1) {
            dx = view.getInt16(p);
            dy = view.getInt16(p + 2);
            p += 4;
        } else {
            dx = view.getInt8(p);
            dy = view.getInt8(p + 1);
            p += 2;
        }
        // point matching (ARGS_ARE_XY_VALUES unset) is rare in modern fonts: placed at 0, 0
        if (!(flags & 2)) {
            dx = 0;
            dy = 0;
        }
        let a = 1;
        let b = 0;
        let c = 0;
        let d = 1;
        const f2 = (o: number) => view.getInt16(o) / 16384;

        if (flags & 8) {
            a = d = f2(p);
            p += 2;
        } else if (flags & 0x40) {
            a = f2(p);
            d = f2(p + 2);
            p += 4;
        } else if (flags & 0x80) {
            a = f2(p);
            b = f2(p + 2);
            c = f2(p + 4);
            d = f2(p + 6);
            p += 8;
        }
        for (const contour of component(glyph)) {
            out.push(contour.map((q) => ({ x: a * q.x + c * q.y + dx, y: b * q.x + d * q.y + dy })));
        }
        more = (flags & 0x20) !== 0;
    }

    return out;
}
