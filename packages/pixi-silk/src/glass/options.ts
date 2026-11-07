import type { ColorSource } from 'pixi.js';
import { parseColor } from '../color';

/** How a {@link Glass} pane looks. Distances are local units, scaled with the pane. */
export interface GlassStyle {
    /** Corner radius. Default 28. */
    radius?: number;
    /** Continuous (squircle) corners from 0 (circular) to 1. Default 0.6. */
    smoothing?: number;
    /** Backdrop blur radius. Default 18. */
    blur?: number;
    /** How far the rim bends what is behind it. Default 14. */
    refraction?: number;
    /** Colour split at the rim, from 0 to 1. Default 0.35. */
    dispersion?: number;
    /** Width of the curved rim that refracts. Default 22. */
    bevel?: number;
    /** Milky whitening, from 0 to 1. Default 0.06. */
    frost?: number;
    /** Colour boost of what shows through. 1 keeps it, above 1 is more vivid. Default 1.2. */
    saturation?: number;
    /** Tint colour. Default white. */
    tint?: ColorSource;
    /** How much tint to mix in, from 0 to 1. Default 0.04. */
    tintAmount?: number;
    /** Overall opacity, from 0 to 1. Default 1. */
    opacity?: number;
    /** Direction the light comes from, radians (0 = right, -PI/2 = top). Default top left. */
    lightAngle?: number;
    /** Strength of the sheen and the lit rim. Default 0.8. */
    light?: number;
    /** Film grain amount. Default 0.035. */
    grain?: number;
    /** Soft drop shadow opacity under the pane. 0 turns it off. Default 0.3. */
    shadow?: number;
}

/** Every {@link GlassStyle} field, resolved. Colours are straight sRGB 0..1. */
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

/** Defaults tuned for a pane over bright, colourful content. */
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

/** Fills in defaults and clamps every field to its valid range. */
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

/** Unit vector pointing towards the light, in screen space (y down). */
export function lightVector(angle: number): [number, number] {
    return [Math.cos(angle), Math.sin(angle)];
}
