export {
    type FontMetrics,
    type FontSpec,
    fontString,
    type Glyph,
    type GlyphContext,
    SdfAtlas,
    type SdfAtlasOptions,
} from './text/atlas';
export { sdfFromAlpha } from './text/edt';
export { silkLabel } from './text/label';
export {
    type CaretHit,
    type CaretRect,
    caretAtPoint,
    caretRect,
    caretX,
    type LayoutLine,
    type LayoutOptions,
    layoutText,
    lineOfIndex,
    type PlacedGlyph,
    rangeRects,
    type TextAlign,
    type TextLayout,
    type TextMeasurer,
    type TextRect,
} from './text/layout';
export {
    type ResolvedTextStyle,
    SilkText,
    SilkTextGeometry,
    type SilkTextOptions,
    type SilkTextStyle,
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
