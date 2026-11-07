import { conic, linear } from '../../gradient';
import { dampAngle } from '../../motion';
import { angleDelta } from '../arc';
import { approach, ColorPicker, type ColorPickerOptions } from './ColorPicker';
import { angleToHue, closestBarycentric, drawHandle, foot, HUE_STOPS, hueToAngle, pureHue } from './draw';
import { hsvToRgb } from './model';

/** Options of the hue-ring pickers. */
export interface HueRingOptions extends ColorPickerOptions {
    /** Outer diameter. Default 220. */
    size?: number;
    /** Thickness of the hue ring. Default 18. */
    ringWidth?: number;
    /** Space between the ring and the inner area. Default 8. */
    gap?: number;
}

/**
 * Hue ring around an inner saturation / value area. The ring and the area are separate drag
 * targets: start on the ring and the drag only turns the hue, wherever the pointer goes.
 * Origin at the top-left corner of its `size` square.
 */
abstract class HueRingPicker extends ColorPicker {
    protected readonly _size: number;
    protected readonly _ringW: number;
    protected readonly _gap: number;
    protected _angle: number;
    protected _s: number;
    protected _v: number;

    constructor(options: HueRingOptions, label: string) {
        super(options, label);
        this._size = options.size ?? 220;
        this._ringW = options.ringWidth ?? 18;
        this._gap = options.gap ?? 8;
        this._angle = hueToAngle(this.model.h);
        this._s = this.model.s;
        this._v = this.model.v;
    }

    /** Outer diameter. */
    get size(): number {
        return this._size;
    }

    protected get _c(): number {
        return this._size / 2;
    }

    /** Radius of the middle of the ring. */
    protected get _ringR(): number {
        return this._size / 2 - this._ringW / 2 - 1;
    }

    /** Radius the inner area must fit in. */
    protected get _innerR(): number {
        return this._size / 2 - this._ringW - this._gap - 1;
    }

    protected _hitPart(x: number, y: number): string | null {
        const d = Math.hypot(x - this._c, y - this._c);
        const pad = this.state.kind.value === 'touch' ? 10 : 4;

        if (Math.abs(d - this._ringR) <= this._ringW / 2 + pad) return 'ring';
        if (this._inArea(x, y, pad)) return 'area';

        return null;
    }

    protected _apply(part: string, x: number, y: number): void {
        if (part === 'ring') {
            this.model.setHsv({ h: angleToHue(Math.atan2(y - this._c, x - this._c)) }, this);

            return;
        }
        const [s, v] = this._areaToSv(x, y);

        this.model.setHsv({ s, v }, this);
    }

    protected override _onModel(hueChanged: boolean): void {
        if (hueChanged) this._fieldDirty = true;
    }

    protected _animate(dt: number): boolean {
        const m = this.model;
        const target = hueToAngle(m.h);
        let busy = false;

        if (Math.abs(angleDelta(this._angle, target)) > 1e-4) {
            this._angle = dampAngle(this._angle, target, this._lambda, dt);
            busy = Math.abs(angleDelta(this._angle, target)) > 1e-4;
            if (!busy) this._angle = target;
            // a rotating area (the triangle) follows the animated angle
            if (this._areaFollowsHue) this._fieldDirty = true;
        }
        let moving: boolean;

        [this._s, moving] = approach(this._s, m.s, this._lambda, dt);
        busy ||= moving;
        [this._v, moving] = approach(this._v, m.v, this._lambda, dt);

        return busy || moving;
    }

    protected _drawField(): void {
        const c = this._c;

        this._field
            .circle(c, c, this._ringR)
            .stroke({ width: this._ringW, gradient: conic(HUE_STOPS, { space: 'srgb' }) });
        this._drawArea(angleToHue(this._angle));
    }

    protected _drawMarks(): void {
        const g = this._marks;
        const r = this._handleR;
        const c = this._c;
        const hue = angleToHue(this._angle);
        const ringHandle = this._part === 'ring' ? r : r * 0.85;

        drawHandle(
            g,
            c + Math.cos(this._angle) * this._ringR,
            c + Math.sin(this._angle) * this._ringR,
            Math.min(ringHandle, this._ringW / 2 + 3),
            hsvToRgb(hue, 1, 1),
        );
        const [x, y] = this._svToArea(this._s, this._v);

        drawHandle(g, x, y, this._part === 'area' ? r : r * 0.85, hsvToRgb(hue, this._s, this._v));
    }

    /** True when the inner area rotates with the hue. */
    protected get _areaFollowsHue(): boolean {
        return false;
    }

    protected abstract _inArea(x: number, y: number, pad: number): boolean;
    protected abstract _areaToSv(x: number, y: number): [number, number];
    protected abstract _svToArea(s: number, v: number): [number, number];
    protected abstract _drawArea(hue: number): void;
}

/**
 * Hue ring with a saturation / value triangle inside (Blender, Krita, GIMP). The triangle turns so
 * its pure-hue corner points at the hue on the ring. Corners: pure hue, white, black.
 */
export class HueTrianglePicker extends HueRingPicker {
    constructor(options: HueRingOptions = {}) {
        super(options, 'HueTrianglePicker');
    }

    protected override get _areaFollowsHue(): boolean {
        return true;
    }

    /** Corners [hue, white, black] for the displayed angle. */
    private _corners(): [number, number, number, number, number, number] {
        const c = this._c;
        const r = this._innerR - 1;
        const a = this._angle;
        const third = (Math.PI * 2) / 3;

        return [
            c + Math.cos(a) * r,
            c + Math.sin(a) * r,
            c + Math.cos(a - third) * r,
            c + Math.sin(a - third) * r,
            c + Math.cos(a + third) * r,
            c + Math.sin(a + third) * r,
        ];
    }

    protected _inArea(x: number, y: number, pad: number): boolean {
        const [hx, hy, wx, wy, kx, ky] = this._corners();
        const [a, b, c] = closestBarycentric(x, y, hx, hy, wx, wy, kx, ky);
        const px = a * hx + b * wx + c * kx;
        const py = a * hy + b * wy + c * ky;

        return Math.hypot(px - x, py - y) <= pad;
    }

    protected _areaToSv(x: number, y: number): [number, number] {
        const [hx, hy, wx, wy, kx, ky] = this._corners();
        const [h, w] = closestBarycentric(x, y, hx, hy, wx, wy, kx, ky);
        const v = h + w;

        return [v > 1e-5 ? h / v : this.model.s, v];
    }

    protected _svToArea(s: number, v: number): [number, number] {
        const [hx, hy, wx, wy, kx, ky] = this._corners();
        const h = s * v;
        const w = v * (1 - s);
        const k = 1 - v;

        return [h * hx + w * wx + k * kx, h * hy + w * wy + k * ky];
    }

    protected _drawArea(hue: number): void {
        const g = this._field;
        const [hx, hy, wx, wy, kx, ky] = this._corners();
        // pure hue, then black fading from its corner, then white fading from its corner
        const [bfx, bfy] = foot(kx, ky, hx, hy, wx, wy);
        const [wfx, wfy] = foot(wx, wy, hx, hy, kx, ky);

        g.triangle(hx, hy, wx, wy, kx, ky).fill(pureHue(hue));
        g.triangle(hx, hy, wx, wy, kx, ky).fill({
            gradient: linear(
                [
                    [0, 0x000000, 1],
                    [1, 0x000000, 0],
                ],
                { from: [kx, ky], to: [bfx, bfy], units: 'local', space: 'srgb' },
            ),
        });
        g.triangle(hx, hy, wx, wy, kx, ky).fill({
            gradient: linear(
                [
                    [0, 0xffffff, 1],
                    [1, 0xffffff, 0],
                ],
                { from: [wx, wy], to: [wfx, wfy], units: 'local', space: 'srgb' },
            ),
        });
    }
}

/** Hue ring with a saturation (left to right) / value (bottom to top) square inside. */
export class HueSquarePicker extends HueRingPicker {
    constructor(options: HueRingOptions = {}) {
        super(options, 'HueSquarePicker');
    }

    /** Half the side of the inner square. */
    private get _half(): number {
        return this._innerR / Math.SQRT2 - 1;
    }

    protected _inArea(x: number, y: number, pad: number): boolean {
        const h = this._half + pad;

        return Math.abs(x - this._c) <= h && Math.abs(y - this._c) <= h;
    }

    protected _areaToSv(x: number, y: number): [number, number] {
        const h = this._half;
        const s = (x - (this._c - h)) / (2 * h);
        const v = 1 - (y - (this._c - h)) / (2 * h);

        return [Math.max(0, Math.min(1, s)), Math.max(0, Math.min(1, v))];
    }

    protected _svToArea(s: number, v: number): [number, number] {
        const h = this._half;

        return [this._c - h + s * 2 * h, this._c - h + (1 - v) * 2 * h];
    }

    protected _drawArea(hue: number): void {
        drawSvSquare(this._field, this._c - this._half, this._c - this._half, this._half * 2, this._half * 2, hue, 4);
    }
}

/** Exact HSV saturation / value square: hue, white fading to the right, black rising from the bottom. */
export function drawSvSquare(
    g: import('../../SilkGraphics').SilkGraphics,
    x: number,
    y: number,
    w: number,
    h: number,
    hue: number,
    radius = 0,
): void {
    g.roundRect(x, y, w, h, radius).fill(pureHue(hue));
    g.roundRect(x, y, w, h, radius).fill({
        gradient: linear(
            [
                [0, 0xffffff, 1],
                [1, 0xffffff, 0],
            ],
            { from: [0, 0], to: [1, 0], space: 'srgb' },
        ),
    });
    g.roundRect(x, y, w, h, radius).fill({
        gradient: linear(
            [
                [0, 0x000000, 0],
                [1, 0x000000, 1],
            ],
            { from: [0, 0], to: [0, 1], space: 'srgb' },
        ),
    });
}
