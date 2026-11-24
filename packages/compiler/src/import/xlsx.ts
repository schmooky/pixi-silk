import ExcelJS from 'exceljs';
import { PLURAL_CATEGORIES, type PluralCategory } from 'pixi-silk/i18n';
import { columnLetter, type Diagnostic, type SheetCell, type SheetRow } from '../author/lint';

/** What {@link readSheetRows} returns. */
export interface ImportResult {
    /** Rows with a key or with any text. */
    rows: SheetRow[];
    /** Problems with cells: formulas, numbers, dates, bad headers. */
    diagnostics: Diagnostic[];
}

const FIXED = ['key', 'context', 'slots', 'maxlen'];

/** A header such as `ar.few` or `ar-MA.other`, as locale and category, or null. */
export function parseHeader(header: string): { locale: string; category: PluralCategory } | null {
    const dot = header.lastIndexOf('.');

    if (dot <= 0) return null;
    const locale = header.slice(0, dot);
    const category = header.slice(dot + 1) as PluralCategory;

    if (!PLURAL_CATEGORIES.includes(category)) return null;
    if (!/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(locale)) return null;

    return { locale, category };
}

interface RawCell {
    text: string | null;
    problem?: { code: string; message: string; severity: 'error' | 'warning' };
}

/**
 * The raw value of a cell as text (brief sec. 4.1): never the formatted display string. Formula
 * cells are rejected. Numbers, dates and booleans are reported, because Excel has already changed
 * what the translator typed (`007` became 7, `1/2` became a date).
 */
export function rawCellText(cell: ExcelJS.Cell): RawCell {
    const v = cell.value;

    if (v === null || v === undefined) return { text: null };
    if (typeof v === 'string') return { text: v };
    if (typeof v === 'number') {
        return {
            text: String(v),
            problem: {
                code: 'number-cell',
                message: `cell holds the number ${v}, not text: Excel may have dropped leading zeros or changed it. Format the column as text and retype it`,
                severity: 'warning',
            },
        };
    }
    if (typeof v === 'boolean') {
        return {
            text: v ? 'TRUE' : 'FALSE',
            problem: { code: 'boolean-cell', message: 'cell holds a boolean, not text', severity: 'warning' },
        };
    }
    if (v instanceof Date) {
        return {
            text: null,
            problem: {
                code: 'date-cell',
                message:
                    'Excel turned this cell into a date (as it does with 1/2): format the column as text and retype it',
                severity: 'error',
            },
        };
    }
    if (typeof v === 'object') {
        if ('formula' in v || 'sharedFormula' in v) {
            return {
                text: null,
                problem: {
                    code: 'formula-cell',
                    message:
                        'cell is a formula: strings must be plain text (start it with a space or escape the first character)',
                    severity: 'error',
                },
            };
        }
        if ('richText' in v) return { text: v.richText.map((r) => r.text).join('') };
        if ('text' in v && typeof v.text === 'string') return { text: v.text };
        if ('error' in v) {
            return { text: null, problem: { code: 'error-cell', message: `cell holds ${v.error}`, severity: 'error' } };
        }
    }

    return { text: null, problem: { code: 'unknown-cell', message: 'cell type is not supported', severity: 'error' } };
}

/**
 * Reads every worksheet of an .xlsx file (brief sec. 3.2). Row 1 is the header: `key`, `context`,
 * `slots`, `maxLen`, then `<locale>.<category>` columns. Unknown headers are reported and skipped.
 */
export async function readSheetRows(data: ArrayBuffer | Uint8Array): Promise<ImportResult> {
    const book = new ExcelJS.Workbook();
    const rows: SheetRow[] = [];
    const diagnostics: Diagnostic[] = [];

    await book.xlsx.load(data instanceof Uint8Array ? data.slice().buffer : data);
    for (const sheet of book.worksheets) {
        const header = sheet.getRow(1);
        const columns = new Map<number, string>();

        header.eachCell((cell, col) => {
            const raw = rawCellText(cell).text?.trim() ?? '';

            if (raw) columns.set(col, raw);
        });
        const fixed = new Map<string, number>();
        const locales = new Map<number, { locale: string; category: PluralCategory }>();

        for (const [col, name] of columns) {
            if (FIXED.includes(name.toLowerCase())) fixed.set(name.toLowerCase(), col);
            else {
                const h = parseHeader(name);

                if (h) locales.set(col, h);
                else {
                    diagnostics.push({
                        severity: 'warning',
                        code: 'unknown-column',
                        message: `column "${name}" is not key, context, slots, maxLen or <locale>.<category>: skipped`,
                        sheet: sheet.name,
                        row: 1,
                        column: columnLetter(col),
                    });
                }
            }
        }
        if (!fixed.has('key')) {
            diagnostics.push({
                severity: 'error',
                code: 'no-key-column',
                message: 'sheet has no "key" column',
                sheet: sheet.name,
                row: 1,
            });
            continue;
        }
        const text = (row: ExcelJS.Row, col: number | undefined, at: number): string => {
            if (col === undefined) return '';
            const raw = rawCellText(row.getCell(col));

            // maxLen is meant to be a number
            if (raw.problem && !(col === fixed.get('maxlen') && raw.problem.code === 'number-cell')) {
                diagnostics.push({ ...raw.problem, sheet: sheet.name, row: at, column: columnLetter(col) });
            }
            return raw.text ?? '';
        };

        for (let r = 2; r <= sheet.rowCount; r++) {
            const row = sheet.getRow(r);
            const key = text(row, fixed.get('key'), r).trim();
            const cells: SheetCell[] = [];

            for (const [col, h] of locales) {
                const value = text(row, col, r);

                if (value) cells.push({ ...h, value, column: columnLetter(col) });
            }
            if (!key && cells.length === 0) continue;
            const maxLen = Number(text(row, fixed.get('maxlen'), r).trim() || 0);

            rows.push({
                sheet: sheet.name,
                row: r,
                key,
                context: text(row, fixed.get('context'), r),
                slots: text(row, fixed.get('slots'), r),
                maxLen: Number.isFinite(maxLen) ? maxLen : 0,
                cells,
            });
        }
    }

    return { rows, diagnostics };
}

/**
 * Reads a UTF-8 CSV with a byte order mark, the only CSV accepted (`--allow-csv`): Excel writes
 * other encodings for CSV and breaks non-Latin text. Same columns as the .xlsx sheet.
 */
export function readCsvRows(data: Uint8Array, name = 'csv'): ImportResult {
    const diagnostics: Diagnostic[] = [];

    if (data[0] !== 0xef || data[1] !== 0xbb || data[2] !== 0xbf) {
        return {
            rows: [],
            diagnostics: [
                {
                    severity: 'error',
                    code: 'csv-encoding',
                    message: 'CSV must be UTF-8 with a byte order mark: export as "CSV UTF-8" or use .xlsx',
                    sheet: name,
                },
            ],
        };
    }
    const records = parseCsv(new TextDecoder().decode(data.subarray(3)));
    const header = records[0] ?? [];
    const col = (n: string) => header.findIndex((h) => h.trim().toLowerCase() === n);
    const keyCol = col('key');
    const rows: SheetRow[] = [];

    if (keyCol < 0) {
        diagnostics.push({
            severity: 'error',
            code: 'no-key-column',
            message: 'CSV has no "key" column',
            sheet: name,
            row: 1,
        });
        return { rows, diagnostics };
    }
    const locales = header.map((h) => parseHeader(h.trim()));

    records.slice(1).forEach((rec, i) => {
        const cells: SheetCell[] = [];

        locales.forEach((h, c) => {
            if (h && rec[c]) cells.push({ ...h, value: rec[c], column: columnLetter(c + 1) });
        });
        const key = (rec[keyCol] ?? '').trim();

        if (!key && !cells.length) return;
        rows.push({
            sheet: name,
            row: i + 2,
            key,
            context: rec[col('context')] ?? '',
            slots: rec[col('slots')] ?? '',
            maxLen: Number(rec[col('maxlen')] ?? 0) || 0,
            cells,
        });
    });

    return { rows, diagnostics };
}

/** RFC 4180 CSV: quoted fields, doubled quotes, line breaks inside quotes. */
export function parseCsv(text: string): string[][] {
    const out: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (quoted) {
            if (ch === '"' && text[i + 1] === '"') {
                field += '"';
                i++;
            } else if (ch === '"') quoted = false;
            else field += ch;
        } else if (ch === '"') quoted = true;
        else if (ch === ',') {
            row.push(field);
            field = '';
        } else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            row.push(field);
            out.push(row);
            row = [];
            field = '';
        } else field += ch;
    }
    if (field || row.length) {
        row.push(field);
        out.push(row);
    }

    return out;
}
