/**
 * The shaping corpus (brief sec. 11, M2): one entry per case, shaped by the compiler and compared
 * with plain HarfBuzz shaping of each directional run (tests/goldens/shaping.json).
 */
export const CORPUS: {
    name: string;
    locale: string;
    text: string;
    runs: { text: string; dir: 'ltr' | 'rtl'; font: string; features?: string[] }[];
}[] = [
    {
        name: 'latin',
        locale: 'en',
        text: 'Hello, world! Office fit',
        runs: [{ text: 'Hello, world! Office fit', dir: 'ltr', font: 'NotoSans-Regular.ttf' }],
    },
    {
        name: 'arabic',
        locale: 'ar',
        text: 'مرحبا بالعالم',
        runs: [{ text: 'مرحبا بالعالم', dir: 'rtl', font: 'NotoSansArabic-Regular.ttf' }],
    },
    {
        name: 'arabic with diacritics',
        locale: 'ar',
        text: 'مَرْحَبًا بِكُمْ',
        runs: [{ text: 'مَرْحَبًا بِكُمْ', dir: 'rtl', font: 'NotoSansArabic-Regular.ttf' }],
    },
    {
        name: 'hebrew',
        locale: 'he',
        text: 'שלום עולם',
        runs: [{ text: 'שלום עולם', dir: 'rtl', font: 'NotoSansHebrew-Regular.ttf' }],
    },
    {
        name: 'mixed direction',
        locale: 'ar',
        text: 'اشترِ Gold Pack الآن',
        runs: [
            { text: 'اشترِ ', dir: 'rtl', font: 'NotoSansArabic-Regular.ttf' },
            { text: 'Gold Pack', dir: 'ltr', font: 'NotoSans-Regular.ttf' },
            { text: ' الآن', dir: 'rtl', font: 'NotoSansArabic-Regular.ttf' },
        ],
    },
];
