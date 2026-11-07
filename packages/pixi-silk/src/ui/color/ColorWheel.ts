import { conic, linear, radial } from '../../gradient';
import { dampAngle } from '../../motion';
import { angleDelta } from '../arc';
import { approach, ColorPicker, type ColorPickerOptions } from './ColorPicker';
import { angleToHue, drawHandle, HUE_STOPS, hueToAngle } from './draw';
import { hsvToRgb, rgbToHex } from './model';

/** Options of {@link ColorWheel}. */
export interface ColorWheelOptions extends ColorPickerOptions {
    /** Disc diameter. Default 200. */
    size?: number;
    /** Width of the value strip on the right. `0` hides it. Default 18. */
    stripWidth?: number;
    /** Space between disc and strip. Default 14. */
    gap?: number;
}

/**
 * Colour wheel: hue around the disc, saturation from the centre out, and a value strip beside it.
 * Origin at the top-left corner, the disc first, then the strip.
 */
export class ColorWheel extends ColorPicker {
    private readonly _size: number;
    private readonly _stripW: number;
    private readonly _gap: number;
    private _angle: number;
    private _s: number;
    private _v: number;

    constructor(options: ColorWheelOptions = {}) {
        super(options, 'ColorWheel');
        this._size = options.size ?? 200;
        this._stripW = options.stripWidth ?? 18;
        this._gap = options.gap ?? 14;
        this._angle = hueToAngle(this.model.h);
        this._s = this.model.s;
        this._v = this.model.v;
    }

    /** Total width (disc, gap and strip). */
    get pickerWidth(): number {
        return this._size + (this._stripW > 0 ? this._gap + this._stripW : 0);
    }

    private get _r(): number {
        return this._size / 2 - 1;
    }

    private get _stripX(): number {
        return this._size + this._gap;
    }

    protected _hitPart(x: number, y: number): string | null {
        const pad = this.state.kind.value === 'touch' ? 10 : 4;
        const c = this._size / 2;

        if (Math.hypot(x - c, y - c) <= this._r + pad) return 'disc';
        if (this._stripW > 0 && x >= this._stripX - pad && x <= this._stripX + this._stripW + pad) {
            if (y >= -pad && y <= this._size + pad) return 'strip';
        }

        return null;
    }

    protected _apply(part: string, x: number, y: number): void {
        const c = this._size / 2;

        if (part === 'strip') {
            this.model.setHsv({ v: 1 - y / this._size }, this);

            return;
        }
        const d = Math.hypot(x - c, y - c);
        const s = Math.min(1, d / this._r);
        // at the centre the hue is undefined: keep it
        const h = d > 0.5 ? angleToHue(Math.atan2(y - c, x - c)) : this.model.h;

        this.model.setHsv({ h, s }, this);
    }

    protected _animate(dt: number): boolean {
        const m = this.model;
        const target = hueToAngle(m.h);
        let busy = false;

        if (Math.abs(angleDelta(this._angle, target)) > 1e-4) {
            this._angle = dampAngle(this._angle, target, this._lambda, dt);
            busy = Math.abs(angleDelta(this._angle, target)) > 1e-4;
            if (!busy) this._angle = target;
        }
        let moving: boolean;

        [this._s, moving] = approach(this._s, m.s, this._lambda, dt);
        busy ||= moving;
        [this._v, moving] = approach(this._v, m.v, this._lambda, dt);
        busy ||= moving;
        // the disc darkens and the strip recolours with the animated values
        if (busy) this._fieldDirty = true;

        return busy;
    }

    protected _drawField(): void {
        const g = this._field;
        const c = this._size / 2;
        const r = this._r;
        const hue = angleToHue(this._angle);

        g.circle(c, c, r).fill({ gradient: conic(HUE_STOPS, { space: 'srgb' }) });
        g.circle(c, c, r).fill({
            gradient: radial(
                [
                    [0, 0xffffff, 1],
                    [1, 0xffffff, 0],
                ],
                { space: 'srgb' },
            ),
        });
        if (this._v < 1) g.circle(c, c, r).fill({ color: 0x000000, alpha: 1 - this._v });
        if (this._stripW > 0) {
            g.pill(this._stripX, 0, this._stripW, this._size).fill({
                gradient: linear([rgbToHex(hsvToRgb(hue, this._s, 1)), 0x000000], {
                    from: [0, 0],
                    to: [0, 1],
                    space: 'srgb',
                }),
            });
        }
    }

    protected _drawMarks(): void {
        const g = this._marks;
        const c = this._size / 2;
        const r = this._handleR;
        const hue = angleToHue(this._angle);
        const rgb = hsvToRgb(hue, this._s, this._v);

        drawHandle(
            g,
            c + Math.cos(this._angle) * this._s * this._r,
            c + Math.sin(this._angle) * this._s * this._r,
            this._part === 'disc' ? r : r * 0.85,
            rgb,
        );
        if (this._stripW > 0) {
            const hy = (1 - this._v) * this._size;

            drawHandle(g, this._stripX + this._stripW / 2, hy, this._part === 'strip' ? r : r * 0.85, rgb);
        }
    }
}
