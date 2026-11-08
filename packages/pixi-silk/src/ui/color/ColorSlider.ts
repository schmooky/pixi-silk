import { Container, type Text, type Ticker } from 'pixi.js';
import { linear } from '../../gradient';
import { createIcon } from '../icon';
import type { InputProfiles } from '../input';
import { approach, ColorPicker, type ColorPickerOptions } from './ColorPicker';
import { checker, drawHandle } from './draw';
import { ColorModel, hsvToRgb, oklchToRgb, type RGB, rgbToHex, rgbToOklch } from './model';

/**
 * Channel a {@link ColorSlider} edits: HSV (`h`, `s`, `v`), RGB (`r`, `g`, `b`),
 * OKLCH (`L`, `C`, `H`) or alpha (`a`).
 */
export type ColorChannel = 'h' | 's' | 'v' | 'r' | 'g' | 'b' | 'L' | 'C' | 'H' | 'a';

/** Highest OKLCH chroma a slider spans. */
const C_MAX = 0.37;

/** Options of {@link ColorSlider}. */
export interface ColorSliderOptions extends ColorPickerOptions {
    /** The channel this track edits. */
    channel: ColorChannel;
    /** Track length in local units. Default 220. */
    width?: number;
    /** Track thickness in local units. Default 18. */
    height?: number;
    /** `vertical` runs bottom (0) to top (1). Default `horizontal`. */
    orientation?: 'horizontal' | 'vertical';
}

/** Reads one channel of the model, as 0..1. Hues map 0..360 degrees to 0..1, OKLCH chroma 0..0.37 to 0..1. */
export function readChannel(model: ColorModel, channel: ColorChannel): number {
    switch (channel) {
        case 'h':
            return model.h / 360;
        case 's':
            return model.s;
        case 'v':
            return model.v;
        case 'a':
            return model.alpha;
        case 'r':
        case 'g':
        case 'b':
            return model.rgb['rgb'.indexOf(channel)];
        default: {
            const lch = model.oklch;

            return channel === 'L' ? lch[0] : channel === 'C' ? Math.min(1, lch[1] / C_MAX) : lch[2] / 360;
        }
    }
}

/** Writes one channel of the model from `t` 0..1 (clamped), with the scales of {@link readChannel}. OKLCH writes reduce chroma to fit sRGB. */
export function writeChannel(model: ColorModel, channel: ColorChannel, t: number, origin: unknown = null): void {
    const v = Math.max(0, Math.min(1, t));

    switch (channel) {
        case 'h':
            model.setHsv({ h: v * 359.999 }, origin);
            break;
        case 's':
        case 'v':
            model.setHsv({ [channel]: v }, origin);
            break;
        case 'a':
            model.setHsv({ a: v }, origin);
            break;
        case 'r':
        case 'g':
        case 'b': {
            const rgb = model.rgb;

            rgb['rgb'.indexOf(channel)] = v;
            model.setRgb(rgb, origin);
            break;
        }
        default: {
            const lch = model.oklch;

            if (channel === 'L') lch[0] = v;
            else if (channel === 'C') lch[1] = v * C_MAX;
            else lch[2] = v * 359.999;
            model.setOklch(lch, origin);
        }
    }
}

/** The colour at position `t` (0..1) of a channel track, given the rest of the current colour. */
export function channelColor(model: ColorModel, channel: ColorChannel, t: number): RGB {
    const { h, s, v } = model.value.value;

    switch (channel) {
        case 'h':
            return hsvToRgb(t * 360, s, v);
        case 's':
            return hsvToRgb(h, t, v);
        case 'v':
            return hsvToRgb(h, s, t);
        case 'a':
            return model.rgb;
        case 'r':
        case 'g':
        case 'b': {
            const rgb = model.rgb;

            rgb['rgb'.indexOf(channel)] = t;

            return rgb;
        }
        default: {
            const [L, C, H] = rgbToOklch(model.rgb, h);
            const lch: [number, number, number] =
                channel === 'L' ? [t, C, H] : channel === 'C' ? [L, t * C_MAX, H] : [L, C, t * 360];

            return oklchToRgb(lch[0], lch[1], lch[2]);
        }
    }
}

/**
 * A gradient track for one channel. The track shows what each position would give with the rest
 * of the colour unchanged, so moving the hue recolours the saturation track and so on.
 */
export class ColorSlider extends ColorPicker {
    /** The channel this track edits. */
    readonly channel: ColorChannel;
    private readonly _len: number;
    private readonly _thick: number;
    private readonly _vertical: boolean;
    private _t: number;

    constructor(options: ColorSliderOptions) {
        super(options, `ColorSlider(${options.channel})`);
        this.channel = options.channel;
        this._len = options.width ?? 220;
        this._thick = options.height ?? 18;
        this._vertical = options.orientation === 'vertical';
        this._t = readChannel(this.model, this.channel);
    }

    /** Track length in local units. */
    get length(): number {
        return this._len;
    }

    /** Track thickness in local units. */
    get thickness(): number {
        return this._thick;
    }

    private _toT(x: number, y: number): number {
        const r = this._thick / 2;

        return this._vertical ? 1 - (y - r) / (this._len - 2 * r) : (x - r) / (this._len - 2 * r);
    }

    private _fromT(t: number): [number, number] {
        const r = this._thick / 2;
        const along = r + t * (this._len - 2 * r);

        return this._vertical ? [r, this._len - along] : [along, r];
    }

    protected _hitPart(x: number, y: number): string | null {
        const pad = this.state.kind.value === 'touch' ? 10 : 4;
        const [w, h] = this._vertical ? [this._thick, this._len] : [this._len, this._thick];

        return x >= -pad && y >= -pad && x <= w + pad && y <= h + pad ? 'track' : null;
    }

    protected _apply(_part: string, x: number, y: number): void {
        writeChannel(this.model, this.channel, this._toT(x, y), this);
    }

    protected _animate(dt: number): boolean {
        const target = readChannel(this.model, this.channel);
        let moving: boolean;

        [this._t, moving] = approach(this._t, target, this._lambda, dt);

        return moving;
    }

    protected _drawField(): void {
        const g = this._field;
        const [w, h] = this._vertical ? [this._thick, this._len] : [this._len, this._thick];
        const r = this._thick / 2;
        const oklch = this.channel === 'L' || this.channel === 'C' || this.channel === 'H';
        const samples = this.channel === 'h' ? 7 : oklch ? 13 : 2;
        const stops: [number, number, number][] = [];

        for (let i = 0; i < samples; i++) {
            const t = i / (samples - 1);

            stops.push([t, rgbToHex(channelColor(this.model, this.channel, t)), this.channel === 'a' ? t : 1]);
        }
        if (this.channel === 'a') checker(g, 0, 0, w, h, r, r);
        const from: [number, number] = this._vertical ? [0, 1] : [0, 0];
        const to: [number, number] = this._vertical ? [0, 0] : [1, 0];

        g.roundRect(0, 0, w, h, r).fill({ gradient: linear(stops, { from, to, space: oklch ? 'oklab' : 'srgb' }) });
    }

    protected _drawMarks(): void {
        const [x, y] = this._fromT(this._t);
        const r = Math.min(this._handleR + 1, this._thick / 2 + 4);

        drawHandle(
            this._marks,
            x,
            y,
            this._part ? r : r * 0.9,
            channelColor(this.model, this.channel, this._t),
            this.channel === 'a' ? this.model.alpha : 1,
        );
    }
}

/** Options of {@link ChannelSliders}. */
export interface ChannelSlidersOptions {
    /** The colour every track edits. Default: one new model that all the tracks share. */
    model?: ColorModel;
    /** Which channels: `hsv`, `rgb` or `oklch`. Default `hsv`. */
    mode?: 'hsv' | 'rgb' | 'oklch';
    /** Adds an alpha track. Default true. */
    alpha?: boolean;
    /** Track length in local units. Default 220. */
    width?: number;
    /** Track thickness in local units. Default 16. */
    height?: number;
    /** Space between tracks in local units. Default 12. */
    gap?: number;
    /** Letter labels before the tracks. They take 22 units on the left. Default true. */
    labels?: boolean;
    /** Passed to every track. See {@link ColorPickerOptions.ticker}. */
    ticker?: Ticker | null;
    /** Passed to every track. */
    profiles?: InputProfiles;
}

const MODES: Record<NonNullable<ChannelSlidersOptions['mode']>, ColorChannel[]> = {
    hsv: ['h', 's', 'v'],
    rgb: ['r', 'g', 'b'],
    oklch: ['L', 'C', 'H'],
};

/** A stack of {@link ColorSlider}s for one colour model, with optional letter labels. */
export class ChannelSliders extends Container {
    /** The tracks, top to bottom, alpha last. */
    readonly sliders: ColorSlider[];
    /** The colour the tracks edit: `options.model`, or the model created for them. */
    readonly model: ColorModel;

    constructor(options: ChannelSlidersOptions = {}) {
        super({ label: 'ChannelSliders' });
        const model = options.model ?? new ColorModel();

        this.model = model;
        const channels = [...MODES[options.mode ?? 'hsv'], ...(options.alpha === false ? [] : ['a' as const])];
        const h = options.height ?? 16;
        const gap = options.gap ?? 12;
        const labels = options.labels ?? true;
        const x = labels ? 22 : 0;

        this.sliders = channels.map((channel, i) => {
            const slider = new ColorSlider({
                channel,
                model,
                width: options.width ?? 220,
                height: h,
                ticker: options.ticker,
                profiles: options.profiles,
            });

            slider.position.set(x, i * (h + gap));
            this.addChild(slider);
            if (labels) {
                const text = createIcon(channel.toUpperCase(), 30, { fontSize: 11, fill: 0x8e8e93 }) as Text;

                text.position.set(7, i * (h + gap) + h / 2);
                this.addChild(text);
            }

            return slider;
        });
    }
}
