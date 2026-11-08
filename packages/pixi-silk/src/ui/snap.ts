import { Container, type Ticker } from 'pixi.js';
import { damp } from '../motion';
import { SilkGraphics } from '../SilkGraphics';
import { Driver } from './driver';
import { hex } from './paint';
import { ValuePill } from './ValuePill';

/** Axis-aligned rectangle in the snapping space. Targets are compared by identity in `exclude`. */
export interface SnapRect {
    /** Left edge. */
    x: number;
    /** Top edge. */
    y: number;
    /** Width, 0 for a point. */
    width: number;
    /** Height, 0 for a point. */
    height: number;
}

/** A line the snap engine found, ready to draw, in the snapping space. */
export interface SnapGuide {
    /** `x` is a vertical line at x = `at`, `y` a horizontal line at y = `at`. */
    axis: 'x' | 'y';
    /** What lined up: target edges, target centres, a fixed guide line, or an equal gap. */
    kind: 'edge' | 'centre' | 'line' | 'spacing';
    /** Position of the line on its axis. For spacing guides, where the gap markers sit across the axis. */
    at: number;
    /** Start of the line along the other axis. */
    from: number;
    /** End of the line along the other axis. */
    to: number;
    /** Spacing guides only: the equal gaps, as [start, end] on `axis`, drawn at `at` on the other axis. */
    gaps?: [number, number][];
    /** Spacing guides only: the gap size. */
    gap?: number;
}

/** What {@link SnapEngine.snap} found. Add `dx` and `dy` to the moving rectangle to snap it. */
export interface SnapResult {
    /** Horizontal move, 0 when nothing snapped on x. */
    dx: number;
    /** Vertical move, 0 when nothing snapped on y. */
    dy: number;
    /** True when something within the threshold lined up on x. */
    snappedX: boolean;
    /** True when something within the threshold lined up on y. */
    snappedY: boolean;
    /** Every alignment at the snapped position, x guides first. */
    guides: SnapGuide[];
}

/** Options of {@link SnapEngine}. Each one sets the engine property of the same name. */
export interface SnapEngineOptions {
    /** Distance within which things snap, in the snapping space's units. Default 6. Divide by the zoom for screen pixels. */
    threshold?: number;
    /** Uses target edges as snap anchors. Default true. */
    edges?: boolean;
    /** Uses target centres as snap anchors. Default true. */
    centres?: boolean;
    /** Snaps to an equal gap between neighbours that overlap on the other axis. Default true. */
    spacing?: boolean;
    /** Rectangles to snap against (other objects). Default none. The array is kept, not copied. */
    targets?: SnapRect[];
    /** Fixed guide lines: vertical lines at `x`, horizontal lines at `y`. The moving edges and centre snap to them. */
    lines?: { x?: number[]; y?: number[] };
    /** Points, used like zero-size targets. */
    points?: { x: number; y: number }[];
}

interface AxisRect {
    lo: number;
    hi: number;
    olo: number;
    ohi: number;
}

interface AxisPick {
    delta: number;
    guides: SnapGuide[];
}

const EPS = 0.5;

/**
 * Pure snapping maths, no drawing. It moves a rectangle so its edges or centre line up with
 * other rectangles, guide lines and points, or so it sits at an equal gap from its neighbours.
 * Each axis picks the nearest candidate within the threshold. Works in whatever space the
 * rectangles are given in, axis-aligned only. Change the properties at any time.
 *
 * Experimental: the API may change in a minor release.
 * @experimental
 */
export class SnapEngine {
    /** Distance within which things snap, in the snapping space's units. */
    threshold: number;
    /** Uses target edges as snap anchors. */
    edges: boolean;
    /** Uses target centres as snap anchors. */
    centres: boolean;
    /** Snaps to equal gaps between neighbours. */
    spacing: boolean;
    /** Rectangles to snap against. */
    targets: SnapRect[];
    /** Fixed guide lines. `Guides.bindSnap()` from `pixi-silk/ui/guides` keeps them in step with a guides layer. */
    lines: { x: number[]; y: number[] };
    /** Points, used like zero-size targets. */
    points: { x: number; y: number }[];

    constructor(options: SnapEngineOptions = {}) {
        this.threshold = options.threshold ?? 6;
        this.edges = options.edges ?? true;
        this.centres = options.centres ?? true;
        this.spacing = options.spacing ?? true;
        this.targets = options.targets ?? [];
        this.lines = { x: options.lines?.x ?? [], y: options.lines?.y ?? [] };
        this.points = options.points ?? [];
    }

    /**
     * Snaps a moving rectangle and returns the move and the guides. Does not change `rect`.
     * `exclude` leaves out targets by identity, usually the moving object's own rectangle.
     */
    snap(rect: SnapRect, exclude: readonly SnapRect[] = []): SnapResult {
        const others = this.targets.filter((t) => !exclude.includes(t));
        const pts = this.points.map((p) => ({ x: p.x, y: p.y, width: 0, height: 0 }));
        const x = this._axis(
            rect,
            [...others, ...pts],
            others,
            this.lines.x,
            (r) => ({ lo: r.x, hi: r.x + r.width, olo: r.y, ohi: r.y + r.height }),
            'x',
        );
        const y = this._axis(
            rect,
            [...others, ...pts],
            others,
            this.lines.y,
            (r) => ({ lo: r.y, hi: r.y + r.height, olo: r.x, ohi: r.x + r.width }),
            'y',
        );

        return {
            dx: x?.delta ?? 0,
            dy: y?.delta ?? 0,
            snappedX: !!x,
            snappedY: !!y,
            guides: [...(x?.guides ?? []), ...(y?.guides ?? [])],
        };
    }

    /** Snaps a single point, as a zero-size rectangle, and returns where it lands. */
    snapPoint(x: number, y: number): { x: number; y: number; guides: SnapGuide[] } {
        const r = this.snap({ x, y, width: 0, height: 0 });

        return { x: x + r.dx, y: y + r.dy, guides: r.guides };
    }

    private _axis(
        rect: SnapRect,
        candidates: SnapRect[],
        row: SnapRect[],
        lines: number[],
        map: (r: SnapRect) => AxisRect,
        axis: 'x' | 'y',
    ): AxisPick | null {
        const m = map(rect);
        const mid = (m.lo + m.hi) / 2;
        const th = this.threshold;
        let best: number | null = null;
        const consider = (delta: number) => {
            if (Math.abs(delta) <= th && (best === null || Math.abs(delta) < Math.abs(best) - 1e-9)) best = delta;
        };

        // edges and centres
        const anchors = (r: AxisRect) => {
            const out: number[] = [];

            if (this.edges) out.push(r.lo, r.hi);
            if (this.centres) out.push((r.lo + r.hi) / 2);

            return out;
        };
        const mine = anchors(m);

        for (const c of candidates) {
            const t = map(c);

            for (const a of anchors(t)) for (const v of mine) consider(a - v);
        }
        for (const l of lines) for (const v of [m.lo, mid, m.hi]) consider(l - v);

        // equal spacing among neighbours that overlap on the other axis
        let spacingPick: { delta: number; guide: SnapGuide } | null = null;

        if (this.spacing) spacingPick = this._spacing(m, row.map(map), axis);
        if (spacingPick && (best === null || Math.abs(spacingPick.delta) < Math.abs(best) - 1e-9)) {
            return { delta: spacingPick.delta, guides: [spacingPick.guide] };
        }
        if (best === null) return null;
        const delta: number = best;
        const guides: SnapGuide[] = [];
        const lo = m.lo + delta;
        const hi = m.hi + delta;
        const c = (lo + hi) / 2;

        for (const cand of candidates) {
            const t = map(cand);

            for (const a of anchors(t)) {
                const hit = [lo, c, hi].findIndex((v) => Math.abs(v - a) < EPS);

                if (hit < 0) continue;
                guides.push({
                    axis,
                    kind: hit === 1 && Math.abs((t.lo + t.hi) / 2 - a) < EPS ? 'centre' : 'edge',
                    at: a,
                    from: Math.min(m.olo, t.olo),
                    to: Math.max(m.ohi, t.ohi),
                });
            }
        }
        for (const l of lines) {
            if ([lo, c, hi].some((v) => Math.abs(v - l) < EPS)) {
                guides.push({ axis, kind: 'line', at: l, from: m.olo - 12, to: m.ohi + 12 });
            }
        }

        return { delta, guides: dedupe(guides) };
    }

    private _spacing(m: AxisRect, all: AxisRect[], axis: 'x' | 'y'): { delta: number; guide: SnapGuide } | null {
        const row = all.filter((r) => r.ohi > m.olo && r.olo < m.ohi).sort((a, b) => a.lo - b.lo);
        const size = m.hi - m.lo;
        const th = this.threshold;
        let left: AxisRect | null = null;
        let right: AxisRect | null = null;

        for (const r of row) {
            if (r.hi <= m.lo + th && (!left || r.hi > left.hi)) left = r;
            if (r.lo >= m.hi - th && (!right || r.lo < right.lo)) right = r;
        }
        let best: { delta: number; guide: SnapGuide } | null = null;
        const line = (gaps: [number, number][], gap: number, others: AxisRect[]): SnapGuide => {
            const olo = Math.max(m.olo, ...others.map((o) => o.olo));
            const ohi = Math.min(m.ohi, ...others.map((o) => o.ohi));
            const at = olo <= ohi ? (olo + ohi) / 2 : (m.olo + m.ohi) / 2;

            return { axis, kind: 'spacing', at, from: gaps[0][0], to: gaps[gaps.length - 1][1], gaps, gap };
        };
        const offer = (pos: number, gaps: (p: number) => [number, number][], gap: number, others: AxisRect[]) => {
            const delta = pos - m.lo;

            if (Math.abs(delta) > th || (best && Math.abs(best.delta) <= Math.abs(delta))) return;
            best = { delta, guide: line(gaps(pos), gap, others) };
        };

        // centred between the two neighbours
        if (left && right && right.lo - left.hi >= size) {
            const L = left;
            const R = right;
            const gap = (R.lo - L.hi - size) / 2;

            offer(
                L.hi + gap,
                (p) => [
                    [L.hi, p],
                    [p + size, R.lo],
                ],
                gap,
                [L, R],
            );
        }
        // repeat a gap that already exists between two neighbours in the row
        for (let i = 0; i + 1 < row.length; i++) {
            const a = row[i];
            const b = row[i + 1];
            const gap = b.lo - a.hi;

            if (gap <= 0) continue;
            if (left) {
                const L = left;

                offer(
                    L.hi + gap,
                    (p) => [
                        [a.hi, b.lo],
                        [L.hi, p],
                    ],
                    gap,
                    [L],
                );
            }
            if (right) {
                const R = right;

                offer(
                    R.lo - gap - size,
                    (p) => [
                        [p + size, R.lo],
                        [a.hi, b.lo],
                    ],
                    gap,
                    [R],
                );
            }
        }

        return best;
    }
}

function dedupe(guides: SnapGuide[]): SnapGuide[] {
    const out: SnapGuide[] = [];

    for (const g of guides) {
        const same = out.find((o) => o.axis === g.axis && Math.abs(o.at - g.at) < EPS);

        if (same) {
            same.from = Math.min(same.from, g.from);
            same.to = Math.max(same.to, g.to);
            if (g.kind === 'centre') same.kind = 'centre';
        } else out.push({ ...g });
    }

    return out;
}

/** Options of {@link SnapGuides}. */
export interface SnapGuidesOptions {
    /** Line colour, also the pill fill. Default `0xff375f`. */
    color?: number | string;
    /** Draws spacing values in pills. Default true. */
    readouts?: boolean;
    /** Digits after the point in readouts. Default 0. */
    precision?: number;
    /** Ticker that runs fades and redraws. Default `Ticker.shared`. With `null`, call {@link SnapGuides.tick} yourself. */
    ticker?: Ticker | null;
}

interface Shown {
    guide: SnapGuide;
    fade: number;
    live: boolean;
    pills: ValuePill[];
}

/** One alignment, whatever its extent: guides with the same key are the same line. */
const keyOf = (g: SnapGuide): string => `${g.axis}:${g.kind}:${Math.round(g.at * 2) / 2}:${g.gap ?? ''}`;

/**
 * Draws what a {@link SnapEngine} found: dashed alignment lines with end marks, and equal-gap
 * markers with their distance in a pill. Each alignment fades in when found and out when lost,
 * so the guides never slide from one alignment to the next.
 * Add it to the same space as the rectangles you snap. It ignores pointer events.
 *
 * Experimental: the API may change in a minor release.
 * @experimental
 */
export class SnapGuides extends Container {
    private readonly _g = new SilkGraphics();
    private readonly _driver: Driver;
    private readonly _color: number;
    private readonly _opts: SnapGuidesOptions;
    private readonly _shown = new Map<string, Shown>();

    constructor(options: SnapGuidesOptions = {}) {
        super({ label: 'SnapGuides' });
        this._opts = options;
        this._color = hex(options.color ?? 0xff375f);
        this.eventMode = 'none';
        this.addChild(this._g);
        this._driver = new Driver((dt) => this._step(dt), options.ticker);
    }

    /** Guides shown now, not counting ones fading out. Allocates a new array. */
    get guides(): readonly SnapGuide[] {
        return [...this._shown.values()].filter((s) => s.live).map((s) => s.guide);
    }

    /** Shows the guides of a snap result, replacing the last call's. Guides no longer in it fade out. */
    show(guides: readonly SnapGuide[] | SnapResult): void {
        const list = Array.isArray(guides) ? (guides as SnapGuide[]) : (guides as SnapResult).guides;
        const keys = new Set<string>();

        for (const guide of list) {
            const key = keyOf(guide);
            const entry = this._shown.get(key);

            keys.add(key);
            if (entry) {
                entry.guide = guide;
                entry.live = true;
            } else this._shown.set(key, { guide, fade: 0, live: true, pills: [] });
        }
        for (const [key, entry] of this._shown) if (!keys.has(key)) entry.live = false;
        this._driver.wake();
    }

    /** Fades every guide out. */
    clear(): void {
        for (const entry of this._shown.values()) entry.live = false;
        this._driver.wake();
    }

    /** Advances the fades by `dt` seconds (clamped to 0..0.1) and redraws. Only needed with `ticker: null`. */
    tick(dt: number): boolean {
        return this._driver.tick(dt);
    }

    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        this._driver.sleep();
        super.destroy(options ?? { children: true });
    }

    private _step(dt: number): boolean {
        let busy = false;

        this._g.clear();
        for (const [key, entry] of this._shown) {
            const target = entry.live ? 1 : 0;

            entry.fade = damp(entry.fade, target, entry.live ? 28 : 14, dt);
            if (Math.abs(entry.fade - target) < 0.004) entry.fade = target;
            if (entry.fade !== target) busy = true;
            let pillsBusy = false;

            this._draw(entry);
            for (const p of entry.pills) if (p.update(dt)) pillsBusy = true;
            if (pillsBusy) busy = true;
            if (!entry.live && entry.fade === 0 && !pillsBusy) {
                for (const p of entry.pills) p.destroy();
                this._shown.delete(key);
            }
        }

        return busy;
    }

    private _draw(entry: Shown): void {
        const g = this._g;
        const guide = entry.guide;
        const color = this._color;
        const alpha = entry.fade;

        if (alpha <= 0) {
            for (const p of entry.pills) p.hide();

            return;
        }
        if (guide.kind === 'spacing' && guide.gaps) {
            guide.gaps.forEach(([a, b], i) => {
                // gaps run along the snapping axis, at `at` across it
                const p0 = guide.axis === 'x' ? { x: a, y: guide.at } : { x: guide.at, y: a };
                const p1 = guide.axis === 'x' ? { x: b, y: guide.at } : { x: guide.at, y: b };

                // the gap and its end ticks are one stroke: no darker dots where they cross
                g.line(p0.x, p0.y, p1.x, p1.y);
                for (const p of [p0, p1]) {
                    if (guide.axis === 'x') g.line(p.x, p.y - 4, p.x, p.y + 4);
                    else g.line(p.x - 4, p.y, p.x + 4, p.y);
                }
                g.stroke({ width: 1, color, alpha, union: true });
                if (this._opts.readouts === false) return;
                let pill = entry.pills[i];

                if (!pill) {
                    pill = new ValuePill({ fill: color, color: 0xffffff, fontSize: 11, height: 18 });
                    entry.pills[i] = pill;
                    this.addChild(pill);
                }
                pill.position.set((p0.x + p1.x) / 2, (p0.y + p1.y) / 2);
                if (entry.live) pill.show((guide.gap ?? b - a).toFixed(this._opts.precision ?? 0));
                else pill.hide();
            });

            return;
        }
        const pt = (along: number, across: number): [number, number] =>
            guide.axis === 'x' ? [across, along] : [along, across];
        const [x0, y0] = pt(guide.from, guide.at);
        const [x1, y1] = pt(guide.to, guide.at);

        g.line(x0, y0, x1, y1).stroke({ width: 1, color, alpha, dash: guide.kind === 'line' ? [6, 4] : [4, 3] });
        for (const [x, y] of [
            [x0, y0],
            [x1, y1],
        ]) {
            g.line(x - 3, y - 3, x + 3, y + 3)
                .line(x - 3, y + 3, x + 3, y - 3)
                .stroke({ width: 1, color, alpha, union: true });
        }
    }
}
