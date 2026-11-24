/**
 * Writes fixtures/world: one message per script the app locales use, a config, and subset fonts.
 * The full Noto fonts are downloaded into .cache/fonts first (see DECISIONS.md D20). Only subsets
 * with the characters these strings and the digit tables need are committed, a few KB each.
 *
 *   pnpm --filter @pixi-silk/compiler build && node scripts/build-world-fixture.ts
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
// the built compiler: run `pnpm --filter @pixi-silk/compiler build` first
import { digitsOf, resolveLocale, subsetFont } from '../dist/index.mjs';

/** "Welcome to the shop" in one locale per script, app codes. */
export const WELCOME: Record<string, string> = {
    en: 'Welcome to the shop',
    ru: 'Добро пожаловать в магазин',
    el: 'Καλώς ήρθατε στο κατάστημα',
    ka: 'კეთილი იყოს თქვენი მობრძანება',
    hy: 'Բարի գալուստ խանութ',
    iq: 'مرحبًا بك في المتجر',
    fa: 'به فروشگاه خوش آمدید',
    ur: 'دکان میں خوش آمدید',
    ku: 'بەخێربێیت',
    he: 'ברוכים הבאים לחנות',
    hi: 'दुकान में आपका स्वागत है',
    sd: 'पसलमा स्वागत छ',
    bn: 'দোকানে স্বাগতম',
    ta: 'கடைக்கு வரவேற்கிறோம்',
    si: 'වෙළඳසැලට සාදරයෙන් පිළිගනිමු',
    th: 'ยินดีต้อนรับสู่ร้านค้า',
    lo: 'ຍິນດີຕ້ອນຮັບສູ່ຮ້ານ',
    km: 'សូមស្វាគមន៍មកកាន់ហាង',
    my: 'ဆိုင်သို့ကြိုဆိုပါသည်',
    aa: 'እንኃን ወደ ሱቁ በደህና መጡ',
    zh: '欢迎光临商店',
    tw: '歡迎光臨商店',
    hk: '歡迎光臨商店',
    ja: 'ショップへようこそ',
    ko: '상점에 오신 것을 환영합니다',
    vi: 'Chào mừng đến cửa hàng',
    gu: 'દુકાનમાં આપનું સ્વાગત છે',
    kn: 'ಅಂಗಡಿಗೆ ಸ್ವಾಗತ',
    ml: 'കടയിലേക്ക് സ്വാഗതം',
    or: 'ଦୋକାନକୁ ସ୍ଵାଗତ',
    te: 'దుకాణానికి స్వాగతం',
};

/** Families of the cached fonts, by file, for the config. */
const CACHED: Record<string, string> = {
    'NotoSansGeorgian-Regular.ttf': 'Noto Sans Georgian',
    'NotoSansArmenian-Regular.ttf': 'Noto Sans Armenian',
    'NotoSansDevanagari-Regular.ttf': 'Noto Sans Devanagari',
    'NotoSansBengali-Regular.ttf': 'Noto Sans Bengali',
    'NotoSansTamil-Regular.ttf': 'Noto Sans Tamil',
    'NotoSansSinhala-Regular.ttf': 'Noto Sans Sinhala',
    'NotoSansThai-Regular.ttf': 'Noto Sans Thai',
    'NotoSansLao-Regular.ttf': 'Noto Sans Lao',
    'NotoSansKhmer-Regular.ttf': 'Noto Sans Khmer',
    'NotoSansMyanmar-Regular.ttf': 'Noto Sans Myanmar',
    'NotoSansEthiopic-Regular.ttf': 'Noto Sans Ethiopic',
    'NotoNastaliqUrdu-Regular.ttf': 'Noto Nastaliq Urdu',
    'NotoSansGujarati-Regular.ttf': 'Noto Sans Gujarati',
    'NotoSansKannada-Regular.ttf': 'Noto Sans Kannada',
    'NotoSansMalayalam-Regular.ttf': 'Noto Sans Malayalam',
    'NotoSansOriya-Regular.ttf': 'Noto Sans Oriya',
    'NotoSansTelugu-Regular.ttf': 'Noto Sans Telugu',
    'NotoSansSC-Regular.otf': 'Noto Sans SC',
    'NotoSansTC-Regular.otf': 'Noto Sans TC',
    'NotoSansHK-Regular.otf': 'Noto Sans HK',
    'NotoSansJP-Regular.otf': 'Noto Sans JP',
    'NotoSansKR-Regular.otf': 'Noto Sans KR',
};

const here = new URL('../', import.meta.url);
const cache = new URL('.cache/fonts/', here);
const out = new URL('fixtures/world/', here);
const fontsOut = new URL('fixtures/fonts/world/', here);

mkdirSync(out, { recursive: true });
mkdirSync(fontsOut, { recursive: true });
// every character a font may be asked for: the strings, each locale's digits, number punctuation
const chars = new Set<number>();

for (const text of Object.values(WELCOME)) for (const ch of text) chars.add(ch.codePointAt(0) ?? 0);
for (const code of Object.keys(WELCOME)) for (const cp of digitsOf(resolveLocale(code).numberingSystem)) chars.add(cp);
for (const ch of '0123456789,.-%+ \u00a0\u202f\u2019\u2212٪٫٬') chars.add(ch.codePointAt(0) ?? 0);
const fonts = [
    { family: 'Noto Sans', weight: 400, file: '../fonts/NotoSans-Regular.ttf' },
    { family: 'Noto Sans', weight: 700, file: '../fonts/NotoSans-Bold.ttf' },
    { family: 'Noto Sans Arabic', weight: 400, file: '../fonts/NotoSansArabic-Regular.ttf' },
    { family: 'Noto Sans Hebrew', weight: 400, file: '../fonts/NotoSansHebrew-Regular.ttf' },
];

for (const [file, family] of Object.entries(CACHED)) {
    const source = new URL(file, cache);

    if (!existsSync(source)) {
        console.warn(`skipped ${file}: not in .cache/fonts`);
        continue;
    }
    const subset = subsetFont(new Uint8Array(readFileSync(source)), chars);
    const name = file.replace(/\.(ttf|otf)$/, '.subset.$1');

    writeFileSync(new URL(name, fontsOut), subset);
    fonts.push({ family, weight: 400, file: `../fonts/world/${name}` });
    console.log(`${name}: ${(subset.length / 1024).toFixed(1)} kB`);
}
for (const license of ['OFL-noto.txt', 'CJK-LICENSE.txt']) {
    if (existsSync(new URL(license, cache))) copyFileSync(new URL(license, cache), new URL(license, fontsOut));
}
const config = {
    sourceLocale: 'en',
    locales: Object.fromEntries(Object.keys(WELCOME).map((code) => [code, {}])),
    fonts,
    atlas: { kind: 'msdf', emSize: 40, maxPageSize: 1024 },
    devKeys: true,
};

writeFileSync(new URL('silk.config.json', out), `${JSON.stringify(config, null, 2)}\n`);
const book = new ExcelJS.Workbook();

book.created = new Date(Date.UTC(2026, 0, 1));
book.modified = book.created;
const sheet = book.addWorksheet('world');
const codes = Object.keys(WELCOME);

sheet.addRow(['key', 'context', 'slots', 'maxLen', ...codes.map((c) => `${c}.other`)]);
sheet.addRow(['world.welcome', 'Shop greeting', '', '', ...codes.map((c) => WELCOME[c])]);
sheet.addRow([
    'world.balance',
    'A number alone, in the locale digits',
    'count:number(maxDigits=7,tabular)',
    '',
    ...codes.map(() => '{count}'),
]);
writeFileSync(new URL('strings.xlsx', out), new Uint8Array(await book.xlsx.writeBuffer()));
console.log(`wrote fixtures/world: ${codes.length} locales, ${fonts.length} fonts`);
