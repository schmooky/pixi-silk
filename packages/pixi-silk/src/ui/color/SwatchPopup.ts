import { Container, type FederatedPointerEvent, type PointData, type Ticker } from 'pixi.js';
import { damp } from '../../motion';
import { SilkGraphics } from '../../SilkGraphics';
import { type Signal, signal } from '../../signal';
import { angleDelta } from '../arc';
import { Driver } from '../driver';
import { type InputProfile, type InputProfiles, inputKind, inputProfile, preferredInputKind } from '../input';
import { clamp01 } from '../paint';
import { ColorModel } from './model';

/** Options of {@link SwatchPopup}. */
export interface SwatchPopupOptions {
    /** The colour a pick writes to. Default: a new model. */
    model?: ColorModel;
    /** Colours on the ring, 0xRRGGBB. Leave out to use the model's recent colours. At most 16 are shown. */
    colors?: number[];
    /** Radius to the swatch centres, local units. Scaled by the pointer profile. Default 62. */
    radius?: number;
    /** Swatch diameter, local units. Scaled by the pointer profile. Default 30. */
    size?: number;
    /** Ticker that runs the animation. Default `Ticker.shared`. With `null`, call {@link SwatchPopup.tick} yourself. */
    ticker?: Ticker | null;
    /** Per pointer kind overrides of size, falloff and tap timing. */
    profiles?: InputProfiles;
    /** A colour was picked (already written to the model and committed). */
    onPick?: (color: number) => void;
}

/** What {@link SwatchPopup.openAt} needs from the pointer event that opened it. */
export type SwatchPointer = Pick<FederatedPointerEvent, 'pointerId' | 'pointerType' | 'buttons' | 'global'>;

/**
 * A ring of swatches that pops up around a point, for quick colour changes mid-stroke. Press,
 * drag towards a colour and release, or tap to keep it open and tap a colour. The centre shows the
 * colour under the pointer and cancels. Picks by angle, like the radial menu. It starts closed:
 * add it to the stage, then call {@link SwatchPopup.openAt}.
 */
export class SwatchPopup extends Container {
    /** The colour this popup writes to. */
    readonly model: ColorModel;
    /** True while open. */
    readonly open: Signal<boolean> = signal(false);
    /** Index of the colour under the pointer, or -1. */
    readonly hovered: Signal<number> = signal(-1);
    private readonly _opts: SwatchPopupOptions;
    private readonly _g = new SilkGraphics();
    private readonly _driver: Driver;
    private _colors: number[] = [];
    private _t: number[] = [];
    private _hoverT: number[] = [];
    private _elapsed = 0;
    private _profile: InputProfile = inputProfile('mouse');
    private _press: { id: number; x: number; y: number; t0: number; moved: boolean; opening: boolean } | null = null;
    private _pointer = { d: 0, a: 0 };

    constructor(options: SwatchPopupOptions = {}) {
        super({ label: 'SwatchPopup' });
        this._opts = options;
        this.model = options.model ?? new ColorModel();
        this._driver = new Driver((dt) => this._step(dt), options.ticker);
        this.addChild(this._g);
        this.visible = false;
        this.eventMode = 'none';
        this.hitArea = { contains: () => true };
        this.on('pointerdown', this._onDown, this);
        this.on('globalpointermove', this._onMove, this);
        this.on('pointerup', this._onUp, this);
        this.on('pointerupoutside', this._onUp, this);
    }

    private get _radius(): number {
        return (this._opts.radius ?? 62) * this._profile.scale;
    }

    private get _size(): number {
        return (this._opts.size ?? 30) * this._profile.scale;
    }

    /**
     * Opens centred on (x, y) in the parent's coordinates and moves to the top of the parent. Pass the
     * pointer event that opened it so a press-drag-release picks in one gesture.
     */
    openAt(x: number, y: number, event?: SwatchPointer): void {
        this._profile = inputProfile(event ? inputKind(event) : preferredInputKind(), this._opts.profiles);
        this._colors = [...(this._opts.colors ?? this.model.history.value)].slice(0, 16);
        this._t = this._colors.map(() => 0);
        this._hoverT = this._colors.map(() => 0);
        this._elapsed = 0;
        this.position.set(x, y);
        this.parent?.addChild(this);
        this.visible = true;
        this.eventMode = 'static';
        this._pointer = { d: 0, a: 0 };
        this.hovered.set(-1);
        this._press = null;
        if (event && event.buttons !== 0) {
            const p = this.toLocal(event.global);

            this._press = { id: event.pointerId, x: p.x, y: p.y, t0: performance.now(), moved: false, opening: true };
        }
        this.open.set(true);
        this._driver.wake();
    }

    /** Closes without picking. Does nothing when closed. */
    close(): void {
        if (!this.open.value) return;
        this.open.set(false);
        this.eventMode = 'none';
        this._press = null;
        this._driver.wake();
    }

    /** Advances the animation by `dt` seconds (only needed with `ticker: null`). Returns true while moving. */
    tick(dt: number): boolean {
        return this._driver.tick(dt);
    }

    /** Steers the popup with a point in its own coordinates (centre at 0, 0). Pointer events call this. Call it yourself for gamepads or tests. */
    pointerAt(x: number, y: number): void {
        const d = Math.hypot(x, y);
        const a = Math.atan2(y, x);
        const n = this._colors.length;
        const reach = this._radius + this._size + this._profile.falloff;
        let hit = -1;

        this._pointer = { d, a };
        if (n > 0 && d >= this._size * 0.6 && d <= reach) {
            const slot = (Math.PI * 2) / n;

            hit = Math.round(angleDelta(a, -Math.PI / 2) / slot);
            hit = ((hit % n) + n) % n;
        }
        this.hovered.set(hit);
        this._driver.wake();
    }

    private _local(e: { global: PointData }): PointData {
        return this.toLocal(e.global);
    }

    private _onDown(e: FederatedPointerEvent): void {
        if (!this.open.value) return;
        const p = this._local(e);

        this._press = { id: e.pointerId, x: p.x, y: p.y, t0: performance.now(), moved: false, opening: false };
        this.pointerAt(p.x, p.y);
    }

    private _onMove(e: FederatedPointerEvent): void {
        if (!this.open.value) return;
        if (this._press && e.pointerId !== this._press.id) return;
        if (!this._press && inputKind(e) === 'touch') return;
        const p = this._local(e);

        if (this._press && Math.hypot(p.x - this._press.x, p.y - this._press.y) > this._profile.slop) {
            this._press.moved = true;
        }
        this.pointerAt(p.x, p.y);
    }

    private _onUp(e: FederatedPointerEvent): void {
        const press = this._press;

        if (!press || e.pointerId !== press.id || !this.open.value) return;
        const p = this._local(e);

        this.pointerAt(p.x, p.y);
        this._press = null;
        const i = this.hovered.value;

        if (i >= 0) {
            const color = this._colors[i];

            this.model.setHex(color, undefined, this);
            this.model.commit();
            this._opts.onPick?.(color);
            this.close();

            return;
        }
        const tap = !press.moved && performance.now() - press.t0 < this._profile.tapMs;

        // the opening tap leaves it up, anything else on the centre or outside closes it
        if (press.opening && tap) return;
        this.close();
    }

    private _step(dt: number): boolean {
        const g = this._g;
        const open = this.open.value;
        const n = this._colors.length;
        const R = this._radius;
        const size = this._size;
        let busy = false;
        let shown = false;

        this._elapsed += dt;
        g.clear();
        const centreT = n ? this._t.reduce((a, b) => a + b, 0) / n : open ? 1 : 0;

        for (let i = 0; i < n; i++) {
            const target = open && this._elapsed >= i * 0.015 ? 1 : open ? this._t[i] : 0;
            const hoverTarget = i === this.hovered.value ? 1 : 0;

            this._t[i] = damp(this._t[i], target, open ? 16 : 22, dt);
            this._hoverT[i] = damp(this._hoverT[i], hoverTarget, 20, dt);
            if (Math.abs(this._t[i] - target) > 0.003 || Math.abs(this._hoverT[i] - hoverTarget) > 0.003) busy = true;
            if (open && target === 0) busy = true;
            const t = clamp01(this._t[i]);

            if (t < 0.01) continue;
            shown = true;
            const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
            const r = R * (0.5 + 0.5 * t) + this._hoverT[i] * 8;
            const s = (size / 2) * (0.5 + 0.5 * t) * (1 + 0.18 * this._hoverT[i]);
            const x = Math.cos(a) * r;
            const y = Math.sin(a) * r;

            g.circle(x, y + 1.5, s + 1).fill({ color: 0x000000, alpha: 0.35 * t, blur: 4 });
            g.circle(x, y, s)
                .fill({ color: this._colors[i], alpha: t })
                .stroke({
                    width: 2 + this._hoverT[i],
                    color: 0xffffff,
                    alpha: t * (0.6 + 0.4 * this._hoverT[i]),
                    alignment: 'outside',
                });
        }
        // centre: the colour under the pointer, or the current one
        const hover = this.hovered.value;
        const centre = hover >= 0 ? this._colors[hover] : this.model.hex;
        const c = clamp01(centreT);

        if (c > 0.01) {
            shown = true;
            g.circle(0, 1.5, size * 0.62).fill({ color: 0x000000, alpha: 0.35 * c, blur: 5 });
            g.circle(0, 0, size * 0.6 * (0.6 + 0.4 * c))
                .fill({ color: centre, alpha: c })
                .stroke({
                    width: 3,
                    color: 0xffffff,
                    alpha: c,
                    alignment: 'outside',
                });
            if (this._pointer.d > size * 0.6 && open) {
                g.arcSweep(0, 0, size * 0.6 + 7, this._pointer.a - 0.3, 0.6).stroke({
                    width: 3,
                    color: 0xffffff,
                    alpha: 0.8 * c,
                    cap: 'round',
                });
            }
        }
        if (!open && !shown) this.visible = false;

        return busy || (!open && shown);
    }
}
