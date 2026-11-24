import type { PluralCategory } from 'pixi-silk/i18n';
import { formatSlot, parseSlots, type SilkConfig, type SlotDecl } from '../config';
import { resolveLocale } from '../locales';
import { DEFAULT_LIMITS, type ParsedMessage, parseMessage, plainText } from './parse';

/** A compiler problem. Errors stop `silk compile`. Warnings do not. */
export interface Diagnostic {
    /** `error` or `warning`. */
    severity: 'error' | 'warning';
    /** Stable code, such as `missing-plural`. */
    code: string;
    /** What is wrong, in one sentence. */
    message: string;
    /** Sheet (worksheet) name. */
    sheet?: string;
    /** 1-based row. */
    row?: number;
    /** Column letter, such as `F`. */
    column?: string;
    /** Locale of the cell. */
    locale?: string;
    /** Message key. */
    key?: string;
}

/** One translation cell. */
export interface SheetCell {
    /** Locale, from the column header `<locale>.<category>`. */
    locale: string;
    /** Plural category, `other` for messages without plurals. */
    category: PluralCategory;
    /** Raw text of the cell. */
    value: string;
    /** Column letter. */
    column: string;
}

/** One row of the strings sheet. */
export interface SheetRow {
    /** Worksheet name. */
    sheet: string;
    /** 1-based row. */
    row: number;
    /** Message key. */
    key: string;
    /** Note for translators. */
    context: string;
    /** The `slots` cell. */
    slots: string;
    /** Longest the message should be in characters, 0 for no limit. */
    maxLen: number;
    /** Translation cells. */
    cells: SheetCell[];
}

/** A message ready for shaping: every locale's variants, parsed and normalized. */
export interface CatalogMessage {
    /** Message key. */
    key: string;
    /** Note for translators. */
    context: string;
    /** Slot declarations (sheet and config merged). */
    slots: SlotDecl[];
    /** Longest length in characters, 0 for no limit. */
    maxLen: number;
    /** Where the message came from. */
    origin: { sheet: string; row: number };
    /** Variants by locale, then plural category. */
    locales: Record<string, Partial<Record<PluralCategory, ParsedMessage>>>;
}

/** The result of {@link lintRows}. */
export interface Catalog {
    /** Messages by key, in sheet order. */
    messages: Map<string, CatalogMessage>;
    /** Every problem found. */
    diagnostics: Diagnostic[];
}

/** Characters stripped from cells, with what to write instead. */
const INVISIBLE: Record<string, string> = {
    '\u200b': 'zero-width space',
    '\u200e': 'left-to-right mark',
    '\u200f': 'right-to-left mark',
    '\u061c': 'Arabic letter mark',
    '\u202a': 'LRE',
    '\u202b': 'RLE',
    '\u202c': 'PDF',
    '\u202d': 'LRO',
    '\u202e': 'RLO',
    '\u2066': 'LRI',
    '\u2067': 'RLI',
    '\u2068': 'FSI',
    '\u2069': 'PDI',
    '\u00ad': 'soft hyphen',
    '\ufeff': 'byte order mark',
    '\u200d': 'zero-width joiner (write <zwj/>)',
};

/** Result of {@link normalizeCell}. */
export interface Normalized {
    /** The cleaned text. */
    text: string;
    /** What was changed, one entry per kind. */
    changes: { code: string; message: string; severity: 'error' | 'warning' }[];
}

/**
 * Cleans one cell (brief sec. 4.2): NFC, CRLF and CR to LF, trimmed ends, invisible characters
 * stripped, a no-break space replaced by a space (write `<nbsp/>` for an intended one).
 */
export function normalizeCell(raw: string): Normalized {
    const changes: Normalized['changes'] = [];
    let text = raw.normalize('NFC');

    if (text !== raw) changes.push({ code: 'nfc', message: 'text was not in NFC: normalized', severity: 'warning' });
    if (/\r/.test(text)) text = text.replace(/\r\n?/g, '\n');
    const trimmed = text.replace(/^[ \t\n]+|[ \t\n]+$/g, '');

    if (trimmed !== text) {
        changes.push({
            code: 'trimmed',
            message: 'space at the start or end of the cell was removed',
            severity: 'warning',
        });
        text = trimmed;
    }
    const found = new Set<string>();
    let out = '';

    let prev = '';

    for (const ch of text) {
        // a joiner inside an emoji sequence is part of the emoji
        const emojiJoiner = ch === '\u200d' && /\p{Extended_Pictographic}|\ufe0f/u.test(prev);

        prev = ch;
        if (INVISIBLE[ch] !== undefined && !emojiJoiner) {
            found.add(INVISIBLE[ch]);
            continue;
        }
        if (ch === '\u00a0' || ch === '\u202f') {
            found.add('no-break space (write <nbsp/> if it is intended)');
            out += ' ';
            continue;
        }
        out += ch;
    }
    if (found.size) {
        changes.push({
            code: 'invisible',
            message: `removed invisible characters: ${[...found].join(', ')}`,
            severity: 'warning',
        });
    }

    return { text: out, changes };
}

/** Column letter of a 1-based column index. */
export function columnLetter(n: number): string {
    let s = '';

    for (let c = n; c > 0; c = Math.floor((c - 1) / 26)) s = String.fromCharCode(65 + ((c - 1) % 26)) + s;

    return s;
}

/** Plural categories a locale uses, from `Intl.PluralRules`. */
export function pluralCategories(locale: string): PluralCategory[] {
    return new Intl.PluralRules(locale).resolvedOptions().pluralCategories as PluralCategory[];
}

function multiset(items: string[]): string {
    return [...items].sort().join('\u0000');
}

/**
 * Parses, normalizes and checks every row against the config (brief sec. 4.2): balanced tags,
 * allowlisted tags and objects, placeholders and tags matching the source locale, complete plural
 * categories, slot declarations, `maxLen`, duplicate or empty keys.
 * `styleNames` are the theme's style names, which are allowed tags too.
 */
export function lintRows(rows: SheetRow[], config: SilkConfig, styleNames: Iterable<string> = []): Catalog {
    const diagnostics: Diagnostic[] = [];
    const messages = new Map<string, CatalogMessage>();
    const limits = { ...DEFAULT_LIMITS, ...config.limits };
    const tags = new Set([...(config.tags ?? []), ...styleNames]);
    const objects = new Set(config.objects ?? []);
    const source = config.sourceLocale ?? 'en';
    const locales = Object.keys(config.locales);
    const configSlots = new Map<string, SlotDecl>();

    for (const [name, decl] of Object.entries(config.slots ?? {})) {
        const { slots, errors } = parseSlots(`${name}:${decl}`);

        for (const e of errors) diagnostics.push({ severity: 'error', code: 'bad-slot', message: `config: ${e}` });
        if (slots[0]) configSlots.set(name, slots[0]);
    }

    for (const row of rows) {
        const at = { sheet: row.sheet, row: row.row };

        if (!row.key) {
            diagnostics.push({ ...at, column: 'A', severity: 'error', code: 'empty-key', message: 'row has no key' });
            continue;
        }
        if (messages.has(row.key)) {
            const first = messages.get(row.key)?.origin;

            diagnostics.push({
                ...at,
                column: 'A',
                key: row.key,
                severity: 'error',
                code: 'duplicate-key',
                message: `key "${row.key}" is also on ${first?.sheet} row ${first?.row}`,
            });
            continue;
        }
        const { slots: sheetSlots, errors } = parseSlots(row.slots);

        for (const e of errors) {
            diagnostics.push({ ...at, key: row.key, severity: 'error', code: 'bad-slot', message: e });
        }
        const slots = new Map(sheetSlots.map((s) => [s.name, s]));

        for (const [name, decl] of configSlots) {
            const own = slots.get(name);

            if (own && formatSlot(own) !== formatSlot(decl)) {
                diagnostics.push({
                    ...at,
                    key: row.key,
                    severity: 'error',
                    code: 'slot-conflict',
                    message: `slot "${name}" is "${formatSlot(own)}" here and "${formatSlot(decl)}" in the config`,
                });
            }
        }
        const message: CatalogMessage = {
            key: row.key,
            context: row.context,
            slots: [...slots.values()],
            maxLen: row.maxLen,
            origin: at,
            locales: {},
        };
        const selector = message.slots.find((s) => s.plural);

        messages.set(row.key, message);
        for (const cell of row.cells) {
            if (!cell.value) continue;
            const where = { ...at, column: cell.column, locale: cell.locale, key: row.key };
            const { text, changes } = normalizeCell(cell.value);

            for (const c of changes) diagnostics.push({ ...where, ...c });
            const parsed = parseMessage(text, limits);

            for (const issue of parsed.issues) {
                diagnostics.push({
                    ...where,
                    severity: issue.code === 'formula-prefix' ? 'warning' : 'error',
                    code: issue.code,
                    message: `${issue.message} (character ${issue.offset + 1})`,
                });
            }
            for (const span of parsed.spans) {
                if (!tags.has(span.tag)) {
                    diagnostics.push({
                        ...where,
                        severity: 'error',
                        code: 'unknown-tag',
                        message: `<${span.tag}> is not a known tag: add it to the theme or to config.tags`,
                    });
                }
            }
            for (const hole of parsed.holes) {
                if (hole.kind === 'object' && !objects.has(hole.name)) {
                    diagnostics.push({
                        ...where,
                        severity: 'error',
                        code: 'unknown-object',
                        message: `<${hole.name}/> is not a known inline object: add it to config.objects`,
                    });
                }
                if (hole.kind === 'slot' && !slots.has(hole.name)) {
                    const fromConfig = configSlots.get(hole.name);

                    if (fromConfig) {
                        slots.set(hole.name, fromConfig);
                        message.slots.push(fromConfig);
                    } else {
                        diagnostics.push({
                            ...where,
                            severity: 'error',
                            code: 'undeclared-slot',
                            message: `{${hole.name}} is not declared in the slots column or the config`,
                        });
                    }
                }
            }
            if (row.maxLen > 0) {
                // what a reader counts as characters: a letter with its marks, an emoji, is one
                const length = [
                    ...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(plainText(parsed)),
                ].length;

                if (length > row.maxLen) {
                    diagnostics.push({
                        ...where,
                        severity: 'warning',
                        code: 'max-len',
                        message: `${length} characters, maxLen is ${row.maxLen}`,
                    });
                }
            }
            message.locales[cell.locale] ??= {};
            message.locales[cell.locale][cell.category] = parsed;
        }

        // plural categories per locale
        for (const locale of locales) {
            const variants = message.locales[locale];

            if (!variants) {
                diagnostics.push({
                    ...at,
                    key: row.key,
                    locale,
                    severity: locale === source ? 'error' : 'warning',
                    code: 'missing-translation',
                    message: `no ${locale} text`,
                });
                continue;
            }
            const used = Object.keys(variants) as PluralCategory[];

            if (!selector) {
                for (const c of used) {
                    if (c !== 'other') {
                        diagnostics.push({
                            ...at,
                            key: row.key,
                            locale,
                            severity: 'error',
                            code: 'plural-without-selector',
                            message: `${locale}.${c} is filled but no slot is marked :plural`,
                        });
                    }
                }
                continue;
            }
            const required = pluralCategories(resolveLocale(locale, config.locales[locale]).bcp47);

            for (const c of required) {
                if (!variants[c]) {
                    diagnostics.push({
                        ...at,
                        key: row.key,
                        locale,
                        severity: 'error',
                        code: 'missing-plural',
                        message: `${locale} needs the "${c}" plural form`,
                    });
                }
            }
            for (const c of used) {
                if (!required.includes(c)) {
                    diagnostics.push({
                        ...at,
                        key: row.key,
                        locale,
                        severity: 'warning',
                        code: 'extra-plural',
                        message: `${locale} has no "${c}" plural form: the column is ignored`,
                    });
                }
            }
        }

        // placeholders and tags against the source locale
        const sourceVariant = message.locales[source]?.other ?? Object.values(message.locales[source] ?? {})[0];

        if (!sourceVariant) continue;
        const sourceHoles = multiset(sourceVariant.holes.map((h) => `${h.kind}:${h.name}`));
        const sourceTags = multiset(sourceVariant.spans.map((s) => s.tag));

        for (const [locale, variants] of Object.entries(message.locales)) {
            for (const [category, variant] of Object.entries(variants)) {
                if (!variant || variant === sourceVariant) continue;
                const cell = row.cells.find((c) => c.locale === locale && c.category === category);
                const where = { ...at, column: cell?.column, locale, key: row.key };

                if (multiset(variant.holes.map((h) => `${h.kind}:${h.name}`)) !== sourceHoles) {
                    diagnostics.push({
                        ...where,
                        severity: 'error',
                        code: 'placeholder-mismatch',
                        message: `placeholders and objects differ from ${source}: ${describeHoles(variant)} vs ${describeHoles(sourceVariant)}`,
                    });
                }
                if (multiset(variant.spans.map((s) => s.tag)) !== sourceTags) {
                    diagnostics.push({
                        ...where,
                        severity: 'error',
                        code: 'tag-mismatch',
                        message: `tags differ from ${source}: ${describeTags(variant)} vs ${describeTags(sourceVariant)}`,
                    });
                }
            }
        }
    }

    return { messages, diagnostics };
}

function describeHoles(m: ParsedMessage): string {
    return m.holes.map((h) => (h.kind === 'slot' ? `{${h.name}}` : `<${h.name}/>`)).join(' ') || 'none';
}

function describeTags(m: ParsedMessage): string {
    return m.spans.map((s) => `<${s.tag}>`).join(' ') || 'none';
}

/** One line per diagnostic, `sheet!F12 [ar] key: message`, for terminals and CI logs. */
export function formatDiagnostic(d: Diagnostic): string {
    const cell = d.sheet ? `${d.sheet}!${d.column ?? ''}${d.row ?? ''}` : 'config';
    const locale = d.locale ? ` [${d.locale}]` : '';
    const key = d.key ? ` ${d.key}` : '';

    return `${d.severity}: ${cell}${locale}${key}: ${d.message} (${d.code})`;
}
