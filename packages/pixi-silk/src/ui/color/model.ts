import { linearToOklab, linearToSrgb, oklabToLinear, srgbToLinear } from '../../color';
import { type Signal, signal } from '../../signal';

/** Hue in degrees (0..360), saturation, value and alpha (0..1). */
export interface HSVA {
    h: number;
    s: number;
    v: number;
    a: number;
}

/** Straight sRGB channels, 0..1. */
export type RGB = [number, number, number];

/** OKLCH: lightness 0..1, chroma (about 0..0.37 inside sRGB), hue in degrees. */
export type OKLCH = [number, number, number];

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const wrapHue = (h: number): number => ((h % 360) + 360) % 360;

/** HSV (hue in degrees) to sRGB. */
export function hsvToRgb(h: number, s: number, v: number): RGB {
    const f = (n: number) => {
        const k = (n + wrapHue(h) / 60) % 6;

        return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    };

    return [f(5), f(3), f(1)];
}

/** sRGB to HSV. Greys have no hue: `hue` is kept for them, so a picker does not jump back to red. */
export function rgbToHsv(r: number, g: number, b: number, hue = 0): { h: number; s: number; v: number } {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = hue;

    if (d > 1e-6) {
        if (max === r) h = 60 * (((g - b) / d) % 6);
        else if (max === g) h = 60 * ((b - r) / d + 2);
        else h = 60 * ((r - g) / d + 4);
    }

    return { h: wrapHue(h), s: max > 1e-6 ? d / max : 0, v: max };
}

/** 0xRRGGBB to sRGB. */
export function hexToRgb(hex: number): RGB {
    return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

/** sRGB to 0xRRGGBB (clamped). */
export function rgbToHex(rgb: RGB): number {
    const c = (v: number) => Math.round(clamp01(v) * 255);

    return (c(rgb[0]) << 16) | (c(rgb[1]) << 8) | c(rgb[2]);
}

/** sRGB to OKLCH. Greys keep `hue`. */
export function rgbToOklch(rgb: RGB, hue = 0): OKLCH {
    const [L, a, b] = linearToOklab(srgbToLinear(rgb[0]), srgbToLinear(rgb[1]), srgbToLinear(rgb[2]));
    const C = Math.hypot(a, b);

    return [L, C, C > 1e-4 ? wrapHue((Math.atan2(b, a) * 180) / Math.PI) : hue];
}

/** OKLCH to sRGB, not clamped: channels outside 0..1 mean the colour is outside sRGB. */
export function oklchToRgbUnclamped(L: number, C: number, h: number): RGB {
    const a = (h * Math.PI) / 180;
    const lin = oklabToLinear(L, C * Math.cos(a), C * Math.sin(a));

    return [linearToSrgb(lin[0]), linearToSrgb(lin[1]), linearToSrgb(lin[2])].map((v) =>
        Number.isFinite(v) ? v : 0,
    ) as RGB;
}

/** True when the OKLCH colour fits in sRGB. */
export function inGamut(L: number, C: number, h: number, eps = 1e-4): boolean {
    const a = (h * Math.PI) / 180;
    const lin = oklabToLinear(L, C * Math.cos(a), C * Math.sin(a));

    return lin.every((v) => v >= -eps && v <= 1 + eps);
}

/** Largest chroma at this lightness and hue that still fits in sRGB. */
export function maxChroma(L: number, h: number): number {
    if (L <= 0 || L >= 1) return 0;
    let lo = 0;
    let hi = 0.4;

    for (let i = 0; i < 18; i++) {
        const mid = (lo + hi) / 2;

        if (inGamut(L, mid, h)) lo = mid;
        else hi = mid;
    }

    return lo;
}

/** OKLCH to sRGB, reducing chroma (keeping lightness and hue) until it fits. */
export function oklchToRgb(L: number, C: number, h: number): RGB {
    const l = clamp01(L);
    const c = inGamut(l, C, h) ? C : Math.min(C, maxChroma(l, h));

    return oklchToRgbUnclamped(l, c, h).map(clamp01) as RGB;
}

/** Relative luminance (WCAG), to pick a readable colour on top. */
export function luminance(rgb: RGB): number {
    return 0.2126 * srgbToLinear(rgb[0]) + 0.7152 * srgbToLinear(rgb[1]) + 0.0722 * srgbToLinear(rgb[2]);
}

/** Options of {@link ColorModel}. */
export interface ColorModelOptions {
    /** Starting colour, 0xRRGGBB. Default 0x0a84ff. */
    color?: number;
    /** Starting alpha. Default 1. */
    alpha?: number;
    /** How many committed colours `history` keeps. Default 16. */
    historySize?: number;
}

/**
 * The colour every picker edits. Stored as HSV + alpha (so hue survives greys and black), readable
 * and writable as hex, RGB and OKLCH. Bind several pickers to one model and they stay in sync.
 *
 * `value` changes continuously during drags. `commit()` (called by pickers when a drag ends)
 * records the colour in `history` and bumps `committed`, which is what an app usually saves.
 */
export class ColorModel {
    /** Current colour as HSVA. Replace the object to change it (it is compared by identity). */
    readonly value: Signal<HSVA>;
    /** Last committed colours, newest first, as 0xRRGGBB. */
    readonly history: Signal<readonly number[]>;
    /** Counts commits, for apps that save on release. */
    readonly committed: Signal<number> = signal(0);
    /** Who made the last change, as passed to the setters. Pickers use it to ignore their own echo. */
    origin: unknown = null;
    private readonly _historySize: number;

    constructor(options: ColorModelOptions = {}) {
        const [r, g, b] = hexToRgb(options.color ?? 0x0a84ff);

        this.value = signal<HSVA>({ ...rgbToHsv(r, g, b), a: options.alpha ?? 1 });
        this.history = signal<readonly number[]>([]);
        this._historySize = options.historySize ?? 16;
    }

    /** Hue in degrees. */
    get h(): number {
        return this.value.value.h;
    }

    get s(): number {
        return this.value.value.s;
    }

    get v(): number {
        return this.value.value.v;
    }

    get alpha(): number {
        return this.value.value.a;
    }

    /** Current colour as straight sRGB. */
    get rgb(): RGB {
        const { h, s, v } = this.value.value;

        return hsvToRgb(h, s, v);
    }

    /** Current colour as 0xRRGGBB. */
    get hex(): number {
        return rgbToHex(this.rgb);
    }

    /** Current colour as OKLCH. */
    get oklch(): OKLCH {
        return rgbToOklch(this.rgb, this.h);
    }

    /** Changes any of h, s, v, a. Values are clamped (hue wrapped). */
    setHsv(next: Partial<HSVA>, origin: unknown = null): void {
        const cur = this.value.value;
        const h = next.h === undefined ? cur.h : wrapHue(next.h);
        const out = {
            h,
            s: clamp01(next.s ?? cur.s),
            v: clamp01(next.v ?? cur.v),
            a: clamp01(next.a ?? cur.a),
        };

        if (out.h === cur.h && out.s === cur.s && out.v === cur.v && out.a === cur.a) return;
        this.origin = origin;
        this.value.set(out);
    }

    /** Sets the colour from sRGB, keeping the hue when the colour is grey. */
    setRgb(rgb: RGB, origin: unknown = null): void {
        const { h, s, v } = rgbToHsv(clamp01(rgb[0]), clamp01(rgb[1]), clamp01(rgb[2]), this.h);

        this.setHsv({ h, s, v }, origin);
    }

    /** Sets the colour from 0xRRGGBB (alpha unchanged unless given). */
    setHex(hex: number, alpha?: number, origin: unknown = null): void {
        const { h, s, v } = rgbToHsv(...hexToRgb(hex), this.h);

        this.setHsv({ h, s, v, a: alpha }, origin);
    }

    /** Sets the colour from OKLCH, reducing chroma to fit sRGB. */
    setOklch(lch: OKLCH, origin: unknown = null): void {
        this.setRgb(oklchToRgb(lch[0], lch[1], lch[2]), origin);
    }

    /** Records the current colour in `history` (no duplicates) and bumps `committed`. */
    commit(): void {
        const hex = this.hex;
        const list = [hex, ...this.history.value.filter((c) => c !== hex)].slice(0, this._historySize);

        this.history.set(list);
        this.committed.update((n) => n + 1);
    }
}
