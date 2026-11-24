/**
 * pixi-silk/i18n: the renderer-agnostic core of baked localized text. Reads `.silk` bundles made by
 * `@pixi-silk/compiler`, resolves messages and plural variants, formats number slots from baked
 * digit tables, lays out lines from baked advances and break flags, and writes glyph instances.
 * It imports no Pixi code and carries no Unicode data tables. `pixi-silk/i18n/pixi` draws it.
 */

export {
    HeadlessBackend,
    type RunSprite,
    type SilkBackend,
    type StoredPage,
    submitLayout,
    type TextBufferHandle,
} from './i18n/backend';
export {
    type BundleData,
    type BundleRuns,
    bundleCounts,
    digitGlyph,
    findMessage,
    isLittleEndian,
    readBundle,
    SilkBundleError,
} from './i18n/bundle';
export { cloneLayout, LayoutCache } from './i18n/cache';
export {
    align8,
    BundleFlag,
    DIGIT_ENTRY_STRIDE,
    DIGIT_STRIDE,
    FACE_STRIDE,
    GLYPH_STRIDE,
    HEADER_BYTES,
    hashKey,
    LAYOUT_ALIGNS,
    LAYOUT_STRIDE,
    MESSAGE_STRIDE,
    NONE,
    PAGE_STRIDE,
    PageKind,
    PLURAL_CATEGORIES,
    type PluralCategory,
    RunFlag,
    SECTION_ENTRY_BYTES,
    SEGMENT_STRIDE,
    Section,
    SegmentKind,
    SILK_MAGIC,
    SILK_MAJOR,
    SILK_MINOR,
    SLOT_STRIDE,
    SlotFlag,
    SlotType,
    SPAN_STRIDE,
    VARIANT_STRIDE,
} from './i18n/format';
export {
    INSTANCE_FLOATS,
    type InlineMetrics,
    InstanceKind,
    type LayoutBox,
    layoutMessage,
    type MessageAlign,
    type MessageLayout,
    type MessageLayoutOptions,
    reorder,
    type SlotPlacement,
    updateNumberSlot,
} from './i18n/layout';
export {
    type BundleFace,
    type BundlePage,
    type BundleSlot,
    type FormattedNumber,
    SilkBundle,
} from './i18n/messages';
export { fontHash, type RuntimeShaper, type ShapedGlyphOut, sameFont } from './i18n/shaper';
export { type RowLayout, type StyleChange, StyleTable } from './i18n/styles';
export {
    effectReach,
    mergeStyles,
    PAINT_PROPERTIES,
    packStyle,
    parseHex,
    propertyClass,
    SHADOW_MAX_BLUR,
    SHAPE_PROPERTIES,
    STYLE_FLOATS,
    STYLE_TEXELS,
    StyleFlag,
    shapeKey,
    type ThemeData,
    type ThemeGlow,
    type ThemeLine,
    type ThemeOutline,
    type ThemeShadow,
    type ThemeStyle,
    validateTheme,
} from './i18n/theme';
