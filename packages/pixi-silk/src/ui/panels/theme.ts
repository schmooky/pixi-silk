import type { ColorSource } from 'pixi.js';
import type { SdfAtlas } from '../../text/atlas';
import { SilkText } from '../../text/SilkText';
import { hex } from '../paint';

/**
 * Colours and type of the editor panels. Every panel, the layer tree, the inspector and the
 * minimap read the same tokens, so one theme restyles them all.
 */
export interface PanelTheme {
    /** Panel body. */
    background: number;
    /** Opacity of the panel body. */
    backgroundAlpha: number;
    /** Hairlines: the panel edge, dividers, field outlines. */
    border: number;
    /** Drop shadow under floating panels. */
    shadow: number;
    /** Opacity of the drop shadow. 0 turns it off. */
    shadowAlpha: number;
    /** Main text. */
    text: number;
    /** Labels, units and secondary text. */
    textDim: number;
    /** Selection, focus rings, drop indicators. */
    accent: number;
    /** Text on top of the accent colour. */
    accentText: number;
    /** Row and button hover. */
    hover: number;
    /** Row selection fill, drawn at `selectedAlpha`. */
    selected: number;
    /** Opacity of the selection fill. */
    selectedAlpha: number;
    /** Field background. */
    field: number;
    /** Field background under the pointer. */
    fieldHover: number;
    /** Switch tracks and segmented control backgrounds. */
    track: number;
    /** Scrollbar thumb. */
    scrollbar: number;
    /** Corner radius of panels. Fields use about half of it. */
    radius: number;
    /** CSS font family list of every label. */
    fontFamily: string;
    /** Font size of rows and fields, in panel units. */
    fontSize: number;
}

/** The dark default theme, close to the dark UI of design tools. */
export const PANEL_THEME: Readonly<PanelTheme> = {
    background: 0x1f1f22,
    backgroundAlpha: 0.98,
    border: 0x323237,
    shadow: 0x000000,
    shadowAlpha: 0.42,
    text: 0xe9e9ee,
    textDim: 0x8e8e96,
    accent: 0x0a84ff,
    accentText: 0xffffff,
    hover: 0x2b2b30,
    selected: 0x0a84ff,
    selectedAlpha: 0.24,
    field: 0x2a2a2f,
    fieldHover: 0x323238,
    track: 0x3a3a40,
    scrollbar: 0xffffff,
    radius: 12,
    fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    fontSize: 12,
};

/** The light theme. Pass it as `theme`, or spread it and change a few tokens. */
export const PANEL_THEME_LIGHT: Readonly<PanelTheme> = {
    ...PANEL_THEME,
    background: 0xffffff,
    backgroundAlpha: 0.99,
    border: 0xe2e2e7,
    shadowAlpha: 0.14,
    text: 0x1c1c1f,
    textDim: 0x6e6e76,
    accent: 0x007aff,
    hover: 0xf0f0f4,
    selected: 0x007aff,
    selectedAlpha: 0.14,
    field: 0xf1f1f4,
    fieldHover: 0xe8e8ed,
    track: 0xd9d9df,
    scrollbar: 0x000000,
};

const NUMERIC = new Set(['backgroundAlpha', 'shadowAlpha', 'selectedAlpha', 'radius', 'fontSize']);

/** The full theme for `input`: the dark default with `input` over it. Colours may be any Pixi colour. */
export function resolvePanelTheme(input?: Partial<PanelTheme>): PanelTheme {
    const out: Record<string, unknown> = { ...PANEL_THEME };

    for (const [key, value] of Object.entries(input ?? {})) {
        if (value === undefined) continue;
        out[key] = key === 'fontFamily' || NUMERIC.has(key) ? value : hex(value as ColorSource);
    }

    return out as unknown as PanelTheme;
}

/** What the panels need to make a label. */
export interface PanelTextOptions {
    text?: string;
    /** Default the theme's font size. */
    size?: number;
    /** Default 500. */
    weight?: number | string;
    /** Default the theme's text colour. */
    color?: number;
    /** 0 to 1 per axis. Default 0. */
    anchor?: number | { x: number; y: number };
    /** Glyph atlas. Default the shared one. */
    atlas?: SdfAtlas;
}

/** A SilkText label in the panel style. It stays sharp at any zoom or scale. */
export function panelText(theme: PanelTheme, options: PanelTextOptions = {}): SilkText {
    return new SilkText({
        text: options.text ?? '',
        fontFamily: theme.fontFamily,
        fontSize: options.size ?? theme.fontSize,
        fontWeight: options.weight ?? 500,
        fill: options.color ?? theme.text,
        anchor: options.anchor,
        atlas: options.atlas,
    });
}

/**
 * Sets `label` to `text`, cut with three dots to fit `width`. Returns true when it was cut. Long
 * names in narrow rows stay on one line.
 */
export function fitText(label: SilkText, text: string, width: number): boolean {
    label.text = text;
    if (width <= 0 || label.width <= width) return false;
    let lo = 0;
    let hi = text.length;

    // the longest prefix that fits with the dots
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;

        label.text = `${text.slice(0, mid).trimEnd()}...`;
        if (label.width <= width) lo = mid;
        else hi = mid - 1;
    }
    label.text = lo > 0 ? `${text.slice(0, lo).trimEnd()}...` : '...';

    return true;
}
