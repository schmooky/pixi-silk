import type { TextStyleOptions } from 'pixi.js';
import type { LabelFactory } from '../ui/label';
import { SilkText, type SilkTextOptions, type SilkTextStyle } from './SilkText';

/** The parts of a PixiJS text style that a SilkText understands. */
function fromPixiStyle(style: TextStyleOptions): SilkTextStyle {
    const out: SilkTextStyle = {};
    const family = style.fontFamily;

    if (family !== undefined) out.fontFamily = Array.isArray(family) ? family.join(', ') : family;
    if (style.fontSize !== undefined) out.fontSize = Number.parseFloat(String(style.fontSize));
    if (style.fontWeight !== undefined) out.fontWeight = style.fontWeight;
    if (style.fontStyle !== undefined) out.fontStyle = style.fontStyle;
    if (style.letterSpacing !== undefined) out.letterSpacing = style.letterSpacing;
    if (style.lineHeight !== undefined) out.lineHeight = style.lineHeight;
    if (style.align === 'left' || style.align === 'center' || style.align === 'right') out.align = style.align;
    if (typeof style.fill === 'number' || typeof style.fill === 'string') out.fill = style.fill;

    return out;
}

/**
 * A label factory that makes {@link SilkText} labels, for widgets such as `ValuePill`. The widget's
 * style comes first, then `overrides` (any SilkText option but the text). From the Pixi style it
 * keeps the font, letter spacing, line height, left, center or right alignment, and a plain colour fill.
 * Gradients, strokes and drop shadows of the Pixi style are dropped.
 *
 * @example
 * ```ts
 * import { ValuePill } from 'pixi-silk/ui/pill';
 * import { silkLabel } from 'pixi-silk/text';
 *
 * const pill = new ValuePill({ label: silkLabel({ tabularNumbers: true }) });
 * ```
 */
export function silkLabel(overrides: Omit<SilkTextOptions, 'text'> = {}): LabelFactory {
    return (style) => new SilkText({ ...fromPixiStyle(style), ...overrides });
}
