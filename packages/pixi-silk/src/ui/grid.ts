import { type ColorSource, Container, type Ticker } from 'pixi.js';
import { damp } from '../motion';
import { SilkGraphics } from '../SilkGraphics';
import { type Signal, signal } from '../signal';
import type { Camera } from './camera';
import { Driver } from './driver';
import { hex } from './paint';

/** How a {@link CanvasGrid} draws: thin `lines` or `dots` at the crossings. */
export type GridStyle = 'lines' | 'dots';

/** One level of a {@link CanvasGrid}, as {@link gridLevels} returns it. */
export interface GridLevel {
    /** Distance between lines, in world units. */
    step: number;
    /** Distance between lines on screen, in CSS pixels (`step` times the zoom). */
    spacing: number;
    /** Opacity this level adds, 0..1, so the lines it shares with coarser levels add up to theirs. */
    alpha: number;
}

/** Options of {@link gridLevels}. */
export interface GridLevelOptions {
    /** Finest step, in world units. Default 1, a pixel grid at 100%. Must be above 0. */
    unit?: number;
    /** Each level is this many times the one below. Default 10, at least 2. */
    ratio?: number;
    /** Opacity of a line at full strength, 0..1. Default 0.1. */
    alpha?: number;
    /** Screen spacing in CSS pixels where a level starts to show and where it reaches full strength. Default `[6, 120]`. */
    fade?: [number, number];
}

/**
 * Options of {@link CanvasGrid}. In `dots` style, `alpha` defaults to 0.32 and `fade` to
 * `[12, 160]`, so dots read as strong as lines.
 */
export interface CanvasGridOptions extends GridLevelOptions {
    /** The camera the grid follows. The grid redraws whenever the camera's signals change. */
    camera: Camera;
    /** Lines or dots. Default `lines`. Change it later through `state.style`, and the grid crossfades. */
    style?: GridStyle;
    /** Line and dot colour. Default white. */
    color?: ColorSource;
    /** Line width in CSS pixels. Default 1. A level is skipped when its spacing is below twice this. */
    lineWidth?: number;
    /** Dot diameter in CSS pixels. Default 2. A level is skipped when its spacing is below twice this. */
    dotSize?: number;
    /** Draws the x = 0 and y = 0 axes in `axisColor`, 1 pixel wide. Default false. Change it later through `state.axes`. */
    axes?: boolean;
    /** Colour of the axes. Default `0x64a8ff`. */
    axisColor?: ColorSource;
    /** Opacity of the axes, 0..1. Default 0.5. */
    axisAlpha?: number;
    /** Ticker that runs fades and redraws. Default `Ticker.shared`. With `null`, call {@link CanvasGrid.tick} yourself. */
    ticker?: Ticker | null;
}

/** The reactive state of a {@link CanvasGrid}. Write to these signals to change the grid. */
export interface CanvasGridState {
    /** Lines or dots. Changes crossfade. */
    style: Signal<GridStyle>;
    /** Shows or hides the grid with a fade. Starts true. Separate from the container's `visible`. */
    visible: Signal<boolean>;
    /** Shows the x = 0 and y = 0 axes. Switches at once, without a fade. */
    axes: Signal<boolean>;
}

const smooth = (t: number): number => {
    const u = t < 0 ? 0 : t > 1 ? 1 : t;

    return u * u * (3 - 2 * u);
};

/**
 * The grid levels to draw at `zoom`, finest first. Each level is `ratio` times the one below. A
 * level fades in as its spacing grows from `fade[0]` to `fade[1]` pixels. Levels nest, so a line
 * of a coarse level is also drawn by the finer ones: each level's `alpha` is what it adds on top.
 * Levels that would add almost nothing are left out. Returns an empty array for a zoom or unit of 0 or less.
 */
export function gridLevels(zoom: number, options: GridLevelOptions = {}): GridLevel[] {
    const unit = options.unit ?? 1;
    const ratio = Math.max(2, options.ratio ?? 10);
    const max = options.alpha ?? 0.1;
    const [lo, hi] = options.fade ?? [6, 120];
    const strength = (spacing: number) => max * smooth(Math.log(spacing / lo) / Math.log(Math.max(hi / lo, 1.0001)));
    const out: GridLevel[] = [];

    if (!(zoom > 0) || !(unit > 0)) return out;
    // the finest level that shows at all
    let n = Math.max(0, Math.ceil(Math.log(lo / (unit * zoom)) / Math.log(ratio) - 1e-9));
    let below = 0;

    for (let i = 0; i < 64; i++, n++) {
        const step = unit * ratio ** n;
        const spacing = step * zoom;
        const total = strength(spacing);

        // what this level adds so that 1 - (1 - a0)(1 - a1)... reaches its full strength
        const alpha = 1 - (1 - total) / (1 - below);

        if (alpha > 0.002) out.push({ step, spacing, alpha });
        below = total;
        if (total >= max - 1e-6) break;
    }

    return out;
}

/**
 * An unbounded grid behind a {@link Camera}'s world. Levels nest (1, 10, 100 by default) and fade
 * in and out with the zoom. The grid lives in screen space and only draws what shows. All vertical
 * lines of a level are one dashed stroke, and so are the horizontal ones. Dots take one stroke per row.
 *
 * Add it under the world, in screen space: `app.stage.addChild(grid, world, overlay)`. It covers
 * the camera's element from (0, 0), ignores pointer events, and cannot be rotated with the view.
 *
 * Experimental: the API may change in a minor release.
 * @experimental
 */
export class CanvasGrid extends Container {
    /** Style, fade and axes, as signals. */
    readonly state: CanvasGridState;

    private readonly _g = new SilkGraphics({ label: 'CanvasGrid' });
    private readonly _camera: Camera;
    private readonly _opts: CanvasGridOptions;
    private readonly _driver: Driver;
    private readonly _color: number;
    private readonly _axisColor: number;
    private readonly _off: (() => void)[] = [];
    private _lines: number;
    private _dots: number;
    private _shown: number;
    private _drawn = 0;

    constructor(options: CanvasGridOptions) {
        super({ label: 'CanvasGrid' });
        this._opts = options;
        this._camera = options.camera;
        this._color = hex(options.color ?? 0xffffff);
        this._axisColor = hex(options.axisColor ?? 0x64a8ff);
        const style = options.style ?? 'lines';

        this.state = { style: signal<GridStyle>(style), visible: signal(true), axes: signal(options.axes ?? false) };
        this._lines = style === 'lines' ? 1 : 0;
        this._dots = 1 - this._lines;
        this._shown = 1;
        this.eventMode = 'none';
        this.addChild(this._g);
        this._driver = new Driver((dt) => this._step(dt), options.ticker);
        const wake = () => this._driver.wake();

        const cam = options.camera.state;

        for (const s of [cam.zoom, cam.x, cam.y, cam.width, cam.height]) this._off.push(s.subscribe(wake));
        this._off.push(
            this.state.style.subscribe(wake),
            this.state.visible.subscribe(wake),
            this.state.axes.subscribe(wake),
        );
        this._draw();
    }

    /** How many shapes the last frame drew, each one silk instance. For tests and stats. */
    get shapes(): number {
        return this._drawn;
    }

    /** The levels of the current style at the camera's zoom. Computed on each read. */
    get levels(): GridLevel[] {
        return gridLevels(this._camera.zoom, this._levelOptions());
    }

    /** Redraws on the next frame. Camera moves and resizes the camera sees redraw by themselves. */
    refresh(): this {
        this._driver.wake();

        return this;
    }

    /** Advances fades by `dt` seconds (clamped to 0..0.1) and redraws. Only needed with `ticker: null`. */
    tick(dt: number): boolean {
        return this._driver.tick(dt);
    }

    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        for (const off of this._off) off();
        this._off.length = 0;
        this._driver.sleep();
        super.destroy(options ?? { children: true });
    }

    private _levelOptions(style: GridStyle = this.state.style.value): GridLevelOptions {
        const o = this._opts;

        return {
            unit: o.unit,
            ratio: o.ratio,
            alpha: o.alpha ?? (style === 'dots' ? 0.32 : 0.1),
            fade: o.fade ?? (style === 'dots' ? [12, 160] : [6, 120]),
        };
    }

    private _step(dt: number): boolean {
        const dots = this.state.style.value === 'dots' ? 1 : 0;
        const show = this.state.visible.value ? 1 : 0;
        let busy = false;
        const ease = (v: number, to: number) => {
            const next = damp(v, to, 14, dt);

            if (Math.abs(next - to) < 0.004) return to;
            busy = true;

            return next;
        };

        this._dots = ease(this._dots, dots);
        this._lines = ease(this._lines, 1 - dots);
        this._shown = ease(this._shown, show);
        this._draw();

        return busy;
    }

    private _draw(): void {
        const g = this._g.clear();
        const cam = this._camera;
        const view = cam.view;
        const k = cam.zoom;
        const w = view.width * k;
        const h = view.height * k;
        const ox = cam.state.x.value;
        const oy = cam.state.y.value;
        let count = 0;

        if (this._shown <= 0.002 || !(w > 0) || !(h > 0)) {
            this._drawn = 0;

            return;
        }
        // first line of a step at or left of the screen edge, in screen pixels
        const first = (origin: number, step: number) => origin - Math.floor(origin / step) * step - step;

        if (this._lines > 0.002) {
            const lw = this._opts.lineWidth ?? 1;

            for (const level of gridLevels(k, this._levelOptions('lines'))) {
                const p = level.spacing;
                const alpha = level.alpha * this._lines * this._shown;

                if (p < lw * 2 || alpha <= 0.002) continue;
                const x0 = first(ox, p) - lw / 2;
                const y0 = first(oy, p) - lw / 2;
                const style = { color: this._color, alpha, cap: 'butt' as const };

                // every vertical line of the level in one stroke: dashes one line wide, as tall as the view
                g.moveTo(x0, h / 2)
                    .lineTo(w + p, h / 2)
                    .stroke({ ...style, width: h, dash: [lw, p - lw] });
                g.moveTo(w / 2, y0)
                    .lineTo(w / 2, h + p)
                    .stroke({ ...style, width: w, dash: [lw, p - lw] });
                count += 2;
            }
        }
        if (this._dots > 0.002) {
            const size = this._opts.dotSize ?? 2;

            for (const level of gridLevels(k, this._levelOptions('dots'))) {
                const p = level.spacing;
                const alpha = level.alpha * this._dots * this._shown;

                if (p < size * 2 || alpha <= 0.002) continue;
                const x0 = first(ox, p);
                const y0 = first(oy, p);
                const style = {
                    color: this._color,
                    alpha,
                    width: size,
                    cap: 'round' as const,
                    dash: [0, p] as [number, number],
                };

                // one row of round zero-length dashes per grid line: dots at every crossing
                for (let y = y0; y <= h + p; y += p) {
                    g.moveTo(x0, y)
                        .lineTo(w + p, y)
                        .stroke(style);
                    count++;
                }
            }
        }
        if (this.state.axes.value) {
            const alpha = (this._opts.axisAlpha ?? 0.5) * this._shown;
            const style = { color: this._axisColor, alpha, width: 1 };

            if (ox >= 0 && ox <= w) {
                g.moveTo(ox, 0).lineTo(ox, h).stroke(style);
                count++;
            }
            if (oy >= 0 && oy <= h) {
                g.moveTo(0, oy).lineTo(w, oy).stroke(style);
                count++;
            }
        }
        this._drawn = count;
    }
}
