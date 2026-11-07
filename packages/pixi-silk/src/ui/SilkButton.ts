import { Container, type FederatedPointerEvent, type TextStyleOptions, type Ticker } from 'pixi.js';
import { damp, Spring } from '../motion';
import { SilkGraphics } from '../SilkGraphics';
import { type Computed, computed, type Signal, signal } from '../signal';
import { Driver } from './driver';
import { createIcon, type IconSource } from './icon';
import { type InputProfiles, inputKind, inputProfile } from './input';
import { clamp01, hex, mix } from './paint';

const TAU = Math.PI * 2;

/** Colours of a {@link SilkButton} (any Pixi colour). */
export interface ButtonTheme {
    fill: number | string;
    fillHover: number | string;
    fillPress: number | string;
    fillDisabled: number | string;
    content: number | string;
    contentDisabled: number | string;
    accent: number | string;
    shadow: number | string;
}

/** Default theme: blue filled button. */
export const BUTTON_THEME: Readonly<ButtonTheme> = {
    fill: 0x0a84ff,
    fillHover: 0x3a9bff,
    fillPress: 0x0060df,
    fillDisabled: 0x3a3a3c,
    content: 0xffffff,
    contentDisabled: 0x8e8e93,
    accent: 0xffffff,
    shadow: 0x000000,
};

/** Where a button is in its show / hide cycle. */
export type ButtonPhase = 'hidden' | 'showing' | 'shown' | 'hiding';

/** The reactive state of a {@link SilkButton}. Write `shown`, `enabled` and `busy`, read the rest. */
export interface ButtonState {
    /** Wanted visibility. Writing it animates the button in or out. */
    shown: Signal<boolean>;
    /** Disabled buttons dim and ignore input. */
    enabled: Signal<boolean>;
    /** Busy buttons show a spinner and ignore input (a spin in progress, a request in flight). */
    busy: Signal<boolean>;
    /** Animation phase. Input is only accepted while `shown`. */
    phase: Signal<ButtonPhase>;
    hovered: Signal<boolean>;
    pressed: Signal<boolean>;
    /** True when the button accepts input: shown, settled, enabled and not busy. */
    active: Computed<boolean>;
}

/** Options of {@link SilkButton}. */
export interface SilkButtonOptions {
    /** Default 120 (the height for circles). */
    width?: number;
    /** Default 48. */
    height?: number;
    /** Default `pill`. `squircle` uses continuous corners. */
    shape?: 'pill' | 'circle' | 'rect' | 'squircle';
    /** Corner radius of `rect` and `squircle`. Default 14. */
    radius?: number;
    label?: string;
    icon?: IconSource;
    /** Default 22. */
    iconSize?: number;
    textStyle?: TextStyleOptions;
    theme?: Partial<ButtonTheme>;
    /** Start visible. Default true. */
    shown?: boolean;
    /** Default true. */
    enabled?: boolean;
    /** Long-press time in ms. A press held this long fires `onHold` instead of `onPress`. */
    holdMs?: number;
    /** Scale the button grows from when it appears. Default 0.6. */
    appearScale?: number;
    /** Distance it rises from when it appears. Default 10. */
    appearOffset?: number;
    /** Extra hit margin around the shape (a finger landing a little outside still counts). Default 6. */
    hitPadding?: number;
    profiles?: InputProfiles;
    ticker?: Ticker | null;
    onPress?: (button: SilkButton) => void;
    onHold?: (button: SilkButton) => void;
}

/**
 * A button that animates in and out, refuses input while it moves and keeps its state in signals.
 *
 * - `show()` / `hide()` (or write `state.shown`) spring it in and out. Both return a promise that
 *   resolves `true` when the animation finishes, `false` when it was reversed half way.
 * - Input is off while it appears, disappears, is disabled or busy: no double spins, no taps on a
 *   button that is fading away.
 * - A press that slides off the button still counts when released within the pointer's slop.
 * - Optional long-press (`holdMs`) with a progress indicator, e.g. tap to spin, hold for autoplay.
 * - `state.busy` swaps the content for a spinner.
 */
export class SilkButton extends Container {
    readonly state: ButtonState;

    private readonly _w: number;
    private readonly _h: number;
    private readonly _opts: SilkButtonOptions;
    private readonly _theme: Record<keyof ButtonTheme, number>;
    private readonly _g = new SilkGraphics();
    private readonly _content = new Container();
    private readonly _driver: Driver;
    private readonly _appear: Spring;
    private readonly _press: Spring = new Spring(0, 700, 32);
    private _hover = 0;
    private _enabled = 1;
    private _busy = 0;
    private _spin = 0;
    private _hold = 0;
    private _holdFired = false;
    private _pressId = -1;
    private _slop = 6;
    private _waiters: ((done: boolean) => void)[] = [];

    constructor(options: SilkButtonOptions = {}) {
        super({ label: 'SilkButton' });
        this._opts = options;
        const shape = options.shape ?? 'pill';

        this._h = options.height ?? 48;
        this._w = shape === 'circle' ? this._h : (options.width ?? 120);
        this._theme = Object.fromEntries(
            Object.entries({ ...BUTTON_THEME, ...options.theme }).map(([k, v]) => [k, hex(v)]),
        ) as Record<keyof ButtonTheme, number>;
        const shown = options.shown ?? true;
        const s = {
            shown: signal(shown),
            enabled: signal(options.enabled ?? true),
            busy: signal(false),
            phase: signal<ButtonPhase>(shown ? 'shown' : 'hidden'),
            hovered: signal(false),
            pressed: signal(false),
        };

        this.state = {
            ...s,
            active: computed(
                [s.phase, s.enabled, s.busy],
                () => s.phase.value === 'shown' && s.enabled.value && !s.busy.value,
            ),
        };
        this._appear = new Spring(shown ? 1 : 0, 320, 24);
        this._driver = new Driver((dt) => this._step(dt), options.ticker);
        this._buildContent();
        this._content.interactiveChildren = false;
        this.addChild(this._g, this._content);

        const pad = options.hitPadding ?? 6;
        const hw = this._w / 2 + pad;
        const hh = this._h / 2 + pad;

        this.hitArea = { contains: (x: number, y: number) => Math.abs(x) <= hw && Math.abs(y) <= hh };
        this.cursor = 'pointer';
        this.visible = shown;
        // fingers have no hover: only mice and pens light the button up
        this.on('pointerover', (e) => this.state.hovered.set(inputKind(e) !== 'touch'));
        this.on('pointerout', () => this.state.hovered.set(false));
        this.on('pointerdown', this._onDown, this);
        this.on('pointerup', this._onUp, this);
        this.on('pointerupoutside', this._onUp, this);

        s.shown.subscribe((v) => this._onShown(v));
        this.state.active.subscribe((v) => {
            this.eventMode = v ? 'static' : 'none';
            if (!v) this._cancelPress();
        });
        this.eventMode = this.state.active.value ? 'static' : 'none';
        for (const sig of [s.hovered, s.pressed, s.enabled, s.busy]) sig.subscribe(() => this._driver.wake());
        this._driver.wake();
    }

    /** Width of the shape. */
    get buttonWidth(): number {
        return this._w;
    }

    /** Height of the shape. */
    get buttonHeight(): number {
        return this._h;
    }

    /** Appearance from 0 (gone) to 1 (fully shown), as animated. Layouts use it to open and close gaps. */
    get appearance(): number {
        return clamp01(this._appear.value);
    }

    /** Animates the button in. Resolves true when it finishes, false if reversed first. */
    show(): Promise<boolean> {
        return this._toggle(true);
    }

    /** Animates the button out. Resolves true when it finishes, false if reversed first. */
    hide(): Promise<boolean> {
        return this._toggle(false);
    }

    /** Advances the animation by `dt` seconds (only needed with `ticker: null`). Returns true while moving. */
    tick(dt: number): boolean {
        return this._driver.tick(dt);
    }

    /** Fires `onPress` as if tapped (respects `state.active`). */
    press(): void {
        if (!this.state.active.value) return;
        this._press.velocity -= 12;
        this._opts.onPress?.(this);
        this._driver.wake();
    }

    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        this._driver.sleep();
        this.state.active.dispose();
        this._settle(false);
        super.destroy(options ?? { children: true });
    }

    // ------------------------------------------------------------------------------ state

    private _toggle(shown: boolean): Promise<boolean> {
        const phase = this.state.phase.value;

        if (this.state.shown.value === shown && (phase === 'shown' || phase === 'hidden')) {
            return Promise.resolve(true);
        }
        this.state.shown.set(shown);

        return new Promise<boolean>((resolve) => this._waiters.push(resolve));
    }

    private _onShown(shown: boolean): void {
        // reversed half way: whoever waited on the old direction gets `false`
        this._settle(false);
        this.state.phase.set(shown ? 'showing' : 'hiding');
        this._appear.target = shown ? 1 : 0;
        this.visible = true;
        this._driver.wake();
    }

    private _settle(done: boolean): void {
        const waiters = this._waiters;

        this._waiters = [];
        for (const w of waiters) w(done);
    }

    // ------------------------------------------------------------------------------ input

    private _onDown(e: FederatedPointerEvent): void {
        if (!this.state.active.value || this._pressId >= 0) return;
        this._pressId = e.pointerId;
        this._slop = inputProfile(inputKind(e), this._opts.profiles).slop;
        this._hold = 0;
        this._holdFired = false;
        this._press.target = 1;
        this.state.pressed.set(true);
    }

    private _onUp(e: FederatedPointerEvent): void {
        if (e.pointerId !== this._pressId) return;
        const p = this.toLocal(e.global);
        const reach = this._slop * 2;
        const within = Math.abs(p.x) <= this._w / 2 + reach && Math.abs(p.y) <= this._h / 2 + reach;
        const fire = within && !this._holdFired && this.state.active.value;

        this._cancelPress();
        if (inputKind(e) === 'touch') this.state.hovered.set(false);
        if (fire) this._opts.onPress?.(this);
    }

    private _cancelPress(): void {
        this._pressId = -1;
        this._press.target = 0;
        this._hold = 0;
        this.state.pressed.set(false);
        this._driver.wake();
    }

    // ------------------------------------------------------------------------------ drawing

    private _buildContent(): void {
        const { icon, label, iconSize = 22, textStyle } = this._opts;
        const parts: Container[] = [];

        if (icon !== undefined) parts.push(createIcon(icon, iconSize));
        if (label !== undefined) parts.push(createIcon(label, 36, textStyle));
        const gap = 8;
        const total = parts.reduce((sum, p) => sum + p.width, 0) + gap * (parts.length - 1);
        let x = -total / 2;

        for (const p of parts) {
            p.x = x + p.width / 2;
            x += p.width + gap;
            this._content.addChild(p);
        }
    }

    private _shape(g: SilkGraphics, grow: number): SilkGraphics {
        const w = this._w + grow * 2;
        const h = this._h + grow * 2;
        const x = -w / 2;
        const y = -h / 2;

        switch (this._opts.shape ?? 'pill') {
            case 'circle':
                return g.circle(0, 0, w / 2);
            case 'rect':
                return g.roundRect(x, y, w, h, (this._opts.radius ?? 14) + grow);
            case 'squircle':
                return g.roundRect(x, y, w, h, (this._opts.radius ?? 14) + grow, 0.6);
            default:
                return g.pill(x, y, w, h);
        }
    }

    private _step(dt: number): boolean {
        const t = this._theme;
        const st = this.state;
        let busy = false;

        this._appear.step(dt);
        this._press.step(dt);
        const hoverT = st.hovered.value && st.active.value ? 1 : 0;
        const enabledT = st.enabled.value ? 1 : 0;
        const busyT = st.busy.value ? 1 : 0;

        this._hover = damp(this._hover, hoverT, 18, dt);
        this._enabled = damp(this._enabled, enabledT, 14, dt);
        this._busy = damp(this._busy, busyT, 12, dt);
        if (Math.abs(this._hover - hoverT) > 0.002) busy = true;
        if (Math.abs(this._enabled - enabledT) > 0.002) busy = true;
        if (Math.abs(this._busy - busyT) > 0.002) busy = true;
        if (!this._appear.settled || !this._press.settled) busy = true;

        if (this._busy > 0.002) {
            this._spin += dt * 5.5;
            busy = true;
        }
        const holdMs = this._opts.holdMs;

        if (holdMs && this._pressId >= 0 && !this._holdFired) {
            this._hold = Math.min(1, this._hold + (dt * 1000) / holdMs);
            if (this._hold >= 1) {
                this._holdFired = true;
                this._press.velocity -= 14;
                this._opts.onHold?.(this);
            }
            busy = true;
        } else if (this._hold > 0) {
            this._hold = damp(this._hold, 0, 14, dt);
            if (this._hold < 0.002) this._hold = 0;
            busy = true;
        }

        // phase bookkeeping
        const phase = st.phase.value;

        if (phase === 'showing' && this._appear.settled) {
            st.phase.set('shown');
            this._settle(true);
        } else if (phase === 'hiding' && this._appear.settled) {
            st.phase.set('hidden');
            this.visible = false;
            this._settle(true);
        }

        const a = this._appear.value;
        const from = this._opts.appearScale ?? 0.6;
        const press = this._press.value;

        this.scale.set((from + (1 - from) * a) * (1 - 0.06 * press));
        this.alpha = clamp01(a);
        this.pivot.y = -(1 - clamp01(a)) * (this._opts.appearOffset ?? 10);

        const g = this._g;
        const dim = 1 - this._enabled;
        let fill = mix(t.fill, t.fillHover, this._hover);

        fill = mix(fill, t.fillPress, press);
        fill = mix(fill, t.fillDisabled, dim);
        g.clear();
        g.translateTransform(0, 3);
        this._shape(g, 0).fill({ color: t.shadow, alpha: 0.3 * (1 - dim * 0.6), blur: 8 + 4 * this._hover });
        g.resetTransform();
        this._shape(g, 0).fill(fill);
        if (this._hover > 0.01) {
            this._shape(g, 0).stroke({ width: 1.5, color: t.accent, alpha: 0.35 * this._hover, alignment: 'inside' });
        }
        if (this._hold > 0.001) this._drawHold(g, t.accent);
        if (this._busy > 0.002) {
            const r = Math.min(this._w, this._h) * 0.22;

            g.arcSweep(0, 0, r, this._spin, TAU * 0.7).stroke({
                width: 2.5,
                color: t.content,
                alpha: this._busy,
                cap: 'round',
            });
        }
        this._content.tint = mix(t.content, t.contentDisabled, dim);
        this._content.alpha = 1 - this._busy;
        this._content.scale.set(1 - 0.3 * this._busy);

        return busy;
    }

    private _drawHold(g: SilkGraphics, color: number): void {
        const p = this._hold;

        if ((this._opts.shape ?? 'pill') === 'circle') {
            g.arcSweep(0, 0, this._w / 2 + 5, -Math.PI / 2, TAU * p).stroke({
                width: 3,
                color,
                alpha: Math.min(1, p * 4),
                cap: 'round',
            });

            return;
        }
        const inset = Math.min(this._h / 2, 16);
        const len = (this._w - inset * 2) * p;

        g.pill(-this._w / 2 + inset, this._h / 2 - 7, Math.max(len, 3), 3).fill({ color, alpha: Math.min(1, p * 4) });
    }
}
