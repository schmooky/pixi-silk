import {
    align8,
    type BundleData,
    BundleFlag,
    HEADER_BYTES,
    NONE,
    SECTION_ENTRY_BYTES,
    Section,
    SILK_MAGIC,
} from 'pixi-silk/i18n';

const encoder = new TextEncoder();

function stringsSection(strings: readonly string[]): Uint8Array {
    const encoded = strings.map((s) => encoder.encode(s));
    const total = encoded.reduce((n, e) => n + e.length, 0);
    const out = new Uint8Array(4 + (strings.length + 1) * 4 + total);
    const view = new DataView(out.buffer);
    let at = 4 + (strings.length + 1) * 4;
    let offset = 0;

    view.setUint32(0, strings.length, true);
    encoded.forEach((e, i) => {
        view.setUint32(4 + i * 4, offset, true);
        out.set(e, at);
        at += e.length;
        offset += e.length;
    });
    view.setUint32(4 + strings.length * 4, offset, true);

    return out;
}

function bytesOf(view: ArrayBufferView): Uint8Array {
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

/**
 * Serializes bundle data to the `.silk` v2 binary format. Sections are written in id order, each
 * on an 8-byte boundary with zero padding, so the same data always gives the same bytes.
 * `strings` must already contain every string the tables refer to; `locale` and
 * `numberingSystem` are looked up in it (and added when missing).
 */
export function writeBundle(data: BundleData): Uint8Array {
    const strings = [...data.strings];
    const ref = (s: string): number => {
        let i = strings.indexOf(s);

        if (i < 0) i = strings.push(s) - 1;
        return i;
    };
    const meta = new Uint32Array([
        ref(data.locale),
        data.numberingSystem ? ref(data.numberingSystem) : NONE,
        data.dir,
        0,
    ]);
    const tags = new Uint32Array(1 + data.tags.length);

    tags[0] = data.tags.length;
    tags.set(data.tags, 1);
    const glyph32 = data.runs.glyph instanceof Uint32Array;
    const sections: [number, Uint8Array][] = [
        [Section.Meta, bytesOf(meta)],
        [Section.Strings, stringsSection(strings)],
        [Section.Tags, bytesOf(tags)],
        [Section.Faces, bytesOf(data.faces)],
        [Section.Pages, bytesOf(data.pages)],
        [Section.Glyphs, bytesOf(data.glyphs)],
        [Section.RunGlyph, bytesOf(data.runs.glyph)],
        [Section.RunAdvance, bytesOf(data.runs.advance)],
        [Section.RunDx, bytesOf(data.runs.dx)],
        [Section.RunDy, bytesOf(data.runs.dy)],
        [Section.RunCluster, bytesOf(data.runs.cluster)],
        [Section.RunLevel, bytesOf(data.runs.level)],
        [Section.RunFlags, bytesOf(data.runs.flags)],
        [Section.Messages, bytesOf(data.messages)],
        [Section.Variants, bytesOf(data.variants)],
        [Section.Segments, bytesOf(data.segments)],
        [Section.Spans, bytesOf(data.spans)],
        [Section.Slots, bytesOf(data.slots)],
        [Section.Digits, bytesOf(data.digits)],
        [Section.DigitEntries, bytesOf(data.digitEntries)],
    ];
    let at = align8(HEADER_BYTES + sections.length * SECTION_ENTRY_BYTES);
    const offsets = sections.map(([, b]) => {
        const o = at;

        at = align8(at + b.length);
        return o;
    });
    const out = new Uint8Array(at);
    const view = new DataView(out.buffer);

    view.setUint32(0, SILK_MAGIC, true);
    view.setUint16(4, data.major, true);
    view.setUint16(6, data.minor, true);
    view.setUint32(8, (data.flags & ~BundleFlag.Glyph32) | (glyph32 ? BundleFlag.Glyph32 : 0), true);
    view.setUint32(12, sections.length, true);
    sections.forEach(([id, b], i) => {
        const e = HEADER_BYTES + i * SECTION_ENTRY_BYTES;

        view.setUint32(e, id, true);
        view.setUint32(e + 4, offsets[i], true);
        view.setUint32(e + 8, b.length, true);
        out.set(b, offsets[i]);
    });

    return out;
}
