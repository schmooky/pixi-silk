import { Color, type ColorSource } from 'pixi.js';
import { Gradient, radial } from '../gradient';
import type { GlowLayer } from './Glow';

/** Options of {@link neon}. */
export interface NeonOptions {
    /** Rough size of the shape, sets every blur radius. The recipe is tuned at 100. Default 100. */
    size?: number;
    /** Paint of the solid core. Default a radial gradient from a pale tint to the glow colour. */
    core?: ColorSource | Gradient;
    /** Strength of the bloom, from 0 to about 2. Default 1. */
    intensity?: number;
    /**
     * What the glow sits on. Light adds up on `dark` surfaces. On `light` ones (white cards) added
     * light would vanish, so the passes paint normally. Default `dark`.
     */
    surface?: 'dark' | 'light';
}

/** Mixes `color` towards white by `t` (0 keeps it, 1 is white). */
function tint(color: ColorSource, t: number): number {
    const [r, g, b] = new Color(color).toArray();

    return new Color([r + (1 - r) * t, g + (1 - g) * t, b + (1 - b) * t]).toNumber();
}

/**
 * The neon recipe from Figma, five layers back to front, for a shape about `size` wide.
 * A wide bloom and a tighter one go behind, both Plus lighter. Then the core: a radial gradient
 * with two coloured drop glows and a pale inner shadow. A 60% white copy added on top makes the
 * middle burn towards white, and a thin blurred white outline finishes it.
 */
export function neon(color: ColorSource, options: NeonOptions = {}): GlowLayer[] {
    const { size = 100, intensity = 1, surface = 'dark' } = options;
    const s = size / 100;
    const k = Math.max(0, intensity);
    const dark = surface === 'dark';
    const blend = dark ? 'add' : 'normal';
    const light = dark ? 1 : 0.55;
    const pale = tint(color, 0.85);
    const bloom = radial(
        [
            [0, tint(color, 0.35), 1],
            [1, color, 0.6],
        ],
        { radius: 0.75 },
    );
    const core =
        options.core ??
        radial(
            [
                [0, pale, 1],
                [0.55, tint(color, 0.3), 1],
                [1, color, 1],
            ],
            { center: [0.5, 0.45], radius: 0.7 },
        );

    return [
        // 5. bloom, layer blur 110 (sigma 55), hard light: the room fills with colour
        { fill: { gradient: bloom, alpha: 0.75 * k * light, blur: 55 * s, spread: 28 * s }, blend },
        // 4. bloom, layer blur 50, plus lighter
        { fill: { gradient: bloom, alpha: 0.7 * k * light, blur: 25 * s, spread: 6 * s }, blend },
        // 3. the core: gradient, two drop glows, a pale inner shadow
        { fill: { color, alpha: 0.3 * light, blur: 7.5 * s }, blend },
        { fill: { color: tint(color, 0.1), alpha: 0.2 * light, blur: 30 * s }, blend },
        {
            fill: {
                ...(core instanceof Gradient ? { gradient: core } : { color: core }),
                innerShadow: { color: tint(color, 0.95), blur: 5 * s, spread: 2 * s },
            },
        },
        // 2. white at 60%, layer blur 20, plus lighter: the middle burns out
        { fill: { color: 0xffffff, alpha: 0.6 * light * Math.min(1, k), blur: 10 * s }, blend },
        // 1. white outline, layer blur 10
        { stroke: { width: 2 * s, color: 0xffffff, alpha: 0.9, blur: 5 * s } },
    ];
}

/** A soft halo only: the shape blurred a few times, each wider and fainter. */
export function halo(color: ColorSource, size = 100, rings = 3): GlowLayer[] {
    return Array.from({ length: rings }, (_, i) => {
        const t = (i + 1) / rings;

        return {
            fill: { color, alpha: 0.7 * (1 - t * 0.6), blur: size * (0.06 + 0.4 * t * t), spread: size * 0.04 * t },
            blend: 'add' as const,
        };
    }).reverse();
}

/**
 * Stacked white shadows behind a shape, as in CSS: `[blur, spread]` pairs with the CSS blur
 * radius (twice the gaussian sigma). The default is the classic 8 / 32+8 / 128+32 stack.
 */
export function shadowStack(
    color: ColorSource = 0xffffff,
    stack: [blur: number, spread: number][] = [
        [8, 0],
        [32, 8],
        [128, 32],
    ],
    alpha = 0.6,
): GlowLayer[] {
    return stack.map(([blur, spread]) => ({ fill: { color, alpha, blur: blur / 2, spread }, blend: 'add' as const }));
}
