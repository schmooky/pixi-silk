import {
    type BundleData,
    BundleFlag,
    effectReach,
    hashKey,
    INSTANCE_FLOATS,
    LAYOUT_ALIGNS,
    layoutMessage,
    MESSAGE_STRIDE,
    mergeStyles,
    NONE,
    PageKind,
    PLURAL_CATEGORIES,
    type PluralCategory,
    SEGMENT_STRIDE,
    SegmentKind,
    SILK_MAJOR,
    SILK_MINOR,
    SilkBundle,
    SlotFlag,
    SlotType,
    StyleTable,
    type ThemeStyle,
    VARIANT_STRIDE,
} from 'pixi-silk/i18n';
import { type Atlas, buildAtlas, type GlyphRequest } from './atlas/pack';
import { type CatalogMessage, type Diagnostic, pluralCategories } from './author/lint';
import type { FixedLayout, SlotDecl } from './config';
import { emitMessagesDts } from './emit/dts';
import { writeBundle } from './emit/writer';
import { resolveLocale } from './locales';
import type { Project } from './project';
import { faceChain, type LoadedFace, loadFaces } from './shape/fonts';
import { buildDigitTable, type DigitTable, type ShapedGlyph, type ShapedVariant, shapeVariant } from './shape/shape';

/** Options of {@link compileProject}. */
export interface CompileOptions {
    /**
     * Split each locale into chunks: one bundle per worksheet (`sheet`) or per key prefix before the
     * first dot (`keyPrefix`), named `<locale>.<chunk>.silk`. Default one bundle per locale.
     */
    splitBy?: 'sheet' | 'keyPrefix';
}

/** Chunk name of a message for a split mode, or '' for none. */
export function chunkOf(message: CatalogMessage, splitBy: CompileOptions['splitBy']): string {
    if (splitBy === 'sheet') return message.origin.sheet;
    if (splitBy === 'keyPrefix') return message.key.split('.')[0];

    return '';
}

/** What one compile produces. */
export interface CompileResult {
    /** `.silk` bundles by locale, or by `<locale>.<chunk>` when split. */
    bundles: Map<string, Uint8Array>;
    /** Atlas pages, shared by every locale. */
    atlas: Atlas;
    /** `messages.d.ts`. */
    dts: string;
    /** Page manifest: file, script, kind and size of every page. */
    manifest: {
        emSize: number;
        distanceRange: number;
        pages: { file: string; script: string; kind: string; width: number; height: number; glyphs: number }[];
    };
    /** Human-readable dumps of the bundles, by locale. */
    debug: Map<string, unknown>;
    /** Every problem. A result with errors has no bundles. */
    diagnostics: Diagnostic[];
}

/** 0 for left-to-right locales, 1 for right-to-left ones, from the script of the locale's BCP 47 tag. */
export function localeDirection(locale: string): 0 | 1 {
    return resolveLocale(locale).dir;
}

interface ShapedMessage {
    message: CatalogMessage;
    variants: { category: PluralCategory; shaped: ShapedVariant }[];
}

/** The distance range the theme needs, in atlas pixels, and warnings for effects that would clip. */
export function distanceRangeFor(
    styles: Record<string, ThemeStyle>,
    emSize: number,
    minSize: number,
    maxRange: number,
): { range: number; warnings: Diagnostic[] } {
    let range = 4;
    const warnings: Diagnostic[] = [];

    for (const [name, style] of Object.entries(styles)) {
        const reach = effectReach(style);

        for (const [effect, px] of Object.entries(reach)) {
            const need = Math.ceil((2 * px * emSize) / minSize) + 1;

            if (need > maxRange) {
                warnings.push({
                    severity: 'warning',
                    code: 'effect-clips',
                    message: `style "${name}": a ${effect} of ${px} px needs a distance range of ${need} px at ${minSize} px text, the atlas has ${maxRange}: it clips below ${Math.ceil((2 * px * emSize) / (maxRange - 1))} px. Use mtsdf pages or a post-process glow for wide soft effects`,
                });
            }
            range = Math.max(range, Math.min(need, maxRange));
        }
    }

    return { range, warnings };
}

/**
 * Compiles a linted project (brief sec. 4): shapes every variant of every locale, builds the shared
 * atlas and the digit tables, and writes one bundle per locale. Deterministic: the same inputs
 * give byte-identical outputs.
 */
export function compileProject(project: Project, options: CompileOptions = {}): CompileResult {
    const { config, catalog, theme } = project;
    const diagnostics = [...catalog.diagnostics];
    const faces = loadFaces(config.fonts, project.root);
    const atlasConfig = {
        kind: config.atlas?.kind ?? 'msdf',
        emSize: config.atlas?.emSize ?? 40,
        maxPageSize: config.atlas?.maxPageSize ?? 1024,
        format: config.atlas?.format ?? 'png',
    };
    const allStyles = { base: theme.base ?? {}, ...(theme.styles ?? {}) };
    const fromTheme = distanceRangeFor(
        allStyles,
        atlasConfig.emSize,
        config.atlas?.minSize ?? 24,
        config.atlas?.maxDistanceRange ?? 16,
    );
    const distanceRange = config.atlas?.distanceRange || fromTheme.range;

    diagnostics.push(...fromTheme.warnings);
    const shapedByLocale = new Map<string, ShapedMessage[]>();
    const requests: GlyphRequest[] = [];
    const digitTables = new Map<string, Map<string, DigitTable>>();

    for (const [locale, localeConfig] of Object.entries(config.locales)) {
        const resolved = resolveLocale(locale, localeConfig);
        const { dir, numberingSystem, families } = resolved;
        const shaped: ShapedMessage[] = [];
        const tables = new Map<string, DigitTable>();

        for (const message of catalog.messages.values()) {
            const variants = message.locales[locale];

            if (!variants) continue;
            const selector = message.slots.find((s) => s.plural);
            const categories: PluralCategory[] = selector ? pluralCategories(resolved.bcp47) : ['other'];
            const out: ShapedMessage['variants'] = [];

            for (const category of categories) {
                const parsed = variants[category];

                if (!parsed || parsed.issues.length) continue;
                const shapedVariant = shapeVariant(parsed, {
                    faces,
                    theme,
                    locale: resolved.bcp47,
                    dir,
                    families,
                    slots: message.slots,
                    report: (d) =>
                        diagnostics.push({
                            severity: 'error',
                            ...d,
                            sheet: message.origin.sheet,
                            row: message.origin.row,
                            locale,
                            key: message.key,
                        }),
                });

                out.push({ category, shaped: shapedVariant });
                for (const seg of shapedVariant.segments) {
                    if (seg.kind === 'static')
                        for (const g of seg.glyphs) if (g.gid > 0) requests.push({ face: g.face, gid: g.gid });
                    if (seg.kind === 'slot') {
                        const decl = message.slots.find((s) => s.name === seg.name);

                        if (decl?.type !== 'number') continue;
                        const style = styleAtOffset(shapedVariant, allStyles, seg.offset);
                        const chain = faceChain(faces, style.family, style.weight ?? 400, families);
                        const key = `${chain.map((f) => f.id).join(',')}|${numberingSystem}`;

                        if (!tables.has(key)) {
                            const table = buildDigitTable(chain, numberingSystem, (d) =>
                                diagnostics.push({ severity: 'error', ...d, locale, key: message.key }),
                            );

                            if (table) {
                                tables.set(key, table);
                                for (const e of table.entries)
                                    if (e.gid > 0) requests.push({ face: e.face, gid: e.gid });
                            }
                        }
                    }
                }
            }
            if (out.length) shaped.push({ message, variants: out });
        }
        shapedByLocale.set(locale, shaped);
        digitTables.set(locale, tables);
    }
    const atlas = buildAtlas(requests, faces, { ...atlasConfig, distanceRange });
    const manifest = {
        emSize: atlas.emSize,
        distanceRange: atlas.distanceRange,
        pages: atlas.pages.map(({ file, script, kind, width, height, glyphs }) => ({
            file,
            script,
            kind,
            width,
            height,
            glyphs,
        })),
    };
    const bundles = new Map<string, Uint8Array>();
    const debug = new Map<string, unknown>();
    const failed = diagnostics.some((d) => d.severity === 'error');

    for (const [locale, allShaped] of shapedByLocale) {
        const chunks = [...new Set(allShaped.map((m) => chunkOf(m.message, options.splitBy)))];

        for (const chunk of chunks) {
            const shaped = allShaped.filter((m) => chunkOf(m.message, options.splitBy) === chunk);
            const name = chunk ? `${locale}.${chunk}` : locale;
            const localeDiagnostics: Diagnostic[] = [];
            const resolved = resolveLocale(locale, config.locales[locale]);
            const { data, dump } = assembleBundle({
                locale: resolved.bcp47,
                id: locale,
                dir: resolved.dir,
                families: resolved.families,
                numberingSystem: resolved.numberingSystem,
                shaped,
                faces,
                atlas,
                tables: digitTables.get(locale) ?? new Map(),
                devKeys: config.devKeys ?? false,
                theme: allStyles,
                report: (d) => localeDiagnostics.push(d),
            });

            if (config.layouts?.length)
                bakeLayouts(data, config.layouts, allStyles, (d) => localeDiagnostics.push({ ...d, locale }));
            diagnostics.push(...localeDiagnostics);
            if (!failed && !localeDiagnostics.some((d) => d.severity === 'error')) bundles.set(name, writeBundle(data));
            debug.set(name, dump);
        }
    }
    if (diagnostics.some((d) => d.severity === 'error')) bundles.clear();

    return { bundles, atlas, dts: emitMessagesDts(catalog), manifest, debug, diagnostics };
}

function styleAtOffset(variant: ShapedVariant, styles: Record<string, ThemeStyle>, offset: number): ThemeStyle {
    return mergeStyles(
        styles.base,
        ...variant.spans.filter((s) => s.start <= offset && offset < s.end).map((s) => styles[s.tag]),
    );
}

interface AssembleInput {
    /** BCP 47 tag. */
    locale: string;
    /** App code, the bundle name. */
    id?: string;
    /** Paragraph direction. Default from the tag. */
    dir?: 0 | 1;
    /** Preferred families. */
    families?: string[];
    numberingSystem: string;
    shaped: ShapedMessage[];
    faces: readonly LoadedFace[];
    atlas: Atlas;
    tables: Map<string, DigitTable>;
    devKeys: boolean;
    theme: Record<string, ThemeStyle>;
    report: (d: Diagnostic) => void;
}

/** Builds the tables of one locale's bundle from its shaped messages (brief sec. 5). */
export function assembleBundle(input: AssembleInput): { data: BundleData; dump: unknown } {
    const { atlas, faces } = input;
    const strings: string[] = [];
    const stringIndex = new Map<string, number>();
    const ref = (s: string) => {
        let i = stringIndex.get(s);

        if (i === undefined) {
            i = strings.push(s) - 1;
            stringIndex.set(s, i);
        }
        return i;
    };

    ref(input.locale);
    ref(input.numberingSystem);
    // atlas glyphs of this bundle, sorted by face and glyph id; record 0 is the empty glyph
    const usedGlyphs = new Set<string>();
    const usedFaces = new Set<number>();

    for (const { variants } of input.shaped) {
        for (const { shaped } of variants) {
            for (const seg of shaped.segments) {
                if (seg.kind !== 'static') continue;
                usedFaces.add(seg.face);
                for (const g of seg.glyphs) {
                    usedFaces.add(g.face);
                    if (atlas.glyphs.has(`${g.face}:${g.gid}`)) usedGlyphs.add(`${g.face}:${g.gid}`);
                }
            }
        }
    }
    for (const t of input.tables.values()) {
        usedFaces.add(t.face);
        for (const e of t.entries) {
            usedFaces.add(e.face);
            if (atlas.glyphs.has(`${e.face}:${e.gid}`)) usedGlyphs.add(`${e.face}:${e.gid}`);
        }
    }
    const glyphKeys = [...usedGlyphs].sort((a, b) => {
        const [fa, ga] = a.split(':').map(Number);
        const [fb, gb] = b.split(':').map(Number);

        return fa - fb || ga - gb;
    });
    const glyphIndex = new Map(glyphKeys.map((k, i) => [k, i + 1]));
    const usedPages = [...new Set(glyphKeys.map((k) => atlas.glyphs.get(k)?.page ?? 0))].sort((a, b) => a - b);
    const glyphs = new Int16Array((glyphKeys.length + 1) * 10);

    glyphKeys.forEach((k, i) => {
        const g = atlas.glyphs.get(k);

        if (!g) return;
        const o = (i + 1) * 10;

        glyphs.set([g.page, g.x, g.y, g.w, g.h, g.planeL, g.planeB, g.planeR, g.planeT, Number(k.split(':')[0])], o);
    });
    const pages = new Float32Array(usedPages.length * 7);

    usedPages.forEach((p, i) => {
        const page = atlas.pages[p];
        const kind = page.kind === 'sdf' ? PageKind.Sdf : page.kind === 'mtsdf' ? PageKind.Mtsdf : PageKind.Msdf;

        pages.set(
            [p, ref(`atlas/${page.file}`), kind, page.width, page.height, atlas.distanceRange, atlas.emSize],
            i * 7,
        );
    });
    const faceIds = [...usedFaces].sort((a, b) => a - b);
    const faceRecords = new Int32Array(faceIds.length * 9);

    faceIds.forEach((id, i) => {
        const f = faces[id];

        faceRecords.set(
            [
                id,
                f.upem,
                Number(f.hash & 0xffffffffn) | 0,
                Number(f.hash >> 32n) | 0,
                f.extents.ascender,
                f.extents.descender,
                f.extents.lineGap,
                ref(f.family),
                f.weight,
            ],
            i * 9,
        );
    });
    // tags: span tags and object names
    const tagIds = new Map<string, number>();
    const tag = (name: string) => {
        let id = tagIds.get(name);

        if (id === undefined) {
            id = tagIds.size;
            tagIds.set(name, id);
        }
        return id;
    };
    // digit tables
    const tableKeys = [...input.tables.keys()].sort();
    const tableIndex = new Map(tableKeys.map((k, i) => [k, i]));
    const digits: number[] = [];
    const digitEntries: number[] = [];

    for (const k of tableKeys) {
        const t = input.tables.get(k);

        if (!t) continue;
        digits.push(
            t.face,
            ref(t.numberingSystem),
            digitEntries.length / 3,
            t.entries.length,
            t.tabularAdvance,
            t.tabular ? SlotFlag.Tabular : SlotFlag.NoFastPath,
        );
        for (const e of t.entries) {
            const glyph = e.gid < 0 ? -1 : (glyphIndex.get(`${e.face}:${e.gid}`) ?? 0);

            digitEntries.push(e.cp, glyph, e.advance);
        }
    }
    // slots, runs, segments, spans, variants, messages
    const slotIds = new Map<string, number>();
    const slots: number[] = [];
    const runCols = {
        glyph: [] as number[],
        advance: [] as number[],
        dx: [] as number[],
        dy: [] as number[],
        cluster: [] as number[],
        level: [] as number[],
        flags: [] as number[],
    };
    const runIndex = new Map<string, number>();
    const segments: number[] = [];
    const spans: number[] = [];
    const variants: number[] = [];
    const messages: { hash: number; key: string; record: number[] }[] = [];
    const dumpMessages: unknown[] = [];
    const slotId = (decl: SlotDecl, table: number) => {
        const k = `${decl.name}|${decl.type}|${decl.maxDigits}|${decl.maxChars}|${decl.tabular}|${decl.plural}|${decl.percent}|${table}`;
        let id = slotIds.get(k);

        if (id === undefined) {
            id = slotIds.size;
            slotIds.set(k, id);
            const tableRecord = table === NONE ? null : digits.slice(table * 6, table * 6 + 6);
            const flags =
                (decl.tabular ? SlotFlag.Tabular : 0) |
                (decl.plural ? SlotFlag.Plural : 0) |
                (decl.percent ? SlotFlag.Percent : 0) |
                (tableRecord && tableRecord[5] & SlotFlag.NoFastPath ? SlotFlag.NoFastPath : 0);

            slots.push(
                ref(decl.name),
                decl.type === 'number' ? SlotType.Number : SlotType.Text,
                decl.type === 'number' ? decl.maxDigits : decl.maxChars,
                table,
                flags,
                tableRecord ? tableRecord[0] : 0,
            );
        }
        return id;
    };
    const addRun = (glyphsOf: ShapedGlyph[]): number => {
        const key = JSON.stringify(
            glyphsOf.map((g) => [g.face, g.gid, g.advance, g.dx, g.dy, g.cluster, g.level, g.flags]),
        );
        const known = runIndex.get(key);

        if (known !== undefined) return known;
        const start = runCols.glyph.length;

        for (const g of glyphsOf) {
            runCols.glyph.push(g.gid < 0 ? 0 : (glyphIndex.get(`${g.face}:${g.gid}`) ?? 0));
            runCols.advance.push(g.advance);
            runCols.dx.push(g.dx);
            runCols.dy.push(g.dy);
            runCols.cluster.push(g.cluster);
            runCols.level.push(g.level);
            runCols.flags.push(g.flags);
        }
        runIndex.set(key, start);
        return start;
    };

    for (const { message, variants: vs } of input.shaped) {
        const firstVariant = variants.length / 7;
        const selector = message.slots.find((s) => s.plural);
        let selectorSlot = NONE;
        const dumpVariants: unknown[] = [];

        for (const { category, shaped } of vs) {
            const firstSeg = segments.length / 5;
            const firstSpan = spans.length / 5;

            for (const seg of shaped.segments) {
                if (seg.kind === 'static') {
                    segments.push(SegmentKind.Static, addRun(seg.glyphs), seg.glyphs.length, seg.face, seg.level);
                } else if (seg.kind === 'slot') {
                    const decl = message.slots.find((s) => s.name === seg.name);

                    if (!decl) continue;
                    let table = NONE;

                    if (decl.type === 'number') {
                        const style = styleAtOffset(shaped, input.theme, seg.offset);
                        const chain = faceChain(faces, style.family, style.weight ?? 400, input.families);
                        const key = `${chain.map((f) => f.id).join(',')}|${input.numberingSystem}`;

                        table = tableIndex.get(key) ?? NONE;
                    }
                    const id = slotId(decl, table);

                    if (decl.plural) selectorSlot = id;
                    segments.push(SegmentKind.Slot, id, seg.offset, seg.flags, seg.level);
                } else {
                    segments.push(SegmentKind.Object, tag(seg.name), seg.offset, seg.flags, seg.level);
                }
            }
            const segCount = segments.length / 5 - firstSeg;
            const segOffsets = (i: number): [number, number] => {
                const at = (firstSeg + i) * 5;

                if (segments[at] !== SegmentKind.Static) return [segments[at + 2], segments[at + 2] + 1];
                const start = segments[at + 1];
                const len = segments[at + 2];
                let lo = Infinity;
                let hi = -Infinity;

                for (let g = start; g < start + len; g++) {
                    lo = Math.min(lo, runCols.cluster[g]);
                    hi = Math.max(hi, runCols.cluster[g] + 1);
                }
                return [lo, hi];
            };

            for (const span of shaped.spans) {
                let startSeg = -1;
                let endSeg = -1;

                for (let i = 0; i < segCount; i++) {
                    const [lo, hi] = segOffsets(i);

                    if (hi > span.start && lo < span.end) {
                        if (startSeg < 0) startSeg = i;
                        endSeg = i;
                    }
                }
                if (startSeg < 0) continue;
                spans.push(tag(span.tag), startSeg, span.start, endSeg, span.end);
            }
            variants.push(
                PLURAL_CATEGORIES.indexOf(category),
                firstSeg,
                segCount,
                firstSpan,
                spans.length / 5 - firstSpan,
                shaped.baseLevel,
                ref(shaped.text),
            );
            dumpVariants.push({
                category,
                text: shaped.text,
                segments: shaped.segments.map(dumpSegment),
                spans: shaped.spans,
            });
        }
        if (selector && selectorSlot === NONE) {
            input.report({
                severity: 'error',
                code: 'selector-missing',
                message: `{${selector.name}} selects the plural but appears in no variant`,
                key: message.key,
                locale: input.locale,
            });
        }
        const hash = hashKey(message.key);

        messages.push({
            hash,
            key: message.key,
            record: [hash, input.devKeys ? ref(message.key) : NONE, selectorSlot, firstVariant, vs.length, 0],
        });
        dumpMessages.push({ key: message.key, hash, variants: dumpVariants });
    }
    messages.sort((a, b) => a.hash - b.hash);
    for (let i = 1; i < messages.length; i++) {
        if (messages[i].hash === messages[i - 1].hash) {
            input.report({
                severity: 'error',
                code: 'key-collision',
                message: `keys "${messages[i - 1].key}" and "${messages[i].key}" have the same hash: rename one`,
                locale: input.locale,
            });
        }
    }
    const tagRefs = new Uint32Array([...tagIds.keys()].map(ref));
    const glyph32 = glyphKeys.length + 1 > 0xffff;
    const data: BundleData = {
        major: SILK_MAJOR,
        minor: SILK_MINOR,
        flags: input.devKeys ? BundleFlag.DevKeys : 0,
        locale: input.locale,
        id: input.id ?? input.locale,
        dir: input.dir ?? localeDirection(input.locale),
        numberingSystem: input.numberingSystem,
        strings,
        tags: tagRefs,
        faces: faceRecords,
        pages,
        glyphs,
        runs: {
            glyph: glyph32 ? new Uint32Array(runCols.glyph) : new Uint16Array(runCols.glyph),
            advance: new Int16Array(runCols.advance),
            dx: new Int16Array(runCols.dx),
            dy: new Int16Array(runCols.dy),
            cluster: new Uint16Array(runCols.cluster),
            level: new Uint8Array(runCols.level),
            flags: new Uint8Array(runCols.flags),
        },
        messages: new Uint32Array(messages.flatMap((m) => m.record)),
        variants: new Uint32Array(variants),
        segments: new Uint32Array(segments),
        spans: new Uint16Array(spans),
        slots: new Uint32Array(slots),
        digits: new Uint32Array(digits),
        digitEntries: new Int32Array(digitEntries),
    };
    const dump = {
        locale: input.locale,
        numberingSystem: input.numberingSystem,
        glyphs: glyphKeys.length,
        runGlyphs: runCols.glyph.length,
        pages: usedPages.map((p) => atlas.pages[p].file),
        tags: [...tagIds.keys()],
        digitTables: tableKeys.map((k) => {
            const t = input.tables.get(k);

            return {
                face: t?.face,
                numberingSystem: t?.numberingSystem,
                tabular: t?.tabular,
                entries: t?.entries.map((e) => String.fromCodePoint(e.cp)).join(''),
            };
        }),
        messages: dumpMessages,
    };

    return { data, dump };
}

function dumpSegment(seg: ShapedVariant['segments'][number]): unknown {
    if (seg.kind !== 'static')
        return { kind: seg.kind, name: seg.name, offset: seg.offset, level: seg.level, flags: seg.flags };

    return {
        kind: 'static',
        face: seg.face,
        level: seg.level,
        glyphs: seg.glyphs.map((g) => [g.gid, g.advance, g.dx, g.dy, g.cluster, g.flags]),
    };
}

/**
 * Lays out the fixed messages of a bundle with the runtime's own `layoutMessage` and stores the
 * result in the LAYOUTS sections, with tag stacks in place of style rows (rows are numbered per
 * theme at runtime).
 */
export function bakeLayouts(
    data: BundleData,
    layouts: readonly FixedLayout[],
    styles: Record<string, ThemeStyle>,
    report: (d: Diagnostic) => void,
): void {
    const bundle = new SilkBundle(writeBundle(data).slice().buffer as ArrayBuffer);
    const table = new StyleTable({ $silk: 2, base: styles.base, styles });
    const strings = [...data.strings];
    const stackIds = new Map<string, number>();
    const stackRefs: number[] = [];
    const records: number[] = [];
    const instances: number[] = [];
    const lines: number[] = [];

    for (const spec of layouts) {
        const message = bundle.message(spec.key);

        if (message < 0) continue;
        const first = data.messages[message * MESSAGE_STRIDE + 3];
        const count = data.messages[message * MESSAGE_STRIDE + 4];

        for (let v = first; v < first + count; v++) {
            const firstSeg = data.variants[v * VARIANT_STRIDE + 1];
            const segCount = data.variants[v * VARIANT_STRIDE + 2];
            let fixed = true;

            for (let s = firstSeg; s < firstSeg + segCount; s++)
                if (data.segments[s * SEGMENT_STRIDE] !== SegmentKind.Static) fixed = false;
            const options = {
                size: spec.size,
                maxWidth: spec.maxWidth ?? 0,
                align: spec.align ?? 'start',
                lineHeight: spec.lineHeight ?? 1.35,
                values: {},
                styles: table,
            } as const;
            const layout = layoutMessage(bundle, v, options);

            if (layout.hits.length) fixed = false;
            if (!fixed) {
                report({
                    severity: 'warning',
                    code: 'layout-not-fixed',
                    message: `"${spec.key}" has slots, objects or tappable spans: it is laid out at runtime`,
                    key: spec.key,
                });
                break;
            }
            records.push(
                v,
                spec.size,
                options.maxWidth,
                LAYOUT_ALIGNS.indexOf(options.align),
                options.lineHeight,
                instances.length / INSTANCE_FLOATS,
                layout.count,
                layout.width,
                layout.height,
                lines.length / 3,
                layout.lines.length,
                0,
            );
            for (let i = 0; i < layout.count * INSTANCE_FLOATS; i++) {
                if (i % INSTANCE_FLOATS !== 4) {
                    instances.push(layout.instances[i]);
                    continue;
                }
                const key = table.stackOf(layout.instances[i]).join('\u0000');
                let id = stackIds.get(key);

                if (id === undefined) {
                    id = stackIds.size;
                    stackIds.set(key, id);
                    let ref = strings.indexOf(key);

                    if (ref < 0) ref = strings.push(key) - 1;
                    stackRefs.push(ref);
                }
                instances.push(id);
            }
            for (const l of layout.lines) lines.push(l.baseline, l.left, l.right);
        }
    }
    if (!records.length) return;
    data.strings = strings;
    data.layouts = new Float32Array(records);
    data.layoutInstances = new Float32Array(instances);
    data.layoutStacks = new Uint32Array(stackRefs);
    data.layoutLines = new Float32Array(lines);
}
