import { Color, type ColorSource } from 'pixi.js';

/** Converts any Pixi colour source to 0xRRGGBB. Alpha is dropped. */
export function hex(color: ColorSource): number {
    return Color.shared.setValue(color).toNumber();
}

/** Mixes two 0xRRGGBB colours per channel in sRGB (not linear light). `t` 0 gives `a`, 1 gives `b`, clamped. */
export function mix(a: number, b: number, t: number): number {
    if (t <= 0) return a;
    if (t >= 1) return b;
    const ch = (s: number) => {
        const x = (a >> s) & 255;

        return Math.round(x + (((b >> s) & 255) - x) * t) << s;
    };

    return ch(16) | ch(8) | ch(0);
}

/** Back-out easing: maps 0..1 to 0..1, overshooting past 1 near the end. `s` sets the overshoot. */
export function outBack(t: number, s = 1.6): number {
    const u = t - 1;

    return 1 + u * u * ((s + 1) * u + s);
}

/** Clamps to 0..1. */
export function clamp01(v: number): number {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}
