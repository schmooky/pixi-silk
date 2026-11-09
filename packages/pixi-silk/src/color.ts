import { Color, type ColorSource } from 'pixi.js';

/** Straight (non-premultiplied) sRGB colour with alpha, all channels 0..1, as returned by {@link parseColor}. */
export type RGBA = [number, number, number, number];

// created on first use, so importing this module has no side effects
let scratch: Color | undefined;
// hex numbers and strings repeat a lot when redrawing every frame: memoise them
const cache = new Map<number | string, RGBA>();

/**
 * Converts any Pixi `ColorSource` to straight sRGB `[r, g, b, a]`, channels 0..1, with `alpha`
 * multiplied in. Returns a new array. Numbers and strings are cached, up to 1024 of them.
 */
export function parseColor(value: ColorSource, alpha = 1): RGBA {
    const cacheable = typeof value === 'number' || typeof value === 'string';
    let base = cacheable ? cache.get(value) : undefined;

    if (!base) {
        scratch ??= new Color();
        const [r, g, b, a] = scratch.setValue(value).toArray() as number[];

        base = [r, g, b, a ?? 1];
        if (cacheable) {
            if (cache.size > 1024) cache.clear();
            cache.set(value, base);
        }
    }

    return [base[0], base[1], base[2], base[3] * alpha];
}

/** sRGB transfer function, encoded 0..1 to linear light 0..1. */
export const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** Inverse sRGB transfer function, linear light 0..1 to encoded 0..1. */
export const linearToSrgb = (c: number): number => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** Converts linear-light sRGB to OKLab (Björn Ottosson's perceptual colour space), used to interpolate gradients evenly. */
export function linearToOklab(r: number, g: number, b: number): [number, number, number] {
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

    return [
        0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
}

/** Converts OKLab back to linear-light sRGB. Out-of-gamut colours fall outside 0..1, so callers clamp. */
export function oklabToLinear(L: number, a: number, b: number): [number, number, number] {
    const l = L + 0.3963377774 * a + 0.2158037573 * b;
    const m = L - 0.1055613458 * a - 0.0638541728 * b;
    const s = L - 0.0894841775 * a - 1.291485548 * b;
    const l3 = l * l * l;
    const m3 = m * m * m;
    const s3 = s * s * s;

    return [
        4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
        -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
        -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
    ];
}

/** Colour space gradients are interpolated in: perceptual OKLab (default), linear light, or plain sRGB. */
export type ColorSpace = 'oklab' | 'srgb' | 'linear';

/** Converts straight sRGB to coordinates in `space`. Alpha is dropped. */
export function toSpace(rgb: RGBA, space: ColorSpace): [number, number, number] {
    if (space === 'srgb') return [rgb[0], rgb[1], rgb[2]];
    const lr = srgbToLinear(rgb[0]);
    const lg = srgbToLinear(rgb[1]);
    const lb = srgbToLinear(rgb[2]);

    if (space === 'linear') return [lr, lg, lb];

    return linearToOklab(lr, lg, lb);
}

/** Converts coordinates in `space` back to straight sRGB, clamped to 0..1. */
export function fromSpace(c: [number, number, number], space: ColorSpace): [number, number, number] {
    const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

    if (space === 'srgb') return [clamp(c[0]), clamp(c[1]), clamp(c[2])];
    const lin = space === 'linear' ? c : oklabToLinear(c[0], c[1], c[2]);

    return [clamp(linearToSrgb(clamp(lin[0]))), clamp(linearToSrgb(clamp(lin[1]))), clamp(linearToSrgb(clamp(lin[2])))];
}

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

/** Encodes a number as IEEE 754 half float bits, rounded to nearest. Overflow gives infinity. */
export function toHalf(value: number): number {
    f32[0] = value;
    const x = u32[0];
    const sign = (x >>> 16) & 0x8000;
    const exp = ((x >>> 23) & 0xff) - 112;
    const mant = x & 0x7fffff;

    if (exp <= 0) {
        if (exp < -10) return sign;
        const m = (mant | 0x800000) >>> (1 - exp);

        return sign | ((m + 0x1000) >>> 13);
    }
    if (exp >= 31) return sign | 0x7c00;

    return sign | ((exp << 10) + ((mant + 0x1000) >>> 13));
}
