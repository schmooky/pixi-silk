/**
 * The `.silk` bundle format, version 2: constants and record layouts shared by the runtime reader
 * and the compiler's writer (`@pixi-silk/compiler`). Little-endian. Every section starts on an
 * 8-byte boundary, so the reader makes typed-array views straight over the fetched buffer.
 *
 * Layout: a 16-byte header (magic, major, minor, flags, section count), the section table
 * (`{ id, offset, length }` as three u32 per section), then the sections.
 */

/** `SILK` read as a little-endian u32. */
export const SILK_MAGIC = 0x4b4c4953;
/** Major version this runtime reads. A bundle with another major is refused. */
export const SILK_MAJOR = 2;
/** Minor version this runtime was written for. A newer minor loads with a warning. */
export const SILK_MINOR = 0;
/** Bytes before the section table. */
export const HEADER_BYTES = 16;
/** Bytes per section table entry. */
export const SECTION_ENTRY_BYTES = 12;

/** Header flags. */
export const BundleFlag = {
    /** The bundle keeps message keys as strings (dev builds). */
    DevKeys: 1,
    /** Run glyph indices are u32 (more than 65 535 atlas glyphs). */
    Glyph32: 2,
} as const;

/** Section ids. */
export const Section = {
    Meta: 1,
    Strings: 2,
    Tags: 3,
    Faces: 4,
    Pages: 5,
    Glyphs: 6,
    RunGlyph: 7,
    RunAdvance: 8,
    RunDx: 9,
    RunDy: 10,
    RunCluster: 11,
    RunLevel: 12,
    RunFlags: 13,
    Messages: 14,
    Variants: 15,
    Segments: 16,
    Spans: 17,
    Slots: 18,
    Digits: 19,
    DigitEntries: 20,
} as const;

/** Per-glyph flags in the RUNS flags column. */
export const RunFlag = {
    /** A line may break before this glyph (UAX #14, baked). */
    BreakBefore: 1,
    /** A line must break before this glyph (a newline ended the previous one). */
    Mandatory: 2,
    /** HarfBuzz `UNSAFE_TO_BREAK`: breaking here would need reshaping. */
    UnsafeToBreak: 4,
    /** The glyph is white space: it does not count at the end of a line. */
    Whitespace: 8,
    /** The glyph is a newline: zero width, never drawn. */
    Newline: 16,
} as const;

/** Kinds of message segments. */
export const SegmentKind = {
    /** Baked glyphs: `a` run start, `b` run length, `c` face. */
    Static: 0,
    /** A value placeholder: `a` slot id. */
    Slot: 1,
    /** An inline object such as `<coin/>`: `a` tag id. */
    Object: 2,
} as const;

/** Types of slots. */
export const SlotType = {
    /** A number, formatted with `Intl.NumberFormat` and drawn from a digit table. */
    Number: 0,
    /** Free text, drawn by the dynamic path. */
    Text: 1,
} as const;

/** Slot flags. */
export const SlotFlag = {
    /** Digits have one width (`tnum` was applied when baking). */
    Tabular: 1,
    /** The slot selects the plural variant. */
    Plural: 2,
    /** The face has no `tnum`: the `value-fast` update is disabled for this slot. */
    NoFastPath: 4,
} as const;

/** Glyph kinds of atlas pages. */
export const PageKind = {
    /** Three-channel multi-channel signed distance field (median of RGB). */
    Msdf: 0,
    /** Single-channel signed distance field (R). */
    Sdf: 1,
    /** MSDF plus a true distance in alpha, for wide soft effects. */
    Mtsdf: 2,
} as const;

/** Plural categories in the order the VARIANTS section stores them. */
export const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;

/** A CLDR plural category. */
export type PluralCategory = (typeof PLURAL_CATEGORIES)[number];

/** Int16 per atlas glyph: page, x, y, w, h (atlas pixels), planeL, planeB, planeR, planeT (font units), face. */
export const GLYPH_STRIDE = 10;
/** Uint32 per message: key hash, key string ref (or `NONE`), selector slot (or `NONE`), first variant, variant count, flags. */
export const MESSAGE_STRIDE = 6;
/** Uint32 per variant: plural category index, first segment, segment count, first span, span count, base level. */
export const VARIANT_STRIDE = 6;
/** Uint32 per segment: kind, a, b, c, bidi level. */
export const SEGMENT_STRIDE = 5;
/** Uint16 per span: tag id, start segment, start cluster, end segment, end cluster (end exclusive). */
export const SPAN_STRIDE = 5;
/** Uint32 per slot: name ref, type, max digits or chars, digit table (or `NONE`), flags, face. */
export const SLOT_STRIDE = 6;
/** Int32 per face: face id, units per em, hash low, hash high, ascender, descender, line gap, family ref, weight. */
export const FACE_STRIDE = 9;
/** Float32 per page: page id, file ref, kind, width, height, distance range (atlas px), em size (atlas px per em). */
export const PAGE_STRIDE = 7;
/** Uint32 per digit table: face, numbering system ref, first entry, entry count, tabular advance, flags. */
export const DIGIT_STRIDE = 6;
/** Int32 per digit table entry: code point, glyph index (-1 for a zero-width mark), advance (font units). */
export const DIGIT_ENTRY_STRIDE = 3;

/** "No value" in u32 fields. */
export const NONE = 0xffffffff;

/**
 * 32-bit FNV-1a hash of a message key, over its UTF-16 code units. Production bundles store only
 * this. The compiler fails when two keys of one bundle collide.
 */
export function hashKey(key: string): number {
    let h = 0x811c9dc5;

    for (let i = 0; i < key.length; i++) {
        h ^= key.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }

    return h >>> 0;
}

/** Rounds `n` up to the next multiple of 8. */
export function align8(n: number): number {
    return (n + 7) & ~7;
}
