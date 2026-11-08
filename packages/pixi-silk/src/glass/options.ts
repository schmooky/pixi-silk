import type { ColorSource } from 'pixi.js';
import { parseColor } from '../color';

/**
 * How a {@link Glass} pane looks. Distances are in local units and scale with the pane's transform.
 * Every field is optional. {@link resolveGlass} fills in {@link GLASS_DEFAULTS} and clamps the ranges.
 */
export interface GlassStyle {
    /** Corner radius in local units, at least 0. Default 28. */
    radius?: number;
    /** Squircle smoothing of the corners, 0 (circular arcs) to 1. Default 0.6. */
    smoothing?: number;
    /** Backdrop blur radius in local units, at least 0. Default 18. */
    blur?: number;
    /** How far the rim shifts what is behind it, in local units. Negative bends the other way. Default 14. */
    refraction?: number;
    /** Colour split at the rim, 0 to 1. Default 0.35. */
    dispersion?: number;
    /** Width of the curved rim that refracts, in local units, at least 1. Default 22. */
    bevel?: number;
    /** Milky whitening, 0 to 1. Default 0.06. */
    frost?: number;
    /** Saturation of what shows through, at least 0. 1 keeps it, 0 is grey, above 1 is more vivid. Default 1.2. */
    saturation?: number;
    /** Tint colour, any Pixi colour source. Default white. */
    tint?: ColorSource;
    /** How much tint to mix in, 0 to 1. Default 0.04. */
    tintAmount?: number;
    /** Opacity of the glass and its shadow, 0 to 1. Default 1. */
    opacity?: number;
    /** Direction the light comes from, in radians. 0 is right, -PI/2 is top. Default -3PI/4 (top left). */
    lightAngle?: number;
    /** Strength of the sheen and the lit rim, at least 0. Default 0.8. */
    light?: number;
    /** Film grain amount, at least 0. Default 0.035. */
    grain?: number;
    /** Opacity of the soft drop shadow under the pane, 0 to 1. 0 turns it off. Default 0.3. */
    shadow?: number;
}

/** Every {@link GlassStyle} field with defaults applied and ranges clamped. `tint` is straight sRGB, 0 to 1 per channel. */
export interface ResolvedGlass {
    radius: number;
    smoothing: number;
    blur: number;
    refraction: number;
    dispersion: number;
    bevel: number;
    frost: number;
    saturation: number;
    tint: [number, number, number];
    tintAmount: number;
    opacity: number;
    lightAngle: number;
    light: number;
    grain: number;
    shadow: number;
}

/** Default values of {@link GlassStyle}, tuned for a pane over bright, colourful content. The tint default is white. */
export const GLASS_DEFAULTS: Readonly<Omit<ResolvedGlass, 'tint'>> = {
    radius: 28,
    smoothing: 0.6,
    blur: 18,
    refraction: 14,
    dispersion: 0.35,
    bevel: 22,
    frost: 0.06,
    saturation: 1.2,
    tintAmount: 0.04,
    opacity: 1,
    lightAngle: (-3 * Math.PI) / 4,
    light: 0.8,
    grain: 0.035,
    shadow: 0.3,
};

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Fills in {@link GLASS_DEFAULTS} and clamps each field to its range. Returns a new object every call. */
export function resolveGlass(style: GlassStyle = {}): ResolvedGlass {
    const o = { ...GLASS_DEFAULTS, ...style };
    const [r, g, b] = parseColor(style.tint ?? 0xffffff);

    return {
        radius: Math.max(0, o.radius),
        smoothing: clamp01(o.smoothing),
        blur: Math.max(0, o.blur),
        refraction: o.refraction,
        dispersion: clamp01(o.dispersion),
        bevel: Math.max(1, o.bevel),
        frost: clamp01(o.frost),
        saturation: Math.max(0, o.saturation),
        tint: [r, g, b],
        tintAmount: clamp01(o.tintAmount),
        opacity: clamp01(o.opacity),
        lightAngle: o.lightAngle,
        light: Math.max(0, o.light),
        grain: Math.max(0, o.grain),
        shadow: clamp01(o.shadow),
    };
}

/** Unit vector towards the light for an angle in radians, in screen space with y pointing down. */
export function lightVector(angle: number): [number, number] {
    return [Math.cos(angle), Math.sin(angle)];
}
