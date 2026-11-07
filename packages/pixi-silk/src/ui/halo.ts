import { Container, type FederatedPointerEvent, type Ticker } from 'pixi.js';
import { damp, dampAngle, Spring } from '../motion';
import { SilkGraphics } from '../SilkGraphics';
import { type Signal, signal } from '../signal';
import { angleDelta } from './arc';
import { Driver } from './driver';
import { createIcon, type IconSource } from './icon';
import { type InputProfiles, inputKind, inputProfile } from './input';
import { clamp01, hex, mix } from './paint';
import { ValuePill } from './ValuePill';

/** One action of a {@link ContextHalo}. */
export interface HaloItem {
    /** Stable id, handed back on selection. */
    id: string;
    icon?: IconSource;
    /** Shown in a pill while the item is hovered. */
    label?: string;
    /** Shown but not selectable. */
    disabled?: boolean;
}

/** Colours of a {@link ContextHalo} (any Pixi colour). */
export interface HaloTheme {
    fill: number | string;
    fillHover: number | string;
    fillDisabled: number | string;
    icon: number | string;
    iconHover: number | string;
    accent: number | string;
    shadow: number | string;
}

/** Default theme: light buttons with a blue hover. */
export const HALO_THEME: Readonly<HaloTheme> = {
    fill: 0xf2f2f7,
    fillHover: 0xffffff,
    fillDisabled: 0x8e8e93,
    icon: 0x3a3a3c,
    iconHover: 0x0a84ff,
    accent: 0x0a84ff,
    shadow: 0x000000,
};

/** Rectangle in the halo's coordinates (its parent's, while the halo sits at 0, 0 unscaled). */
export interface HaloBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** Options of {@link ContextHalo}. */
export interface ContextHaloOptions {
    items: HaloItem[];
    /** Radius of each button. Default 18. */
    radius?: number;
    /** Distance between the target's box and the buttons. Default 10. */
    gap?: number;
    /** Space between neighbouring buttons. Default 8. */
    spacing?: number;
    /** Icon size. Default 18. */
    iconSize?: number;
    /** Preferred side, as an angle (radians, -PI/2 is above). Default above. */
    direction?: number;
    /** The buttons stay inside this rectangle, turning to another side of the target when needed. */
    bounds?: HaloBounds | (() => HaloBounds);
    /** Fold the buttons away while `state.dragging` is true. Default false: they follow. */
    hideWhileDragging?: boolean;
    /**
     * How the buttons move to a new target. `pop` (default) pops them out at the old target and
     * back in around the new one. `glide` slides them across. Following one target is always smooth.
     */
    transition?: 'pop' | 'glide';
    theme?: Partial<HaloTheme>;
    profiles?: InputProfiles;
    /** Ticker driving the animation. Default `Ticker.shared`. `null` for manual {@link ContextHalo.tick}. */
    ticker?: Ticker | null;
    onSelect?: (item: HaloItem) => void;
}

/** The reactive state of a {@link ContextHalo}. */
export interface HaloState {
    /** Object the halo orbits, or null. */
    target: Signal<Container | null>;
    /** Item under the pointer. */
    hover: Signal<HaloItem | null>;
    /** Set it while the target is being dragged: the halo follows faster, or folds away with `hideWhileDragging`. */
    dragging: Signal<boolean>;
    /** `hidden`, `in` (popping in), `shown` or `out` (popping out). Input is only accepted while `shown`. */
    phase: Signal<HaloPhase>;
}

/** Where a {@link ContextHalo} is in its pop cycle. */
export type HaloPhase = 'hidden' | 'in' | 'shown' | 'out';

interface Slot {
    item: HaloItem;
    icon: Container | null;
    open: Spring;
    hover: number;
    flash: number;
    delay: number;
    x: number;
    y: number;
    tx: number;
    ty: number;
}

const SIDES = [-Math.PI / 2, 0, Math.PI / 2, Math.PI, -Math.PI / 4, (-3 * Math.PI) / 4, Math.PI / 4, (3 * Math.PI) / 4];

/**
 * Action buttons orbiting the selected object, the way 3D and design tools show context actions.
 *
 * - Follows the target every frame, from its bounds, so it tracks drags, tweens and camera moves.
 * - Lays the buttons on an arc hugging the target's box, on the preferred side. When that side would
 *   leave `bounds` it turns to the side with the most room, gliding round rather than jumping.
 * - Pops in with a stagger and pops out on `detach()`. Selecting another object pops the buttons
 *   out at the old one and in around the new one (`transition: 'glide'` slides them instead).
 *
 * Attach it to a target with `attach(target)`. Keep the halo above the target in the display list.
 */
export class ContextHalo extends Container {
    readonly state: HaloState = {
        target: signal<Container | null>(null),
        hover: signal<HaloItem | null>(null),
        dragging: signal(false),
        phase: signal<HaloPhase>('hidden'),
    };

    private readonly _opts: ContextHaloOptions;
    private readonly _theme: Record<keyof HaloTheme, number>;
    private readonly _r: number;
    private readonly _g = new SilkGraphics();
    private readonly _icons = new Container();
    private readonly _driver: Driver;
    private _slots: Slot[] = [];
    private _pill: ValuePill | null = null;
    private _angle: number;
    private _center = { x: 0, y: 0, hw: 0, hh: 0 };
    private _placed = false;
    private _pressed: Slot | null = null;
    private _pressId = -1;
    private _slop = 4;
    private _elapsed = 0;
    /** What the buttons track: the old target while popping out, then the new one. */
    private _follow: Container | null = null;
    /** Target to pop in once the pop-out ends (`null` means hide). */
    private _next: Container | null = null;

    constructor(options: ContextHaloOptions) {
        super({ label: 'ContextHalo' });
        this._opts = options;
        this._r = options.radius ?? 18;
        this._angle = options.direction ?? -Math.PI / 2;
        this._theme = Object.fromEntries(
            Object.entries({ ...HALO_THEME, ...options.theme }).map(([k, v]) => [k, hex(v)]),
        ) as Record<keyof HaloTheme, number>;
        this._driver = new Driver((dt) => this._step(dt), options.ticker);
        this._icons.interactiveChildren = false;
        this.addChild(this._g, this._icons);
        this.eventMode = 'none';
        this.hitArea = { contains: (x: number, y: number) => this._slotAt(x, y, this._r * 0.25) !== null };
        this.on('globalpointermove', this._onMove, this);
        this.on('pointerdown', this._onDown, this);
        this.on('pointerup', this._onUp, this);
        this.on('pointerupoutside', this._onUp, this);
        this.on('pointerout', () => this._setHover(null));
        this.state.dragging.subscribe(() => this._driver.wake());
        this.setItems(options.items);
    }

    /** Fold the buttons away while `state.dragging` is true. Can change at any time. */
    get hideWhileDragging(): boolean {
        return !!this._opts.hideWhileDragging;
    }

    set hideWhileDragging(value: boolean) {
        this._opts.hideWhileDragging = value;
        this._driver.wake();
    }

    /** Replaces the actions. */
    setItems(items: HaloItem[]): void {
        for (const s of this._slots) s.icon?.destroy();
        this._icons.removeChildren();
        this._slots = items.map((item) => {
            const icon = item.icon !== undefined ? createIcon(item.icon, this._opts.iconSize ?? 18) : null;

            if (icon) this._icons.addChild(icon);

            return { item, icon, open: new Spring(0, 420, 26), hover: 0, flash: 0, delay: 0, x: 0, y: 0, tx: 0, ty: 0 };
        });
        this._placed = false;
        this._driver.wake();
    }

    /** Starts orbiting `target`. From another target the buttons pop out there and in here. */
    attach(target: Container): void {
        if (target === this.state.target.value && this.state.phase.value !== 'out') return;
        const visible = this._slots.some((sl) => sl.open.value > 0.02);

        this.state.target.set(target);
        this.parent?.addChild(this);
        if (!this._follow || !visible) this._popIn(target);
        else if ((this._opts.transition ?? 'pop') === 'glide') {
            this._follow = target;
            this._next = null;
            if (this.state.phase.value === 'out') this._popIn(target, false);
        } else {
            this._next = target;
            this._popOut();
        }
        this._driver.wake();
    }

    /** Pops the buttons out and lets go of the target. */
    detach(): void {
        this.state.target.set(null);
        this._next = null;
        if (this.state.phase.value !== 'hidden') this._popOut();
        this._driver.wake();
    }

    private _popOut(): void {
        const n = this._slots.length;

        this.state.phase.set('out');
        this.eventMode = 'none';
        this._setHover(null);
        this._pressId = -1;
        this._elapsed = 0;
        this._slots.forEach((sl, i) => {
            // quick and flat on the way out, last button first
            sl.open.stiffness = 900;
            sl.open.damping = 46;
            sl.delay = (n - 1 - i) * 0.012;
        });
    }

    private _popIn(target: Container, fromZero = true): void {
        this._follow = target;
        this._next = null;
        this._placed = !fromZero && this._placed;
        this.state.phase.set('in');
        this.eventMode = 'none';
        this._elapsed = 0;
        this._slots.forEach((sl, i) => {
            // a little overshoot on the way in, first button first
            sl.open.stiffness = 420;
            sl.open.damping = 20;
            if (fromZero) sl.open.value = sl.open.velocity = 0;
            sl.flash = 0;
            sl.delay = i * 0.018;
        });
    }

    /** Advances the animation by `dt` seconds (only needed with `ticker: null`). Returns true while moving. */
    tick(dt: number): boolean {
        return this._driver.tick(dt);
    }

    /** Where each button is heading, in the halo's coordinates (for tests and custom drawing). */
    get positions(): { id: string; x: number; y: number }[] {
        return this._slots.map((s) => ({ id: s.item.id, x: s.tx, y: s.ty }));
    }

    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        this._driver.sleep();
        super.destroy(options ?? { children: true });
    }

    // ------------------------------------------------------------------------------ layout

    /** The target's box in the halo's own space. */
    private _measure(target: Container): { x: number; y: number; hw: number; hh: number } {
        const b = target.getBounds();
        const p0 = this.toLocal({ x: b.x, y: b.y });
        const p1 = this.toLocal({ x: b.x + b.width, y: b.y + b.height });

        return {
            x: (p0.x + p1.x) / 2,
            y: (p0.y + p1.y) / 2,
            hw: Math.abs(p1.x - p0.x) / 2,
            hh: Math.abs(p1.y - p0.y) / 2,
        };
    }

    /** Button centres on an arc around a box, centred on `dir`. */
    private _arc(
        box: { x: number; y: number; hw: number; hh: number },
        dir: number,
    ): { x: number; y: number; a: number }[] {
        const n = this._slots.length;
        const r = this._r;
        const rx = box.hw + (this._opts.gap ?? 10) + r;
        const ry = box.hh + (this._opts.gap ?? 10) + r;
        const step = 2 * r + (this._opts.spacing ?? 8);
        const at = (a: number) => ({ x: box.x + Math.cos(a) * rx, y: box.y + Math.sin(a) * ry, a });
        // walk along the ellipse by arc length, so buttons sit evenly on wide and tall boxes
        const advance = (a: number, sign: number, dist: number) => {
            let left = dist;
            let cur = a;

            while (left > 0) {
                const speed = Math.hypot(rx * Math.sin(cur), ry * Math.cos(cur)) || 1;
                const da = Math.min(0.05, left / speed);

                cur += sign * da;
                left -= da * speed;
            }

            return cur;
        };
        const out: { x: number; y: number; a: number }[] = [];

        for (let i = 0; i < n; i++) {
            const k = i - (n - 1) / 2;

            out.push(at(advance(dir, Math.sign(k), Math.abs(k) * step)));
        }
        // keep reading order: left to right below the target too, top to bottom on its left
        const sin = Math.sin(dir);

        return sin > 0.3 || (Math.abs(sin) <= 0.3 && Math.cos(dir) < 0) ? out.reverse() : out;
    }

    private _overflow(points: { x: number; y: number }[]): number {
        const b = typeof this._opts.bounds === 'function' ? this._opts.bounds() : this._opts.bounds;

        if (!b) return 0;
        const m = this._r + 4;
        let over = 0;

        for (const p of points) {
            over += Math.max(0, b.x + m - p.x) + Math.max(0, p.x - (b.x + b.width - m));
            over += Math.max(0, b.y + m - p.y) + Math.max(0, p.y - (b.y + b.height - m));
        }

        return over;
    }

    /** The preferred side, unless another side keeps the buttons inside the bounds. */
    private _side(box: { x: number; y: number; hw: number; hh: number }): number {
        const preferred = this._opts.direction ?? -Math.PI / 2;
        const candidates = [preferred, ...SIDES.filter((s) => Math.abs(angleDelta(s, preferred)) > 1e-3)];
        let best = preferred;
        let bestOver = Infinity;

        for (const side of candidates) {
            const over = this._overflow(this._arc(box, side));

            if (over === 0) return side;
            if (over < bestOver) {
                bestOver = over;
                best = side;
            }
        }

        return best;
    }

    // ------------------------------------------------------------------------------ input

    private _slotAt(x: number, y: number, extra = 0): Slot | null {
        let best: Slot | null = null;
        let bestD = Infinity;

        for (const s of this._slots) {
            if (s.open.value < 0.5) continue;
            const d = Math.hypot(x - s.x, y - s.y);

            if (d <= this._r + extra && d < bestD) {
                best = s;
                bestD = d;
            }
        }

        return best;
    }

    private _setHover(slot: Slot | null): void {
        const item = slot?.item ?? null;

        if (this.state.hover.value === item) return;
        this.state.hover.set(item);
        if (item?.label) {
            this._pill ??= this.addChild(new ValuePill());
            this._pill.show(item.label);
        } else {
            this._pill?.hide();
        }
        this._driver.wake();
    }

    private _onMove(e: FederatedPointerEvent): void {
        if (!this.state.target.value) return;
        if (inputKind(e) === 'touch' && this._pressId < 0) return;
        const p = this.toLocal(e.global);

        this._setHover(this._slotAt(p.x, p.y, this._pressId >= 0 ? this._slop : 0));
    }

    private _onDown(e: FederatedPointerEvent): void {
        const p = this.toLocal(e.global);

        this._slop = inputProfile(inputKind(e), this._opts.profiles).slop;
        this._pressed = this._slotAt(p.x, p.y, this._slop);
        this._pressId = this._pressed ? e.pointerId : -1;
        this._setHover(this._pressed);
    }

    private _onUp(e: FederatedPointerEvent): void {
        if (e.pointerId !== this._pressId) return;
        const p = this.toLocal(e.global);
        const slot = this._slotAt(p.x, p.y, this._slop * 2);
        const pressed = this._pressed;

        this._pressId = -1;
        this._pressed = null;
        if (inputKind(e) === 'touch') this._setHover(null);
        if (!slot || slot !== pressed || slot.item.disabled || this.state.phase.value !== 'shown') return;
        slot.flash = 1;
        this._opts.onSelect?.(slot.item);
        this._driver.wake();
    }

    // ------------------------------------------------------------------------------ animation

    private _step(dt: number): boolean {
        const target = this._follow;
        const t = this._theme;
        const phase = this.state.phase.value;
        const dragging = this.state.dragging.value;
        const out = phase === 'out' || phase === 'hidden';
        const folded = out || (dragging && !!this._opts.hideWhileDragging);
        let busy = phase !== 'hidden';

        this._elapsed += dt;
        if (target && !target.destroyed) {
            const box = this._measure(target);
            const side = this._side(box);
            const follow = dragging ? 40 : 22;

            if (!this._placed) {
                this._center = box;
                this._angle = side;
                this._placed = true;
            } else {
                this._center.x = damp(this._center.x, box.x, follow, dt);
                this._center.y = damp(this._center.y, box.y, follow, dt);
                this._center.hw = damp(this._center.hw, box.hw, follow, dt);
                this._center.hh = damp(this._center.hh, box.hh, follow, dt);
                this._angle = dampAngle(this._angle, side, 10, dt);
            }
            const arc = this._arc(this._center, this._angle);

            this._slots.forEach((s, i) => {
                s.tx = arc[i].x;
                s.ty = arc[i].y;
            });
        } else if (target?.destroyed && this.state.target.value === target) {
            this.detach();
        }

        const g = this._g;

        g.clear();
        const hoverItem = this.state.hover.value;
        let anyShown = false;
        let pillSlot: Slot | null = null;

        this._slots.forEach((s) => {
            const delay = s.delay;

            const ready = this._elapsed >= delay;

            if (out) s.open.target = ready ? 0 : s.open.target;
            else s.open.target = folded ? 0 : ready ? 1 : s.open.target;
            s.open.step(dt);
            // snap a folded button to rest, so the spring's last wobble cannot wake the driver
            if (s.open.target === 0 && Math.abs(s.open.value) < 1e-3 && Math.abs(s.open.velocity) < 1e-2) {
                s.open.value = s.open.velocity = 0;
            }
            const hTarget = s.item === hoverItem && !s.item.disabled ? 1 : 0;

            s.hover = damp(s.hover, hTarget, 20, dt);
            s.flash = damp(s.flash, 0, 6, dt);
            if (!s.open.settled || Math.abs(s.hover - hTarget) > 0.002 || s.flash > 0.002) busy = true;
            if (!ready) busy = true;
            const v = s.open.value;
            const k = clamp01(v);
            // popping in they start a little towards the target, popping out they stay put
            const reach = out ? 1 : 0.85 + 0.15 * k;

            s.x = this._center.x + (s.tx - this._center.x) * reach;
            s.y = this._center.y + (s.ty - this._center.y) * reach;
            if (v <= 0.001) {
                if (s.icon) s.icon.visible = false;

                return;
            }
            anyShown = true;
            const r = this._r * (0.4 + 0.6 * Math.min(v, 1.15)) * (1 + 0.08 * s.hover);
            const disabled = !!s.item.disabled;
            let fill = disabled ? t.fillDisabled : mix(t.fill, t.fillHover, s.hover);

            fill = mix(fill, t.accent, s.flash);
            g.circle(s.x, s.y + 2, r).fill({ color: t.shadow, alpha: 0.3 * k, blur: 5 });
            g.circle(s.x, s.y, r).fill({ color: fill, alpha: k });
            if (s.hover > 0.01) {
                g.circle(s.x, s.y, r + 3).stroke({ width: 2, color: t.accent, alpha: s.hover * k });
            }
            if (s.icon) {
                s.icon.visible = true;
                s.icon.position.set(s.x, s.y);
                s.icon.scale.set(0.4 + 0.6 * Math.min(v, 1.15));
                s.icon.tint = disabled ? 0xd1d1d6 : mix(t.icon, t.iconHover, s.hover);
                s.icon.alpha = k * (disabled ? 0.6 : 1);
            }
            if (s.item === hoverItem) pillSlot = s;
        });

        if (this._pill) {
            const s = pillSlot as Slot | null;

            if (s) {
                // the label sits outside the arc, away from the target
                const ax = s.x - this._center.x;
                const ay = s.y - this._center.y;
                const len = Math.hypot(ax, ay) || 1;

                this._pill.position.set(s.x + (ax / len) * (this._r + 18), s.y + (ay / len) * (this._r + 16));
            }
            if (folded) this._pill.hide();
            if (this._pill.update(dt)) busy = true;
        }

        // phase changes once the pops land
        if (phase === 'out' && this._slots.every((sl) => sl.open.target === 0 && sl.open.value < 0.02)) {
            if (this._next) this._popIn(this._next);
            else {
                this._follow = null;
                this.state.phase.set('hidden');
                for (const sl of this._slots) sl.open.value = sl.open.velocity = 0;
                g.clear();
                for (const sl of this._slots) if (sl.icon) sl.icon.visible = false;
            }
            busy = true;
        } else if (
            phase === 'in' &&
            this._slots.every(
                (sl) => sl.open.target === 1 && Math.abs(sl.open.value - 1) < 0.01 && Math.abs(sl.open.velocity) < 0.1,
            )
        ) {
            this.state.phase.set('shown');
            this.eventMode = 'static';
        }

        return busy || (anyShown && folded);
    }
}
