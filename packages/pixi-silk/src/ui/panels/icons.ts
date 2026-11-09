import type { SilkGraphics } from '../../SilkGraphics';

/**
 * A disclosure chevron pointing right, rotated by `turn` quarter turns (0 right, 1 down).
 * Centred on (x, y) in a `size` box. It adds to `g` and does not clear it.
 */
export function drawChevron(
    g: SilkGraphics,
    x: number,
    y: number,
    size: number,
    color: number,
    alpha: number,
    turn = 0,
): void {
    const a = (turn * Math.PI) / 2;
    const s = size * 0.22;
    const pt = (px: number, py: number): [number, number] => [
        x + px * Math.cos(a) - py * Math.sin(a),
        y + px * Math.sin(a) + py * Math.cos(a),
    ];
    const [x0, y0] = pt(-s * 0.55, -s);
    const [x1, y1] = pt(s * 0.55, 0);
    const [x2, y2] = pt(-s * 0.55, s);

    g.moveTo(x0, y0).lineTo(x1, y1).lineTo(x2, y2).stroke({ width: 1.4, color, alpha, cap: 'round', join: 'round' });
}

/**
 * An open eye, or a closed one with a slash when `open` is false.
 * Centred on (x, y) in a `size` box. It adds to `g` and does not clear it.
 */
export function drawEye(
    g: SilkGraphics,
    x: number,
    y: number,
    size: number,
    color: number,
    alpha: number,
    open = true,
): void {
    const w = size * 0.42;
    const h = size * 0.26;

    g.moveTo(x - w, y)
        .quadraticCurveTo(x, y - h * 1.6, x + w, y)
        .quadraticCurveTo(x, y + h * 1.6, x - w, y)
        .closePath()
        .stroke({ width: 1.2, color, alpha, join: 'round' });
    if (open) g.circle(x, y, size * 0.11).fill({ color, alpha });
    else g.line(x - w * 0.8, y + h * 1.3, x + w * 0.8, y - h * 1.3).stroke({ width: 1.3, color, alpha, cap: 'round' });
}

/** A padlock, shut or open. Centred on (x, y) in a `size` box. It adds to `g` and does not clear it. */
export function drawLock(
    g: SilkGraphics,
    x: number,
    y: number,
    size: number,
    color: number,
    alpha: number,
    locked = true,
): void {
    const bw = size * 0.5;
    const bh = size * 0.36;
    const top = y - size * 0.02;
    const r = size * 0.15;
    const sx = locked ? x : x + size * 0.12;

    g.roundRect(x - bw / 2, top, bw, bh, 1.6).fill({ color, alpha });
    g.moveTo(sx - r, top)
        .lineTo(sx - r, top - r * 0.6)
        .arc(sx, top - r * 0.6, r, Math.PI, 0)
        .lineTo(sx + r, locked ? top : top - r * 0.4)
        .stroke({ width: 1.2, color, alpha, cap: 'round' });
}

/**
 * Two chain links: the aspect lock of a size field.
 * Centred on (x, y) in a `size` box. It adds to `g` and does not clear it.
 */
export function drawLink(
    g: SilkGraphics,
    x: number,
    y: number,
    size: number,
    color: number,
    alpha: number,
    linked = true,
): void {
    const w = size * 0.3;
    const h = size * 0.2;
    const gap = linked ? 0 : size * 0.08;

    g.roundRect(x - w - size * 0.1 - gap, y - h / 2, w + size * 0.1, h, h / 2).stroke({ width: 1.2, color, alpha });
    g.roundRect(x + gap, y - h / 2, w + size * 0.1, h, h / 2).stroke({ width: 1.2, color, alpha });
    if (linked) g.line(x - size * 0.12, y, x + size * 0.12, y).stroke({ width: 1.2, color, alpha, cap: 'round' });
}

/** What a layer is, for the icon in its row. */
export type LayerKind = 'frame' | 'group' | 'shape' | 'text' | 'image' | 'component';

/** Draws the built-in icon of a layer kind. Centred on (x, y) in a `size` box. It adds to `g` and does not clear it. */
export function drawLayerIcon(
    g: SilkGraphics,
    kind: LayerKind,
    x: number,
    y: number,
    size: number,
    color: number,
    alpha: number,
): void {
    const s = size * 0.36;
    const line = { width: 1.2, color, alpha };

    if (kind === 'frame') {
        g.line(x - s * 0.5, y - s, x - s * 0.5, y + s).stroke(line);
        g.line(x + s * 0.5, y - s, x + s * 0.5, y + s).stroke(line);
        g.line(x - s, y - s * 0.5, x + s, y - s * 0.5).stroke(line);
        g.line(x - s, y + s * 0.5, x + s, y + s * 0.5).stroke(line);
    } else if (kind === 'group') {
        g.roundRect(x - s, y - s * 0.8, s * 2, s * 1.6, 2).stroke({ ...line, alpha: alpha * 0.9 });
        g.roundRect(x - s * 0.45, y - s * 0.3, s * 0.9, s * 0.6, 1).fill({ color, alpha: alpha * 0.6 });
    } else if (kind === 'text') {
        g.line(x - s * 0.8, y - s * 0.8, x + s * 0.8, y - s * 0.8).stroke({ ...line, width: 1.4 });
        g.line(x, y - s * 0.8, x, y + s * 0.9).stroke({ ...line, width: 1.4, cap: 'round' });
    } else if (kind === 'image') {
        g.roundRect(x - s, y - s * 0.8, s * 2, s * 1.6, 2).stroke(line);
        g.moveTo(x - s * 0.7, y + s * 0.5)
            .lineTo(x - s * 0.15, y - s * 0.1)
            .lineTo(x + s * 0.2, y + s * 0.25)
            .lineTo(x + s * 0.7, y - s * 0.3)
            .stroke({ ...line, join: 'round', cap: 'round' });
    } else if (kind === 'component') {
        g.regularPoly(x, y, s * 1.05, 4, 0, 1.5).stroke(line);
        g.regularPoly(x, y, s * 0.4, 4, 0, 0.8).fill({ color, alpha });
    } else {
        g.roundRect(x - s * 0.9, y - s * 0.9, s * 1.8, s * 1.8, s * 0.5, 0.6).stroke(line);
    }
}
