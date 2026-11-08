import { type ColorSource, Container, type PointData, Text, type Ticker } from 'pixi.js';
import { damp } from '../motion';
import { SilkGraphics } from '../SilkGraphics';
import { type Signal, signal } from '../signal';
import type { Camera, WorldRect } from './camera';
import { Driver } from './driver';
import { boundsQuad, unionQuad } from './outline';
import { hex } from './paint';

/** Which bar of a {@link Ruler} a point is on. */
export type RulerSide = 'top' | 'left' | 'corner';

/** What a {@link Ruler} highlights: objects (followed every frame) or a rectangle in world units. */
export type RulerTarget = Container | readonly Container[] | WorldRect;

/** Options of {@link Ruler}. */
export interface RulerOptions {
    /** The camera the ruler reads. */
    camera: Camera;
    /** Which rulers to draw. Default `both`. */
    sides?: 'both' | 'top' | 'left';
    /** Thickness, screen pixels. Default 20. */
    size?: number;
    /** Background. Default near black. */
    background?: ColorSource;
    /** Tick colour. Default white at low opacity. */
    tickColor?: ColorSource;
    /** Label colour. Default grey. */
    textColor?: ColorSource;
    /** Selection band, its labels and the cursor marker. Default blue. */
    accent?: ColorSource;
    /** Smallest distance between labels, screen pixels. Default 72. */
    labelSpacing?: number;
    /** Label font size. Default 10. */
    fontSize?: number;
    /** Turns a world value into a label. `step` is the distance between labels. Default whole numbers. */
    format?: (value: number, step: number) => string;
    /** Follow the pointer over the camera's element with a marker. Default true. */
    trackCursor?: boolean;
    ticker?: Ticker | null;
}

/** The reactive state of a {@link Ruler}. */
export interface RulerState {
    /** Pointer position on the element, screen pixels, or null when it is away. */
    cursor: Signal<PointData | null>;
    /** The highlighted extent in world units, or null. Updated every frame while it follows objects. */
    selection: Signal<WorldRect | null>;
}

/** The nice step (1, 2 or 5 times a power of ten) at or above `min`. */
export function niceStep(min: number): number {
    if (!(min > 0) || !Number.isFinite(min)) return 1;
    const p = 10 ** Math.floor(Math.log10(min));

    for (const m of [1, 2, 5, 10]) if (m * p >= min * (1 - 1e-9)) return m * p;

    return 10 * p;
}

/** Minor ticks per label step: 5 for 1 and 5, 4 for 2. */
export function tickDivisions(step: number): number {
    const m = Math.round(step / 10 ** Math.floor(Math.log10(step) + 1e-9));

    return m === 2 ? 4 : 5;
}

const defaultFormat = (v: number, step: number): string => {
    const digits = step >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(step) - 1e-9));
    const s = v.toFixed(digits);

    return Number(s) === 0 ? (0).toFixed(digits) : s;
};

const isRect = (t: RulerTarget): t is WorldRect => !Array.isArray(t) && !('children' in (t as object));

interface Label {
    text: Text;
    key: string;
    fade: number;
    live: boolean;
}

/**
 * Top and left rulers for a {@link Camera}, like a design tool's.
 *
 * - Ticks and labels adapt to the zoom in 1, 2, 5 steps. Labels fade in and out as steps change.
 * - The selection's extent shows as a band with its edges labelled in the accent colour.
 * - A marker follows the pointer.
 *
 * Values are world units, through `format` for units or rounding. Put the ruler in screen space,
 * above the world. It catches presses on its bars, so a {@link Guides} layer can drag guides out of it.
 */
export class Ruler extends Container {
    readonly state: RulerState = {
        cursor: signal<PointData | null>(null),
        selection: signal<WorldRect | null>(null, sameRect),
    };

    private readonly _camera: Camera;
    private readonly _opts: RulerOptions;
    private readonly _g = new SilkGraphics({ label: 'RulerBars' });
    private readonly _marks = new SilkGraphics({ label: 'RulerMarks' });
    private readonly _labels = new Container();
    private readonly _pool: Label[] = [];
    private readonly _edges: Text[] = [];
    private readonly _driver: Driver;
    private readonly _off: (() => void)[] = [];
    private readonly _c: Record<'bg' | 'tick' | 'text' | 'accent', number>;
    private _target: RulerTarget | null = null;
    private _band = 0;
    private _lastBand: WorldRect | null = null;

    constructor(options: RulerOptions) {
        super({ label: 'Ruler' });
        this._opts = options;
        this._camera = options.camera;
        this._c = {
            bg: hex(options.background ?? 0x1c1c1e),
            tick: hex(options.tickColor ?? 0xffffff),
            text: hex(options.textColor ?? 0x8e8e93),
            accent: hex(options.accent ?? 0x0a84ff),
        };
        this.addChild(this._g, this._labels, this._marks);
        for (let i = 0; i < 4; i++) {
            const t = this._text(this._c.accent);

            t.visible = false;
            this._edges.push(t);
            this.addChild(t);
        }
        this.eventMode = 'static';
        this.hitArea = { contains: (x: number, y: number) => this.side({ x, y }) !== null };
        this._driver = new Driver((dt) => this._step(dt), options.ticker);
        const wake = () => this._driver.wake();
        const cam = options.camera.state;

        for (const s of [cam.zoom, cam.x, cam.y, cam.width, cam.height, this.state.cursor])
            this._off.push(s.subscribe(wake));
        if (options.trackCursor ?? true) this._track();
        this._driver.wake();
    }

    /** Thickness of the bars, screen pixels. */
    get size(): number {
        return this._opts.size ?? 20;
    }

    /** The distance between labels now, in world units. */
    get step(): number {
        return niceStep((this._opts.labelSpacing ?? 72) / this._camera.zoom);
    }

    /** Labels on screen now (not counting ones fading out). */
    get labels(): string[] {
        return this._pool.filter((l) => l.live).map((l) => l.text.text);
    }

    /** Which bar a screen point is on, or null. */
    side(p: PointData): RulerSide | null {
        const s = this.size;
        const sides = this._opts.sides ?? 'both';
        const top = sides !== 'left' && p.y >= 0 && p.y <= s && p.x >= 0;
        const left = sides !== 'top' && p.x >= 0 && p.x <= s && p.y >= 0;

        if (top && left) return 'corner';

        return top ? 'top' : left ? 'left' : null;
    }

    /** Highlights the extent of objects or of a world rectangle (null clears it). */
    highlight(target: RulerTarget | null): this {
        this._target = target;
        this._driver.wake();

        return this;
    }

    /** Advances by `dt` seconds and redraws (only needed with `ticker: null`). */
    tick(dt: number): boolean {
        return this._driver.tick(dt);
    }

    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        for (const off of this._off) off();
        this._off.length = 0;
        this._driver.sleep();
        super.destroy(options ?? { children: true });
    }

    // ------------------------------------------------------------------------------- internals

    private _track(): void {
        const el = this._camera.element;
        const move = (e: Event) => {
            const pe = e as PointerEvent;
            const r = el.getBoundingClientRect();

            this.state.cursor.set({ x: pe.clientX - r.left, y: pe.clientY - r.top });
        };
        const leave = () => this.state.cursor.set(null);

        el.addEventListener('pointermove', move);
        el.addEventListener('pointerleave', leave);
        this._off.push(() => {
            el.removeEventListener('pointermove', move);
            el.removeEventListener('pointerleave', leave);
        });
    }

    private _text(fill: number): Text {
        const t = new Text({
            text: '',
            style: {
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: this._opts.fontSize ?? 10,
                fontWeight: '500',
                fill,
            },
            resolution: 3,
        });

        return t;
    }

    private _extent(): WorldRect | null {
        const t = this._target;

        if (!t) return null;
        if (isRect(t)) return t;
        const list = (Array.isArray(t) ? t : [t]).filter((c: Container) => !c.destroyed && c.parent);

        if (!list.length) return null;
        const world = this._camera.world;
        const q = unionQuad(list.map((c: Container) => boundsQuad(c, world)));

        return { x: q[0].x, y: q[0].y, width: q[2].x - q[0].x, height: q[2].y - q[0].y };
    }

    private _step(dt: number): boolean {
        const cam = this._camera;
        const k = cam.zoom;
        const view = cam.view;
        const W = view.width * k;
        const H = view.height * k;
        const ox = cam.state.x.value;
        const oy = cam.state.y.value;
        const s = this.size;
        const sides = this._opts.sides ?? 'both';
        const top = sides !== 'left';
        const left = sides !== 'top';
        const c = this._c;
        const g = this._g.clear();
        const m = this._marks.clear();
        const fmt = this._opts.format ?? defaultFormat;
        let busy = false;

        // bars and their inner edges
        if (top) g.rect(0, 0, W, s).fill(c.bg);
        if (left) g.rect(0, 0, s, H).fill(c.bg);
        if (top) g.rect(0, s - 1, W, 1).fill({ color: c.tick, alpha: 0.1 });
        if (left) g.rect(s - 1, 0, 1, H).fill({ color: c.tick, alpha: 0.1 });

        // selection band, fading in and out, following its objects exactly
        const ext = this._extent();

        this.state.selection.set(ext);
        if (ext) this._lastBand = ext;
        const bandTo = ext ? 1 : 0;

        this._band = damp(this._band, bandTo, 18, dt);
        if (Math.abs(this._band - bandTo) < 0.004) this._band = bandTo;
        else busy = true;
        if (this._target && !isRect(this._target)) busy = true;
        const band = this._lastBand;
        const ba = this._band;
        const blocked: { side: 'top' | 'left'; lo: number; hi: number }[] = [];

        for (const e of this._edges) e.visible = false;
        if (band && ba > 0.002) {
            const x0 = band.x * k + ox;
            const x1 = (band.x + band.width) * k + ox;
            const y0 = band.y * k + oy;
            const y1 = (band.y + band.height) * k + oy;
            const step = this.step;

            if (top) {
                g.rect(x0, 0, Math.max(1, x1 - x0), s - 1).fill({ color: c.accent, alpha: 0.22 * ba });
                this._edge(0, fmt(band.x, step), x0 - 3, 1, 'top', ba, blocked);
                this._edge(1, fmt(band.x + band.width, step), x1 + 3, 0, 'top', ba, blocked);
            }
            if (left) {
                g.rect(0, y0, s - 1, Math.max(1, y1 - y0)).fill({ color: c.accent, alpha: 0.22 * ba });
                this._edge(2, fmt(band.y, step), y0 - 3, 1, 'left', ba, blocked);
                this._edge(3, fmt(band.y + band.height, step), y1 + 3, 0, 'left', ba, blocked);
            }
        }

        // ticks: every tick of a size is one dashed stroke across the bar
        const step = this.step;
        const minor = step / tickDivisions(step);
        const tickAlpha = 0.28;
        const ticks = (axis: 'x' | 'y', origin: number, length: number, every: number, len: number, alpha: number) => {
            const p = every * k;

            if (p < 3) return;
            const first = origin - Math.floor(origin / p) * p - p - 0.5;

            if (axis === 'x')
                g.moveTo(first, s - len / 2 - 1)
                    .lineTo(length + p, s - len / 2 - 1)
                    .stroke({ width: len, color: c.tick, alpha, dash: [1, p - 1] });
            else
                g.moveTo(s - len / 2 - 1, first)
                    .lineTo(s - len / 2 - 1, length + p)
                    .stroke({ width: len, color: c.tick, alpha, dash: [1, p - 1] });
        };

        if (top) {
            ticks('x', ox, W, minor, 4, tickAlpha);
            ticks('x', ox, W, step, s - 1, tickAlpha);
        }
        if (left) {
            ticks('y', oy, H, minor, 4, tickAlpha);
            ticks('y', oy, H, step, s - 1, tickAlpha);
        }

        // labels at every major tick, keyed by value so a zoom keeps the ones it shares
        const keys = new Set<string>();
        const place = (side: 'top' | 'left', v: number, at: number) => {
            const key = `${side}:${v.toPrecision(12)}`;
            const label = this._label(key, keys);
            const text = fmt(v, step);

            if (label.text.text !== text) label.text.text = text;
            if (side === 'top') {
                label.text.rotation = 0;
                label.text.position.set(Math.round(at + 3), 3);
            } else {
                label.text.rotation = -Math.PI / 2;
                label.text.position.set(3, Math.round(at - 3));
            }
            const lo = side === 'top' ? at + 3 : at - 3 - label.text.width;
            const hi = lo + label.text.width;

            label.live = !blocked.some((b) => b.side === side && b.hi + 4 > lo && b.lo - 4 < hi);
        };

        if (top)
            for (let n = Math.floor((s - ox) / (step * k)); n * step * k + ox <= W; n++) {
                const at = n * step * k + ox;

                if (at >= s) place('top', n * step, at);
            }
        if (left)
            for (let n = Math.floor((s - oy) / (step * k)); n * step * k + oy <= H; n++) {
                const at = n * step * k + oy;

                if (at >= s) place('left', n * step, at);
            }
        for (const label of this._pool) {
            if (!keys.has(label.key)) label.live = false;
            const to = label.live ? 1 : 0;

            label.fade = damp(label.fade, to, label.live ? 16 : 22, dt);
            if (Math.abs(label.fade - to) < 0.01) label.fade = to;
            else busy = true;
            label.text.alpha = label.fade;
            label.text.visible = label.fade > 0;
            if (!keys.has(label.key) && label.fade === 0) label.key = '';
        }

        // the pointer
        const p = this.state.cursor.value;

        if (p) {
            if (top && p.x >= s) m.rect(p.x - 0.5, 0, 1, s - 1).fill({ color: c.accent, alpha: 0.9 });
            if (left && p.y >= s) m.rect(0, p.y - 0.5, s - 1, 1).fill({ color: c.accent, alpha: 0.9 });
        }
        if (top && left) m.rect(0, 0, s, s).fill(c.bg);

        return busy;
    }

    /** A selection edge label, aligned to end at `at` (`align` 1) or to start there (0). */
    private _edge(
        i: number,
        value: string,
        at: number,
        align: 0 | 1,
        side: 'top' | 'left',
        alpha: number,
        blocked: { side: 'top' | 'left'; lo: number; hi: number }[],
    ): void {
        const t = this._edges[i];

        if (t.text !== value) t.text = value;
        const w = t.width;
        const lo = align === 1 ? at - w : at;

        t.visible = true;
        t.alpha = alpha;
        if (side === 'top') {
            t.rotation = 0;
            t.position.set(Math.round(lo), 3);
        } else {
            t.rotation = -Math.PI / 2;
            // reads bottom to top: the text's start is its lower end
            t.position.set(3, Math.round(lo + w));
        }
        blocked.push({ side, lo, hi: lo + w });
    }

    /** The label for `key`, reusing a free one. */
    private _label(key: string, keys: Set<string>): Label {
        keys.add(key);
        let label = this._pool.find((l) => l.key === key);

        if (label) return label;
        label = this._pool.find((l) => l.key === '' || (!l.live && l.fade === 0 && !keys.has(l.key)));
        if (!label) {
            label = { text: this._text(this._c.text), key, fade: 0, live: true };
            this._pool.push(label);
            this._labels.addChild(label.text);
        }
        label.key = key;
        label.live = true;

        return label;
    }
}

function sameRect(a: WorldRect | null, b: WorldRect | null): boolean {
    if (a === b) return true;
    if (!a || !b) return false;

    return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}
