import ExcelJS from 'exceljs';
import type { Diagnostic, SheetRow } from './author/lint';
import { pluralCategories } from './author/lint';
import type { SilkConfig } from './config';

/**
 * Writes a translator workbook (brief sec. 4.5, `silk export`): one sheet with key, context,
 * slots, maxLen, the source locale's columns (locked) and the target locale's columns. Every cell
 * is formatted as text, so Excel keeps `007` and `1/2` as typed, and the header row is frozen.
 */
export async function exportWorkbook(rows: SheetRow[], config: SilkConfig, target: string): Promise<Uint8Array> {
    const source = config.sourceLocale ?? 'en';
    const book = new ExcelJS.Workbook();

    book.created = new Date(Date.UTC(2026, 0, 1));
    book.modified = book.created;
    const sheet = book.addWorksheet('translate', { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }] });
    const sourceCats = new Set<string>();

    for (const r of rows) for (const c of r.cells) if (c.locale === source) sourceCats.add(c.category);
    const sourceCols = [...sourceCats].map((c) => `${source}.${c}`);
    const hasPlural = rows.some((r) => /:plural|plural\b/.test(r.slots));
    const targetCols = (hasPlural ? pluralCategories(target) : ['other']).map((c) => `${target}.${c}`);
    const header = ['key', 'context', 'slots', 'maxLen', ...sourceCols, ...targetCols];

    sheet.addRow(header);
    for (const r of rows) {
        const value = (h: string) => {
            const [locale, category] = [h.slice(0, h.lastIndexOf('.')), h.slice(h.lastIndexOf('.') + 1)];

            return r.cells.find((c) => c.locale === locale && c.category === category)?.value ?? '';
        };

        sheet.addRow([
            r.key,
            r.context,
            r.slots,
            r.maxLen ? String(r.maxLen) : '',
            ...sourceCols.map(value),
            ...targetCols.map(value),
        ]);
    }
    sheet.columns.forEach((col, i) => {
        col.numFmt = '@';
        col.width = i < 4 ? 18 : 40;
    });
    sheet.getRow(1).font = { bold: true };
    // lock everything but the target columns
    sheet.eachRow((row, n) => {
        row.eachCell({ includeEmpty: true }, (cell, c) => {
            cell.numFmt = '@';
            cell.protection = { locked: n === 1 || c <= 4 + sourceCols.length };
        });
    });
    await sheet.protect('', {
        formatColumns: true,
        formatRows: true,
        selectLockedCells: true,
        selectUnlockedCells: true,
    });

    return new Uint8Array(await book.xlsx.writeBuffer());
}

/**
 * Checks a returned translator workbook against the master rows (`silk import`): the key column
 * must hold the same keys in the same order, with none emptied, duplicated or edited.
 */
export function checkKeys(master: SheetRow[], returned: SheetRow[]): Diagnostic[] {
    const out: Diagnostic[] = [];
    const known = new Set(master.map((r) => r.key));
    const seen = new Set<string>();

    for (const r of returned) {
        const at = { sheet: r.sheet, row: r.row, column: 'A' };

        if (!r.key)
            out.push({ ...at, severity: 'error', code: 'key-emptied', message: 'the key of this row was deleted' });
        else if (seen.has(r.key))
            out.push({
                ...at,
                key: r.key,
                severity: 'error',
                code: 'key-duplicated',
                message: `key "${r.key}" appears twice`,
            });
        else if (!known.has(r.key))
            out.push({
                ...at,
                key: r.key,
                severity: 'error',
                code: 'key-edited',
                message: `key "${r.key}" is not in the master sheet: keys must not be edited`,
            });
        seen.add(r.key);
    }
    for (const r of master) {
        if (!seen.has(r.key))
            out.push({
                severity: 'error',
                code: 'key-missing',
                key: r.key,
                message: `key "${r.key}" is missing from the returned sheet`,
            });
    }

    return out;
}

/** Merges the target locale's cells of returned rows into the master rows. */
export function mergeTranslations(master: SheetRow[], returned: SheetRow[], target: string): SheetRow[] {
    const byKey = new Map(returned.map((r) => [r.key, r]));

    return master.map((r) => {
        const back = byKey.get(r.key);

        if (!back) return r;
        const kept = r.cells.filter((c) => c.locale !== target);

        return { ...r, cells: [...kept, ...back.cells.filter((c) => c.locale === target)] };
    });
}

/** Writes rows back to a strings workbook with text-formatted cells (the master sheet after an import). */
export async function writeWorkbook(rows: SheetRow[]): Promise<Uint8Array> {
    const book = new ExcelJS.Workbook();

    book.created = new Date(Date.UTC(2026, 0, 1));
    book.modified = book.created;
    for (const sheetName of [...new Set(rows.map((r) => r.sheet))]) {
        const sheetRows = rows.filter((r) => r.sheet === sheetName);
        const columns = [...new Set(sheetRows.flatMap((r) => r.cells.map((c) => `${c.locale}.${c.category}`)))];
        const sheet = book.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] });

        sheet.addRow(['key', 'context', 'slots', 'maxLen', ...columns]);
        for (const r of sheetRows) {
            sheet.addRow([
                r.key,
                r.context,
                r.slots,
                r.maxLen ? String(r.maxLen) : '',
                ...columns.map((h) => r.cells.find((c) => `${c.locale}.${c.category}` === h)?.value ?? ''),
            ]);
        }
        sheet.eachRow((row) => row.eachCell({ includeEmpty: true }, (cell) => (cell.numFmt = '@')));
    }

    return new Uint8Array(await book.xlsx.writeBuffer());
}
