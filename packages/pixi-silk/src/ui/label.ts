import type { Container, TextStyleOptions } from 'pixi.js';

/** A text display object a widget can own: PixiJS `Text`, `SilkText`, or anything with these members. */
export interface TextLabel extends Container {
    /** The text shown. */
    text: string;
    /** Point of the text at its position, 0 to 1 on each axis. */
    readonly anchor: { set(x: number, y?: number): void };
}

/**
 * Builds the label of a widget from the style the widget asks for. Widgets that show text take one
 * as their `label` option, so they never import a text renderer you do not use. Pass `silkLabel()`
 * from `pixi-silk/text` for distance-field labels, which a zooming camera scales without re-rasterising.
 */
export type LabelFactory = (style: TextStyleOptions) => TextLabel;
