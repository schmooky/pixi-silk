import * as hb from 'harfbuzzjs';
import { mergeStyles, RunFlag, shapeKey, type ThemeData, type ThemeStyle } from 'pixi-silk/i18n';
import { type BidiClass, resolveLevels } from 'pixi-silk/text/bidi';
import type { Diagnostic } from '../author/lint';
import { HOLE, type ParsedMessage } from '../author/parse';
import type { SlotDecl } from '../config';
import { exactBidiClass } from './bidi-classes';
import { covers, faceChain, type LoadedFace, scriptOf, UNSUPPORTED_SCRIPTS } from './fonts';
import { breakOpportunities } from './linebreak';

/** One shaped glyph, in logical order. Positions are font units of its face. */
export interface ShapedGlyph {
    /** Face id. */
    face: number;
    /** Glyph id in the face, or -1 for a newline (nothing to draw). */
    gid: number;
    /** Advance. */
    advance: number;
    /** Offset (mark positioning). */
    dx: number;
    /** Offset. */
    dy: number;
    /** UTF-16 offset of the glyph's cluster in the variant text. */
    cluster: number;
    /** Bidi level. */
    level: number;
    /** {@link RunFlag} bits. */
    flags: number;
    /** ISO 15924 script of the cluster's first character. */
    script: string;
}

/** A segment of a shaped variant, in logical order. */
export type ShapedSegment =
    | { kind: 'static'; face: number; level: number; glyphs: ShapedGlyph[] }
    | { kind: 'slot' | 'object'; name: string; offset: number; level: number; flags: number };

/** A message variant after shaping. */
export interface ShapedVariant {
    /** Variant text, holes as U+FFFC. */
    text: string;
    /** Paragraph level of the locale: 0 left to right, 1 right to left. */
    baseLevel: 0 | 1;
    /** Segments in logical order. */
    segments: ShapedSegment[];
    /** Spans over text offsets, outer before inner. */
    spans: { tag: string; start: number; end: number }[];
}

/** What {@link shapeVariant} needs to know. */
export interface ShapeContext {
    /** Loaded faces, config order. */
    faces: readonly LoadedFace[];
    /** The theme: tags select styles, shape-relevant fields split items. */
    theme: ThemeData;
    /** BCP 47 locale (shaping language). */
    locale: string;
    /** Paragraph direction of the locale. */
    dir: 0 | 1;
    /** The message's slots, to give break analysis a stand-in character. */
    slots: readonly SlotDecl[];
    /** Allow scripts v2 cannot break. */
    allowUnsupportedScripts?: boolean;
    /** Where to report problems. */
    report: (d: Omit<Diagnostic, 'severity'> & { severity?: Diagnostic['severity'] }) => void;
}

interface Unit {
    cp: number;
    offset: number;
    length: number;
    type: BidiClass;
    hole: number;
}

/** Styles that cover an offset, outer first, merged over the base. */
function styleAt(message: ParsedMessage, theme: ThemeData, offset: number): ThemeStyle {
    const stack = message.spans.filter((s) => s.start <= offset && offset < s.end);

    return mergeStyles(theme.base, ...stack.map((s) => theme.styles?.[s.tag]));
}

/**
 * Shapes one message variant (brief sec. 4.3): bidi levels (full UAX #9, holes as neutral
 * isolates), itemization by level, script, face and shape-relevant style, HarfBuzz shaping with the
 * whole paragraph as context, and UAX #14 break opportunities baked into the glyph flags.
 * Reports a missing glyph instead of baking `.notdef`.
 */
export function shapeVariant(message: ParsedMessage, ctx: ShapeContext): ShapedVariant {
    const text = message.text;
    const units: Unit[] = [];
    let h = 0;

    for (let i = 0; i < text.length; ) {
        const cp = text.codePointAt(i) ?? 0;
        const length = cp > 0xffff ? 2 : 1;
        const isHole = cp === 0xfffc && message.holes[h]?.index === i;

        units.push({ cp, offset: i, length, type: isHole ? 'ON' : exactBidiClass(cp), hole: isHole ? h++ : -1 });
        i += length;
    }
    // stand-ins for break analysis: a digit for number slots, a letter for text slots
    let analysis = '';

    for (const u of units) {
        if (u.hole < 0) analysis += String.fromCodePoint(u.cp);
        else {
            const hole = message.holes[u.hole];
            const decl = ctx.slots.find((s) => s.name === hole.name);

            analysis += hole.kind === 'object' ? HOLE : decl?.type === 'number' ? '0' : 'x';
        }
    }
    const breaks = new Map(breakOpportunities(analysis).map((b) => [b.position, b.required]));
    const levels: number[] = new Array(units.length).fill(ctx.dir);

    // bidi per paragraph
    for (let start = 0; start < units.length; ) {
        let end = start;

        while (end < units.length && units[end].cp !== 10) end++;
        const slice = units.slice(start, end);
        const resolved = resolveLevels(
            slice.map((u) => u.type),
            ctx.dir,
            slice.map((u) => String.fromCodePoint(u.cp)),
        );

        resolved.forEach((l, i) => {
            levels[start + i] = l;
        });
        start = end + 1;
    }

    const segments: ShapedSegment[] = [];
    let unitIndex = 0;
    let paragraphStart = 0;
    let prevFace = -1;
    let prevScript = 'Zyyy';
    const scripts = units.map((u) => scriptOf(u.cp));

    // common and inherited characters take the script of a neighbour, preferring one at the same bidi
    // level, so a space between an Arabic and a Latin run joins the run it is drawn with
    const raw = [...scripts];
    const neutral = (s: string) => s === 'Zyyy' || s === 'Zinh';

    for (let i = 0; i < scripts.length; i++) {
        if (!neutral(raw[i])) continue;
        let prev = -1;
        let next = -1;

        for (let j = i - 1; j >= 0 && units[j].cp !== 10; j--) {
            if (!neutral(raw[j])) {
                prev = j;
                break;
            }
        }
        for (let j = i + 1; j < scripts.length && units[j].cp !== 10; j++) {
            if (!neutral(raw[j])) {
                next = j;
                break;
            }
        }
        const pick =
            prev >= 0 && levels[prev] === levels[i]
                ? prev
                : next >= 0 && levels[next] === levels[i]
                  ? next
                  : prev >= 0
                    ? prev
                    : next;

        if (pick >= 0) scripts[i] = raw[pick];
    }
    for (const s of new Set(scripts)) {
        if (UNSUPPORTED_SCRIPTS.has(s) && !ctx.allowUnsupportedScripts) {
            ctx.report({
                code: 'unsupported-script',
                message: `script ${s} needs dictionary line breaking, which v2 does not support (pass --allow-unsupported-scripts to compile it anyway)`,
            });
        }
    }
    const faceOf = (i: number, style: ThemeStyle): number => {
        const u = units[i];
        const chain = faceChain(ctx.faces, style.family, style.weight ?? 400);
        const isMark = u.type === 'NSM' || scriptOf(u.cp) === 'Zinh';
        const common = scriptOf(u.cp) === 'Zyyy';

        // marks stay with their base
        if (isMark && prevFace >= 0 && chain.some((f) => f.id === prevFace) && covers(ctx.faces[prevFace], u.cp)) {
            return prevFace;
        }
        // common characters take a face of the script they were resolved to
        if (common) {
            for (const f of chain) {
                if (covers(f, u.cp) && f.script === pageScriptOf(scripts[i])) return f.id;
            }
            if (prevFace >= 0 && chain.some((f) => f.id === prevFace) && covers(ctx.faces[prevFace], u.cp))
                return prevFace;
        }
        for (const f of chain) if (covers(f, u.cp)) return f.id;

        return -1;
    };

    while (unitIndex < units.length) {
        const u = units[unitIndex];

        if (u.cp === 10) {
            // a newline: its own segment, nothing to draw
            segments.push({
                kind: 'static',
                face: Math.max(prevFace, 0),
                level: ctx.dir,
                glyphs: [
                    {
                        face: Math.max(prevFace, 0),
                        gid: -1,
                        advance: 0,
                        dx: 0,
                        dy: 0,
                        cluster: u.offset,
                        level: ctx.dir,
                        flags: RunFlag.Newline | RunFlag.Whitespace | breakFlags(breaks, u.offset),
                        script: prevScript,
                    },
                ],
            });
            unitIndex++;
            paragraphStart = unitIndex;
            continue;
        }
        if (u.hole >= 0) {
            const hole = message.holes[u.hole];

            segments.push({
                kind: hole.kind,
                name: hole.name,
                offset: u.offset,
                level: levels[unitIndex],
                flags: breakFlags(breaks, u.offset),
            });
            unitIndex++;
            continue;
        }
        // one item: same level, script, face and shape-relevant style
        const style = styleAt(message, ctx.theme, u.offset);
        const key = shapeKey(style);
        const face = faceOf(unitIndex, style);

        if (face < 0) {
            ctx.report({
                code: 'missing-glyph',
                message: `no font has a glyph for U+${u.cp.toString(16).toUpperCase().padStart(4, '0')} "${String.fromCodePoint(u.cp)}" (character ${u.offset + 1})`,
            });
            unitIndex++;
            continue;
        }
        prevFace = face;
        let end = unitIndex + 1;

        while (end < units.length) {
            const v = units[end];

            if (v.cp === 10 || v.hole >= 0 || levels[end] !== levels[unitIndex] || scripts[end] !== scripts[unitIndex])
                break;
            const vs = styleAt(message, ctx.theme, v.offset);

            if (shapeKey(vs) !== key) break;
            if (faceOf(end, vs) !== face) break;
            end++;
        }
        prevScript = scripts[unitIndex];
        const glyphs = shapeItem(
            units,
            unitIndex,
            end,
            paragraphStart,
            levels[unitIndex],
            scripts[unitIndex],
            face,
            style,
            ctx,
        );

        for (const g of glyphs) {
            const first = glyphs.find((x) => x.cluster === g.cluster) === g;

            if (first) g.flags |= breakFlags(breaks, g.cluster);
            const ch = text.codePointAt(g.cluster) ?? 0;

            if (ch === 32 || ch === 9 || ch === 0x3000 || (ch >= 0x2000 && ch <= 0x200a)) g.flags |= RunFlag.Whitespace;
        }
        segments.push({ kind: 'static', face, level: levels[unitIndex], glyphs });
        unitIndex = end;
    }

    return {
        text,
        baseLevel: ctx.dir,
        segments,
        spans: message.spans.map((s) => ({ tag: s.tag, start: s.start, end: s.end })),
    };
}

function pageScriptOf(script: string): string {
    return script === 'Arab'
        ? 'arabic'
        : script === 'Hebr'
          ? 'hebrew'
          : script === 'Grek'
            ? 'greek'
            : script === 'Cyrl'
              ? 'cyrillic'
              : 'latin';
}

function breakFlags(breaks: Map<number, boolean>, offset: number): number {
    const b = breaks.get(offset);

    if (b === undefined) return 0;

    return RunFlag.BreakBefore | (b ? RunFlag.Mandatory : 0);
}

function shapeItem(
    units: Unit[],
    from: number,
    to: number,
    paragraphStart: number,
    level: number,
    script: string,
    faceId: number,
    style: ThemeStyle,
    ctx: ShapeContext,
): ShapedGlyph[] {
    let paragraphEnd = from;

    while (paragraphEnd < units.length && units[paragraphEnd].cp !== 10) paragraphEnd++;
    const base = units[paragraphStart]?.offset ?? 0;
    const paragraph = ctx_text(units, paragraphStart, paragraphEnd);
    const itemOffset = units[from].offset - base;
    const itemLength = units[to - 1].offset + units[to - 1].length - units[from].offset;
    const face = ctx.faces[faceId];
    const buffer = new hb.Buffer();

    buffer.addText(paragraph, itemOffset, itemLength);
    buffer.setDirection(level % 2 ? hb.Direction.RTL : hb.Direction.LTR);
    buffer.setScript(script === 'Zyyy' || script === 'Zzzz' ? 'Zyyy' : script);
    buffer.setLanguage(ctx.locale);
    buffer.setFlags(
        hb.BufferFlag.PRODUCE_UNSAFE_TO_CONCAT |
            (from === paragraphStart ? hb.BufferFlag.BOT : 0) |
            (to === paragraphEnd ? hb.BufferFlag.EOT : 0),
    );
    const features = (style.features ?? []).map((tag) => new hb.Feature(tag, 1));

    hb.shape(face.font, buffer, features);
    const out = buffer.getGlyphInfosAndPositions().map((g): ShapedGlyph => {
        const cluster = g.cluster + base;

        if (g.codepoint === 0) {
            const cp = units.find((u) => u.offset === cluster)?.cp ?? 0;

            ctx.report({
                code: 'missing-glyph',
                message: `${face.file} has no glyph for U+${cp.toString(16).toUpperCase().padStart(4, '0')} "${String.fromCodePoint(cp)}" (character ${cluster + 1})`,
            });
        }

        return {
            face: faceId,
            gid: g.codepoint,
            advance: Math.round((g.xAdvance ?? 0) + (style.letterSpacing ?? 0) * face.upem),
            dx: g.xOffset ?? 0,
            dy: g.yOffset ?? 0,
            cluster,
            level,
            flags: g.flags & hb.GlyphFlag.UNSAFE_TO_BREAK ? RunFlag.UnsafeToBreak : 0,
            script,
        };
    });

    // HarfBuzz returns right-to-left runs in visual order: store logical order
    if (level % 2) out.reverse();

    return out;
}

function ctx_text(units: Unit[], from: number, to: number): string {
    let s = '';

    for (let i = from; i < to; i++) s += String.fromCodePoint(units[i].cp);

    return s;
}

/**
 * Digits and number punctuation for one face and numbering system, shaped one character at a time
 * with `tnum`, so `value-fast` updates map characters to glyphs without shaping (brief sec. 4.3).
 */
export interface DigitTable {
    /** Face of the digits. */
    face: number;
    /** Numbering system, such as `arab`. */
    numberingSystem: string;
    /** Entries: code point, face, glyph id (-1 for a zero-width mark), advance. */
    entries: { cp: number; face: number; gid: number; advance: number }[];
    /** Widest digit advance, font units of `face`. */
    tabularAdvance: number;
    /** The face applied `tnum`, or its digits already share one width. */
    tabular: boolean;
}

const ZERO_WIDTH = [0x061c, 0x200e, 0x200f];
const PUNCT = [0x2c, 0x2e, 0x2d, 0x2212, 0x25, 0x2b, 0x20, 0xa0, 0x202f, 0x2019];
/** Arabic percent sign, decimal and thousands separators, for the `arab` and `arabext` systems. */
const ARABIC_PUNCT = [0x66a, 0x66b, 0x66c];

/** Digits of a numbering system, from `Intl.NumberFormat`. */
export function digitsOf(numberingSystem: string): number[] {
    const f = new Intl.NumberFormat('en', { numberingSystem, useGrouping: false });

    return [...'0123456789'].map((d) => f.format(Number(d)).codePointAt(0) ?? 48);
}

/**
 * Builds the digit table of a face chain for a numbering system: the native digits, Latin digits
 * (the fallback), separators, minus, percent and the bidi marks `Intl.NumberFormat` emits.
 */
export function buildDigitTable(
    chain: readonly LoadedFace[],
    numberingSystem: string,
    report: ShapeContext['report'],
): DigitTable | null {
    const native = digitsOf(numberingSystem);
    const latin = digitsOf('latn');
    const face = chain.find((f) => native.every((cp) => covers(f, cp)));

    if (!face) {
        report({
            code: 'missing-digits',
            message: `no font has all ${numberingSystem} digits (${String.fromCodePoint(...native)})`,
        });
        return null;
    }
    const tnum = face.features.has('tnum');
    const shapeOne = (f: LoadedFace, cp: number) => {
        const b = new hb.Buffer();

        b.addCodePoints([cp]);
        b.guessSegmentProperties();
        b.setDirection(hb.Direction.LTR);
        hb.shape(f.font, b, tnum && f === face ? [new hb.Feature('tnum', 1)] : []);
        const g = b.getGlyphInfosAndPositions()[0];

        return { gid: g?.codepoint ?? 0, advance: g?.xAdvance ?? 0 };
    };
    const entries: DigitTable['entries'] = [];
    const seen = new Set<number>();

    const punct = numberingSystem.startsWith('arab') ? [...PUNCT, ...ARABIC_PUNCT] : PUNCT;

    for (const cp of [...native, ...latin, ...punct]) {
        if (seen.has(cp)) continue;
        seen.add(cp);
        const f = covers(face, cp) ? face : chain.find((c) => covers(c, cp));

        if (!f) continue;
        const { gid, advance } = shapeOne(f, cp);

        entries.push({ cp, face: f.id, gid, advance: Math.round((advance * face.upem) / f.upem) });
    }
    for (const cp of ZERO_WIDTH) entries.push({ cp, face: face.id, gid: -1, advance: 0 });
    const digitAdvances = entries.filter((e) => native.includes(e.cp)).map((e) => e.advance);
    const tabularAdvance = Math.max(...digitAdvances);
    const uniform = digitAdvances.every((a) => a === tabularAdvance);

    if (!tnum && !uniform) {
        report({
            severity: 'warning',
            code: 'no-tnum',
            message: `${face.file} has no tnum feature and proportional ${numberingSystem} digits: value-fast updates are disabled for its number slots`,
        });
    }

    return { face: face.id, numberingSystem, entries, tabularAdvance, tabular: tnum || uniform };
}
