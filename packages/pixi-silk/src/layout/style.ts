/**
 * Style types of the flex layout engine. They follow CSS flexbox, with `box-sizing: border-box`
 * everywhere and shorter names for the common properties.
 */

/** A length: pixels, a percent of the containing box (`'50%'`) or `'auto'`. */
export type Length = number | `${number}%` | 'auto';

/** Main axis of a container. `row` lays children out left to right, `column` top to bottom. */
export type FlexDirection = 'row' | 'column' | 'row-reverse' | 'column-reverse';

/** Cross axis alignment of items in their line. `baseline` lines up first text baselines in a row. */
export type AlignItems = 'start' | 'center' | 'end' | 'stretch' | 'baseline';

/** Main axis distribution of the free space in a line. */
export type JustifyContent = 'start' | 'center' | 'end' | 'space-between' | 'space-around' | 'space-evenly';

/** Cross axis distribution of the lines of a wrapping container. */
export type AlignContent = 'start' | 'center' | 'end' | 'stretch' | 'space-between' | 'space-around' | 'space-evenly';

/** Box edges, as in CSS: one value for all sides, `[vertical, horizontal]`, `[top, horizontal, bottom]` or `[top, right, bottom, left]`. */
export type Edges<T = Length> = T | readonly [T, T] | readonly [T, T, T] | readonly [T, T, T, T];

/** A size in pixels. */
export interface Size {
    /** Width in pixels. */
    width: number;
    /** Height in pixels. */
    height: number;
}

/**
 * Measures leaf content (text, a sprite) for the space offered. Either argument is `Infinity`
 * when that axis is unconstrained. Return the content size without padding. `baseline` is the
 * distance from the top to the first text baseline, for `alignItems: 'baseline'`.
 */
export type MeasureFunction = (availableWidth: number, availableHeight: number) => Size & { baseline?: number };

/** The style of a layout node. Every property is optional and defaults to the CSS initial value. */
export interface LayoutStyle {
    /** `none` takes the node out of layout: it gets a zero box. Default `flex`. */
    display?: 'flex' | 'none';
    /** `absolute` places the node against its parent's box with `top`, `right`, `bottom` and `left`. */
    position?: 'relative' | 'absolute';
    /** Main axis. Default `row`. */
    direction?: FlexDirection;
    /** Break items into several lines when they overflow. Default `nowrap`. */
    wrap?: 'nowrap' | 'wrap' | 'wrap-reverse';
    /** Space between items and between lines, in pixels. Default 0. */
    gap?: number;
    /** Space between lines (rows). Overrides `gap`. */
    rowGap?: number;
    /** Space between columns. Overrides `gap`. */
    columnGap?: number;
    /** Space inside the box. Percents are of the parent's width, as in CSS. */
    padding?: Edges<number | `${number}%`>;
    /** Top padding. Overrides `padding`. */
    paddingTop?: number | `${number}%`;
    /** Right padding. Overrides `padding`. */
    paddingRight?: number | `${number}%`;
    /** Bottom padding. Overrides `padding`. */
    paddingBottom?: number | `${number}%`;
    /** Left padding. Overrides `padding`. */
    paddingLeft?: number | `${number}%`;
    /** Space outside the box. `'auto'` takes up free space, which centres or pushes the item. */
    margin?: Edges;
    /** Top margin. Overrides `margin`. */
    marginTop?: Length;
    /** Right margin. Overrides `margin`. */
    marginRight?: Length;
    /** Bottom margin. Overrides `margin`. */
    marginBottom?: Length;
    /** Left margin. Overrides `margin`. */
    marginLeft?: Length;
    /** Cross axis alignment of the children. Default `stretch`. */
    alignItems?: AlignItems;
    /** Cross axis alignment of this node, over its parent's `alignItems`. */
    alignSelf?: AlignItems | 'auto';
    /** Main axis distribution of the free space. Default `start`. */
    justifyContent?: JustifyContent;
    /** Line distribution of a wrapping container. Default `stretch`. */
    alignContent?: AlignContent;
    /** Share of the free space this item takes. Default 0. */
    grow?: number;
    /** Share of the overflow this item gives up, weighted by its basis. Default 1. */
    shrink?: number;
    /** Main size before growing or shrinking. Default `auto` (the width or height, else the content). */
    basis?: Length;
    /** Border-box width. Default `auto`. */
    width?: Length;
    /** Border-box height. Default `auto`. */
    height?: Length;
    /** Smallest width. Default 0. */
    minWidth?: Length;
    /** Smallest height. Default 0. */
    minHeight?: Length;
    /** Largest width. Default none. */
    maxWidth?: Length;
    /** Largest height. Default none. */
    maxHeight?: Length;
    /** Width divided by height. Sizes the missing axis when only one is known. */
    aspectRatio?: number;
    /** Distance from the parent's top edge, for `position: 'absolute'`. */
    top?: Length;
    /** Distance from the parent's right edge, for `position: 'absolute'`. */
    right?: Length;
    /** Distance from the parent's bottom edge, for `position: 'absolute'`. */
    bottom?: Length;
    /** Distance from the parent's left edge, for `position: 'absolute'`. */
    left?: Length;
    /** Sets `top`, `right`, `bottom` and `left` at once. The single sides override it. */
    inset?: Length;
}

/** The box a layout pass computed for a node, relative to its parent's top-left corner. */
export interface ComputedLayout {
    x: number;
    y: number;
    width: number;
    height: number;
}
