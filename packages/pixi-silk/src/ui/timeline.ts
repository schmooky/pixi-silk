import {
    BitmapText,
    Container,
    type FederatedPointerEvent,
    type FederatedWheelEvent,
    type TextStyleOptions,
    type Ticker,
} from 'pixi.js';
import { damp } from '../motion';
import { SilkGraphics } from '../SilkGraphics';
import { type Signal, signal } from '../signal';
import { clamp, rubberBand, snapTo } from './arc';
import { Driver } from './driver';
import { type InputProfiles, inputKind, inputProfile } from './input';
import { shiftDown } from './keys';
import { hex, mix } from './paint';

/** One key on a {@link MiniTimeline}. */
export interface TimelineKey {
    /** Unique id. Selection and `onKeysChange` refer to keys by it. */
    id: string;
    /** Time in frames. */
    time: number;
    /** Colour of the dot. Default: the theme's key colour. */
    color?: number | string;
}

/** Colours of a {@link MiniTimeline} (any Pixi colour). */
export interface TimelineTheme {
    /** Track background. */
    background: number | string;
    /** Ruler strip along the top. */
    ruler: number | string;
    /** Ruler ticks and the track's centre line. */
    tick: number | string;
    /** Key dots without their own `color`. */
    key: number | string;
    /** Selected keys and the selection box. */
    selected: number | string;
    /** Playhead line and handle. */
    playhead: number | string;
    /** Loop range bar and its handles. */
    loop: number | string;
    /** Frame numbers on the ruler. */
    text: number | string;
}

/** Dark default theme of {@link MiniTimeline}. Override single colours with the `theme` option. */
export const TIMELINE_THEME: Readonly<TimelineTheme> = {
    background: 0x1c1c1e,
    ruler: 0x2c2c2e,
    tick: 0x8e8e93,
    key: 0xe5e5ea,
    selected: 0xffd60a,
    playhead: 0x0a84ff,
    loop: 0x30d158,
    text: 0x8e8e93,
};

/** The reactive state of a {@link MiniTimeline}. */
export interface TimelineState {
    /** Playhead time in frames, 0 to `duration`. Writing it moves the playhead. */
    time: Signal<number>;
    /** Writing it starts or stops playback. */
    playing: Signal<boolean>;
    /** Ids of the selected keys. */
    selection: Signal<readonly string[]>;
    /** Loop range in frames, or null to play the whole track. */
    range: Signal<readonly [number, number] | null>;
    /** Visible window `[start, end]` in frames. Zoom and pan write it. The drawn view glides after it. */
    view: Signal<readonly [number, number]>;
}

/** Options of {@link MiniTimeline}. */
export interface MiniTimelineOptions {
    /** Width in local units. Default 440. */
    width?: number;
    /** Height in local units, ruler included. Default 64. */
    height?: number;
    /** Length in frames. Default 120. */
    duration?: number;
    /** Playback speed in frames per second. Default 30. */
    fps?: number;
    /** Starting keys. They are copied. Default none. */
    keys?: TimelineKey[];
    /** Snap keys and the playhead to multiples of this many frames. 0 for none. Default 1. */
    snap?: number;
    /** Loop range in frames. Default none: playback loops over the whole track. */
    loop?: [number, number];
    /** Start playing. Default false. */
    playing?: boolean;
    /** How far the playhead stretches past either end while scrubbing, in pixels. Default 28. */
    rubber?: number;
    /** Fewest frames the view can zoom in to. Default 8. */
    minSpan?: number;
    /** Frame numbers on the ruler. Default true. */
    labels?: boolean;
    /** Style of the frame numbers. */
    textStyle?: TextStyleOptions;
    /** Colours that replace parts of {@link TIMELINE_THEME}. */
    theme?: Partial<TimelineTheme>;
    /** Per pointer kind overrides of `slop`, the movement a tap may have. */
    profiles?: InputProfiles;
    /** Ticker driving playback and animation. Default `Ticker.shared`. `null` for manual {@link MiniTimeline.tick}. */
    ticker?: Ticker | null;
    /** The playhead moved because of the user. Writes to `state.time` and playback do not call it. */
    onScrub?: (time: number) => void;
    /** Keys were dragged. Called once on release with a copy of every key. {@link MiniTimeline.setKeys} does not call it. */
    onKeysChange?: (keys: TimelineKey[]) => void;
}

type Drag = 'scrub' | 'loopStart' | 'loopEnd' | 'keys' | 'marquee';

const RULER = 18;

/**
 * A compact animation timeline: a ruler you scrub, key dots you select and drag, a loop range and
 * a playhead. Scrubbing past either end stretches like a rubber band. Keys snap to frames.
 * Shift adds to the selection, and a drag on empty track draws a selection box. The wheel zooms
 * around the pointer (sideways or with Shift it pans). A double tap on the ruler zooms in or back out.
 * The top-left corner is at (0, 0). Keys are points in time: there are no curves or values.
 *
 * Experimental: the API may change in a minor release.
 *
 * @experimental
 */
export class MiniTimeline extends Container {
    /** Playhead, playback, selection, loop range and view. Write to them to drive the timeline. */
    readonly state: TimelineState;

    private readonly _opts: MiniTimelineOptions;
    private readonly _w: number;
    private readonly _h: number;
    private readonly _duration: number;
    private readonly _theme: Record<keyof TimelineTheme, number>;
    private readonly _g = new SilkGraphics();
    private readonly _labels = new Container();
    private readonly _driver: Driver;
    private _keys: TimelineKey[];
    private _viewShown: [number, number];
    private _drag: Drag | null = null;
    private _pressId = -1;
    private _pressX = 0;
    private _pressY = 0;
    private _moved = false;
    private _slop = 4;
    private _lastX = 0;
    private _headOver = 0;
    private _dragFrom = new Map<string, number>();
    private _marqueeBase: string[] = [];
    private _hoverKey: string | null = null;
    private _lastRulerTap = 0;
    private _dirty = true;
    private _pool: BitmapText[] = [];

    constructor(options: MiniTimelineOptions = {}) {
        super({ label: 'MiniTimeline' });
        this._opts = options;
        this._w = options.width ?? 440;
        this._h = options.height ?? 64;
        this._duration = Math.max(1, options.duration ?? 120);
        this._theme = Object.fromEntries(
            Object.entries({ ...TIMELINE_THEME, ...options.theme }).map(([k, v]) => [k, hex(v)]),
        ) as Record<keyof TimelineTheme, number>;
        this._keys = (options.keys ?? []).map((k) => ({ ...k }));
        this.state = {
            time: signal(0),
            playing: signal(options.playing ?? false),
            selection: signal<readonly string[]>([]),
            range: signal<readonly [number, number] | null>(options.loop ? [...options.loop] : null),
            view: signal<readonly [number, number]>([0, this._duration]),
        };
        this._viewShown = [0, this._duration];
        this._driver = new Driver((dt) => this._step(dt), options.ticker);
        const s = this.state;

        for (const sig of [s.time, s.playing, s.selection, s.range, s.view] as Signal<unknown>[]) {
            sig.subscribe(() => {
                this._dirty = true;
                this._driver.wake();
            });
        }
        this.addChild(this._g, this._labels);
        this.hitArea = {
            contains: (x: number, y: number) => x >= -6 && x <= this._w + 6 && y >= -4 && y <= this._h + 4,
        };
        this.eventMode = 'static';
        this.on('pointerdown', this._onDown, this);
        this.on('globalpointermove', this._onMove, this);
        this.on('pointerup', this._onUp, this);
        this.on('pointerupoutside', this._onUp, this);
        this.on('wheel', this._onWheel, this);
        this._driver.wake();
    }

    /** A copy of the keys. Changing it does not change the timeline: use {@link MiniTimeline.setKeys}. */
    get keys(): TimelineKey[] {
        return this._keys.map((k) => ({ ...k }));
    }

    /** Replaces the keys with copies. Selected ids that no longer exist leave the selection. */
    setKeys(keys: TimelineKey[]): void {
        this._keys = keys.map((k) => ({ ...k }));
        const ids = new Set(this._keys.map((k) => k.id));

        this.state.selection.set(this.state.selection.value.filter((id) => ids.has(id)));
        this._dirty = true;
        this._driver.wake();
    }

    /** Starts or stops playback. */
    toggle(): void {
        this.state.playing.update((p) => !p);
    }

    /**
     * Zooms the view by `factor` (above 1 zooms in) around `aroundTime` (default the playhead).
     * The span stays between `minSpan` and the whole track.
     */
    zoomBy(factor: number, aroundTime: number = this.state.time.value): void {
        const [a, b] = this.state.view.value;
        const span = clamp((b - a) / factor, this._opts.minSpan ?? 8, this._duration);
        const f = (aroundTime - a) / (b - a || 1);
        let start = aroundTime - f * span;

        start = clamp(start, 0, this._duration - span);
        this.state.view.set([start, start + span]);
    }

    /** Shifts the view by `frames`, kept inside the track. */
    panBy(frames: number): void {
        const [a, b] = this.state.view.value;
        const span = b - a;
        const start = clamp(a + frames, 0, this._duration - span);

        this.state.view.set([start, start + span]);
    }

    /** Shows the whole track. */
    showAll(): void {
        this.state.view.set([0, this._duration]);
    }

    /** Frame under a local x (in the target view, not the animated one). */
    timeAt(x: number): number {
        const [a, b] = this.state.view.value;

        return a + (x / this._w) * (b - a);
    }

    /** Local x of a frame in the target view. */
    xAt(time: number): number {
        const [a, b] = this.state.view.value;

        return ((time - a) / (b - a || 1)) * this._w;
    }

    /** Advances playback and animation by `dt` seconds (only needed with `ticker: null`). Returns true while moving. */
    tick(dt: number): boolean {
        return this._driver.tick(dt);
    }

    /** Stops the animation. Destroys children unless `options` says otherwise. */
    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        this._driver.sleep();
        super.destroy(options ?? { children: true });
    }

    // ------------------------------------------------------------------------------ input

    private _snap(t: number): number {
        return snapTo(t, this._opts.snap ?? 1);
    }

    private _keyAt(x: number): TimelineKey | null {
        let best: TimelineKey | null = null;
        let bestD = 9;

        for (const k of this._keys) {
            const d = Math.abs(this.xAt(k.time) - x);

            if (d < bestD) {
                bestD = d;
                best = k;
            }
        }

        return best;
    }

    /** Presses at a local point, as the pointer does. `shift` adds to the selection. */
    pressAt(x: number, y: number, shift = false): void {
        this._pressX = x;
        this._pressY = y;
        this._moved = false;
        this._lastX = x;
        const range = this.state.range.value;

        if (y < RULER + 2) {
            if (range && Math.abs(x - this.xAt(range[0])) <= 7) this._drag = 'loopStart';
            else if (range && Math.abs(x - this.xAt(range[1])) <= 7) this._drag = 'loopEnd';
            else {
                this._drag = 'scrub';
                this._scrubTo(x);
            }

            return;
        }
        const key = this._keyAt(x);
        const sel = this.state.selection.value;

        if (key) {
            if (shift) {
                this.state.selection.set(sel.includes(key.id) ? sel.filter((id) => id !== key.id) : [...sel, key.id]);
            } else if (!sel.includes(key.id)) {
                this.state.selection.set([key.id]);
            }
            this._drag = 'keys';
            this._dragFrom = new Map(
                this._keys.filter((k) => this.state.selection.value.includes(k.id)).map((k) => [k.id, k.time]),
            );

            return;
        }
        this._drag = 'marquee';
        this._marqueeBase = shift ? [...sel] : [];
        if (!shift) this.state.selection.set([]);
    }

    /** Drags to a local point, as the pointer does. */
    dragTo(x: number, _y = 0): void {
        this._lastX = x;
        if (!this._moved && Math.abs(x - this._pressX) > this._slop) this._moved = true;
        const range = this.state.range.value;

        switch (this._drag) {
            case 'scrub':
                this._scrubTo(x);
                break;
            case 'loopStart':
            case 'loopEnd': {
                if (!range) break;
                const t = this._snap(clamp(this.timeAt(x), 0, this._duration));
                const minLen = Math.max(1, this._opts.snap ?? 1);
                const next: [number, number] =
                    this._drag === 'loopStart'
                        ? [Math.min(t, range[1] - minLen), range[1]]
                        : [range[0], Math.max(t, range[0] + minLen)];

                this.state.range.set(next);
                break;
            }
            case 'keys': {
                if (!this._moved) break;
                let delta = this._snap(this.timeAt(x) - this.timeAt(this._pressX));
                const times = [...this._dragFrom.values()];
                // the group stops at the ends of the track instead of squashing
                const lo = Math.min(...times);
                const hi = Math.max(...times);

                delta = clamp(delta, -lo, this._duration - hi);
                for (const k of this._keys) {
                    const from = this._dragFrom.get(k.id);

                    if (from !== undefined) k.time = from + delta;
                }
                this._dirty = true;
                break;
            }
            case 'marquee': {
                const x0 = Math.min(this._pressX, x);
                const x1 = Math.max(this._pressX, x);
                const inside = this._keys.filter((k) => {
                    const kx = this.xAt(k.time);

                    return kx >= x0 && kx <= x1;
                });

                this.state.selection.set([...new Set([...this._marqueeBase, ...inside.map((k) => k.id)])]);
                this._dirty = true;
                break;
            }
        }
        this._driver.wake();
    }

    /** Releases the press, as the pointer does. */
    release(): void {
        const drag = this._drag;

        this._drag = null;
        if (drag === 'keys' && this._moved) this._opts.onKeysChange?.(this.keys);
        if (drag === 'scrub' && !this._moved && this._pressY < RULER + 2) {
            const now = performance.now();

            if (now - this._lastRulerTap < 320) {
                // double tap: zoom in around the tap, or back out to the whole track
                const [a, b] = this.state.view.value;

                if (b - a < this._duration - 1e-6) this.showAll();
                else this.zoomBy(4, this.timeAt(this._pressX));
                this._lastRulerTap = 0;
            } else {
                this._lastRulerTap = now;
            }
        }
        this._dirty = true;
        this._driver.wake();
    }

    private _scrubTo(x: number): void {
        const t = this._snap(clamp(this.timeAt(x), 0, this._duration));
        const stretched = rubberBand(x, this.xAt(0), this.xAt(this._duration), this._opts.rubber ?? 28);

        this._headOver = stretched - this.xAt(t);
        if (Math.abs(stretched - x) < 1e-6 && x >= this.xAt(0) && x <= this.xAt(this._duration)) this._headOver = 0;
        if (t !== this.state.time.value) {
            this.state.time.set(t);
            this._opts.onScrub?.(t);
        }
        this._dirty = true;
    }

    private _onDown(e: FederatedPointerEvent): void {
        if (this._pressId >= 0) return;
        this._pressId = e.pointerId;
        this._slop = inputProfile(inputKind(e), this._opts.profiles).slop;
        const p = this.toLocal(e.global);

        this.pressAt(p.x, p.y, e.shiftKey || shiftDown());
    }

    private _onMove(e: FederatedPointerEvent): void {
        const p = this.toLocal(e.global);

        if (e.pointerId !== this._pressId) {
            if (this._pressId < 0 && inputKind(e) !== 'touch') {
                const over = p.y >= RULER + 2 && p.y <= this._h && p.x >= 0 && p.x <= this._w;
                const key = over ? this._keyAt(p.x) : null;
                const id = key?.id ?? null;

                if (id !== this._hoverKey) {
                    this._hoverKey = id;
                    this._dirty = true;
                    this._driver.wake();
                }
                const range = this.state.range.value;
                const onHandle =
                    !!range &&
                    p.y < RULER + 2 &&
                    Math.min(Math.abs(p.x - this.xAt(range[0])), Math.abs(p.x - this.xAt(range[1]))) <= 7;

                this.cursor = onHandle ? 'ew-resize' : key ? 'grab' : 'default';
            }

            return;
        }
        this.dragTo(p.x, p.y);
    }

    private _onUp(e: FederatedPointerEvent): void {
        if (e.pointerId !== this._pressId) return;
        this._pressId = -1;
        this.release();
    }

    private _onWheel(e: FederatedWheelEvent): void {
        const p = this.toLocal(e.global);
        const [a, b] = this.state.view.value;

        if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
            const d = e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;

            this.panBy((d / this._w) * (b - a));

            return;
        }
        this.zoomBy(Math.exp(-e.deltaY * 0.0025), this.timeAt(p.x));
    }

    // ------------------------------------------------------------------------------ animation

    private _step(dt: number): boolean {
        const s = this.state;
        let busy = this._drag !== null;

        if (s.playing.value) {
            const range = s.range.value;
            const lo = range ? range[0] : 0;
            const hi = range ? range[1] : this._duration;
            let t = s.time.value + dt * (this._opts.fps ?? 30);

            if (t > hi || t < lo) t = lo + ((((t - lo) % (hi - lo)) + (hi - lo)) % (hi - lo));
            s.time.set(t);
            busy = true;
        }
        // the playhead springs back after a stretched scrub
        if (this._drag !== 'scrub' && this._headOver !== 0) {
            this._headOver = damp(this._headOver, 0, 18, dt);
            if (Math.abs(this._headOver) < 0.05) this._headOver = 0;
            this._dirty = true;
            busy = true;
        }
        const [va, vb] = s.view.value;

        this._viewShown = [damp(this._viewShown[0], va, 16, dt), damp(this._viewShown[1], vb, 16, dt)];
        if (Math.abs(this._viewShown[0] - va) > 1e-3 || Math.abs(this._viewShown[1] - vb) > 1e-3) {
            busy = true;
            this._dirty = true;
        } else {
            this._viewShown = [va, vb];
        }
        if (this._dirty) {
            this._dirty = false;
            this._draw();
        }

        return busy;
    }

    private _draw(): void {
        const g = this._g;
        const t = this._theme;
        const w = this._w;
        const h = this._h;
        const [a, b] = this._viewShown;
        const span = b - a || 1;
        const X = (time: number) => ((time - a) / span) * w;
        const trackY = RULER + 4;
        const midY = trackY + (h - trackY) / 2;

        g.clear();
        g.roundRect(0, 0, w, h, 10).fill(t.background);
        g.roundRect(0, 0, w, RULER, [10, 10, 0, 0]).fill(t.ruler);

        // ticks: about one label every 60 px, minor ticks in between
        const pxPerFrame = w / span;
        const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
        const major = steps.find((s) => s * pxPerFrame >= 60) ?? 1000;
        const minor = steps.find((s) => s * pxPerFrame >= 8) ?? major;
        const first = Math.ceil(a / minor) * minor;
        const labels: [number, number][] = [];

        for (let f = first; f <= b + 1e-6; f += minor) {
            const x = X(f);

            if (x < 1 || x > w - 1) continue;
            const isMajor = Math.abs(f / major - Math.round(f / major)) < 1e-6;

            g.line(x, RULER, x, RULER - (isMajor ? 8 : 4)).stroke({
                width: 1,
                color: t.tick,
                alpha: isMajor ? 0.9 : 0.45,
            });
            if (isMajor) labels.push([f, x]);
        }
        if (this._opts.labels ?? true) this._drawLabels(labels);

        // loop range
        const range = this.state.range.value;

        if (range) {
            const x0 = clamp(X(range[0]), 0, w);
            const x1 = clamp(X(range[1]), 0, w);

            if (x1 > x0) {
                g.rect(x0, RULER, x1 - x0, h - RULER - 2).fill({ color: t.loop, alpha: 0.06 });
                g.rect(x0, RULER - 4, x1 - x0, 4).fill({ color: t.loop, alpha: 0.7 });
            }
            for (const [end, x] of [
                ['loopStart', X(range[0])],
                ['loopEnd', X(range[1])],
            ] as const) {
                if (x < -4 || x > w + 4) continue;
                const active = this._drag === end;

                g.roundRect(x - 3, 2, 6, RULER - 2, 3).fill(active ? 0xffffff : t.loop);
            }
        }

        // track line and keys
        g.line(6, midY, w - 6, midY).stroke({ width: 1, color: t.tick, alpha: 0.25 });
        const sel = new Set(this.state.selection.value);

        for (const k of this._keys) {
            const x = X(k.time);

            if (x < -8 || x > w + 8) continue;
            const selected = sel.has(k.id);
            const hover = k.id === this._hoverKey;
            const r = selected ? 6.5 : hover ? 6 : 5;

            if (selected) g.regularPoly(x, midY, r + 3, 4, 0, 1.5).fill({ color: t.selected, alpha: 0.25 });
            g.regularPoly(x, midY, r, 4, 0, 1).fill(
                selected ? t.selected : k.color !== undefined ? hex(k.color) : t.key,
            );
        }

        // marquee
        if (this._drag === 'marquee' && this._moved) {
            const x0 = Math.min(this._pressX, this._lastX);
            const x1 = Math.max(this._pressX, this._lastX);

            g.rect(x0, trackY, x1 - x0, h - trackY - 4)
                .fill({ color: t.selected, alpha: 0.1 })
                .stroke({ width: 1, color: t.selected, alpha: 0.6 });
        }

        // playhead
        const hx = X(this.state.time.value) + this._headOver;

        if (hx >= -30 && hx <= w + 30) {
            const scrub = this._drag === 'scrub';

            g.line(hx, RULER - 2, hx, h - 3).stroke({ width: scrub ? 2 : 1.5, color: t.playhead });
            g.roundRect(hx - 5, 1, 10, RULER - 3, 3).fill(mix(t.playhead, 0xffffff, scrub ? 0.25 : 0));
        }
    }

    private _drawLabels(labels: [number, number][]): void {
        while (this._pool.length < labels.length) {
            const text = new BitmapText({
                text: '0',
                style: {
                    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
                    fontSize: 9,
                    fill: 0xffffff,
                    ...this._opts.textStyle,
                },
            });

            text.anchor.set(0, 0.5);
            text.tint = this._theme.text;
            this._pool.push(text);
            this._labels.addChild(text);
        }
        this._pool.forEach((text, i) => {
            const item = labels[i];

            text.visible = !!item;
            if (!item) return;
            text.text = String(Math.round(item[0]));
            text.position.set(item[1] + 3, 6);
        });
    }
}
