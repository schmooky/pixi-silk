import { linear } from '../../gradient';
import { approach, ColorPicker, type ColorPickerOptions } from './ColorPicker';
import { drawHandle } from './draw';
import { maxChroma, type OKLCH, oklchToRgb, rgbToHex, rgbToOklch } from './model';

/** Options of {@link OklchPicker}. */
export interface OklchPickerOptions extends ColorPickerOptions {
    /** Width of the lightness / chroma plane, local units. Default 240. */
    width?: number;
    /** Height of the plane, local units. Default 160. */
    height?: number;
    /** Highest chroma shown. Default 0.37 (the most saturated sRGB colours). */
    maxChroma?: number;
    /** Height of the hue strip under the plane, local units. `0` hides it. Default 16. */
    stripHeight?: number;
    /** Space between plane and strip, local units. Default 12. */
    gap?: number;
    /** Rows the plane is drawn with, at least 8. More is smoother, each costs one gradient. Default 48. */
    rows?: number;
}

const OUT_OF_GAMUT = 0x2c2c2e;

/**
 * Perceptual picker: lightness (top to bottom) against chroma (left to right) for one OKLCH hue,
 * with an OKLCH hue strip below. The area outside sRGB is greyed, with its edge drawn, so colours
 * stay picked by how they look, not by how a screen mixes them.
 */
export class OklchPicker extends ColorPicker {
    private readonly _w: number;
    private readonly _h: number;
    private readonly _cmax: number;
    private readonly _stripH: number;
    private readonly _gap: number;
    private readonly _rows: number;
    /** The picker keeps its own LCH so hue and chroma survive round trips through sRGB. */
    private _lch: OKLCH;
    private _shown: OKLCH;

    constructor(options: OklchPickerOptions = {}) {
        super(options, 'OklchPicker');
        this._w = options.width ?? 240;
        this._h = options.height ?? 160;
        this._cmax = options.maxChroma ?? 0.37;
        this._stripH = options.stripHeight ?? 16;
        this._gap = options.gap ?? 12;
        this._rows = Math.max(8, options.rows ?? 48);
        this._lch = this.model.oklch;
        this._shown = [...this._lch];
    }

    /** Current OKLCH as this picker sees it (chroma may exceed what sRGB shows). A copy. */
    get lch(): OKLCH {
        return [...this._lch];
    }

    private get _stripY(): number {
        return this._h + this._gap;
    }

    protected override _onModel(_hueChanged: boolean, own: boolean): void {
        if (!own) {
            const [L, C, h] = rgbToOklch(this.model.rgb, this._lch[2]);

            this._lch = [L, C, h];
        }
        this._fieldDirty = true;
    }

    protected _hitPart(x: number, y: number): string | null {
        const pad = this.state.kind.value === 'touch' ? 10 : 4;

        if (x < -pad || x > this._w + pad) return null;
        if (y >= -pad && y <= this._h + pad) return 'plane';
        if (this._stripH > 0 && y >= this._stripY - pad && y <= this._stripY + this._stripH + pad) return 'hue';

        return null;
    }

    protected _apply(part: string, x: number, y: number): void {
        const clamp = (v: number) => Math.max(0, Math.min(1, v));

        if (part === 'hue') {
            this._lch = [this._lch[0], this._lch[1], clamp(x / this._w) * 360];
        } else {
            const L = clamp(1 - y / this._h);
            const C = clamp(x / this._w) * this._cmax;

            // dragging past the gamut edge slides along it
            this._lch = [L, Math.min(C, maxChroma(L, this._lch[2])), this._lch[2]];
        }
        this.model.setOklch(this._lch, this);
    }

    protected _animate(dt: number): boolean {
        let busy = false;
        let moving: boolean;

        for (let i = 0; i < 3; i++) {
            [this._shown[i], moving] = approach(this._shown[i], this._lch[i], this._lambda, dt, i === 2 ? 0.01 : 1e-4);
            busy ||= moving;
        }

        return busy;
    }

    protected _drawField(): void {
        const g = this._field;
        const h = this._lch[2];
        const rows = this._rows;
        const rowH = this._h / rows;
        const edge: number[] = [];

        g.roundRect(0, 0, this._w, this._h, 6).fill(OUT_OF_GAMUT);
        for (let i = 0; i < rows; i++) {
            const L = 1 - (i + 0.5) / rows;
            const cm = maxChroma(L, h);
            const x1 = Math.min(1, cm / this._cmax) * this._w;
            const y = i * rowH;

            edge.push(x1, y + rowH / 2);
            if (x1 < 0.5) continue;
            // along a row only chroma changes, which is a straight line in OKLab: exact colours
            const full = x1 >= this._w - 0.5 ? 6 : 0;
            const top = i === 0;
            const bottom = i === rows - 1;

            g.roundRect(0, top ? y : y - 0.35, x1, rowH + (top || bottom ? 0.35 : 0.7), [
                top ? 6 : 0,
                top ? full : 0,
                bottom ? full : 0,
                bottom ? 6 : 0,
            ]).fill({
                gradient: linear([rgbToHex(oklchToRgb(L, 0, h)), rgbToHex(oklchToRgb(L, cm, h))], {
                    from: [0, 0],
                    to: [x1, 0],
                    units: 'local',
                }),
            });
        }
        g.polyline(edge).stroke({ width: 1.5, color: 0xffffff, alpha: 0.55 });
        if (this._stripH > 0) {
            const stops: number[] = [];

            for (let i = 0; i <= 12; i++) stops.push(rgbToHex(oklchToRgb(0.75, 0.13, i * 30)));
            g.pill(0, this._stripY, this._w, this._stripH).fill({
                gradient: linear(stops, { from: [0, 0], to: [1, 0] }),
            });
        }
    }

    protected _drawMarks(): void {
        const g = this._marks;
        const [L, C, h] = this._shown;
        const r = this._handleR;
        const rgb = oklchToRgb(L, C, h);

        drawHandle(g, (C / this._cmax) * this._w, (1 - L) * this._h, this._part === 'plane' ? r : r * 0.85, rgb);
        if (this._stripH > 0) {
            drawHandle(
                g,
                (h / 360) * this._w,
                this._stripY + this._stripH / 2,
                this._part === 'hue' ? r : r * 0.85,
                oklchToRgb(0.75, 0.13, h),
            );
        }
    }
}
