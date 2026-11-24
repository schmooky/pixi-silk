import {
    BundleFlag,
    DIGIT_ENTRY_STRIDE,
    DIGIT_STRIDE,
    FACE_STRIDE,
    HEADER_BYTES,
    MESSAGE_STRIDE,
    NONE,
    PAGE_STRIDE,
    SECTION_ENTRY_BYTES,
    Section,
    SILK_MAGIC,
    SILK_MAJOR,
    SILK_MINOR,
} from './format';

/** The columns of the RUNS section: one entry per shaped glyph. */
export interface BundleRuns {
    /** GLYPHS index of each glyph. 0 is the empty glyph (spaces, newlines). */
    glyph: Uint16Array | Uint32Array;
    /** Advance in font units. */
    advance: Int16Array;
    /** Horizontal offset in font units (mark positioning). */
    dx: Int16Array;
    /** Vertical offset in font units. */
    dy: Int16Array;
    /** Index of the glyph's first source character in its message variant. */
    cluster: Uint16Array;
    /** Bidi embedding level. */
    level: Uint8Array;
    /** {@link RunFlag} bits. */
    flags: Uint8Array;
}

/**
 * Everything a `.silk` bundle holds, as typed arrays. The reader returns views over the fetched
 * buffer, and the compiler builds one of these and writes it. Record layouts are in `format.ts`.
 */
export interface BundleData {
    /** Format major version. */
    major: number;
    /** Format minor version. */
    minor: number;
    /** {@link BundleFlag} bits. */
    flags: number;
    /** BCP 47 locale, such as `ar` or `ku-Arab-IQ`: what plural rules and number formatting use. */
    locale: string;
    /** The app's code for the locale, such as `iq`: the bundle's name. Equal to `locale` when not set. */
    id: string;
    /** Base direction of the locale: 0 left to right, 1 right to left. */
    dir: 0 | 1;
    /** Numbering system number slots format with, such as `arab` or `latn`. */
    numberingSystem: string;
    /** The string table: keys (dev builds), file names, slot, tag and family names. */
    strings: readonly string[];
    /** String refs of tag names, by tag id. */
    tags: Uint32Array;
    /** Int32 records, `FACE_STRIDE` each. */
    faces: Int32Array;
    /** Float32 records, `PAGE_STRIDE` each. */
    pages: Float32Array;
    /** Int16 records, `GLYPH_STRIDE` each. Record 0 is the empty glyph. */
    glyphs: Int16Array;
    /** Shaped glyph columns. */
    runs: BundleRuns;
    /** Uint32 records, `MESSAGE_STRIDE` each, sorted by key hash. */
    messages: Uint32Array;
    /** Uint32 records, `VARIANT_STRIDE` each. */
    variants: Uint32Array;
    /** Uint32 records, `SEGMENT_STRIDE` each. */
    segments: Uint32Array;
    /** Uint16 records, `SPAN_STRIDE` each. */
    spans: Uint16Array;
    /** Uint32 records, `SLOT_STRIDE` each. */
    slots: Uint32Array;
    /** Uint32 records, `DIGIT_STRIDE` each. */
    digits: Uint32Array;
    /** Int32 records, `DIGIT_ENTRY_STRIDE` each. */
    digitEntries: Int32Array;
}

/** Thrown when a buffer is not a `.silk` bundle this runtime can read. */
export class SilkBundleError extends Error {
    override name = 'SilkBundleError';
}

/** True on little-endian platforms. The format is little-endian and typed arrays use the platform order. */
export function isLittleEndian(): boolean {
    return new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
}

const decoder = /* @__PURE__ */ (() => (typeof TextDecoder === 'undefined' ? null : new TextDecoder()))();

function readStrings(buffer: ArrayBuffer, offset: number, length: number): string[] {
    if (length === 0) return [];
    const head = new Uint32Array(buffer, offset, 1)[0];
    const offsets = new Uint32Array(buffer, offset + 4, head + 1);
    const bytesStart = offset + 4 + (head + 1) * 4;
    const bytes = new Uint8Array(buffer, bytesStart, offsets[head]);
    const out: string[] = new Array(head);

    for (let i = 0; i < head; i++) {
        const slice = bytes.subarray(offsets[i], offsets[i + 1]);

        out[i] = decoder ? decoder.decode(slice) : String.fromCharCode(...slice);
    }

    return out;
}

/**
 * Reads a `.silk` bundle without copying: every table is a typed-array view over `buffer`, and only
 * the string table is decoded. Throws {@link SilkBundleError} on a wrong magic, another major
 * version, a truncated buffer or a misaligned section. A newer minor version calls `warn`.
 */
export function readBundle(buffer: ArrayBuffer, warn: (message: string) => void = console.warn): BundleData {
    if (!isLittleEndian()) throw new SilkBundleError('.silk bundles need a little-endian platform');
    if (buffer.byteLength < HEADER_BYTES) throw new SilkBundleError('not a .silk bundle: too short');
    const view = new DataView(buffer);

    if (view.getUint32(0, true) !== SILK_MAGIC) throw new SilkBundleError('not a .silk bundle: wrong magic');
    const major = view.getUint16(4, true);
    const minor = view.getUint16(6, true);

    if (major !== SILK_MAJOR) {
        throw new SilkBundleError(`.silk bundle is version ${major}.${minor}, this runtime reads ${SILK_MAJOR}.x`);
    }
    if (minor > SILK_MINOR) {
        warn(`pixi-silk: .silk bundle ${major}.${minor} is newer than this runtime (${SILK_MAJOR}.${SILK_MINOR})`);
    }
    const flags = view.getUint32(8, true);
    const count = view.getUint32(12, true);

    if (HEADER_BYTES + count * SECTION_ENTRY_BYTES > buffer.byteLength) {
        throw new SilkBundleError('.silk bundle is truncated (section table)');
    }
    const sections = new Map<number, [number, number]>();

    for (let i = 0; i < count; i++) {
        const at = HEADER_BYTES + i * SECTION_ENTRY_BYTES;
        const id = view.getUint32(at, true);
        const offset = view.getUint32(at + 4, true);
        const length = view.getUint32(at + 8, true);

        if (offset % 8 !== 0) throw new SilkBundleError(`.silk section ${id} is not 8-byte aligned`);
        if (offset + length > buffer.byteLength) throw new SilkBundleError(`.silk bundle is truncated (section ${id})`);
        sections.set(id, [offset, length]);
    }
    const bytes = (id: number): [number, number] => sections.get(id) ?? [0, 0];
    const u32 = (id: number) => {
        const [o, l] = bytes(id);

        return new Uint32Array(buffer, o, l >> 2);
    };
    const i32 = (id: number) => {
        const [o, l] = bytes(id);

        return new Int32Array(buffer, o, l >> 2);
    };
    const i16 = (id: number) => {
        const [o, l] = bytes(id);

        return new Int16Array(buffer, o, l >> 1);
    };
    const u16 = (id: number) => {
        const [o, l] = bytes(id);

        return new Uint16Array(buffer, o, l >> 1);
    };
    const u8 = (id: number) => {
        const [o, l] = bytes(id);

        return new Uint8Array(buffer, o, l);
    };
    const [so, sl] = bytes(Section.Strings);
    const strings = readStrings(buffer, so, sl);
    const meta = u32(Section.Meta);
    const str = (ref: number) => (ref === NONE ? '' : (strings[ref] ?? ''));
    const tagSection = u32(Section.Tags);
    const [po, pl] = bytes(Section.Pages);

    return {
        major,
        minor,
        flags,
        locale: str(meta[0]),
        // meta[3] is 0 in bundles without an id: string 0 is the locale itself
        id: str(meta[3]),
        numberingSystem: str(meta[1]),
        dir: meta[2] === 1 ? 1 : 0,
        strings,
        tags: tagSection.subarray(1, 1 + (tagSection[0] ?? 0)),
        faces: i32(Section.Faces),
        pages: new Float32Array(buffer, po, pl >> 2),
        glyphs: i16(Section.Glyphs),
        runs: {
            glyph: flags & BundleFlag.Glyph32 ? u32(Section.RunGlyph) : u16(Section.RunGlyph),
            advance: i16(Section.RunAdvance),
            dx: i16(Section.RunDx),
            dy: i16(Section.RunDy),
            cluster: u16(Section.RunCluster),
            level: u8(Section.RunLevel),
            flags: u8(Section.RunFlags),
        },
        messages: u32(Section.Messages),
        variants: u32(Section.Variants),
        segments: u32(Section.Segments),
        spans: u16(Section.Spans),
        slots: u32(Section.Slots),
        digits: u32(Section.Digits),
        digitEntries: i32(Section.DigitEntries),
    };
}

/** Index of the message with key hash `hash` (binary search), or -1. */
export function findMessage(data: BundleData, hash: number): number {
    const m = data.messages;
    let lo = 0;
    let hi = m.length / MESSAGE_STRIDE - 1;

    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const h = m[mid * MESSAGE_STRIDE];

        if (h === hash) return mid;
        if (h < hash) lo = mid + 1;
        else hi = mid - 1;
    }

    return -1;
}

/** Number of faces, pages and digit tables, for diagnostics. */
export function bundleCounts(data: BundleData): {
    faces: number;
    pages: number;
    digitTables: number;
    messages: number;
} {
    return {
        faces: data.faces.length / FACE_STRIDE,
        pages: data.pages.length / PAGE_STRIDE,
        digitTables: data.digits.length / DIGIT_STRIDE,
        messages: data.messages.length / MESSAGE_STRIDE,
    };
}

/** Digit table entry for code point `cp` in table `table`, as `[glyph, advance]`, or null. */
export function digitGlyph(data: BundleData, table: number, cp: number): [number, number] | null {
    const d = data.digits;
    const first = d[table * DIGIT_STRIDE + 2];
    const n = d[table * DIGIT_STRIDE + 3];
    const e = data.digitEntries;

    for (let i = first; i < first + n; i++) {
        if (e[i * DIGIT_ENTRY_STRIDE] === cp) return [e[i * DIGIT_ENTRY_STRIDE + 1], e[i * DIGIT_ENTRY_STRIDE + 2]];
    }

    return null;
}
