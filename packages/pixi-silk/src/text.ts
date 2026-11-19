/**
 * pixi-silk/text: {@link SilkText}, text drawn from a shared signed distance field atlas, plus the
 * layout and caret helpers it uses. Not part of the root `pixi-silk` import.
 */
export {
    type FontMetrics,
    type FontSpec,
    fontString,
    type Glyph,
    type GlyphContext,
    SdfAtlas,
    type SdfAtlasOptions,
} from './text/atlas';
export {
    type BidiClass,
    bidiClass,
    hasRtl,
    mirror,
    paragraphLevel,
    resetWhitespace,
    resolveLevels,
    type TextDirection,
    visualOrder,
} from './text/bidi';
export { type Cluster, clusters, type WordBreak } from './text/cluster';
export { sdfFromAlpha } from './text/edt';
export { silkLabel } from './text/label';
export {
    type CaretHit,
    type CaretRect,
    caretAtPoint,
    caretRect,
    caretX,
    type InlineMetrics,
    type LayoutLine,
    type LayoutOptions,
    type LineRun,
    layoutText,
    lineOfIndex,
    type PlacedGlyph,
    rangeRects,
    type TextAlign,
    type TextLayout,
    type TextMeasurer,
    type TextRect,
} from './text/layout';
export { type InlineSize, type RichInline, SilkRichText, type SilkRichTextOptions } from './text/rich';
export {
    type InlineAlign,
    type InlineRect,
    type ResolvedTextStyle,
    SilkText,
    SilkTextGeometry,
    type SilkTextOptions,
    type SilkTextStyle,
    type TextInline,
    type TextOutline,
    type TextShadow,
} from './text/SilkText';
export {
    graphemeStops,
    isMac,
    nextWordStop,
    paragraphAt,
    previousWordStop,
    type WordSegment,
    wordAt,
    wordSegments,
} from './text/segment';
