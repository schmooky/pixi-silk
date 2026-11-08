import { Text, type TextStyleOptions } from 'pixi.js';

/*
 * One look for every demo: the background is the site's card colour (dark theme), shapes take
 * their colours from one palette, text from three greys. Showcase scenes may paint their own
 * backdrop on top.
 */

/** Demo background: the docs card colour, `hsl(240 6% 7%)`. */
export const BG = 0x111113;

/** Greys for surfaces and text, from the background up. */
export const INK = {
    /** A panel or tile on the background. */
    surface: 0x1c1c1f,
    /** A raised control or a hovered tile. */
    raised: 0x2a2a2f,
    /** Hairlines, dividers and grid lines. */
    line: 0x34343a,
    /** Secondary labels: readable on `BG` (contrast above 7:1). */
    muted: 0xa1a1aa,
    /** Tertiary labels and ticks (contrast above 4.5:1). */
    faint: 0x8a8a93,
    /** Primary text. */
    text: 0xf2f2f7,
} as const;

/** The shape palette. `accent` is the site's silk violet. */
export const PALETTE = {
    accent: 0xa78bfa,
    blue: 0x0a84ff,
    teal: 0x64d2ff,
    green: 0x30d158,
    yellow: 0xffd60a,
    orange: 0xff9f0a,
    pink: 0xff375f,
    purple: 0xbf5af2,
} as const;

/** The palette in a fixed order, for demos that cycle through colours. */
export const SERIES = [
    PALETTE.blue,
    PALETTE.green,
    PALETTE.orange,
    PALETTE.pink,
    PALETTE.purple,
    PALETTE.teal,
    PALETTE.yellow,
] as const;

/** Minimum padding between the drawing and the canvas edge, in design units. */
export const PAD = 24;

export const FONT = 'Inter, system-ui, sans-serif';
export const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

/**
 * A caption in the shared style: 12 px, muted grey. Pass `style` to override.
 * Anchor `(0.5, 0)` centres it on its x.
 */
export function label(text: string, x: number, y: number, style: TextStyleOptions = {}, anchor = 0): Text {
    const t = new Text({ text, style: { fontFamily: FONT, fontSize: 12, fill: INK.muted, ...style } });

    t.anchor.set(anchor, 0);
    t.position.set(x, y);

    return t;
}

/** A monospace readout for stats and numbers: 12 px, primary text. */
export function readout(text: string, x: number, y: number, style: TextStyleOptions = {}, anchor = 0): Text {
    return label(text, x, y, { fontFamily: MONO, fill: INK.text, ...style }, anchor);
}
