import { Container, type PointData, Text, type Ticker } from 'pixi.js';
import { Spring } from '../motion';
import { SilkGraphics } from '../SilkGraphics';
import { Driver } from './driver';
import type { LabelFactory, TextLabel } from './label';
import { hex } from './paint';

/** A box in the measured space, the way {@link Measure} reads it. */
export interface MeasureRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** What {@link Measure} can measure: an object (its bounds) or a box in the measured space. */
export type MeasureTarget = Container | MeasureRect;

/** Options of {@link Measure}. */
export interface MeasureOptions {
    /**
     * The space distances are measured in, usually the camera's world. A gap of 24 reads "24" at
     * any zoom, while the lines keep their screen size. Default the measure's parent.
     */
    space?: Container;
    /** Colour of the redlines and their labels. Default Figma's red. */
    color?: number | string;
    /** Colour of the size badge. Default blue. */
    sizeColor?: number | string;
    /** Label text colour. Default white. */
    textColor?: number | string;
    /** Turns a distance into a label. Default up to one decimal, trailing zeros dropped. */
    format?: (value: number) => string;
    /** Label font size. Default 11. */
    fontSize?: number;
    /**
     * Builds the label text. Default PixiJS `Text`. Pass `silkLabel()` from `pixi-silk/text` for
     * labels that stay sharp at any zoom and resolution.
     */
    label?: LabelFactory;
    /** Outline the hovered object in the redline colour. Default true. */
    outline?: boolean;
    ticker?: Ticker | null;
}

interface Box {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}

/** One redline: from (x0, y0) to (x1, y1) in the measured space, its value, and dashed guides. */
export interface Redline {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    value: number;
    guides: [number, number, number, number][];
}

const defaultFormat = (v: number): string => String(Math.round(v * 10) / 10);

const isContainer = (t: MeasureTarget): t is Container => 'children' in t;

/** The redlines between two boxes, the way Figma shows them when you hold Alt. */
export function redlines(a: Box, b: Box): Redline[] {
    const out: Redline[] = [];
    const contains = (o: Box, i: Box) => i.x0 >= o.x0 && i.x1 <= o.x1 && i.y0 >= o.y0 && i.y1 <= o.y1;
    const overlapX = a.x0 < b.x1 && b.x0 < a.x1;
    const overlapY = a.y0 < b.y1 && b.y0 < a.y1;
    const cy = (a.y0 + a.y1) / 2;
    const cx = (a.x0 + a.x1) / 2;

    if (overlapX && overlapY) {
        // one inside the other, or crossing: distances between matching edges
        const inner = contains(b, a) ? a : contains(a, b) ? b : a;
        const outer = inner === a ? b : a;
        const my = (Math.max(a.y0, b.y0) + Math.min(a.y1, b.y1)) / 2;
        const mx = (Math.max(a.x0, b.x0) + Math.min(a.x1, b.x1)) / 2;
        const push = (x0: number, y0: number, x1: number, y1: number) => {
            const v = Math.hypot(x1 - x0, y1 - y0);

            if (v > 1e-6) out.push({ x0, y0, x1, y1, value: v, guides: [] });
        };

        push(Math.min(inner.x0, outer.x0), my, Math.max(inner.x0, outer.x0), my);
        push(Math.min(inner.x1, outer.x1), my, Math.max(inner.x1, outer.x1), my);
        push(mx, Math.min(inner.y0, outer.y0), mx, Math.max(inner.y0, outer.y0));
        push(mx, Math.min(inner.y1, outer.y1), mx, Math.max(inner.y1, outer.y1));

        return out;
    }

    // side by side: the horizontal gap, along the shared band or level with a's middle
    if (a.x1 <= b.x0 || b.x1 <= a.x0) {
        const [x0, x1] = a.x1 <= b.x0 ? [a.x1, b.x0] : [b.x1, a.x0];
        const y = overlapY ? (Math.max(a.y0, b.y0) + Math.min(a.y1, b.y1)) / 2 : cy;
        const guides: Redline['guides'] = [];

        // the gap runs past b: a dashed guide shows where b's edge would be
        if (!overlapY) {
            const ex = a.x1 <= b.x0 ? b.x0 : b.x1;

            guides.push([ex, y, ex, y < b.y0 ? b.y0 : b.y1]);
        }
        out.push({ x0, y0: y, x1, y1: y, value: x1 - x0, guides });
    }
    if (a.y1 <= b.y0 || b.y1 <= a.y0) {
        const [y0, y1] = a.y1 <= b.y0 ? [a.y1, b.y0] : [b.y1, a.y0];
        const x = overlapX ? (Math.max(a.x0, b.x0) + Math.min(a.x1, b.x1)) / 2 : cx;
        const guides: Redline['guides'] = [];

        if (!overlapX) {
            const ey = a.y1 <= b.y0 ? b.y0 : b.y1;

            guides.push([x, ey, x < b.x0 ? b.x0 : b.x1, ey]);
        }
        out.push({ x0: x, y0, x1: x, y1, value: y1 - y0, guides });
    }

    return out;
}

/** A label: a rounded pill with text, pooled. */
class Tag extends Container {
    readonly bg = new SilkGraphics();
    readonly text: TextLabel;
    private _value = '';
    private _color = -1;

    constructor(fontSize: number, textColor: number, label?: LabelFactory) {
        super();
        const style = {
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize,
            fontWeight: '600',
            fill: textColor,
        } as const;

        this.text = label ? label(style) : new Text({ text: '', style, resolution: 3 });
        this.text.anchor.set(0.5);
        this.addChild(this.bg, this.text);
    }

    set(value: string, color: number): void {
        if (value === this._value && color === this._color) return;
        this._value = value;
        this._color = color;
        this.text.text = value;
        const h = this.text.height + 6;
        const w = Math.max(h, this.text.width + 10);

        this.bg
            .clear()
            .roundRect(-w / 2, -h / 2, w, h, 4, 0.6)
            .fill(color);
    }
}

/**
 * Distances and sizes for editors, drawn on an overlay.
 *
 * - {@link Measure.between} shows the redlines from one object to another, like holding Alt in
 *   Figma. Neighbours get the gap between them, with a dashed guide when they don't line up. An
 *   object inside another gets its margins.
 * - {@link Measure.size} puts a `W x H` badge under an object.
 *
 * Values are in the measured space (the world under a camera), so zooming never changes them.
 * Lines and labels keep their size on screen. Both follow their objects every frame while shown,
 * and grow in when the pair changes.
 */
export class Measure extends Container {
    private readonly _opts: MeasureOptions;
    private readonly _g = new SilkGraphics();
    private readonly _tags = new Container();
    private readonly _pool: Tag[] = [];
    private readonly _driver: Driver;
    private readonly _color: number;
    private readonly _sizeColor: number;
    private readonly _textColor: number;
    private readonly _grow = new Spring(0, 260, 22);
    private readonly _badge = new Spring(0, 320, 20);
    private _a: MeasureTarget | null = null;
    private _b: MeasureTarget | null = null;
    private _sized: MeasureTarget | null = null;
    private _lastLines: Redline[] = [];

    constructor(options: MeasureOptions = {}) {
        super({ label: 'Measure' });
        this._opts = options;
        this._color = hex(options.color ?? 0xf24822);
        this._sizeColor = hex(options.sizeColor ?? 0x0a84ff);
        this._textColor = hex(options.textColor ?? 0xffffff);
        this.eventMode = 'none';
        this.addChild(this._g, this._tags);
        this._driver = new Driver((dt) => this._step(dt), options.ticker);
    }

    /** The redlines drawn now, in the measured space. */
    get lines(): readonly { x0: number; y0: number; x1: number; y1: number; value: number }[] {
        return this._lastLines;
    }

    /** Shows the distances from `a` to `b`. `null` for either hides them. */
    between(a: MeasureTarget | null, b: MeasureTarget | null): this {
        if (a === this._a && b === this._b) return this;
        const was = this._a !== null && this._b !== null;

        this._a = a;
        this._b = b;
        if (a && b) {
            // a new pair grows in from the middle of each line
            if (!was) this._grow.value = 0;
            else this._grow.value = Math.min(this._grow.value, 0.35);
            this._grow.target = 1;
        } else this._grow.target = 0;
        this._driver.wake();

        return this;
    }

    /** Shows a `W x H` badge under `target` (`null` hides it). */
    size(target: MeasureTarget | null): this {
        if (target === this._sized) return this;
        if (target && !this._sized) this._badge.value = 0;
        this._sized = target ?? this._sized;
        this._badge.target = target ? 1 : 0;
        if (!target) this._fadingSize = true;
        else this._fadingSize = false;
        this._driver.wake();

        return this;
    }

    private _fadingSize = false;

    /** Hides everything. */
    clear(): this {
        return this.between(null, null).size(null);
    }

    /** Advances by `dt` seconds (only needed with `ticker: null`). */
    tick(dt: number): boolean {
        return this._driver.tick(dt);
    }

    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        this._driver.sleep();
        super.destroy(options);
    }

    // ------------------------------------------------------------------------------- internals

    private get _space(): Container {
        return this._opts.space ?? this.parent ?? this;
    }

    /** A target's axis-aligned box in the measured space. */
    private _box(t: MeasureTarget): Box | null {
        if (!isContainer(t)) return { x0: t.x, y0: t.y, x1: t.x + t.width, y1: t.y + t.height };
        if (t.destroyed || !t.parent) return null;
        const b = t.getLocalBounds();
        const space = this._space;
        let x0 = Infinity;
        let y0 = Infinity;
        let x1 = -Infinity;
        let y1 = -Infinity;

        for (const [x, y] of [
            [b.minX, b.minY],
            [b.maxX, b.minY],
            [b.maxX, b.maxY],
            [b.minX, b.maxY],
        ]) {
            const p = space.toLocal(t.toGlobal({ x, y }));

            x0 = Math.min(x0, p.x);
            y0 = Math.min(y0, p.y);
            x1 = Math.max(x1, p.x);
            y1 = Math.max(y1, p.y);
        }

        return { x0, y0, x1, y1 };
    }

    /** A point of the measured space in this overlay's coordinates. */
    private _map(x: number, y: number): PointData {
        const space = this._space;

        return space === this ? { x, y } : this.toLocal(space.toGlobal({ x, y }));
    }

    private _tag(i: number): Tag {
        let tag = this._pool[i];

        if (!tag) {
            tag = new Tag(this._opts.fontSize ?? 11, this._textColor, this._opts.label);
            this._pool.push(tag);
            this._tags.addChild(tag);
        }
        tag.visible = true;

        return tag;
    }

    private _step(dt: number): boolean {
        this._grow.step(dt);
        this._badge.step(dt);
        const g = this._g.clear();
        const fmt = this._opts.format ?? defaultFormat;
        const red = this._color;
        let used = 0;

        // redlines
        const a = this._a ? this._box(this._a) : null;
        const b = this._b ? this._box(this._b) : null;
        const t = Math.max(0, Math.min(1, this._grow.value));
        const lines = a && b ? redlines(a, b) : [];

        this._lastLines = lines;
        if (t > 0.002 && b && (this._opts.outline ?? true)) {
            const p0 = this._map(b.x0, b.y0);
            const p1 = this._map(b.x1, b.y1);

            g.rect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y).stroke({ width: 1, color: red, alpha: t });
        }
        for (const line of lines) {
            if (t <= 0.002) break;
            const p = this._map(line.x0, line.y0);
            const q = this._map(line.x1, line.y1);
            const mx = (p.x + q.x) / 2;
            const my = (p.y + q.y) / 2;
            const hx = ((q.x - p.x) / 2) * t;
            const hy = ((q.y - p.y) / 2) * t;
            const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
            const nx = (-(q.y - p.y) / len) * 4;
            const ny = ((q.x - p.x) / len) * 4;

            for (const [gx0, gy0, gx1, gy1] of line.guides) {
                const u = this._map(gx0, gy0);
                const v = this._map(gx1, gy1);

                g.moveTo(u.x, u.y)
                    .lineTo(v.x, v.y)
                    .stroke({ width: 1, color: red, alpha: 0.8 * t, dash: [3, 3] });
            }
            g.moveTo(mx - hx, my - hy)
                .lineTo(mx + hx, my + hy)
                .stroke({ width: 1, color: red, alpha: t });
            // end ticks once the line has grown out
            if (t > 0.6) {
                const k = (t - 0.6) / 0.4;

                g.moveTo(p.x - nx * k, p.y - ny * k)
                    .lineTo(p.x + nx * k, p.y + ny * k)
                    .moveTo(q.x - nx * k, q.y - ny * k)
                    .lineTo(q.x + nx * k, q.y + ny * k)
                    .stroke({ width: 1, color: red, alpha: t });
            }
            const tag = this._tag(used++);

            tag.set(fmt(line.value), red);
            // short lines put their label beside the line instead of on it
            const room = len > tag.width + 8;
            const vertical = Math.abs(q.y - p.y) > Math.abs(q.x - p.x);

            tag.position.set(
                mx + (room || !vertical ? 0 : tag.width / 2 + 6),
                my + (room || vertical ? 0 : tag.height / 2 + 6),
            );
            tag.alpha = t;
            tag.scale.set(0.7 + 0.3 * t);
        }

        // size badge
        const s = this._sized ? this._box(this._sized) : null;
        const k = Math.max(0, this._badge.value);

        if (s && k > 0.002) {
            const p = this._map((s.x0 + s.x1) / 2, s.y1);
            const tag = this._tag(used++);

            tag.set(`${fmt(s.x1 - s.x0)} × ${fmt(s.y1 - s.y0)}`, this._sizeColor); // prose-ignore
            tag.position.set(p.x, p.y + 8 + tag.height / 2 + (1 - Math.min(1, k)) * -6);
            tag.alpha = Math.min(1, k);
            tag.scale.set(0.8 + 0.2 * Math.min(1, k));
        } else if (this._fadingSize && k <= 0.002) this._sized = null;

        for (let i = used; i < this._pool.length; i++) this._pool[i].visible = false;

        const settling =
            Math.abs(this._grow.value - this._grow.target) > 0.002 ||
            Math.abs(this._grow.velocity) > 0.01 ||
            Math.abs(this._badge.value - this._badge.target) > 0.002 ||
            Math.abs(this._badge.velocity) > 0.01;
        // keep following live objects while anything shows
        const following = (this._a !== null && this._b !== null) || (this._sized !== null && this._badge.target > 0);

        if (!settling && !following) {
            g.clear();
            for (const tag of this._pool) tag.visible = false;
        }

        return settling || following;
    }
}
