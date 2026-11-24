import { GLYPH_STRIDE, RunFlag, SEGMENT_STRIDE, SegmentKind, SPAN_STRIDE, VARIANT_STRIDE } from './format';
import type { FormattedNumber, SilkBundle } from './messages';
import type { StyleTable } from './styles';
import { STYLE_FLOATS, StyleFlag } from './theme';

/** Floats per glyph instance: x, y, scale, glyph, style row, kind, size, width. */
export const INSTANCE_FLOATS = 8;

/** What an instance draws. */
export const InstanceKind = {
    /** An atlas glyph: x, y is the pen on the baseline, scale is pixels per font unit. */
    Glyph: 0,
    /** An underline from x along `width` pixels, at the baseline y. */
    Underline: 1,
    /** A strike-through from x along `width` pixels, at the baseline y. */
    Strike: 2,
} as const;

/** Horizontal alignment. `start` and `end` follow the locale's direction. */
export type MessageAlign = 'start' | 'end' | 'left' | 'center' | 'right';

/** Size of an inline object such as `<coin/>`, in em of the message size. */
export interface InlineMetrics {
    /** Width in em. */
    width: number;
    /** Height in em. */
    height: number;
    /** Part of the height below the baseline, 0 to 1. Default 0. */
    baseline?: number;
}

/** Options of {@link layoutMessage}. */
export interface MessageLayoutOptions {
    /** Font size in pixels. */
    size: number;
    /** Widest a line may be, in pixels. 0 for no wrapping. */
    maxWidth: number;
    /** Alignment of the lines. */
    align: MessageAlign;
    /** Distance between baselines as a factor of `size`. */
    lineHeight: number;
    /** Slot values by name. */
    values: Readonly<Record<string, number | string>>;
    /** Style rows. */
    styles: StyleTable;
    /** Size of inline objects by name. Unknown objects take 1 em. */
    inline?: (name: string) => InlineMetrics | undefined;
    /** Width of a text slot's value in pixels (the dynamic path measures it). Default an estimate. */
    measureText?: (name: string, value: string, size: number, styleRow: number) => number;
}

/** A number slot as laid out, for `value-fast` updates. */
export interface SlotPlacement {
    /** Slot name. */
    name: string;
    /** Slot id in the bundle. */
    slot: number;
    /** First instance of the slot's characters. */
    first: number;
    /** Characters (and instances) of the slot. */
    count: number;
    /** The formatted value it was laid out with. */
    formatted: FormattedNumber;
    /** Pixels per font unit of its digits. */
    scale: number;
    /** Style row. */
    style: number;
}

/** A box in local pixels. */
export interface LayoutBox {
    /** Left. */
    x: number;
    /** Top. */
    y: number;
    /** Width. */
    width: number;
    /** Height. */
    height: number;
}

/** A laid out message: instances ready to upload, plus boxes for objects, text slots and taps. */
export interface MessageLayout {
    /** `INSTANCE_FLOATS` floats per instance. */
    instances: Float32Array;
    /** Instances in use. */
    count: number;
    /** Width of the widest line, or `maxWidth` when set. */
    width: number;
    /** Height of all lines. */
    height: number;
    /** Lines: baseline y and the x range of their content. */
    lines: { baseline: number; left: number; right: number }[];
    /** Number slots, for in-place updates. */
    slots: SlotPlacement[];
    /** Inline objects. */
    objects: (LayoutBox & { name: string })[];
    /** Text slots, drawn by the dynamic path. `baseline` is the distance from the box top to the baseline. */
    textSlots: (LayoutBox & { name: string; value: string; style: number; baseline: number })[];
    /** Boxes of spans whose style is interactive, by tag, one per visual fragment. */
    hits: (LayoutBox & { tag: string })[];
    /** Plain text with values filled in, for accessibility. */
    text: string;
}

interface Element {
    kind: 'glyph' | 'number' | 'text' | 'object';
    level: number;
    width: number;
    flags: number;
    style: number;
    offset: number;
    glyph: number;
    scale: number;
    dx: number;
    dy: number;
    name: string;
    slot: number;
    formatted: FormattedNumber | null;
    value: string;
    metrics: InlineMetrics | null;
}

/** Visual order of a line from its levels (UAX #9 rule L2). */
export function reorder(levels: readonly number[]): number[] {
    const order = levels.map((_, i) => i);
    let max = 0;
    let minOdd = 255;

    for (const l of levels) {
        if (l > max) max = l;
        if (l % 2 && l < minOdd) minOdd = l;
    }
    for (let level = max; level >= minOdd && level > 0; level--) {
        for (let i = 0; i < order.length; ) {
            if (levels[order[i]] < level) {
                i++;
                continue;
            }
            let j = i;

            while (j < order.length && levels[order[j]] >= level) j++;
            for (let a = i, b = j - 1; a < b; a++, b--) [order[a], order[b]] = [order[b], order[a]];
            i = j;
        }
    }

    return order;
}

/** Tag names covering a text offset, outer first. */
function stackAt(bundle: SilkBundle, firstSpan: number, spanCount: number, offset: number): string[] {
    const s = bundle.data.spans;
    const out: string[] = [];

    for (let i = firstSpan; i < firstSpan + spanCount; i++) {
        const o = i * SPAN_STRIDE;

        if (s[o + 2] <= offset && offset < s[o + 4]) out.push(bundle.tag(s[o]));
    }

    return out;
}

/**
 * Lays out one variant of a message from baked data (brief sec. 6.2): greedy line filling over the
 * baked advances, breaking only where the compiler marked a break opportunity, then visual
 * reordering of every line from the baked bidi levels. No shaping and no Unicode tables. Number
 * slots map their characters through the digit tables. Text slots and inline objects are boxes.
 */
export function layoutMessage(bundle: SilkBundle, variant: number, options: MessageLayoutOptions): MessageLayout {
    const d = bundle.data;
    const v = variant * VARIANT_STRIDE;
    const firstSeg = d.variants[v + 1];
    const segCount = d.variants[v + 2];
    const firstSpan = d.variants[v + 3];
    const spanCount = d.variants[v + 4];
    const base = d.variants[v + 5];
    const { size, styles } = options;
    const elements: Element[] = [];
    const styleCache = new Map<string, number>();
    const rowAt = (offset: number) => {
        const stack = stackAt(bundle, firstSpan, spanCount, offset);
        const key = stack.join('\u0000');
        let row = styleCache.get(key);

        if (row === undefined) {
            row = styles.rowFor(stack);
            styleCache.set(key, row);
        }
        return row;
    };
    // size and letter spacing changed at runtime: scale and space the baked advances
    const rowLayouts = new Map<number, { size: number; spacing: number }>();
    const rowLayout = (row: number) => {
        let l = rowLayouts.get(row);

        if (!l) {
            l = styles.layoutOf(row);
            rowLayouts.set(row, l);
        }
        return l;
    };
    let ascender = 0;
    let descender = 0;
    const blank = (): Element => ({
        kind: 'glyph',
        level: base,
        width: 0,
        flags: 0,
        style: 0,
        offset: 0,
        glyph: 0,
        scale: 0,
        dx: 0,
        dy: 0,
        name: '',
        slot: -1,
        formatted: null,
        value: '',
        metrics: null,
    });
    let text = bundle.variantText(variant);
    const holes: string[] = [];

    for (let s = firstSeg; s < firstSeg + segCount; s++) {
        const o = s * SEGMENT_STRIDE;
        const kind = d.segments[o];
        const level = d.segments[o + 4];

        if (kind === SegmentKind.Static) {
            const face = bundle.face(d.segments[o + 3]);
            const scale = size / face.unitsPerEm;

            ascender = Math.max(ascender, face.ascender * scale);
            descender = Math.min(descender, face.descender * scale);
            const start = d.segments[o + 1];

            for (let i = start; i < start + d.segments[o + 2]; i++) {
                const glyph = d.runs.glyph[i];
                const glyphFace = glyph ? d.glyphs[glyph * GLYPH_STRIDE + 9] : face.id;
                const gScale = glyphFace === face.id ? scale : size / bundle.face(glyphFace).unitsPerEm;
                const e = blank();

                e.level = d.runs.level[i];
                e.width = d.runs.advance[i] * gScale;
                e.flags = d.runs.flags[i];
                e.offset = d.runs.cluster[i];
                e.style = rowAt(e.offset);
                const rl = rowLayout(e.style);
                const s = gScale * rl.size;

                e.width = d.runs.advance[i] * s + (e.width > 0 && rl.spacing ? rl.spacing * size * rl.size : 0);
                e.glyph = glyph;
                e.scale = s;
                e.dx = d.runs.dx[i] * s;
                e.dy = d.runs.dy[i] * s;
                elements.push(e);
            }
            continue;
        }
        const e = blank();

        e.level = level;
        e.offset = d.segments[o + 2];
        e.flags = d.segments[o + 3];
        e.style = rowAt(e.offset);
        if (kind === SegmentKind.Object) {
            e.kind = 'object';
            e.name = bundle.tag(d.segments[o + 1]);
            e.metrics = options.inline?.(e.name) ?? { width: 1, height: 1 };
            e.width = e.metrics.width * size * rowLayout(e.style).size;
            holes.push('');
        } else {
            const slot = bundle.slot(d.segments[o + 1]);
            const raw = options.values[slot.name];

            e.name = slot.name;
            e.slot = d.segments[o + 1];
            if (slot.type === 'number') {
                const f = bundle.formatNumber(slot, typeof raw === 'number' ? raw : Number(raw ?? 0));
                const scale = (size * rowLayout(e.style).size) / bundle.face(f.face).unitsPerEm;

                e.kind = 'number';
                e.formatted = f;
                e.scale = scale;
                e.width = f.advances.reduce((a, b) => a + b, 0) * scale;
                holes.push(f.text);
            } else {
                const value = String(raw ?? '');

                e.kind = 'text';
                e.value = value;
                e.width = options.measureText?.(slot.name, value, size, e.style) ?? [...value].length * size * 0.55;
                holes.push(value);
            }
        }
        elements.push(e);
    }
    let h = 0;

    text = text.replace(/￼/g, () => holes[h++] ?? '');
    if (ascender === 0) {
        ascender = size * 0.8;
        descender = -size * 0.2;
    }

    // greedy line breaking at baked opportunities
    const lineRanges: [number, number][] = [];
    const max = options.maxWidth > 0 ? options.maxWidth : Infinity;
    let start = 0;

    while (start < elements.length) {
        let width = 0;
        let end = start;
        let lastBreak = -1;

        for (; end < elements.length; end++) {
            const e = elements[end];

            if (end > start && e.flags & RunFlag.Mandatory) break;
            if (end > start && e.flags & RunFlag.BreakBefore) lastBreak = end;
            if (e.flags & RunFlag.Newline) {
                end++;
                break;
            }
            const ws = (e.flags & RunFlag.Whitespace) !== 0;

            if (!ws && width + e.width > max && end > start) {
                if (lastBreak > start) {
                    end = lastBreak;
                } else {
                    // nothing to break at: cut at the last glyph boundary that is safe
                    while (
                        end > start + 1 &&
                        (elements[end].width === 0 || elements[end].flags & RunFlag.UnsafeToBreak)
                    )
                        end--;
                }
                break;
            }
            width += e.width;
        }
        lineRanges.push([start, end]);
        start = end;
    }

    const lineAdvance = options.lineHeight * size;
    const halfLeading = (lineAdvance - (ascender - descender)) / 2;
    const instances: number[] = [];
    const slots: SlotPlacement[] = [];
    const objects: MessageLayout['objects'] = [];
    const textSlots: MessageLayout['textSlots'] = [];
    const hits: MessageLayout['hits'] = [];
    const lines: MessageLayout['lines'] = [];
    const placed: { e: Element; x: number }[][] = [];
    let widest = 0;

    for (const [ls, le] of lineRanges) {
        const range = elements.slice(ls, le);
        // L1: trailing white space takes the paragraph level and does not count
        let trail = range.length;

        while (trail > 0 && range[trail - 1].flags & (RunFlag.Whitespace | RunFlag.Newline)) trail--;
        const visible = range.slice(0, trail);
        const order = reorder(visible.map((e) => e.level));
        const row: { e: Element; x: number }[] = [];
        let x = 0;

        for (const i of order) {
            row.push({ e: visible[i], x });
            x += visible[i].width;
        }
        placed.push(row);
        widest = Math.max(widest, x);
        lines.push({ baseline: 0, left: 0, right: x });
    }
    const boxWidth = options.maxWidth > 0 ? options.maxWidth : widest;
    const align =
        options.align === 'start'
            ? base
                ? 'right'
                : 'left'
            : options.align === 'end'
              ? base
                  ? 'left'
                  : 'right'
              : options.align;

    placed.forEach((row, li) => {
        const lineWidth = lines[li].right;
        const shift = align === 'right' ? boxWidth - lineWidth : align === 'center' ? (boxWidth - lineWidth) / 2 : 0;
        const baseline = halfLeading + ascender + li * lineAdvance;
        const top = baseline - ascender - halfLeading;

        lines[li] = { baseline, left: shift, right: shift + lineWidth };
        let deco: { row: number; x: number; end: number } | null = null;
        let hit: { tag: string; x: number; end: number } | null = null;
        const flushDeco = () => {
            if (!deco) return;
            const flags = styles.data[deco.row * STYLE_FLOATS + 30];

            if (flags & StyleFlag.Underline)
                instances.push(deco.x, baseline, 0, 0, deco.row, InstanceKind.Underline, size, deco.end - deco.x);
            if (flags & StyleFlag.Strike)
                instances.push(deco.x, baseline, 0, 0, deco.row, InstanceKind.Strike, size, deco.end - deco.x);
            deco = null;
        };
        const flushHit = () => {
            if (hit) hits.push({ tag: hit.tag, x: hit.x, y: top, width: hit.end - hit.x, height: lineAdvance });
            hit = null;
        };

        for (const { e, x: ex } of row) {
            const x = ex + shift;
            const styleFlags = styles.data[e.style * STYLE_FLOATS + 30];

            if (styleFlags & (StyleFlag.Underline | StyleFlag.Strike)) {
                if (deco && deco.row === e.style && Math.abs(deco.end - x) < 0.01) deco.end = x + e.width;
                else {
                    flushDeco();
                    deco = { row: e.style, x, end: x + e.width };
                }
            } else flushDeco();
            const interactive = styleFlags & StyleFlag.Interactive ? interactiveTag(styles, e.style) : '';

            if (interactive) {
                if (hit && hit.tag === interactive && Math.abs(hit.end - x) < 0.01) hit.end = x + e.width;
                else {
                    flushHit();
                    hit = { tag: interactive, x, end: x + e.width };
                }
            } else flushHit();
            if (e.kind === 'glyph') {
                if (e.glyph)
                    instances.push(x + e.dx, baseline - e.dy, e.scale, e.glyph, e.style, InstanceKind.Glyph, size, 0);
            } else if (e.kind === 'number' && e.formatted) {
                const first = instances.length / INSTANCE_FLOATS;
                let pen = x;

                e.formatted.glyphs.forEach((g, i) => {
                    instances.push(pen, baseline, e.scale, g, e.style, InstanceKind.Glyph, size, 0);
                    pen += (e.formatted?.advances[i] ?? 0) * e.scale;
                });
                slots.push({
                    name: e.name,
                    slot: e.slot,
                    first,
                    count: e.formatted.glyphs.length,
                    formatted: e.formatted,
                    scale: e.scale,
                    style: e.style,
                });
            } else if (e.kind === 'text') {
                textSlots.push({
                    name: e.name,
                    value: e.value,
                    style: e.style,
                    x,
                    y: baseline - ascender,
                    width: e.width,
                    height: ascender - descender,
                    baseline: ascender,
                });
            } else if (e.kind === 'object' && e.metrics) {
                const height = e.metrics.height * size * rowLayout(e.style).size;

                objects.push({
                    name: e.name,
                    x,
                    y: baseline - height * (1 - (e.metrics.baseline ?? 0)),
                    width: e.width,
                    height,
                });
            }
        }
        flushDeco();
        flushHit();
    });

    return {
        instances: new Float32Array(instances),
        count: instances.length / INSTANCE_FLOATS,
        width: boxWidth,
        height: lines.length * lineAdvance,
        lines,
        slots,
        objects,
        textSlots,
        hits,
        text,
    };
}

function interactiveTag(styles: StyleTable, row: number): string {
    const stack = styles.stackOf(row);

    for (let i = stack.length - 1; i >= 0; i--) if (styles.theme.styles?.[stack[i]]?.interactive) return stack[i];

    return stack[stack.length - 1] ?? 'base';
}

/**
 * Rewrites the glyphs of a number slot in place when the new value has as many characters, each
 * with the advance of the one it replaces (brief sec. 6.3, `value-fast`): no layout, no allocation
 * beyond the formatting. Returns false when the caller must lay out again.
 */
export function updateNumberSlot(instances: Float32Array, placement: SlotPlacement, next: FormattedNumber): boolean {
    const prev = placement.formatted;

    if (next.glyphs.length !== prev.glyphs.length || next.face !== prev.face) return false;
    for (let i = 0; i < next.advances.length; i++) if (next.advances[i] !== prev.advances[i]) return false;
    for (let i = 0; i < next.glyphs.length; i++)
        instances[(placement.first + i) * INSTANCE_FLOATS + 3] = next.glyphs[i];
    placement.formatted = next;

    return true;
}
