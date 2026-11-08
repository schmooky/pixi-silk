import { type ColorSource, Container, type PointData, type Ticker } from 'pixi.js';
import { damp } from '../motion';
import { SilkGraphics } from '../SilkGraphics';
import { Driver } from './driver';
import { hex } from './paint';
import type { SnapGuide, SnapRect, SnapResult } from './snap';
import { ValuePill } from './ValuePill';

/**
 * A gap marker: a segment from `from` to `to` along `axis`, drawn at `at` across it, labelled with
 * `value`. `axis: 'x'` is a horizontal gap.
 */
export interface GapMarker {
    axis: 'x' | 'y';
    from: number;
    to: number;
    at: number;
    value: number;
}

/** An alignment line: `axis: 'x'` is a vertical line at x = `at`, from `from` to `to` in y. */
export interface AlignLine {
    axis: 'x' | 'y';
    kind: 'edge' | 'centre';
    at: number;
    from: number;
    to: number;
}

/** What {@link findSpacing} found: equal gaps to show and edges or centres that line up. */
export interface SpacingResult {
    gaps: GapMarker[];
    lines: AlignLine[];
}

/** Options of {@link findSpacing}. */
export interface FindSpacingOptions {
    /** Two gaps (or edges) this close count as equal. Default 0.5. */
    tolerance?: number;
    /** Look for edges and centres that line up. Default true. */
    alignment?: boolean;
    /** Look for equal gaps. Default true. */
    gaps?: boolean;
}

interface Span {
    lo: number;
    hi: number;
    olo: number;
    ohi: number;
}

const span = (r: SnapRect, axis: 'x' | 'y'): Span =>
    axis === 'x'
        ? { lo: r.x, hi: r.x + r.width, olo: r.y, ohi: r.y + r.height }
        : { lo: r.y, hi: r.y + r.height, olo: r.x, ohi: r.x + r.width };

/** Where a gap marker between two spans goes across the axis: the middle of what they share. */
const across = (a: Span, b: Span): number => {
    const lo = Math.max(a.olo, b.olo);
    const hi = Math.min(a.ohi, b.ohi);

    return lo <= hi ? (lo + hi) / 2 : (a.olo + a.ohi) / 2;
};

/**
 * The gaps between consecutive rectangles along an axis, for rows and columns. Overlapping
 * neighbours have no gap. Use it to show the spacing of an auto-layout container's children.
 */
export function gapsBetween(rects: readonly SnapRect[], axis: 'x' | 'y'): GapMarker[] {
    const spans = rects.map((r) => span(r, axis)).sort((a, b) => a.lo - b.lo);
    const out: GapMarker[] = [];

    for (let i = 0; i + 1 < spans.length; i++) {
        const a = spans[i];
        const b = spans[i + 1];

        if (b.lo - a.hi > 0) out.push({ axis, from: a.hi, to: b.lo, at: across(a, b), value: b.lo - a.hi });
    }

    return out;
}

function axisGaps(m: Span, all: Span[], axis: 'x' | 'y', tol: number): GapMarker[] {
    // the row: neighbours that share some of the moving box's band across the axis
    const row = all.filter((r) => r.ohi > m.olo && r.olo < m.ohi);
    let left: Span | null = null;
    let right: Span | null = null;

    for (const r of row) {
        if (r.hi <= m.lo + tol && (!left || r.hi > left.hi)) left = r;
        if (r.lo >= m.hi - tol && (!right || r.lo < right.lo)) right = r;
    }
    const mine: GapMarker[] = [];

    if (left) mine.push({ axis, from: left.hi, to: m.lo, at: across(m, left), value: m.lo - left.hi });
    if (right) mine.push({ axis, from: m.hi, to: right.lo, at: across(m, right), value: right.lo - m.hi });
    // every other gap in the row, between neighbours that do not overlap
    const others: GapMarker[] = [];
    const sorted = [...row].sort((a, b) => a.lo - b.lo);

    for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
            const a = sorted[i];
            const b = sorted[j];
            const gap = b.lo - a.hi;

            if (gap <= 0) continue;
            // only neighbours: nothing of the row sits in between
            if (sorted.some((c) => c !== a && c !== b && c.lo < b.lo && c.hi > a.hi)) continue;
            // a gap the moving box sits in is not a gap any more
            if (m.lo < b.lo && m.hi > a.hi) continue;
            others.push({ axis, from: a.hi, to: b.lo, at: across(a, b), value: gap });
        }
    }
    const out: GapMarker[] = [];

    for (const g of mine) {
        if (g.value <= 0) continue;
        const twins = [...mine, ...others].filter((o) => o !== g && Math.abs(o.value - g.value) <= tol);

        if (!twins.length) continue;
        for (const t of [g, ...twins]) if (!out.some((o) => o.from === t.from && o.to === t.to)) out.push(t);
    }

    return out;
}

function axisLines(m: Span, all: Span[], axis: 'x' | 'y', tol: number): AlignLine[] {
    const out: AlignLine[] = [];
    const anchors = (s: Span): [number, 'edge' | 'centre'][] => [
        [s.lo, 'edge'],
        [(s.lo + s.hi) / 2, 'centre'],
        [s.hi, 'edge'],
    ];

    for (const r of all) {
        for (const [v, kind] of anchors(m)) {
            for (const [w, kindR] of anchors(r)) {
                if (Math.abs(v - w) > tol || kind !== kindR) continue;
                const line = out.find((l) => Math.abs(l.at - w) <= tol);
                const from = Math.min(m.olo, r.olo);
                const to = Math.max(m.ohi, r.ohi);

                if (line) {
                    line.from = Math.min(line.from, from);
                    line.to = Math.max(line.to, to);
                } else out.push({ axis, kind, at: w, from, to });
            }
        }
    }

    return out;
}

/**
 * Smart spacing for a box being dragged among others, the way Figma shows it:
 *
 * - Equal gaps: when the gap to a neighbour equals another gap in the same row or column, every
 *   one of those gaps is returned, to draw as pink segments with their value.
 * - Alignment: edges and centres that line up with other boxes, as lines spanning them.
 *
 * It only reports. Snap with a {@link SnapEngine} first, then call this on the snapped box.
 */
export function findSpacing(
    moving: SnapRect,
    others: readonly SnapRect[],
    options: FindSpacingOptions = {},
): SpacingResult {
    const tol = options.tolerance ?? 0.5;
    const gaps: GapMarker[] = [];
    const lines: AlignLine[] = [];

    for (const axis of ['x', 'y'] as const) {
        const m = span(moving, axis);
        const all = others.filter((o) => o !== moving).map((o) => span(o, axis));

        if (options.gaps ?? true) gaps.push(...axisGaps(m, all, axis, tol));
        if (options.alignment ?? true) lines.push(...axisLines(m, all, axis, tol));
    }

    return { gaps, lines };
}

/** The same shapes from a {@link SnapEngine} result, for drawing its guides with {@link SpacingMarkers}. */
export function spacingFromSnap(result: SnapResult | readonly SnapGuide[]): SpacingResult {
    const guides = Array.isArray(result) ? (result as readonly SnapGuide[]) : (result as SnapResult).guides;
    const out: SpacingResult = { gaps: [], lines: [] };

    for (const g of guides) {
        if (g.kind === 'spacing' && g.gaps) {
            for (const [from, to] of g.gaps)
                out.gaps.push({ axis: g.axis, from, to, at: g.at, value: g.gap ?? to - from });
        } else
            out.lines.push({
                axis: g.axis,
                kind: g.kind === 'centre' ? 'centre' : 'edge',
                at: g.at,
                from: g.from,
                to: g.to,
            });
    }

    return out;
}

/** Options of {@link SpacingMarkers}. */
export interface SpacingMarkersOptions {
    /**
     * The space the rectangles are in, usually the camera's world. Lines and pills keep their
     * screen size at any zoom. Default the markers' parent.
     */
    space?: Container;
    /** Marker colour. Default Figma's pink. */
    color?: ColorSource;
    /** Pill text colour. Default white. */
    textColor?: ColorSource;
    /** Turns a gap into the pill text. Default whole numbers. */
    format?: (value: number) => string;
    /** Draw alignment lines too. Default true. */
    lines?: boolean;
    ticker?: Ticker | null;
}

interface Shown<T> {
    item: T;
    fade: number;
    live: boolean;
    pill?: ValuePill;
}

const gapKey = (g: GapMarker): string => `${g.axis}:${Math.round(g.from * 2)}:${Math.round(g.to * 2)}`;
const lineKey = (l: AlignLine): string => `${l.axis}:${Math.round(l.at * 2)}`;

/**
 * Draws smart spacing: pink gap segments with end bars and a value pill, and thin alignment
 * lines with crosses at their ends. Each marker fades in when found and out when lost, and grows
 * from its middle.
 *
 * Feed it {@link findSpacing} on every move of a drag, a {@link SnapEngine} result through
 * {@link spacingFromSnap}, or gaps of your own (an auto-layout container's children through
 * {@link gapsBetween}). Put it in screen space above the world, with `space` set to the world.
 */
export class SpacingMarkers extends Container {
    private readonly _opts: SpacingMarkersOptions;
    private readonly _g = new SilkGraphics({ label: 'SpacingMarkers' });
    private readonly _pills = new Container();
    private readonly _driver: Driver;
    private readonly _color: number;
    private readonly _textColor: number;
    private readonly _gaps = new Map<string, Shown<GapMarker>>();
    private readonly _lines = new Map<string, Shown<AlignLine>>();

    constructor(options: SpacingMarkersOptions = {}) {
        super({ label: 'SpacingMarkers' });
        this._opts = options;
        this._color = hex(options.color ?? 0xff24bd);
        this._textColor = hex(options.textColor ?? 0xffffff);
        this.eventMode = 'none';
        this.addChild(this._g, this._pills);
        this._driver = new Driver((dt) => this._step(dt), options.ticker);
    }

    /** Markers shown now (not counting ones fading out). */
    get shown(): SpacingResult {
        return {
            gaps: [...this._gaps.values()].filter((s) => s.live).map((s) => s.item),
            lines: [...this._lines.values()].filter((s) => s.live).map((s) => s.item),
        };
    }

    /** Shows these markers. Markers no longer in it fade out. `null` fades everything out. */
    show(result: Partial<SpacingResult> | null): this {
        const gaps = result?.gaps ?? [];
        const lines = this._opts.lines === false ? [] : (result?.lines ?? []);

        this._merge(this._gaps, gaps, gapKey);
        this._merge(this._lines, lines, lineKey);
        this._driver.wake();

        return this;
    }

    /** Fades everything out. */
    clear(): this {
        return this.show(null);
    }

    /** Advances by `dt` seconds and redraws (only needed with `ticker: null`). */
    tick(dt: number): boolean {
        return this._driver.tick(dt);
    }

    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        this._driver.sleep();
        super.destroy(options ?? { children: true });
    }

    // ------------------------------------------------------------------------------- internals

    private _merge<T>(map: Map<string, Shown<T>>, items: readonly T[], key: (t: T) => string): void {
        const keys = new Set<string>();

        for (const item of items) {
            const k = key(item);
            const entry = map.get(k);

            keys.add(k);
            if (entry) {
                entry.item = item;
                entry.live = true;
            } else map.set(k, { item, fade: 0, live: true });
        }
        for (const [k, entry] of map) if (!keys.has(k)) entry.live = false;
    }

    private get _space(): Container {
        return this._opts.space ?? this.parent ?? this;
    }

    private _map(x: number, y: number): PointData {
        const space = this._space;

        return space === this ? { x, y } : this.toLocal(space.toGlobal({ x, y }));
    }

    private _fade<T>(entry: Shown<T>, dt: number): boolean {
        const to = entry.live ? 1 : 0;

        entry.fade = damp(entry.fade, to, entry.live ? 26 : 16, dt);
        if (Math.abs(entry.fade - to) < 0.004) entry.fade = to;

        return entry.fade !== to;
    }

    private _step(dt: number): boolean {
        const g = this._g.clear();
        const color = this._color;
        const fmt = this._opts.format ?? ((v: number) => String(Math.round(v)));
        let busy = false;

        for (const [k, s] of this._lines) {
            if (this._fade(s, dt)) busy = true;
            if (!s.live && s.fade === 0) {
                this._lines.delete(k);
                continue;
            }
            const l = s.item;
            const p = l.axis === 'x' ? this._map(l.at, l.from) : this._map(l.from, l.at);
            const q = l.axis === 'x' ? this._map(l.at, l.to) : this._map(l.to, l.at);
            const a = s.fade;

            g.moveTo(p.x, p.y).lineTo(q.x, q.y).stroke({ width: 1, color, alpha: a });
            for (const e of [p, q]) {
                g.moveTo(e.x - 3, e.y - 3)
                    .lineTo(e.x + 3, e.y + 3)
                    .moveTo(e.x - 3, e.y + 3)
                    .lineTo(e.x + 3, e.y - 3)
                    .stroke({ width: 1, color, alpha: a });
            }
        }
        for (const [k, s] of this._gaps) {
            if (this._fade(s, dt)) busy = true;
            if (!s.live && s.fade === 0) {
                s.pill?.destroy();
                this._gaps.delete(k);
                continue;
            }
            const m = s.item;
            const p = m.axis === 'x' ? this._map(m.from, m.at) : this._map(m.at, m.from);
            const q = m.axis === 'x' ? this._map(m.to, m.at) : this._map(m.at, m.to);
            const a = s.fade;
            // grows out from the middle
            const cx = (p.x + q.x) / 2;
            const cy = (p.y + q.y) / 2;
            const t = 0.4 + 0.6 * a;
            const u = { x: cx + (p.x - cx) * t, y: cy + (p.y - cy) * t };
            const v = { x: cx + (q.x - cx) * t, y: cy + (q.y - cy) * t };
            const bar = m.axis === 'x' ? { x: 0, y: 4 } : { x: 4, y: 0 };

            g.moveTo(u.x, u.y)
                .lineTo(v.x, v.y)
                .moveTo(u.x - bar.x, u.y - bar.y)
                .lineTo(u.x + bar.x, u.y + bar.y)
                .moveTo(v.x - bar.x, v.y - bar.y)
                .lineTo(v.x + bar.x, v.y + bar.y)
                .stroke({ width: 1, color, alpha: a });
            if (!s.pill) {
                s.pill = new ValuePill({ fill: color, color: this._textColor, fontSize: 10, height: 16 });
                this._pills.addChild(s.pill);
            }
            if (s.live) s.pill.show(fmt(m.value));
            else s.pill.hide();
            // under a horizontal gap, beside a vertical one
            if (m.axis === 'x') s.pill.position.set(cx, cy + 14);
            else s.pill.position.set(cx + s.pill.width / 2 + 8, cy);
            if (s.pill.update(dt)) busy = true;
        }
        // keep following: the markers sit in the world, which may pan and zoom under them
        if (this._gaps.size || this._lines.size) busy = true;

        return busy;
    }
}
