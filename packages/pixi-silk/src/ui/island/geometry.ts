import type { SilkGraphics } from '../../SilkGraphics';

/** Side of the viewport an island grows from. */
export type IslandEdge = 'left' | 'right' | 'top' | 'bottom';

/** A rectangle in the island's parent space. */
export interface IslandRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** Distances from the viewport edges: notches, rounded corners, home bars. Default 0 each. */
export interface IslandInsets {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
}

/**
 * What an island or a frame follows. An Application or a renderer updates it on `resize`. A
 * signal of a rectangle, such as `IslandFrame.inner`, updates it on change. A plain rectangle
 * stays as it is. The same shapes a SmartContainer takes.
 */
export type IslandViewport =
    | {
          renderer: {
              screen: Partial<IslandRect>;
              on(e: 'resize', fn: () => void): unknown;
              off(e: 'resize', fn: () => void): unknown;
          };
      }
    | {
          screen: Partial<IslandRect>;
          on(event: 'resize', fn: () => void): unknown;
          off(event: 'resize', fn: () => void): unknown;
      }
    | { readonly value: Partial<IslandRect>; subscribe(fn: () => void): () => void }
    | (Partial<IslandRect> & { width: number; height: number });

/** @internal Reads the current rectangle of a viewport source. */
export function readViewport(source: IslandViewport | null): IslandRect {
    if (!source) return { x: 0, y: 0, width: 0, height: 0 };
    const r: Partial<IslandRect> =
        'renderer' in source
            ? source.renderer.screen
            : 'screen' in source
              ? source.screen
              : 'value' in source
                ? source.value
                : source;

    return { x: r.x ?? 0, y: r.y ?? 0, width: r.width ?? 0, height: r.height ?? 0 };
}

/** @internal Calls `fn` when the viewport changes. Returns the unsubscribe function. */
export function followViewport(source: IslandViewport, fn: () => void): () => void {
    if ('renderer' in source) {
        source.renderer.on('resize', fn);

        return () => source.renderer.off('resize', fn);
    }
    if ('screen' in source) {
        source.on('resize', fn);

        return () => source.off('resize', fn);
    }
    if ('subscribe' in source) return source.subscribe(fn);

    return () => {};
}

/**
 * Edge space: `u` runs along the edge (down for left and right, right for top and bottom), `v`
 * points into the viewport from the edge line. Maps a point to the parent space.
 */
export function edgePoint(edge: IslandEdge, view: IslandRect, u: number, v: number): { x: number; y: number } {
    switch (edge) {
        case 'left':
            return { x: view.x + v, y: view.y + u };
        case 'right':
            return { x: view.x + view.width - v, y: view.y + u };
        case 'top':
            return { x: view.x + u, y: view.y + v };
        default:
            return { x: view.x + u, y: view.y + view.height - v };
    }
}

/** Maps the edge-space box `u0..u1` by `v0..v1` to a rectangle in the parent space. */
export function edgeRect(
    edge: IslandEdge,
    view: IslandRect,
    u0: number,
    u1: number,
    v0: number,
    v1: number,
): IslandRect {
    const a = edgePoint(edge, view, u0, v0);
    const b = edgePoint(edge, view, u1, v1);
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);

    return { x, y, width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

/** Length of the edge: the viewport height for left and right, the width for top and bottom. */
export function edgeSpan(edge: IslandEdge, view: IslandRect): number {
    return edge === 'left' || edge === 'right' ? view.height : view.width;
}

/** The inset on the edge itself, and the insets at the start and end of the edge. */
export function edgeInsets(edge: IslandEdge, insets: IslandInsets): { edge: number; start: number; end: number } {
    const t = insets.top ?? 0;
    const r = insets.right ?? 0;
    const b = insets.bottom ?? 0;
    const l = insets.left ?? 0;

    switch (edge) {
        case 'left':
            return { edge: l, start: t, end: b };
        case 'right':
            return { edge: r, start: t, end: b };
        case 'top':
            return { edge: t, start: l, end: r };
        default:
            return { edge: b, start: l, end: r };
    }
}

/** The pieces of an island outline, in the parent space. */
export interface IslandShape {
    /** Body: rounded on the far side, square where it meets the edge. `radii` is `[tl, tr, br, bl]`. */
    body: IslandRect & { radii: [number, number, number, number]; smoothing: number };
    /**
     * Concave pieces, each a square with a circle cut out: the flares where the body meets the
     * edge, or for a full-length island the rounded corners of the window left above it.
     */
    flares: { square: IslandRect; circle: { x: number; y: number; r: number } }[];
    /** The visible body, from the edge line to the far side. */
    box: IslandRect;
}

/** More of the outline of {@link islandShape}. */
export interface IslandShapeOptions {
    /** 0..1: squircle far corners. Default 0. */
    smoothing?: number;
    /**
     * How far the body reaches past the edge line, local units, so the join with a bezel shows no
     * seam. Use 0 for an island inside an object such as a card, or it shows past its edge. Default 1.
     */
    bleed?: number;
    /**
     * The island runs the whole edge: it meets the two side edges flush, and the window above it
     * gets concave corners of `radius` instead of the island getting convex ones. Default false.
     */
    full?: boolean;
}

/**
 * Outline of an island `length` long and `depth` deep, centred at `u` along the edge. The far
 * corners get `radius`, the joins with the edge get concave flares of `flare`. Both shrink when
 * the island is shallow, and the flares always meet the straight part of the sides, so the
 * outline stays smooth at every depth. A `full` island ignores `u` and `length` and spans the edge.
 * Returns null when `depth` is below a quarter unit.
 */
export function islandShape(
    edge: IslandEdge,
    view: IslandRect,
    u: number,
    length: number,
    depth: number,
    radius: number,
    flare: number,
    options: IslandShapeOptions = {},
): IslandShape | null {
    if (depth < 0.25 || length < 0.5) return null;
    const over = Math.max(0, options.bleed ?? 1);
    const flares: IslandShape['flares'] = [];

    if (options.full) {
        const span = edgeSpan(edge, view);
        // the corners of the window grow with the depth, so a hairline does not round the screen
        const rc = Math.max(0, Math.min(radius, depth, span / 2));
        const body = {
            ...edgeRect(edge, view, 0, span, -over, depth),
            radii: [0, 0, 0, 0] as [number, number, number, number],
            smoothing: 0,
        };

        if (rc >= 0.5) {
            // each square overlaps the body by one unit: one union, so no seam
            for (const [s0, s1, cu] of [
                [-over, rc, rc],
                [span - rc, span + over, span - rc],
            ] as const) {
                const c = edgePoint(edge, view, cu, depth + rc);

                flares.push({
                    square: edgeRect(edge, view, s0, s1, depth - 1, depth + rc),
                    circle: { x: c.x, y: c.y, r: rc },
                });
            }
        }

        return { body, flares, box: edgeRect(edge, view, 0, span, 0, depth) };
    }
    const half = length / 2;
    const s = Math.max(0, Math.min(1, options.smoothing ?? 0));
    // a squircle corner bends over (1 + s) times its radius
    const r = Math.max(0, Math.min(radius, half / (1 + s), (depth * 0.6) / (1 + s)));
    const f = Math.max(0, Math.min(flare, depth - r * (1 + s)));
    const a = u - half;
    const b = u + half;
    const far: Record<IslandEdge, [number, number, number, number]> = {
        left: [0, r, r, 0],
        right: [r, 0, 0, r],
        top: [0, 0, r, r],
        bottom: [r, r, 0, 0],
    };
    const body = { ...edgeRect(edge, view, a, b, -over, depth), radii: far[edge], smoothing: s };

    if (f >= 0.5) {
        // each square overlaps the body by one unit: one union, so no seam
        for (const [s0, s1, cu] of [
            [a - f, a + 1, a - f],
            [b - 1, b + f, b + f],
        ] as const) {
            const c = edgePoint(edge, view, cu, f);

            flares.push({ square: edgeRect(edge, view, s0, s1, -over, f), circle: { x: c.x, y: c.y, r: f } });
        }
    }

    return { body, flares, box: edgeRect(edge, view, a, b, 0, depth) };
}

/** Fills an island outline as one shape: one instance, exact edges, safe with a see-through fill. */
export function drawIslandShape(g: SilkGraphics, shape: IslandShape, fill: { color: number; alpha?: number }): void {
    const { body, flares } = shape;
    const drawBody = (g: SilkGraphics) =>
        g.roundRect(body.x, body.y, body.width, body.height, body.radii, body.smoothing);

    if (!flares.length) {
        drawBody(g).fill(fill);

        return;
    }
    g.boolean('union', drawBody, (g) => {
        for (const { square: s, circle: c } of flares) {
            g.boolean(
                'subtract',
                (g) => g.rect(s.x, s.y, s.width, s.height),
                (g) => g.circle(c.x, c.y, c.r),
            );
        }
    }).fill(fill);
}
