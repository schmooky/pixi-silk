import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { checkKeys, exportWorkbook, mergeTranslations, writeWorkbook } from '../src/exchange';
import { readSheetRows } from '../src/import/xlsx';
import { config, fixtures } from './helpers';

describe('silk export and silk import (M7)', () => {
    it('round-trips a translator workbook: text cells, locked source, frozen header', async () => {
        const { rows } = await readSheetRows(readFileSync(`${fixtures}strings.xlsx`));
        const bytes = await exportWorkbook(rows, config, 'ar');
        const book = new ExcelJS.Workbook();

        await book.xlsx.load(bytes.slice().buffer as ArrayBuffer);
        const sheet = book.worksheets[0];
        const header = (sheet.getRow(1).values as string[]).filter(Boolean);

        expect(header).toEqual([
            'key',
            'context',
            'slots',
            'maxLen',
            'en.one',
            'en.other',
            'ar.zero',
            'ar.one',
            'ar.two',
            'ar.few',
            'ar.many',
            'ar.other',
        ]);
        expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
        // Excel locks cells unless told otherwise, so a locked cell may carry no flag at all
        expect(sheet.getCell('B2').protection?.locked ?? true).toBe(true);
        expect((sheet as unknown as { sheetProtection?: { sheet?: boolean } }).sheetProtection?.sheet).toBe(true);
        expect(sheet.getCell('L2').protection?.locked).toBe(false);
        expect(sheet.getCell('L2').numFmt).toBe('@');
        // a translator edits one cell
        sheet.getCell('L2').value = '<title>متجر جديد</title>';
        const back = await readSheetRows(new Uint8Array(await book.xlsx.writeBuffer()));

        expect(checkKeys(rows, back.rows)).toEqual([]);
        const merged = mergeTranslations(rows, back.rows, 'ar');
        const title = merged.find((r) => r.key === 'shop.title')?.cells.find((c) => c.locale === 'ar');

        expect(title?.value).toBe('<title>متجر جديد</title>');
        // the master sheet written back reads the same, edits included
        const again = await readSheetRows(await writeWorkbook(merged));

        expect(again.rows.map((r) => r.key)).toEqual(rows.map((r) => r.key));
        expect(again.rows.find((r) => r.key === 'shop.coins')?.cells.length).toBe(
            rows.find((r) => r.key === 'shop.coins')?.cells.length,
        );
    });

    it('rejects edited, duplicated, emptied and missing keys', async () => {
        const { rows } = await readSheetRows(readFileSync(`${fixtures}strings.xlsx`));
        const edited = rows.map((r, i) =>
            i === 0
                ? { ...r, key: 'shop.titel' }
                : i === 1
                  ? { ...r, key: '' }
                  : i === 2
                    ? { ...r, key: rows[3].key }
                    : r,
        );
        const codes = checkKeys(rows, edited).map((d) => d.code);

        expect(codes).toEqual(expect.arrayContaining(['key-edited', 'key-emptied', 'key-duplicated', 'key-missing']));
    });
});
