import { Container, type FederatedPointerEvent, type Text, type TextStyleOptions, type Ticker } from 'pixi.js';
import { damp } from '../motion';
import { SilkGraphics } from '../SilkGraphics';
import { type Signal, signal } from '../signal';
import { AngleAccumulator, clamp, rubberBand, snapTo, TAU } from './arc';

export { rubberBand };

import { Driver } from './driver';
import { createIcon } from './icon';
import { type InputProfiles, inputKind, inputProfile } from './input';
import { modDown, shiftDown } from './keys';
import { hex, mix } from './paint';
import { ValuePill } from './ValuePill';

/** Colours of the dials (any Pixi colour). */
export interface DialTheme {
    /** Ring or field background. */
    track: number | string;
    /** Progress arc, filled part of a bounded scrubber, flashes and the drag pill. */
    fill: number | string;
    /** The knob and the major detent tick. */
    knob: number | string;
    /** Minor detent ticks and the scrubber label. */
    tick: number | string;
    /** Value readout and the scrubber's step arrows. */
    text: number | string;
}

/** Dark default theme with a blue fill. Override single colours with the `theme` option. */
export const DIAL_THEME: Readonly<DialTheme> = {
    track: 0x2c2c2e,
    fill: 0x0a84ff,
    knob: 0xffffff,
    tick: 0x8e8e93,
    text: 0xf2f2f7,
};

const themeOf = (theme?: Partial<DialTheme>): Record<keyof DialTheme, number> =>
    Object.fromEntries(Object.entries({ ...DIAL_THEME, ...theme }).map(([k, v]) => [k, hex(v)])) as Record<
        keyof DialTheme,
        number
    >;

/** The reactive state of a {@link JogDial} or a {@link Scrubber}. */
export interface DialState {
    /** Current value, snapped to the step. Writing it moves the control. */
    value: Signal<number>;
    /** True while a pointer drags the control. */
    dragging: Signal<boolean>;
}

/** Options of {@link JogDial}. */
export interface JogDialOptions {
    /** Radius of the ring, at its centre line. Default 64. */
    radius?: number;
    /** Thickness of the ring. Default 14. */
    thickness?: number;
    /** Start value, clamped and snapped. Default 0. */
    value?: number;
    /** Lower limit. Default `-Infinity` (no limit). */
    min?: number;
    /** Upper limit. Default `Infinity` (no limit). */
    max?: number;
    /** Snap step. 0 turns snapping off. Default 0. */
    step?: number;
    /** Value change for one full turn near the ring. Default: the range between `min` and `max`, else 1. */
    turn?: number;
    /**
     * How fast precision grows with distance. Past the ring the speed is `(radius / distance) ** fine`,
     * so the pointer far out moves the value slowly. 0 turns it off. Default 1.
     */
    fine?: number;
    /** How far the value can stretch past a limit, as a fraction of one turn. Default 0.12. */
    rubber?: number;
    /** Keep spinning after a flick. Default true. */
    inertia?: boolean;
    /** How quickly a flick slows down, about 1 / seconds. Default 3.5. */
    friction?: number;
    /** Shows the value in the middle. Default true. */
    readout?: boolean;
    /** Formats the readout. Default: the value with the step's decimals. */
    format?: (value: number) => string;
    /** Style of the readout text. */
    textStyle?: TextStyleOptions;
    /** Colours that replace parts of {@link DIAL_THEME}. */
    theme?: Partial<DialTheme>;
    /** Per pointer kind overrides of `slop`, the movement a tap may have. */
    profiles?: InputProfiles;
    /** Ticker driving the animation. Default `Ticker.shared`. `null` for manual {@link JogDial.tick}. */
    ticker?: Ticker | null;
    /** Called on every change of the snapped value, also while dragging. */
    onChange?: (value: number) => void;
    /** The value once the dial comes to rest after a drag or a flick. */
    onCommit?: (value: number) => void;
}

const decimalsOf = (step: number): number => {
    if (!(step > 0) || step >= 1) return 0;

    return Math.min(6, Math.ceil(-Math.log10(step) - 1e-9));
};

/**
 * A jog wheel. Press anywhere on it and drag around the centre: the value follows the angle and
 * keeps adding up over full turns. Drag further out for finer control. A flick keeps it spinning
 * and it slows down by itself. Past `min` or `max` it stretches like a rubber band and springs back.
 * With a `step`, the value clicks through detents and each one pulses on the ring.
 * A tap on the right half steps up, on the left half steps down. The dial is centred on its position.
 *
 * Experimental: the API may change in a minor release.
 *
 * @experimental
 */
export class JogDial extends Container {
    /** Value and drag flag. Writing `value` glides the dial there without calling `onChange`. */
    readonly state: DialState;

    private readonly _o: Required<
        Omit<JogDialOptions, 'min' | 'max' | 'format' | 'textStyle' | 'theme' | 'profiles' | 'ticker'>
    > & { min: number; max: number };
    private readonly _opts: JogDialOptions;
    private readonly _theme: Record<keyof DialTheme, number>;
    private readonly _g = new SilkGraphics();
    private readonly _driver: Driver;
    private readonly _acc = new AngleAccumulator();
    private _text: Text | null = null;
    /** Unsnapped, unclamped position (value units). */
    private _raw: number;
    private _shown: number;
    private _velocity = 0;
    private _trail: { v: number; t: number }[] = [];
    private _pressId = -1;
    private _pressT = 0;
    private _pressX = 0;
    private _pressY = 0;
    private _moved = false;
    private _slop = 4;
    private _pulse = 0;
    private _settling = false;
    private _syncing = false;

    constructor(options: JogDialOptions = {}) {
        super({ label: 'JogDial' });
        this._opts = options;
        this._o = {
            radius: options.radius ?? 64,
            thickness: options.thickness ?? 14,
            value: options.value ?? 0,
            min: options.min ?? -Infinity,
            max: options.max ?? Infinity,
            step: options.step ?? 0,
            turn:
                options.turn ??
                (Number.isFinite(options.min) &&
                Number.isFinite(options.max) &&
                (options.max as number) > (options.min as number)
                    ? (options.max as number) - (options.min as number)
                    : 1),
            fine: options.fine ?? 1,
            rubber: options.rubber ?? 0.12,
            inertia: options.inertia ?? true,
            friction: options.friction ?? 3.5,
            readout: options.readout ?? true,
            onChange: options.onChange ?? (() => {}),
            onCommit: options.onCommit ?? (() => {}),
        };
        this._theme = themeOf(options.theme);
        const start = this._settle(this._o.value);

        this._raw = start;
        this._shown = start;
        this.state = { value: signal(start), dragging: signal(false) };
        this.state.value.subscribe((v) => {
            if (this._syncing) return;
            // written from outside: glide there
            this._raw = clamp(v, this._o.min, this._o.max);
            this._velocity = 0;
            this._driver.wake();
        });
        this._driver = new Driver((dt) => this._step(dt), options.ticker);
        this.addChild(this._g);
        const reach = this._o.radius + this._o.thickness / 2 + 8;

        this.hitArea = { contains: (x: number, y: number) => x * x + y * y <= reach * reach };
        this.eventMode = 'static';
        this.cursor = 'grab';
        this.on('pointerdown', this._onDown, this);
        this.on('globalpointermove', this._onMove, this);
        this.on('pointerup', this._onUp, this);
        this.on('pointerupoutside', this._onUp, this);
        this._driver.wake();
    }

    /** The value as drawn, including rubber-band stretch and unsnapped motion. */
    get shownValue(): number {
        return this._shown;
    }

    /** Advances the animation by `dt` seconds (only needed with `ticker: null`). Returns true while moving. */
    tick(dt: number): boolean {
        return this._driver.tick(dt);
    }

    /** Stops the animation. Destroys children unless `options` says otherwise. */
    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        this._driver.sleep();
        super.destroy(options ?? { children: true });
    }

    // ------------------------------------------------------------------------------ value

    private get _limit(): number {
        return this._o.rubber * this._o.turn;
    }

    /** Clamped and snapped value for a raw position. */
    private _settle(raw: number): number {
        const { min, max, step } = this._o;
        const origin = Number.isFinite(min) ? min : 0;

        return clamp(snapTo(clamp(raw, min, max), step, origin), min, max);
    }

    private _emit(): void {
        const v = this._settle(this._raw);

        if (v === this.state.value.value) return;
        this._syncing = true;
        this.state.value.set(v);
        this._syncing = false;
        if (this._o.step > 0) this._pulse = 1;
        this._o.onChange(v);
    }

    // ------------------------------------------------------------------------------ input

    private _onDown(e: FederatedPointerEvent): void {
        if (this._pressId >= 0) return;
        const p = this.toLocal(e.global);

        this._pressId = e.pointerId;
        this._pressT = performance.now();
        this._pressX = p.x;
        this._pressY = p.y;
        this._moved = false;
        this._slop = inputProfile(inputKind(e), this._opts.profiles).slop;
        this._acc.reset(p.x, p.y);
        this._velocity = 0;
        this._settling = false;
        // catch a spinning dial where it is
        this._raw = rubberBand(this._raw, this._o.min, this._o.max, this._limit);
        this._trail = [{ v: this._raw, t: this._pressT }];
        this.state.dragging.set(true);
        this.cursor = 'grabbing';
        this._driver.wake();
    }

    private _onMove(e: FederatedPointerEvent): void {
        if (e.pointerId !== this._pressId) return;
        const p = this.toLocal(e.global);

        if (!this._moved && Math.hypot(p.x - this._pressX, p.y - this._pressY) > this._slop) this._moved = true;
        this.dragTo(p.x, p.y);
    }

    private _onUp(e: FederatedPointerEvent): void {
        if (e.pointerId !== this._pressId) return;
        const p = this.toLocal(e.global);
        const tap = !this._moved && performance.now() - this._pressT < 300;

        this._pressId = -1;
        this.state.dragging.set(false);
        this.cursor = 'grab';
        if (tap) {
            this.nudge(p.x >= 0 ? 1 : -1);

            return;
        }
        this.release();
    }

    /**
     * Turns the dial towards a point in its own coordinates, as a drag does.
     * Pointer events call this. Call it yourself for gamepads or tests.
     */
    dragTo(x: number, y: number): void {
        const d = Math.hypot(x, y);
        const turnStep = this._acc.push(x, y);
        const { radius, fine, turn } = this._o;
        const outer = radius + this._o.thickness / 2;
        const speed = fine > 0 && d > outer ? (outer / d) ** fine : 1;

        this._raw += (turnStep / TAU) * turn * speed;
        const now = performance.now();

        this._trail.push({ v: this._raw, t: now });
        while (this._trail.length > 2 && now - this._trail[0].t > 90) this._trail.shift();
        this._emit();
        this._driver.wake();
    }

    /** Lets go: a fast drag keeps spinning (inertia), then the dial settles and commits. */
    release(): void {
        const now = performance.now();
        const first = this._trail[0];

        if (this._o.inertia && first && this._trail.length > 1) {
            const dt = Math.max(1, now - first.t) / 1000;

            this._velocity = (this._raw - first.v) / dt;
            // slow drags do not coast
            if (Math.abs(this._velocity) < this._o.turn * 0.25) this._velocity = 0;
        }
        this._settling = true;
        this._driver.wake();
    }

    /** Moves by `count` steps (or a 24th of a turn without a step) and commits. */
    nudge(count: number): void {
        const unit = this._o.step > 0 ? this._o.step : this._o.turn / 24;

        this._raw = this._settle(this._settle(this._raw) + unit * count);
        this._velocity = 0;
        this._emit();
        this._settling = true;
        this._driver.wake();
    }

    // ------------------------------------------------------------------------------ animation

    private _step(dt: number): boolean {
        const { min, max, friction } = this._o;
        const dragging = this._pressId >= 0;
        let busy = dragging;

        if (!dragging && this._velocity !== 0) {
            this._raw += this._velocity * dt;
            this._velocity *= Math.exp(-friction * dt);
            // a limit stops the spin, the rubber band takes over
            if ((this._raw > max && this._velocity > 0) || (this._raw < min && this._velocity < 0)) {
                this._velocity *= Math.exp(-30 * dt);
            }
            if (Math.abs(this._velocity) < this._o.turn * 0.02) this._velocity = 0;
            this._emit();
            busy = true;
        }
        if (!dragging && this._velocity === 0) {
            // spring back inside the limits and into the nearest detent
            const target = this._settle(this._raw);

            this._raw = damp(this._raw, target, 16, dt);
            if (Math.abs(this._raw - target) < 1e-5 * Math.max(1, Math.abs(this._o.turn))) {
                this._raw = target;
                if (this._settling) {
                    this._settling = false;
                    this._o.onCommit(this.state.value.value);
                }
            } else {
                busy = true;
            }
        }
        const shownTarget = rubberBand(this._raw, min, max, this._limit);

        this._shown = damp(this._shown, shownTarget, 40, dt);
        if (Math.abs(this._shown - shownTarget) > 1e-5) busy = true;
        this._pulse = damp(this._pulse, 0, 9, dt);
        if (this._pulse > 0.003) busy = true;
        this._draw();

        return busy;
    }

    private _draw(): void {
        const g = this._g;
        const t = this._theme;
        const { radius: r, thickness: w, turn, step, min, max } = this._o;
        const v = this._shown;
        const bounded = Number.isFinite(min) && Number.isFinite(max) && max > min;
        // with limits the ring is a gauge and the knob rides its end, else the knob turns with the value
        const angle = bounded
            ? -Math.PI / 2 + clamp((v - min) / (max - min), -0.05, 1.05) * TAU
            : -Math.PI / 2 + (v / turn) * TAU;
        const drag = this.state.dragging.value ? 1 : 0;

        g.clear();
        g.circle(0, 0, r + w / 2 + 6).fill({ color: 0x000000, alpha: 0.35, blur: 10 });
        g.circle(0, 0, r).stroke({ width: w, color: t.track });
        if (bounded) {
            // gauge: the share of the range, from the top
            const f = clamp((v - min) / (max - min), 0, 1);

            if (f > 0.001) {
                g.arcSweep(0, 0, r, -Math.PI / 2, f * TAU * 0.999).stroke({
                    width: w,
                    color: t.fill,
                    cap: 'round',
                });
            }
        } else {
            // endless: the fraction of the current turn
            const f = (((v / turn) % 1) + 1) % 1;

            if (f > 0.001) {
                g.arcSweep(0, 0, r, -Math.PI / 2, f * TAU).stroke({
                    width: w,
                    color: t.fill,
                    alpha: 0.85,
                    cap: 'round',
                });
            }
        }
        // detent ticks turn with the dial
        const perTurn = bounded ? (step > 0 ? (max - min) / step : 12) : step > 0 ? turn / step : 24;

        if (perTurn <= 96) {
            const n = Math.round(perTurn);
            const inner = r - w / 2 - 9;

            for (let i = 0; i < n; i++) {
                const a = (bounded ? -Math.PI / 2 : angle) + (i / n) * TAU;
                const major = i === 0;
                const len = major ? 7 : 4;

                g.line(
                    Math.cos(a) * inner,
                    Math.sin(a) * inner,
                    Math.cos(a) * (inner - len),
                    Math.sin(a) * (inner - len),
                ).stroke({
                    width: major ? 2 : 1.25,
                    cap: 'round',
                    color: major ? t.knob : t.tick,
                    alpha: major ? 0.9 : 0.55,
                });
            }
        }
        // knob riding on the ring
        const kx = Math.cos(angle) * r;
        const ky = Math.sin(angle) * r;
        const pulse = this._pulse;

        if (pulse > 0.01) g.circle(kx, ky, w / 2 + 4 + 8 * (1 - pulse)).fill({ color: t.fill, alpha: 0.35 * pulse });
        g.circle(kx, ky, w / 2 + 2 + drag * 2).fill(mix(t.knob, t.fill, pulse * 0.4));
        if (this._o.readout) this._drawReadout();
    }

    private _drawReadout(): void {
        if (!this._text) {
            this._text = createIcon('0', 40, {
                fontSize: Math.round(this._o.radius * 0.36),
                fontWeight: '600',
                ...this._opts.textStyle,
            }) as Text;
            this._text.tint = this._theme.text;
            this.addChild(this._text);
        }
        const v = this.state.value.value;

        this._text.text = this._opts.format ? this._opts.format(v) : v.toFixed(decimalsOf(this._o.step));
    }
}

/** Options of {@link Scrubber}. */
export interface ScrubberOptions {
    /** Field width. Default 150. */
    width?: number;
    /** Field height. Default 30. */
    height?: number;
    /** Start value, clamped to the limits. Default 0. */
    value?: number;
    /** Lower limit. Default `-Infinity`. With both limits finite, the field fills like a slider. */
    min?: number;
    /** Upper limit. Default `Infinity`. */
    max?: number;
    /** Tap step, and the snap step with Ctrl / Cmd. Default 1. */
    step?: number;
    /** Value change per pixel of drag. Default `step / 4`. */
    perPixel?: number;
    /** Speed with Shift held. Default 0.1. */
    fineFactor?: number;
    /** Name shown on the left. */
    label?: string;
    /** Formats the value. Default: the value with the step's decimals. */
    format?: (value: number) => string;
    /** Shows text (label, value, pill). Default true. */
    readout?: boolean;
    /** Style of the label and value text. */
    textStyle?: TextStyleOptions;
    /** Colours that replace parts of {@link DIAL_THEME}. */
    theme?: Partial<DialTheme>;
    /** Per pointer kind overrides of `slop`, the movement a tap may have. */
    profiles?: InputProfiles;
    /** Ticker driving the animation. Default `Ticker.shared`. `null` for manual {@link Scrubber.tick}. */
    ticker?: Ticker | null;
    /** Called on every value change, also while dragging. */
    onChange?: (value: number) => void;
    /** Called with the value when a drag ends or a tap steps it. */
    onCommit?: (value: number) => void;
}

/**
 * A number field you drag, like the ones in 3D and compositing tools. Drag sideways to scrub the
 * value. Shift scrubs finely, Ctrl or Cmd snaps to the step. A tap on the left or right end steps
 * down or up. With `min` and `max` the field fills like a slider. The top-left corner is at (0, 0).
 *
 * Experimental: the API may change in a minor release.
 *
 * @experimental
 */
export class Scrubber extends Container {
    /** Value and drag flag. Writing `value` redraws the field without calling `onChange`. */
    readonly state: DialState;

    private readonly _opts: ScrubberOptions;
    private readonly _theme: Record<keyof DialTheme, number>;
    private readonly _w: number;
    private readonly _h: number;
    private readonly _step: number;
    private readonly _min: number;
    private readonly _max: number;
    private readonly _g = new SilkGraphics();
    private readonly _driver: Driver;
    private _label: Text | null = null;
    private _valueText: Text | null = null;
    private _pill: ValuePill | null = null;
    private _pressId = -1;
    private _pressT = 0;
    private _startX = 0;
    private _startValue = 0;
    private _lastX = 0;
    private _acc = 0;
    private _moved = false;
    private _slop = 4;
    private _hover = 0;
    private _hovered = false;
    private _shownFill = 0;
    private _flash = 0;

    constructor(options: ScrubberOptions = {}) {
        super({ label: 'Scrubber' });
        this._opts = options;
        this._theme = themeOf(options.theme);
        this._w = options.width ?? 150;
        this._h = options.height ?? 30;
        this._step = options.step ?? 1;
        this._min = options.min ?? -Infinity;
        this._max = options.max ?? Infinity;
        const start = clamp(options.value ?? 0, this._min, this._max);

        this.state = { value: signal(start), dragging: signal(false) };
        this._shownFill = this._fill01(start);
        this._driver = new Driver((dt) => this._step_(dt), options.ticker);
        this.state.value.subscribe(() => this._driver.wake());
        this.addChild(this._g);
        this.hitArea = {
            contains: (x: number, y: number) => x >= -4 && x <= this._w + 4 && y >= -4 && y <= this._h + 4,
        };
        this.eventMode = 'static';
        this.cursor = 'ew-resize';
        this.on('pointerover', () => {
            this._hovered = true;
            this._driver.wake();
        });
        this.on('pointerout', () => {
            this._hovered = false;
            this._driver.wake();
        });
        this.on('pointerdown', this._onDown, this);
        this.on('globalpointermove', this._onMove, this);
        this.on('pointerup', this._onUp, this);
        this.on('pointerupoutside', this._onUp, this);
        this._driver.wake();
    }

    /** Advances the animation by `dt` seconds (only needed with `ticker: null`). Returns true while moving. */
    tick(dt: number): boolean {
        return this._driver.tick(dt);
    }

    /** Stops the animation. Destroys children unless `options` says otherwise. */
    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        this._driver.sleep();
        super.destroy(options ?? { children: true });
    }

    /**
     * Scrubs to a drag offset of `dx` pixels from the press. `fine` and `snap` stand for Shift and
     * Ctrl / Cmd. Pointer moves call this.
     */
    scrubTo(dx: number, fine = false, snap = false): void {
        const per = this._opts.perPixel ?? this._step / 4;
        // fine mode only slows down the movement made while it is held
        const delta = dx - this._lastX;

        this._lastX = dx;
        this._acc += delta * per * (fine ? (this._opts.fineFactor ?? 0.1) : 1);
        let v = this._startValue + this._acc;

        if (snap) v = snapTo(v, this._step);
        this._set(clamp(v, this._min, this._max));
    }

    /** Steps by `count` steps (negative steps down), clamps, flashes the field and calls `onCommit`. */
    nudge(count: number): void {
        const v = clamp(snapTo(this.state.value.value + count * this._step, this._step), this._min, this._max);

        this._set(v);
        this._flash = 1;
        this._opts.onCommit?.(v);
        this._driver.wake();
    }

    private _set(v: number): void {
        if (v === this.state.value.value) return;
        this.state.value.set(v);
        this._opts.onChange?.(v);
    }

    private _fill01(v: number): number {
        if (!Number.isFinite(this._min) || !Number.isFinite(this._max) || this._max <= this._min) return 0;

        return clamp((v - this._min) / (this._max - this._min), 0, 1);
    }

    private _onDown(e: FederatedPointerEvent): void {
        if (this._pressId >= 0) return;
        this._pressId = e.pointerId;
        this._pressT = performance.now();
        this._startX = this.toLocal(e.global).x;
        this._startValue = this.state.value.value;
        this._lastX = 0;
        this._acc = 0;
        this._moved = false;
        this._slop = inputProfile(inputKind(e), this._opts.profiles).slop;
        this.state.dragging.set(true);
        this._driver.wake();
    }

    private _onMove(e: FederatedPointerEvent): void {
        if (e.pointerId !== this._pressId) return;
        const dx = this.toLocal(e.global).x - this._startX;

        if (!this._moved) {
            if (Math.abs(dx) <= this._slop) return;
            this._moved = true;
            // start from the slop edge so the value does not jump
            this._lastX = Math.sign(dx) * this._slop;
        }
        this.scrubTo(dx, shiftDown(), modDown());
    }

    private _onUp(e: FederatedPointerEvent): void {
        if (e.pointerId !== this._pressId) return;
        const x = this.toLocal(e.global).x;

        this._pressId = -1;
        this.state.dragging.set(false);
        if (!this._moved && performance.now() - this._pressT < 300) {
            this.nudge(x < this._w / 2 ? -1 : 1);

            return;
        }
        this._opts.onCommit?.(this.state.value.value);
        this._driver.wake();
    }

    private _format(v: number): string {
        return this._opts.format ? this._opts.format(v) : v.toFixed(decimalsOf(this._step));
    }

    private _step_(dt: number): boolean {
        const t = this._theme;
        const g = this._g;
        const w = this._w;
        const h = this._h;
        const dragging = this._pressId >= 0;
        const hoverT = this._hovered || dragging ? 1 : 0;
        const fillT = this._fill01(this.state.value.value);
        let busy = dragging;

        this._hover = damp(this._hover, hoverT, 16, dt);
        this._shownFill = damp(this._shownFill, fillT, 22, dt);
        this._flash = damp(this._flash, 0, 8, dt);
        if (Math.abs(this._hover - hoverT) > 0.003 || Math.abs(this._shownFill - fillT) > 0.0005) busy = true;
        if (this._flash > 0.003) busy = true;

        g.clear();
        g.roundRect(0, 0, w, h, h / 2).fill(mix(t.track, 0x3a3a3c, this._hover));
        if (this._shownFill > 0.002) {
            g.roundRect(0, 0, Math.max(h, w * this._shownFill), h, h / 2).fill({ color: t.fill, alpha: 0.55 });
        }
        if (this._flash > 0.01) g.roundRect(0, 0, w, h, h / 2).stroke({ width: 2, color: t.fill, alpha: this._flash });
        // step arrows at both ends, brighter on hover
        const ay = h / 2;
        const aa = 0.35 + 0.5 * this._hover;

        g.regularPoly(11, ay, 4, 3, -Math.PI / 2, 1).fill({ color: t.text, alpha: aa });
        g.regularPoly(w - 11, ay, 4, 3, Math.PI / 2, 1).fill({ color: t.text, alpha: aa });

        if (this._opts.readout ?? true) busy = this._drawText(dt, dragging) || busy;

        return busy;
    }

    private _drawText(dt: number, dragging: boolean): boolean {
        const t = this._theme;
        const style = { fontSize: Math.round(this._h * 0.42), ...this._opts.textStyle };

        if (!this._valueText) {
            this._valueText = createIcon('', 30, { ...style, fontWeight: '600' }) as Text;
            this._valueText.anchor.set(1, 0.5);
            this._valueText.tint = t.text;
            this.addChild(this._valueText);
            if (this._opts.label) {
                this._label = createIcon(this._opts.label, 30, { ...style, fontWeight: '500' }) as Text;
                this._label.anchor.set(0, 0.5);
                this._label.tint = t.tick;
                this.addChild(this._label);
            }
            this._pill = new ValuePill({ fill: t.fill, color: 0xffffff });
            this.addChild(this._pill);
        }
        const text = this._format(this.state.value.value);

        this._valueText.text = text;
        this._valueText.position.set(this._w - 22, this._h / 2);
        this._label?.position.set(22, this._h / 2);
        const pill = this._pill as ValuePill;

        pill.position.set(this._w / 2, -16);
        if (dragging && this._moved) pill.show(text);
        else pill.hide();

        return pill.update(dt);
    }
}
