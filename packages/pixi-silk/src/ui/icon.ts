import { type Container, Sprite, Text, type TextStyleOptions, Texture } from 'pixi.js';
import { SilkGraphics } from '../SilkGraphics';

/**
 * Anything that can sit in a widget slot:
 * - a string: drawn as text (a word, a glyph, an emoji),
 * - a texture: drawn as a sprite fitted to the slot,
 * - a container: used as is,
 * - a function: draws a vector icon with pixi-silk, centred on (0, 0), `size` wide, in white.
 *
 * Icons are drawn white and coloured with `tint`, so widgets recolour them without redrawing.
 */
export type IconSource = string | Texture | Container | ((g: SilkGraphics, size: number) => void);

/** Builds a centred, tintable display object for an {@link IconSource}. */
export function createIcon(source: IconSource, size: number, textStyle?: TextStyleOptions): Container {
    if (typeof source === 'function') {
        const g = new SilkGraphics();

        source(g, size);

        return g;
    }
    if (typeof source === 'string') {
        const text = new Text({
            text: source,
            style: {
                fill: 0xffffff,
                fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
                fontWeight: '600',
                fontSize: Math.round(size * 0.42),
                align: 'center',
                ...textStyle,
            },
        });

        text.anchor.set(0.5);

        return text;
    }
    if (source instanceof Texture) {
        const sprite = new Sprite(source);
        const k = size / Math.max(source.width, source.height, 1);

        sprite.anchor.set(0.5);
        sprite.scale.set(k);

        return sprite;
    }

    return source;
}

/** Sets the tint of an icon built by {@link createIcon} (containers tint their children). */
export function tintIcon(icon: Container, color: number, alpha = 1): void {
    icon.tint = color;
    icon.alpha = alpha;
}
