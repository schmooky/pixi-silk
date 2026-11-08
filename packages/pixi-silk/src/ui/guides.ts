import { type ColorSource, Container, type FederatedPointerEvent, type PointData, type Ticker } from 'pixi.js';
import { damp } from '../motion';
import { SilkGraphics } from '../SilkGraphics';
import { type Signal, signal } from '../signal';
import type { Camera } from './camera';
import { Driver } from './driver';
import { type InputKind, type InputProfiles, inputKind, inputProfile } from './input';
import { modDown } from './keys';
import { hex } from './paint';
import type { Ruler } from './ruler';
import type { SnapEngine } from './snap';
import { ValuePill } from './ValuePill';

/** A guide line. `axis: 'x'` is a vertical line at x = `at`, `'y'` a horizontal one, in world units. */
export interface Guide {
    id: number;
    axis: 'x' | 'y';
    at: number;
}

/** A guide being dragged: where it is now, and whether letting go here removes it. */
export interface GuideDrag {
    guide: Guide;
    /** True while the pointer is over the ruler: letting go removes the guide. */
    removing: boolean;
    /** True when the guide came out of the ruler in this drag. */
    created: boolean;
}

/** Snaps a guide while it is dragged: returns where a guide at `at` (world units) should go. */
export type GuideSnap = (axis: 'x' | 'y', at: number, threshold: number) => number;

/** Options of {@link Guides}. */
export interface GuidesOptions {
    /** The camera the guides follow. */
    camera: Camera;
    /** Drag new guides out of this ruler, and drop guides on it to remove them. */
    ruler?: Ruler;
    /** Line colour. Default pink. */
    color?: ColorSource;
    /**
     * Snapping while dragging: a {@link SnapEngine} (edges and centres of its targets, its points
     * and lines) or your own function. Ctrl or Cmd turns it off for a drag.
     */
    snap?: SnapEngine | GuideSnap;
    /** Snap distance, screen pixels. Default 6. */
    snapThreshold?: number;
    /** Round guides to this world step while dragging (after snapping misses). Default 1. 0 turns it off. */
    round?: number;
    /** Turns a guide position into the pill text. Default whole numbers. */
    format?: (value: number) => string;
    /** Guides to start with. */
    guides?: readonly Omit<Guide, 'id'>[];
    profiles?: InputProfiles;
    ticker?: Ticker | null;
    /** Called when a drag adds, moves or removes a guide. */
    onChange?: (guides: readonly Guide[]) => void;
}

/** The reactive state of a {@link Guides} layer. */
export interface GuidesState {
    /** Every guide, in the order they were added. Changes when a drag ends or a method edits them. */
    guides: Signal<readonly Guide[]>;
    /** The guide being dragged, or null. Updates on every move. */
    dragging: Signal<GuideDrag | null>;
    /** Id of the guide under the pointer, or null. */
    hover: Signal<number | null>;
}

interface Look {
    fade: number;
    hot: number;
    gone: boolean;
    guide: Guide;
}

interface Drag {
    pointerId: number;
    guide: Guide;
    start: number;
    created: boolean;
    removing: boolean;
    pointer: PointData;
}

/** The value of `candidates` within `threshold` of `v` that is nearest, or `v`. */
export function snapValue(v: number, candidates: readonly number[], threshold: number): number {
    let best = v;
    let d = threshold;

    for (const c of candidates) {
        const e = Math.abs(c - v);

        if (e <= d) {
            d = e;
            best = c;
        }
    }

    return best;
}

/**
 * Guide lines over a {@link Camera}'s world, the way design tools do them.
 *
 * - Drag a guide out of a {@link Ruler}: the top ruler gives a horizontal one, the left a vertical one.
 * - Drag a guide to move it, drop it back on the ruler to remove it.
 * - A pill shows the position while dragging. Guides snap to a {@link SnapEngine}'s objects.
 * - {@link Guides.bindSnap} feeds the guides to a snap engine, so objects snap to them.
 *
 * Works with mouse, pen and touch. Put it in screen space above the world, under the ruler.
 */
export class Guides extends Container {
    readonly state: GuidesState = {
        guides: signal<readonly Guide[]>([]),
        dragging: signal<GuideDrag | null>(null),
        hover: signal<number | null>(null),
    };

    private readonly _opts: GuidesOptions;
    private readonly _camera: Camera;
    private readonly _g = new SilkGraphics({ label: 'Guides' });
    private readonly _pill: ValuePill;
    private readonly _driver: Driver;
    private readonly _color: number;
    private readonly _looks = new Map<number, Look>();
    private readonly _off: (() => void)[] = [];
    private _drag: Drag | null = null;
    private _kind: InputKind = 'mouse';
    private _next = 1;

    constructor(options: GuidesOptions) {
        super({ label: 'Guides' });
        this._opts = options;
        this._camera = options.camera;
        this._color = hex(options.color ?? 0xff375f);
        this._pill = new ValuePill({ fill: this._color, color: 0xffffff, fontSize: 11, height: 18 });
        this.addChild(this._g, this._pill);
        this._driver = new Driver((dt) => this._step(dt), options.ticker);
        this.eventMode = 'static';
        // only the lines catch the pointer: everything else reaches the scene
        this.hitArea = { contains: (x: number, y: number) => this.pick({ x, y }) !== null };
        this.on('pointerdown', (e) => this._down(e));
        this.on('globalpointermove', (e) => this._move(e));
        this.on('pointerup', (e) => this._up(e));
        this.on('pointerupoutside', (e) => this._up(e));
        this.on('pointerout', () => {
            if (!this._drag) this.state.hover.set(null);
        });
        const ruler = options.ruler;

        if (ruler) {
            const down = (e: FederatedPointerEvent) => this._fromRuler(e);
            const up = (e: FederatedPointerEvent) => this._up(e);

            ruler.on('pointerdown', down);
            ruler.on('pointerup', up);
            ruler.on('pointerupoutside', up);
            this._off.push(() => {
                ruler.off('pointerdown', down);
                ruler.off('pointerup', up);
                ruler.off('pointerupoutside', up);
            });
        }
        const wake = () => this._driver.wake();
        const cam = options.camera.state;

        for (const s of [cam.zoom, cam.x, cam.y, cam.width, cam.height, this.state.hover])
            this._off.push(s.subscribe(wake));
        for (const g of options.guides ?? []) this.add(g.axis, g.at);
    }

    /** Every guide now. */
    get guides(): readonly Guide[] {
        return this.state.guides.value;
    }

    /** Adds a guide: `x` is a vertical line at x = `at`, `y` a horizontal one. */
    add(axis: 'x' | 'y', at: number): Guide {
        const guide = { id: this._next++, axis, at };

        this._looks.set(guide.id, { fade: 0, hot: 0, gone: false, guide });
        this.state.guides.set([...this.state.guides.value, guide]);
        this._driver.wake();

        return guide;
    }

    /** Moves a guide. */
    move(id: number, at: number): this {
        const list = this.state.guides.value;

        if (!list.some((g) => g.id === id)) return this;
        this.state.guides.set(list.map((g) => (g.id === id ? { ...g, at } : g)));
        const look = this._looks.get(id);

        if (look) look.guide = { ...look.guide, at };
        this._driver.wake();

        return this;
    }

    /** Removes a guide. It fades out. */
    remove(id: number): this {
        const list = this.state.guides.value;

        if (!list.some((g) => g.id === id)) return this;
        this.state.guides.set(list.filter((g) => g.id !== id));
        const look = this._looks.get(id);

        if (look) look.gone = true;
        this._driver.wake();

        return this;
    }

    /** Removes every guide. */
    clear(): this {
        for (const g of this.state.guides.value) this.remove(g.id);

        return this;
    }

    /** Guide positions in the shape {@link SnapEngine} takes for `lines`. */
    lines(): { x: number[]; y: number[] } {
        const list = this.state.guides.value;

        return {
            x: list.filter((g) => g.axis === 'x').map((g) => g.at),
            y: list.filter((g) => g.axis === 'y').map((g) => g.at),
        };
    }

    /** Keeps `engine.lines` equal to the guides, so objects snap to them. Returns the unbind function. */
    bindSnap(engine: SnapEngine): () => void {
        const sync = () => {
            engine.lines = this.lines();
        };

        sync();
        const off = this.state.guides.subscribe(sync);

        this._off.push(off);

        return off;
    }

    /** The guide near a screen point, or null. */
    pick(p: PointData): Guide | null {
        const tol = 3 + inputProfile(this._kind, this._opts.profiles).slop * 0.6;
        const ruler = this._opts.ruler;

        if (ruler?.side(p)) return null;
        let best: Guide | null = null;
        let d = tol;

        for (const g of this.state.guides.value) {
            const at = this._screen(g);
            const e = Math.abs((g.axis === 'x' ? p.x : p.y) - at);

            if (e <= d) {
                d = e;
                best = g;
            }
        }

        return best;
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

    private _screen(g: Guide): number {
        const cam = this._camera;

        return g.axis === 'x' ? g.at * cam.zoom + cam.state.x.value : g.at * cam.zoom + cam.state.y.value;
    }

    private _local(e: { global: PointData }): PointData {
        return this.toLocal(e.global);
    }

    private _down(e: FederatedPointerEvent): void {
        if (this._drag || e.button > 0) return;
        this._kind = inputKind(e);
        const p = this._local(e);
        const guide = this.pick(p);

        if (!guide) return;
        e.stopPropagation();
        this._begin(e, { ...guide }, false, p);
    }

    private _fromRuler(e: FederatedPointerEvent): void {
        const ruler = this._opts.ruler;

        if (this._drag || !ruler || e.button > 0) return;
        this._kind = inputKind(e);
        const p = this._local(e);
        const side = ruler.side(ruler.toLocal(e.global));

        if (side !== 'top' && side !== 'left') return;
        e.stopPropagation();
        const axis = side === 'top' ? 'y' : 'x';
        const w = this._camera.screenToWorld(p);
        const guide: Guide = { id: this._next++, axis, at: axis === 'x' ? w.x : w.y };

        this._looks.set(guide.id, { fade: 0, hot: 1, gone: false, guide });
        this._begin(e, guide, true, p);
    }

    private _begin(e: FederatedPointerEvent, guide: Guide, created: boolean, p: PointData): void {
        this._drag = { pointerId: e.pointerId, guide, start: guide.at, created, removing: created, pointer: p };
        this.state.hover.set(guide.id);
        this._publish();
        this._driver.wake();
    }

    private _publish(): void {
        const d = this._drag;

        this.state.dragging.set(d ? { guide: { ...d.guide }, removing: d.removing, created: d.created } : null);
    }

    private _move(e: FederatedPointerEvent): void {
        const p = this._local(e);
        const drag = this._drag;

        if (!drag) {
            if (inputKind(e) === 'touch') return;
            this._kind = inputKind(e);
            const g = this.pick(p);

            this.state.hover.set(g?.id ?? null);
            this.cursor = g ? (g.axis === 'x' ? 'col-resize' : 'row-resize') : 'default';

            return;
        }
        if (e.pointerId !== drag.pointerId) return;
        const w = this._camera.screenToWorld(p);
        const raw = drag.guide.axis === 'x' ? w.x : w.y;

        drag.pointer = p;
        drag.guide.at = this._snap(drag, raw);
        drag.removing = !!this._opts.ruler?.side(p);
        const look = this._looks.get(drag.guide.id);

        if (look) look.guide = { ...drag.guide };
        this._publish();
        this._driver.wake();
    }

    private _snap(drag: Drag, v: number): number {
        const snap = this._opts.snap;
        const threshold = (this._opts.snapThreshold ?? 6) / this._camera.zoom;
        const axis = drag.guide.axis;
        let out = v;

        if (snap && !modDown()) {
            if (typeof snap === 'function') out = snap(axis, v, threshold);
            else {
                const values: number[] = [];

                for (const r of snap.targets) {
                    const lo = axis === 'x' ? r.x : r.y;
                    const size = axis === 'x' ? r.width : r.height;

                    if (snap.edges) values.push(lo, lo + size);
                    if (snap.centres) values.push(lo + size / 2);
                }
                for (const pt of snap.points) values.push(axis === 'x' ? pt.x : pt.y);
                // other guides, but not this one where it started
                const lines = [...snap.lines[axis]];
                const own = drag.created ? -1 : lines.indexOf(drag.start);

                if (own >= 0) lines.splice(own, 1);
                values.push(...lines);
                out = snapValue(v, values, threshold);
            }
        }
        const round = this._opts.round ?? 1;

        if (out === v && round > 0) out = Math.round(v / round) * round;

        return out;
    }

    private _up(e: FederatedPointerEvent): void {
        const drag = this._drag;

        if (!drag || e.pointerId !== drag.pointerId) return;
        this._drag = null;
        const look = this._looks.get(drag.guide.id);

        if (drag.removing) {
            if (drag.created) {
                if (look) look.gone = true;
            } else this.remove(drag.guide.id);
        } else if (drag.created) {
            this.state.guides.set([...this.state.guides.value, { ...drag.guide }]);
        } else this.move(drag.guide.id, drag.guide.at);
        this._publish();
        this.state.hover.set(null);
        this._opts.onChange?.(this.state.guides.value);
        this._driver.wake();
    }

    private _step(dt: number): boolean {
        const g = this._g.clear();
        const cam = this._camera;
        const view = cam.view;
        const W = view.width * cam.zoom;
        const H = view.height * cam.zoom;
        const inset = this._opts.ruler?.size ?? 0;
        const drag = this._drag;
        const hover = this.state.hover.value;
        let busy = false;

        for (const [id, look] of this._looks) {
            const dragged = drag?.guide.id === id;
            const fadeTo = look.gone ? 0 : dragged && drag.removing ? 0.35 : 1;
            const hotTo = dragged || hover === id ? 1 : 0;

            look.fade = damp(look.fade, fadeTo, look.gone ? 18 : 24, dt);
            look.hot = damp(look.hot, hotTo, 22, dt);
            if (Math.abs(look.fade - fadeTo) < 0.004) look.fade = fadeTo;
            else busy = true;
            if (Math.abs(look.hot - hotTo) < 0.004) look.hot = hotTo;
            else busy = true;
            if (look.gone && look.fade === 0) {
                this._looks.delete(id);
                continue;
            }
            const at = this._screen(look.guide);
            const width = 1 + look.hot;
            const style = { width, color: this._color, alpha: look.fade };

            if (look.guide.axis === 'x') {
                if (at >= inset - 2 && at <= W + 2) g.moveTo(at, inset).lineTo(at, H).stroke(style);
            } else if (at >= inset - 2 && at <= H + 2) g.moveTo(inset, at).lineTo(W, at).stroke(style);
        }
        // the pill follows the pointer along the dragged guide
        if (drag && !drag.removing) {
            const at = this._screen(drag.guide);
            const fmt = this._opts.format ?? ((v: number) => String(Math.round(v * 100) / 100));

            this._pill.show(fmt(drag.guide.at));
            if (drag.guide.axis === 'x') this._pill.position.set(at, drag.pointer.y + 30);
            else this._pill.position.set(drag.pointer.x + 48, at);
        } else this._pill.hide();
        if (this._pill.update(dt)) busy = true;
        if (drag) busy = true;

        return busy;
    }
}
