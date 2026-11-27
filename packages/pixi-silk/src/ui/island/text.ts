import { Text, type TextStyleOptions } from 'pixi.js';
import type { LabelFactory, TextLabel } from '../label';

/** @internal System font stack of the island widgets. */
export const ISLAND_FONT = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

/** @internal A white label from the factory, or a Pixi `Text`. Colour it with `tint`. */
export function islandLabel(factory: LabelFactory | undefined, style: TextStyleOptions): TextLabel {
    const full: TextStyleOptions = { fill: 0xffffff, fontFamily: ISLAND_FONT, ...style };

    return factory ? factory(full) : new Text({ text: '', style: full });
}
