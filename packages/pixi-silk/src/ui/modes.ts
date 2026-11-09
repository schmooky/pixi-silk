import { Container, type FederatedPointerEvent, type TextStyleOptions, type Ticker } from 'pixi.js';
import { damp, Spring } from '../motion';
import { SilkGraphics } from '../SilkGraphics';
import { type Signal, signal } from '../signal';
import { clamp } from './arc';
import { Driver } from './driver';
import { trackGesture } from './gesture';
import { createIcon, type IconSource } from './icon';
import { type InputProfiles, inputKind, inputProfile } from './input';
import { onKey } from './keys';
import { clamp01, hex, mix } from './paint';
import { type RadialItem, RadialMenu, type RadialMenuOptions } from './RadialMenu';

// ------------------------------------------------------------------------------------------------
// ModeSwitcher
// ------------------------------------------------------------------------------------------------

/** Options of {@link ModeSwitcher}. */
export interface ModeSwitcherOptions {
    /** The modes. Items with `children` are not supported here. */
    modes: RadialItem[];
    /** Starting mode id. Default the first mode. */
    initial?: string;
    /** Hold this key (a `KeyboardEvent.code`) to show the ring. A quick tap swaps to the previous mode. Default `Space`. `null` turns keys off. */
    key?: string | null;
    /** How long the key must be held before the ring shows. Default 160 ms. */
    holdMs?: number;
    /** A long-press on this container shows the ring under the finger. */
    longPressTarget?: Container;
    /** Long-press time. Default 380 ms. */
    longPressMs?: number;
    /** Look and feel of the ring (any {@link RadialMenuOptions} except items and callbacks). */
    menu?: Omit<RadialMenuOptions, 'items' | 'onSelect' | 'onClose' | 'ticker'>;
    /** Ticker driving the animation. Default `Ticker.shared`. `null` for manual {@link ModeSwitcher.tick}. */
    ticker?: Ticker | null;
    /** Called after the mode changes, with the new id and the one before it. */
    onChange?: (mode: string, previous: string | null) => void;
}

/** The reactive state of a {@link ModeSwitcher}. */
export interface ModeSwitcherState {
    /** Current mode id. */
    mode: Signal<string>;
    /** Mode before the current one, the target of a quick tap. */
    previous: Signal<string | null>;
    /** Mode ids, most recently used first. */
    recent: Signal<readonly string[]>;
}

/**
 * Quick mode switching for editors, the hold-a-key ring of paint and 3D tools.
 *
 * - Hold the key: a ring of modes opens under the pointer, the most recently used first (the
 *   previous mode sits on top). Release over a mode to switch, or click it.
 * - Tap the key: swap back to the previous mode, no ring.
 * - Long-press `longPressTarget` on touch screens: the same ring, picked by sliding the finger.
 *
 * The keyboard only acts while the pointer is over the canvas (it moved there in the last few
 * seconds) and never while a text field has focus. Keep the switcher on top of the stage. Key
 * handling listens on `window`. The switcher picks modes only: your app decides what each mode does.
 *
 * Experimental: the API may change in a minor release.
 *
 * @experimental
 */
export class ModeSwitcher extends Container {
    /** Current, previous and recent modes. Read them, and switch with {@link ModeSwitcher.set}. */
    readonly state: ModeSwitcherState;
    /** The ring. Style it through the `menu` option. */
    readonly menu: RadialMenu;

    private readonly _opts: ModeSwitcherOptions;
    private _modes: RadialItem[];
    private _pointer = { x: 0, y: 0, t: -Infinity };
    private _timer: ReturnType<typeof setTimeout> | null = null;
    private _keyDown = false;
    private _waitClosed: (() => void) | null = null;
    private _stops: (() => void)[] = [];

    constructor(options: ModeSwitcherOptions) {
        super({ label: 'ModeSwitcher' });
        this._opts = options;
        this._modes = options.modes;
        const first = options.initial ?? options.modes[0]?.id ?? '';

        this.state = {
            mode: signal(first),
            previous: signal<string | null>(null),
            recent: signal<readonly string[]>([first, ...options.modes.map((m) => m.id).filter((id) => id !== first)]),
        };
        this.menu = new RadialMenu({
            innerRadius: 34,
            outerRadius: 92,
            ...options.menu,
            items: this._ring(),
            ticker: options.ticker,
            onSelect: (item) => this.set(item.id),
        });
        this.addChild(this.menu);
        this.eventMode = 'static';
        this.hitArea = { contains: () => false };
        this.on('globalpointermove', (e: FederatedPointerEvent) => {
            const p = this.toLocal(e.global);

            this._pointer = { x: p.x, y: p.y, t: performance.now() };
        });
        if (options.key !== null) this._stops.push(onKey((code, down, e) => this._onKey(code, down, e)));
        if (options.longPressTarget) {
            this._stops.push(
                trackGesture(
                    options.longPressTarget,
                    {
                        onHold: (p) => {
                            const local = this.toLocal(p.global);

                            this.open(local.x, local.y, p);
                        },
                    },
                    { holdMs: options.longPressMs ?? 380, flickSpeed: 0 },
                ),
            );
        }
    }

    /** Current mode id. */
    get mode(): string {
        return this.state.mode.value;
    }

    /** Switches to `id` (no-op for the current mode or an unknown id). */
    set(id: string): void {
        const current = this.state.mode.value;

        if (id === current || !this._modes.some((m) => m.id === id)) return;
        this.state.previous.set(current);
        this.state.mode.set(id);
        this.state.recent.update((list) => [id, ...list.filter((m) => m !== id)]);
        this._opts.onChange?.(id, current);
    }

    /** Swaps back to the previous mode. No-op before the first switch. */
    toggle(): void {
        const prev = this.state.previous.value;

        if (prev) this.set(prev);
    }

    /** Opens the ring at (x, y) in the switcher's coordinates. Pass the pointer that is down, if any. */
    open(x: number, y: number, pointer?: Parameters<RadialMenu['openAt']>[2]): void {
        const menu = this.menu;

        this._waitClosed?.();
        this._waitClosed = null;
        if (menu.state.phase.value === 'closed') {
            menu.setItems(this._ring());
            menu.openAt(x, y, pointer);

            return;
        }
        // never slide a ring to a new spot: pop it out where it is, then in at the new one
        menu.close();
        this._waitClosed = menu.state.phase.subscribe((phase) => {
            if (phase !== 'closed') return;
            this._waitClosed?.();
            this._waitClosed = null;
            menu.setItems(this._ring());
            menu.openAt(x, y, pointer);
        });
    }

    /** Advances the ring's animation by `dt` seconds (only needed with `ticker: null`). Returns true while moving. */
    tick(dt: number): boolean {
        return this.menu.tick(dt);
    }

    /** Stops the hold timer, the key listener and the long-press gesture. */
    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        this._clearTimer();
        this._waitClosed?.();
        for (const stop of this._stops) stop();
        this._stops = [];
        super.destroy(options ?? { children: true });
    }

    /** Ring items: every mode but the current one, most recent first. */
    private _ring(): RadialItem[] {
        const current = this.state?.mode.value;
        const order = this.state?.recent.value ?? this._modes.map((m) => m.id);

        return order
            .filter((id) => id !== current)
            .map((id) => this._modes.find((m) => m.id === id))
            .filter((m): m is RadialItem => !!m);
    }

    private _clearTimer(): void {
        if (this._timer) clearTimeout(this._timer);
        this._timer = null;
    }

    private _onKey(code: string, down: boolean, e?: KeyboardEvent): void {
        const key = this._opts.key === undefined ? 'Space' : this._opts.key;

        if (code !== key) return;
        if (down) {
            const target = e?.target as HTMLElement | null | undefined;
            const editing = !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
            const hot = performance.now() - this._pointer.t < 4000;

            if (editing || !hot || this._keyDown) return;
            e?.preventDefault?.();
            this._keyDown = true;
            this._clearTimer();
            this._timer = setTimeout(() => {
                this._timer = null;
                this.open(this._pointer.x, this._pointer.y);
            }, this._opts.holdMs ?? 160);

            return;
        }
        if (!this._keyDown) return;
        this._keyDown = false;
        if (this._timer) {
            this._clearTimer();
            this.toggle();

            return;
        }
        if (!this.menu.isOpen) return;
        const hover = this.menu.state.hover.value;

        if (hover && !hover.disabled) this.menu.select(hover);
        else this.menu.close();
    }
}

// ------------------------------------------------------------------------------------------------
// SegmentedSwitch
// ------------------------------------------------------------------------------------------------

/** One choice of a {@link SegmentedSwitch}. */
export interface SegmentOption {
    /** Value the switch reports when this segment is selected. Unique within the switch. */
    id: string;
    /** Text shown when there is no `icon`. */
    label?: string;
    /** Icon shown instead of `label`, sized by `iconSize`. */
    icon?: IconSource;
}

/** Colours of a {@link SegmentedSwitch} (any Pixi colour). */
export interface SegmentedTheme {
    /** Pill background. */
    track: number | string;
    /** The sliding thumb behind the selected segment. */
    thumb: number | string;
    /** Labels and icons of unselected segments. */
    content: number | string;
    /** Label or icon of the selected segment. */
    contentActive: number | string;
    /** Soft shadow under the thumb. */
    shadow: number | string;
}

/** Dark default theme of {@link SegmentedSwitch}. Override single colours with the `theme` option. */
export const SEGMENTED_THEME: Readonly<SegmentedTheme> = {
    track: 0x2c2c2e,
    thumb: 0x636366,
    content: 0x98989f,
    contentActive: 0xffffff,
    shadow: 0x000000,
};

/** Options of {@link SegmentedSwitch}. */
export interface SegmentedSwitchOptions {
    /** Segments from left to right. Fixed after construction. */
    options: SegmentOption[];
    /** Selected id. Default the first. */
    value?: string;
    /** Minimum width of a segment. Segments grow to fit their content. Default 64. */
    segmentWidth?: number;
    /** Pill height. Default 36. */
    height?: number;
    /** Gap between track and thumb. Default 3. */
    padding?: number;
    /** Icon size of segments with an `icon`. Default 18. */
    iconSize?: number;
    /** Style of segment labels. Default font size 13. */
    textStyle?: TextStyleOptions;
    /** Colours that replace parts of {@link SEGMENTED_THEME}. */
    theme?: Partial<SegmentedTheme>;
    /** Per pointer kind overrides of `slop`, which sets how far off the pill a slide still counts. */
    profiles?: InputProfiles;
    /** Ticker driving the animation. Default `Ticker.shared`. `null` for manual {@link SegmentedSwitch.tick}. */
    ticker?: Ticker | null;
    /** Called when `state.value` changes, by the user or by code. */
    onChange?: (id: string, previous: string) => void;
}

/** The reactive state of a {@link SegmentedSwitch}. Write `value` or `enabled` to change it. */
export interface SegmentedState {
    /** Selected segment id. Setting it slides the thumb and calls `onChange`. */
    value: Signal<string>;
    /** False ignores input. Default true. */
    enabled: Signal<boolean>;
}

interface Segment {
    option: SegmentOption;
    content: Container | null;
    x: number;
    w: number;
}

/**
 * A pill of choices with a thumb that slides to the selected one, stretching on the way.
 *
 * Tap a segment, or press and slide along the pill (the thumb follows the finger and the choice
 * lands on release). Centred on its position. Works for toolbars (select, move, rotate) and for
 * speed or quality settings. Segments cannot be added or removed after construction.
 *
 * Experimental: the API may change in a minor release.
 *
 * @experimental
 */
export class SegmentedSwitch extends Container {
    /** Selected id and enabled flag. Write to them to change the switch. */
    readonly state: SegmentedState;

    private readonly _opts: SegmentedSwitchOptions;
    private readonly _theme: Record<keyof SegmentedTheme, number>;
    private readonly _g = new SilkGraphics();
    private readonly _contents = new Container();
    private readonly _driver: Driver;
    private readonly _segments: Segment[];
    private readonly _w: number;
    private readonly _h: number;
    private readonly _left: Spring;
    private readonly _right: Spring;
    private _press = 0;
    private _dim = 0;
    private _pressId = -1;
    private _preview = -1;

    constructor(options: SegmentedSwitchOptions) {
        super({ label: 'SegmentedSwitch' });
        this._opts = options;
        this._theme = Object.fromEntries(
            Object.entries({ ...SEGMENTED_THEME, ...options.theme }).map(([k, v]) => [k, hex(v)]),
        ) as Record<keyof SegmentedTheme, number>;
        this._h = options.height ?? 36;
        const minW = options.segmentWidth ?? 64;
        let x = 0;

        this._segments = options.options.map((option) => {
            const source = option.icon ?? option.label;
            const content =
                source !== undefined
                    ? createIcon(source, option.icon ? (options.iconSize ?? 18) : 34, {
                          fontSize: 13,
                          ...options.textStyle,
                      })
                    : null;
            const w = Math.max(minW, (content?.width ?? 0) + 28);
            const seg = { option, content, x, w };

            x += w;
            if (content) this._contents.addChild(content);

            return seg;
        });
        this._w = x;
        const first = options.value ?? options.options[0]?.id ?? '';

        this.state = { value: signal(first), enabled: signal(true) };
        const i = Math.max(0, this._index(first));

        this._left = new Spring(this._edge(i, 'left'), 420, 30);
        this._right = new Spring(this._edge(i, 'right'), 420, 30);
        this._segments.forEach((s) => {
            if (s.content) s.content.position.set(-this._w / 2 + s.x + s.w / 2, 0);
        });
        this._contents.interactiveChildren = false;
        this.addChild(this._g, this._contents);
        this._driver = new Driver((dt) => this._step(dt), options.ticker);
        const hw = this._w / 2 + 4;
        const hh = this._h / 2 + 6;

        this.hitArea = { contains: (px: number, py: number) => Math.abs(px) <= hw && Math.abs(py) <= hh };
        this.eventMode = 'static';
        this.cursor = 'pointer';
        this.on('pointerdown', this._onDown, this);
        this.on('globalpointermove', this._onMove, this);
        this.on('pointerup', this._onUp, this);
        this.on('pointerupoutside', this._onUp, this);
        this.state.value.subscribe((v, prev) => {
            this._aim(this._index(v));
            this._opts.onChange?.(v, prev);
        });
        this.state.enabled.subscribe((on) => {
            this.eventMode = on ? 'static' : 'none';
            this._driver.wake();
        });
        this._driver.wake();
    }

    /** Width of the pill: the sum of the segment widths. */
    get switchWidth(): number {
        return this._w;
    }

    /** Height of the pill. */
    get switchHeight(): number {
        return this._h;
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

    private _index(id: string): number {
        return this._segments.findIndex((s) => s.option.id === id);
    }

    private _edge(i: number, side: 'left' | 'right'): number {
        const s = this._segments[i];
        const pad = this._opts.padding ?? 3;

        if (!s) return 0;

        return side === 'left' ? -this._w / 2 + s.x + pad : -this._w / 2 + s.x + s.w - pad;
    }

    /** Sends the thumb to segment `i`. The leading edge moves first, so the thumb stretches. */
    private _aim(i: number): void {
        if (i < 0) return;
        const left = this._edge(i, 'left');
        const right = this._edge(i, 'right');
        const goingRight = left > this._left.target;

        this._left.stiffness = goingRight ? 260 : 520;
        this._right.stiffness = goingRight ? 520 : 260;
        this._left.target = left;
        this._right.target = right;
        this._driver.wake();
    }

    private _at(x: number): number {
        const local = x + this._w / 2;
        let i = this._segments.findIndex((s) => local >= s.x && local < s.x + s.w);

        if (i < 0) i = local < 0 ? 0 : this._segments.length - 1;

        return i;
    }

    private _onDown(e: FederatedPointerEvent): void {
        if (this._pressId >= 0 || !this.state.enabled.value) return;
        this._pressId = e.pointerId;
        this._preview = this._at(this.toLocal(e.global).x);
        this._aim(this._preview);
    }

    private _onMove(e: FederatedPointerEvent): void {
        if (e.pointerId !== this._pressId) return;
        const i = this._at(this.toLocal(e.global).x);

        if (i !== this._preview) {
            this._preview = i;
            this._aim(i);
        }
    }

    private _onUp(e: FederatedPointerEvent): void {
        if (e.pointerId !== this._pressId) return;
        const p = this.toLocal(e.global);
        const slop = inputProfile(inputKind(e), this._opts.profiles).slop * 3;
        const near = Math.abs(p.y) <= this._h / 2 + slop + 20;
        const pick = this._preview;

        this._pressId = -1;
        this._preview = -1;
        const id = this._segments[pick]?.option.id;

        if (near && id !== undefined && id !== this.state.value.value) this.state.value.set(id);
        else this._aim(this._index(this.state.value.value));
        this._driver.wake();
    }

    private _step(dt: number): boolean {
        const t = this._theme;
        const pressT = this._pressId >= 0 ? 1 : 0;
        const dimT = this.state.enabled.value ? 0 : 1;
        let busy = false;

        this._left.step(dt);
        this._right.step(dt);
        this._press = damp(this._press, pressT, 20, dt);
        this._dim = damp(this._dim, dimT, 14, dt);
        if (!this._left.settled || !this._right.settled) busy = true;
        if (Math.abs(this._press - pressT) > 0.002 || Math.abs(this._dim - dimT) > 0.002) busy = true;

        const g = this._g;
        const w = this._w;
        const h = this._h;
        const pad = this._opts.padding ?? 3;
        const l = Math.min(this._left.value, this._right.value - 8);
        const r = this._right.value;
        const inset = pad + this._press * 1.5;

        g.clear();
        g.pill(-w / 2, -h / 2, w, h).fill(t.track);
        g.translateTransform(0, 1.5);
        g.pill(l, -h / 2 + inset, r - l, h - inset * 2).fill({ color: t.shadow, alpha: 0.35, blur: 3 });
        g.resetTransform();
        g.pill(l, -h / 2 + inset, r - l, h - inset * 2).fill(t.thumb);

        const mid = (l + r) / 2;
        const half = Math.max(1, (r - l) / 2);

        for (const s of this._segments) {
            if (!s.content) continue;
            const cx = -w / 2 + s.x + s.w / 2;
            const on = clamp01(1 - Math.abs(cx - mid) / (half + s.w / 2));

            s.content.tint = mix(t.content, t.contentActive, clamp(on * 1.6, 0, 1));
        }
        this.alpha = 1 - 0.5 * this._dim;

        return busy;
    }
}
