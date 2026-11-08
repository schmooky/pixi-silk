import type { ColorSource } from 'pixi.js';
import type { FillInput } from '../SilkGraphics';
import type { GlowLayer } from './Glow';

/** Options of {@link neon}. */
export interface NeonOptions {
    /** Rough size of the shape, sets every blur radius. Default 100. */
    size?: number;
    /** Paint of the solid core. Default the glow colour. */
    core?: FillInput;
    /** Strength of the bloom, from 0 to about 2. Default 1. */
    intensity?: number;
    /**
     * What the glow sits on. Light adds up on `dark` surfaces. On `light` ones (white cards) added
     * light would vanish, so the passes paint normally. Default `dark`.
     */
    surface?: 'dark' | 'light';
}

/**
 * The neon recipe: a wide soft bloom and a coloured glow behind (Plus lighter), a solid core,
 * a blurred white highlight and a thin white rim on top.
 */
export function neon(color: ColorSource, options: NeonOptions = {}): GlowLayer[] {
    const { size = 100, core, intensity = 1, surface = 'dark' } = options;
    const k = Math.max(0, intensity);
    const blend = surface === 'dark' ? 'add' : 'normal';
    const light = surface === 'dark' ? 1 : 0.6;

    return [
        { fill: { color, alpha: 0.35 * k * light, blur: size * 0.45 }, blend, scale: 1.45 },
        { fill: { color, alpha: 0.75 * k * light, blur: size * 0.12 }, blend, scale: 1.06 },
        { fill: core ?? color },
        { fill: { color: 0xffffff, alpha: 0.45 * light, blur: size * 0.05 }, blend, scale: 0.8 },
        { stroke: { width: Math.max(1, size * 0.014), color: 0xffffff, alpha: 0.85, blur: size * 0.006 }, blend },
    ];
}

/** A soft halo only: the shape blurred a few times, each wider and fainter. */
export function halo(color: ColorSource, size = 100, rings = 3): GlowLayer[] {
    return Array.from({ length: rings }, (_, i) => {
        const t = (i + 1) / rings;

        return {
            fill: { color, alpha: 0.7 * (1 - t * 0.6), blur: size * (0.06 + 0.4 * t * t) },
            blend: 'add' as const,
            scale: 1 + 0.25 * t,
        };
    }).reverse();
}
