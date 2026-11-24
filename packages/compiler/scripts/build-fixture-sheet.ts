/**
 * Writes fixtures/strings.xlsx (the shop sample, brief sec. 12) and fixtures/pitfalls.xlsx (the
 * Excel pitfalls of sec. 9.2 item 16). The sheets are built here, so reviewers read code, not binaries.
 *
 *   node scripts/build-fixture-sheet.ts
 */
import { writeFileSync } from 'node:fs';
import ExcelJS from 'exceljs';

const book = new ExcelJS.Workbook();

book.creator = 'pixi-silk';
book.created = new Date(Date.UTC(2026, 0, 1));
book.modified = book.created;
const shop = book.addWorksheet('shop');
const header = [
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
    'he.one',
    'he.two',
    'he.other',
];

shop.addRow(header);
const row = (cells: Record<string, string | number>) => shop.addRow(header.map((h) => cells[h] ?? null));

row({
    key: 'shop.title',
    context: 'Title of the shop screen',
    maxLen: 24,
    'en.other': '<title>Treasure Shop</title>',
    'ar.other': '<title>متجر الكنوز</title>',
    'he.other': '<title>חנות האוצרות</title>',
});
row({
    key: 'player.greeting',
    context: 'Greeting under the title. {name} is the player name',
    slots: 'name:text(maxChars=16)',
    'en.other': 'Hello {name}, welcome back!',
    'ar.other': 'مرحبًا {name}، أهلًا بعودتك!',
    'he.other': 'שלום {name}, ברוך שובך!',
});
row({
    key: 'shop.coins',
    context: 'Coin balance. {count} is a number',
    slots: 'count:number(maxDigits=7,tabular):plural',
    'en.one': 'You have <gold>{count}</gold> coin <coin/>',
    'en.other': 'You have <gold>{count}</gold> coins <coin/>',
    'ar.zero': 'ليس لديك أي <gold>{count}</gold> عملة <coin/>',
    'ar.one': 'لديك عملة <gold>{count}</gold> واحدة <coin/>',
    'ar.two': 'لديك <gold>{count}</gold> عملتان <coin/>',
    'ar.few': 'لديك <gold>{count}</gold> عملات <coin/>',
    'ar.many': 'لديك <gold>{count}</gold> عملة <coin/>',
    'ar.other': 'لديك <gold>{count}</gold> عملة <coin/>',
    'he.one': 'יש לך מטבע <gold>{count}</gold> אחד <coin/>',
    'he.two': 'יש לך <gold>{count}</gold> מטבעות <coin/>',
    'he.other': 'יש לך <gold>{count}</gold> מטבעות <coin/>',
});
row({
    key: 'shop.terms',
    context: 'Footer link to the terms of sale',
    'en.other': 'Read the <terms>terms of sale</terms>.',
    'ar.other': 'اقرأ <terms>شروط البيع</terms>.',
    'he.other': 'קראו את <terms>תנאי המכירה</terms>.',
});

// Excel pitfalls, brief sec. 9.2 item 16
const pitBook = new ExcelJS.Workbook();

pitBook.created = book.created;
pitBook.modified = book.created;
const pit = pitBook.addWorksheet('pitfalls');

pit.addRow(['key', 'context', 'en.other']);
pit.addRow(['pit.formula', 'a formula cell', null]).getCell(3).value = { formula: '1+1', result: 2 };
const zeros = pit.addRow(['pit.zeros', 'typed 007 into a number cell', 7]).getCell(3);

zeros.numFmt = '000';
pit.addRow(['pit.half', 'typed 1/2, Excel made it a date', new Date(Date.UTC(2026, 0, 2))]);
const quoted = pit.addRow(['pit.apostrophe', 'typed with a leading apostrophe', '=not a formula']).getCell(3);

quoted.style = { ...quoted.style, quotePrefix: true } as ExcelJS.Style;
pit.addRow(['pit.altenter', 'Alt+Enter line break', 'first line\r\nsecond line']);
pit.addRow(['pit.quotes', 'smart quotes and ellipsis are fine', '\u201cQuoted\u201d \u2026 it\u2019s fine']);
pit.addRow(['pit.nbsp', 'pasted no-break space', 'ten\u00a0coins']);
pit.addRow(['pit.rlm', 'pasted right-to-left mark', 'hello\u200f world']);

for (const [name, b] of [
    ['strings.xlsx', book],
    ['pitfalls.xlsx', pitBook],
] as const) {
    const out = new URL(`../fixtures/${name}`, import.meta.url);

    writeFileSync(out, new Uint8Array(await b.xlsx.writeBuffer()));
    console.log(`wrote ${out.pathname}`);
}
