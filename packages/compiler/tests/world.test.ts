import { RunFlag, readBundle, SilkBundle } from 'pixi-silk/i18n';
import { beforeAll, describe, expect, it } from 'vitest';
import { type CompileResult, compileProject } from '../src/compile';
import { APP_LOCALES, resolveLocale } from '../src/locales';
import { loadProject } from '../src/project';
import { fixtures } from './helpers';

/** The app's own list of locale codes. Every one must resolve. */
const APP_CODES = [
    'ru',
    'en',
    'ka',
    'uk',
    'ua',
    'by',
    'el',
    'tr',
    'de',
    'pt',
    'br',
    'es',
    'fr',
    'pl',
    'ro',
    'it',
    'fa',
    'ir',
    'sk',
    'kz',
    'hi',
    'zh',
    'cn',
    'tw',
    'hk',
    'bg',
    'sv',
    'lv',
    'ja',
    'az',
    'ky',
    'cs',
    'iq',
    'id',
    'th',
    'sq',
    'al',
    'uz',
    'km',
    'bn',
    'ca',
    'nz',
    'in',
    'au',
    'gb',
    'us',
    'sw',
    'hy',
    'si',
    'lk',
    'sd',
    'aa',
    'tl',
    'ht',
    'sl',
    'ur',
    'my',
    'is',
    'ln',
    'mx',
    'pe',
    'er',
    'lo',
    'so',
    'mn',
    'ta',
    'hu',
    'nl',
    'ar',
    'sr',
    'da',
    'et',
    'fi',
    'he',
    'hr',
    'lt',
    'mk',
    'ms',
    'nb',
    'vi',
    'tg',
    'tj',
    'me',
    'sp',
    'am',
    'ne',
    'ku',
    'zu',
    'bs',
    'ko',
    'kr',
    'ak',
    'wo',
    'xh',
    'ha',
    'rw',
    'ps',
];

describe('app locale codes', () => {
    it('covers every code of the app, once, sorted by English name', () => {
        const codes = APP_LOCALES.map((l) => l.code);

        for (const c of APP_CODES) expect(codes, c).toContain(c);
        expect(new Set(codes).size).toBe(codes.length);
        const byName = (a: { name: string; code: string }, b: { name: string; code: string }) =>
            a.name.localeCompare(b.name, 'en') || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0);

        expect(APP_LOCALES).toEqual([...APP_LOCALES].sort(byName));
    });

    it('maps colliding codes to the language the app means', () => {
        expect(resolveLocale('ca').bcp47).toBe('en-CA');
        expect(resolveLocale('sd').bcp47).toBe('ne-NP');
        expect(resolveLocale('aa').bcp47).toBe('am-ET');
        expect(resolveLocale('am')).toMatchObject({ bcp47: 'ku-Arab-IQ', dir: 1, script: 'Arab' });
        expect(resolveLocale('ne')).toMatchObject({ bcp47: 'ku-Latn', dir: 0 });
        expect(resolveLocale('zu').bcp47).toBe('zza');
        expect(resolveLocale('in').bcp47).toBe('en-IN');
    });

    it('resolves direction, script, numbering and plurals for every locale', () => {
        for (const l of APP_LOCALES) {
            const r = resolveLocale(l.code);

            expect(() => new Intl.PluralRules(r.bcp47), l.code).not.toThrow();
            expect(r.numberingSystem, l.code).toMatch(/^[a-z]+$/);
        }
        const rtl = APP_LOCALES.filter((l) => resolveLocale(l.code).dir === 1).map((l) => l.code);

        expect(rtl.sort()).toEqual([
            'am',
            'ar',
            'ar-EG',
            'ar-MA',
            'ar-SA',
            'fa',
            'he',
            'iq',
            'ir',
            'ku',
            'prs',
            'ps',
            'sd-PK',
            'ur',
        ]);
        expect(resolveLocale('fa').numberingSystem).toBe('arabext');
        expect(resolveLocale('bn').numberingSystem).toBe('beng');
        expect(resolveLocale('my').numberingSystem).toBe('mymr');
        expect(resolveLocale('ar-MA').numberingSystem).toBe('latn');
    });
});

describe('every script of the app locales (fixtures/world)', () => {
    let result: CompileResult;

    beforeAll(async () => {
        const project = await loadProject({
            config: `${fixtures}world/silk.config.json`,
            strings: `${fixtures}world/strings.xlsx`,
            theme: `${fixtures}theme.json`,
        });

        result = compileProject(project);
    });

    it('compiles without a missing glyph', () => {
        expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
        expect(result.bundles.size).toBe(31);
    });

    const bundle = (code: string) => new SilkBundle(result.bundles.get(code)?.slice().buffer as ArrayBuffer);
    const breaksIn = (code: string) => {
        const b = readBundle(result.bundles.get(code)?.slice().buffer as ArrayBuffer);

        return [...b.runs.flags].filter((f) => f & RunFlag.BreakBefore).length;
    };

    it('finds line breaks between words of Thai, Lao, Khmer and Burmese, which have no spaces', () => {
        for (const code of ['th', 'lo', 'km', 'my']) expect(breaksIn(code), code).toBeGreaterThanOrEqual(2);
    });

    it('breaks between Chinese and Japanese characters', () => {
        expect(breaksIn('zh')).toBeGreaterThanOrEqual(4);
        expect(breaksIn('ja')).toBeGreaterThanOrEqual(2);
    });

    it('stores the app code and the BCP 47 tag, and the right direction', () => {
        const iq = bundle('iq');

        expect(iq.id).toBe('iq');
        expect(iq.locale).toBe('ar-IQ');
        expect(iq.dir).toBe(1);
        expect(bundle('ku').dir).toBe(1);
        expect(bundle('hi').dir).toBe(0);
    });

    it('picks the locale preferred font for Han characters and Urdu', () => {
        const family = (code: string) => {
            const b = bundle(code);
            const face = b.data.segments[b.data.variants[b.variant(b.message('world.welcome')) * 7 + 1] * 5 + 3];

            return b.face(face).family;
        };

        expect(family('zh')).toBe('Noto Sans SC');
        expect(family('tw')).toBe('Noto Sans TC');
        expect(family('hk')).toBe('Noto Sans HK');
        expect(family('ja')).toBe('Noto Sans JP');
        expect(family('ko')).toBe('Noto Sans KR');
        expect(family('ur')).toBe('Noto Nastaliq Urdu');
    });

    it('formats numbers in each locale digits', () => {
        const cases: Record<string, string> = {
            fa: '۱٬۲۵۰',
            bn: '১,২৫০',
            my: '၁,၂၅၀',
            sd: '१,२५०',
            iq: '١٬٢٥٠',
        };

        for (const [code, want] of Object.entries(cases)) {
            const b = bundle(code);
            const slot = b.slot(
                b.data.segments[b.data.variants[b.variant(b.message('world.balance')) * 7 + 1] * 5 + 1],
            );
            const f = b.formatNumber(slot, 1250);

            expect(f.text, code).toBe(want);
            expect(f.fellBack, code).toBe(false);
        }
    });
});
