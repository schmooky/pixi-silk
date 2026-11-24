/**
 * The app locale codes pixi-silk/i18n knows, with the BCP 47 tag each one stands for. Many app codes
 * are country codes or collide with other languages' ISO 639 codes, so the compiler never guesses:
 * plural rules, numbering systems, script and direction come from the BCP 47 tag.
 *
 * Collisions to watch: `ca` is Canadian English (ISO 639 `ca` is Catalan), `sd` is Nepali (Sindhi),
 * `aa` is Amharic (Afar), `am` is Kurdish Badini (Amharic), `ne` is Kurdish Kurmanji (Nepali), `zu`
 * is Zaza (Zulu), `in` is Indian English (the old code of Indonesian).
 */

/** One app locale. */
export interface AppLocale {
    /** Code the app uses, the bundle name. */
    code: string;
    /** English name. */
    name: string;
    /** BCP 47 tag for plural rules, number formatting, script and direction. */
    bcp47: string;
    /** Font families to prefer for this locale, such as a Japanese face for `ja`. */
    families?: string[];
}

const SC = ['Noto Sans SC'];
const TC = ['Noto Sans TC'];

/** Every app locale, sorted by English name, then code. */
export const APP_LOCALES: readonly AppLocale[] = [
    { code: 'er', name: 'Afar', bcp47: 'aa' },
    { code: 'af', name: 'Afrikaans', bcp47: 'af' },
    { code: 'ak', name: 'Akan', bcp47: 'ak' },
    { code: 'al', name: 'Albanian', bcp47: 'sq-AL' },
    { code: 'sq', name: 'Albanian', bcp47: 'sq-AL' },
    { code: 'us', name: 'American English', bcp47: 'en-US' },
    { code: 'aa', name: 'Amharic', bcp47: 'am-ET' },
    { code: 'ar', name: 'Arabic', bcp47: 'ar' },
    { code: 'es-AR', name: 'Argentine Spanish', bcp47: 'es-AR' },
    { code: 'hy', name: 'Armenian', bcp47: 'hy' },
    { code: 'au', name: 'Australian English', bcp47: 'en-AU' },
    { code: 'az', name: 'Azerbaijani', bcp47: 'az' },
    { code: 'eu', name: 'Basque', bcp47: 'eu' },
    { code: 'by', name: 'Belarusian', bcp47: 'be' },
    { code: 'bn', name: 'Bengali', bcp47: 'bn' },
    { code: 'bs', name: 'Bosnian', bcp47: 'bs' },
    { code: 'br', name: 'Brazilian Portuguese', bcp47: 'pt-BR' },
    { code: 'gb', name: 'British English', bcp47: 'en-GB' },
    { code: 'bg', name: 'Bulgarian', bcp47: 'bg' },
    { code: 'my', name: 'Burmese', bcp47: 'my' },
    { code: 'ca', name: 'Canadian English', bcp47: 'en-CA' },
    { code: 'fr-CA', name: 'Canadian French', bcp47: 'fr-CA' },
    { code: 'hk', name: 'Cantonese (Hong Kong)', bcp47: 'yue-Hant-HK', families: ['Noto Sans HK', ...TC] },
    { code: 'ca-ES', name: 'Catalan', bcp47: 'ca-ES' },
    { code: 'ceb', name: 'Cebuano', bcp47: 'ceb' },
    { code: 'cn', name: 'Chinese (Simplified)', bcp47: 'zh-Hans-CN', families: SC },
    { code: 'zh', name: 'Chinese (Simplified)', bcp47: 'zh-Hans-CN', families: SC },
    { code: 'tw', name: 'Chinese (Traditional)', bcp47: 'zh-Hant-TW', families: TC },
    { code: 'es-CO', name: 'Colombian Spanish', bcp47: 'es-CO' },
    { code: 'hr', name: 'Croatian', bcp47: 'hr' },
    { code: 'cs', name: 'Czech', bcp47: 'cs' },
    { code: 'da', name: 'Danish', bcp47: 'da' },
    { code: 'prs', name: 'Dari', bcp47: 'fa-AF' },
    { code: 'nl', name: 'Dutch', bcp47: 'nl' },
    { code: 'ar-EG', name: 'Egyptian Arabic', bcp47: 'ar-EG' },
    { code: 'en', name: 'English', bcp47: 'en' },
    { code: 'et', name: 'Estonian', bcp47: 'et' },
    { code: 'fi', name: 'Finnish', bcp47: 'fi' },
    { code: 'fr', name: 'French', bcp47: 'fr' },
    { code: 'gl', name: 'Galician', bcp47: 'gl' },
    { code: 'ka', name: 'Georgian', bcp47: 'ka' },
    { code: 'de', name: 'German', bcp47: 'de' },
    { code: 'el', name: 'Greek', bcp47: 'el' },
    { code: 'gu', name: 'Gujarati', bcp47: 'gu' },
    { code: 'ht', name: 'Haitian Creole', bcp47: 'ht' },
    { code: 'ha', name: 'Hausa', bcp47: 'ha' },
    { code: 'he', name: 'Hebrew', bcp47: 'he' },
    { code: 'hi', name: 'Hindi', bcp47: 'hi' },
    { code: 'hu', name: 'Hungarian', bcp47: 'hu' },
    { code: 'is', name: 'Icelandic', bcp47: 'is' },
    { code: 'ig', name: 'Igbo', bcp47: 'ig' },
    { code: 'in', name: 'Indian English', bcp47: 'en-IN' },
    { code: 'id', name: 'Indonesian', bcp47: 'id' },
    { code: 'iq', name: 'Iraqi Arabic', bcp47: 'ar-IQ' },
    { code: 'ga', name: 'Irish', bcp47: 'ga' },
    { code: 'it', name: 'Italian', bcp47: 'it' },
    { code: 'ja', name: 'Japanese', bcp47: 'ja', families: ['Noto Sans JP'] },
    { code: 'jv', name: 'Javanese', bcp47: 'jv' },
    { code: 'kn', name: 'Kannada', bcp47: 'kn' },
    { code: 'kz', name: 'Kazakh', bcp47: 'kk' },
    { code: 'km', name: 'Khmer', bcp47: 'km' },
    { code: 'rw', name: 'Kinyarwanda', bcp47: 'rw' },
    { code: 'ko', name: 'Korean', bcp47: 'ko-KR', families: ['Noto Sans KR'] },
    { code: 'kr', name: 'Korean', bcp47: 'ko-KR', families: ['Noto Sans KR'] },
    { code: 'am', name: 'Kurdish (Badini)', bcp47: 'ku-Arab-IQ' },
    { code: 'ne', name: 'Kurdish (Kurmanji)', bcp47: 'ku-Latn' },
    { code: 'ku', name: 'Kurdish (Sorani)', bcp47: 'ckb-IQ' },
    { code: 'zu', name: 'Kurdish (Zaza)', bcp47: 'zza' },
    { code: 'ky', name: 'Kyrgyz', bcp47: 'ky' },
    { code: 'lo', name: 'Lao', bcp47: 'lo' },
    { code: 'lv', name: 'Latvian', bcp47: 'lv' },
    { code: 'ln', name: 'Lingala', bcp47: 'ln' },
    { code: 'lt', name: 'Lithuanian', bcp47: 'lt' },
    { code: 'lb', name: 'Luxembourgish', bcp47: 'lb' },
    { code: 'mk', name: 'Macedonian', bcp47: 'mk' },
    { code: 'mg', name: 'Malagasy', bcp47: 'mg' },
    { code: 'ms', name: 'Malay', bcp47: 'ms' },
    { code: 'ml', name: 'Malayalam', bcp47: 'ml' },
    { code: 'mt', name: 'Maltese', bcp47: 'mt' },
    { code: 'mr', name: 'Marathi', bcp47: 'mr' },
    { code: 'mx', name: 'Mexican Spanish', bcp47: 'es-MX' },
    { code: 'mn', name: 'Mongolian', bcp47: 'mn' },
    { code: 'me', name: 'Montenegrin', bcp47: 'sr-Latn-ME' },
    { code: 'ar-MA', name: 'Moroccan Arabic', bcp47: 'ar-MA' },
    { code: 'sd', name: 'Nepali', bcp47: 'ne-NP' },
    { code: 'nz', name: 'New Zealand English', bcp47: 'en-NZ' },
    { code: 'nb', name: 'Norwegian', bcp47: 'nb' },
    { code: 'or', name: 'Odia', bcp47: 'or' },
    { code: 'om', name: 'Oromo', bcp47: 'om' },
    { code: 'ps', name: 'Pashto', bcp47: 'ps' },
    { code: 'fa', name: 'Persian', bcp47: 'fa-IR' },
    { code: 'ir', name: 'Persian', bcp47: 'fa-IR' },
    { code: 'pe', name: 'Peruvian Spanish', bcp47: 'es-PE' },
    { code: 'pl', name: 'Polish', bcp47: 'pl' },
    { code: 'pt', name: 'Portuguese', bcp47: 'pt-PT' },
    { code: 'pa', name: 'Punjabi', bcp47: 'pa' },
    { code: 'ro', name: 'Romanian', bcp47: 'ro' },
    { code: 'ru', name: 'Russian', bcp47: 'ru' },
    { code: 'ar-SA', name: 'Saudi Arabic', bcp47: 'ar-SA' },
    { code: 'sr', name: 'Serbian', bcp47: 'sr-Cyrl' },
    { code: 'sp', name: 'Serbian (Latin)', bcp47: 'sr-Latn' },
    { code: 'sn', name: 'Shona', bcp47: 'sn' },
    { code: 'sd-PK', name: 'Sindhi', bcp47: 'sd-PK' },
    { code: 'lk', name: 'Sinhala', bcp47: 'si-LK' },
    { code: 'si', name: 'Sinhala', bcp47: 'si-LK' },
    { code: 'sk', name: 'Slovak', bcp47: 'sk' },
    { code: 'sl', name: 'Slovenian', bcp47: 'sl' },
    { code: 'so', name: 'Somali', bcp47: 'so' },
    { code: 'es', name: 'Spanish', bcp47: 'es-ES' },
    { code: 'sw', name: 'Swahili', bcp47: 'sw' },
    { code: 'sv', name: 'Swedish', bcp47: 'sv' },
    { code: 'tl', name: 'Tagalog', bcp47: 'fil' },
    { code: 'tg', name: 'Tajik', bcp47: 'tg-TJ' },
    { code: 'tj', name: 'Tajik', bcp47: 'tg-TJ' },
    { code: 'ta', name: 'Tamil', bcp47: 'ta' },
    { code: 'tt', name: 'Tatar', bcp47: 'tt' },
    { code: 'te', name: 'Telugu', bcp47: 'te' },
    { code: 'th', name: 'Thai', bcp47: 'th' },
    { code: 'ti', name: 'Tigrinya', bcp47: 'ti' },
    { code: 'tr', name: 'Turkish', bcp47: 'tr' },
    { code: 'tk', name: 'Turkmen', bcp47: 'tk' },
    { code: 'ua', name: 'Ukrainian', bcp47: 'uk-UA' },
    { code: 'uk', name: 'Ukrainian', bcp47: 'uk-UA' },
    { code: 'ur', name: 'Urdu', bcp47: 'ur', families: ['Noto Nastaliq Urdu'] },
    { code: 'uz', name: 'Uzbek', bcp47: 'uz' },
    { code: 'vi', name: 'Vietnamese', bcp47: 'vi' },
    { code: 'cy', name: 'Welsh', bcp47: 'cy' },
    { code: 'wo', name: 'Wolof', bcp47: 'wo' },
    { code: 'xh', name: 'Xhosa', bcp47: 'xh' },
    { code: 'yo', name: 'Yoruba', bcp47: 'yo' },
    { code: 'zu-ZA', name: 'Zulu', bcp47: 'zu-ZA' },
];

const BY_CODE = new Map(APP_LOCALES.map((l) => [l.code, l]));

/** What the compiler needs to know about a locale code. */
export interface ResolvedLocale {
    /** The app code: the bundle name. */
    code: string;
    /** BCP 47 tag. */
    bcp47: string;
    /** 0 left to right, 1 right to left. */
    dir: 0 | 1;
    /** ISO 15924 script, such as `Arab`. */
    script: string;
    /** Numbering system: the config's, else CLDR's default for the tag. */
    numberingSystem: string;
    /** Preferred font families, config first. */
    families: string[];
}

const RTL_SCRIPTS = new Set(['Arab', 'Hebr', 'Thaa', 'Syrc', 'Nkoo', 'Adlm', 'Rohg']);

/**
 * Resolves an app locale code with its config entry: the BCP 47 tag (config, else
 * {@link APP_LOCALES}, else the code itself), script and direction from `Intl.Locale`, and the
 * numbering system (config, else CLDR's default for the tag).
 */
export function resolveLocale(
    code: string,
    config: { bcp47?: string; numberingSystem?: string; families?: string[] } = {},
): ResolvedLocale {
    const known = BY_CODE.get(code);
    const bcp47 = config.bcp47 ?? known?.bcp47 ?? code;
    let script = 'Latn';

    try {
        script = new Intl.Locale(bcp47).maximize().script ?? 'Latn';
    } catch {
        // an invalid tag keeps Latin
    }
    let numberingSystem = config.numberingSystem;

    if (!numberingSystem) {
        try {
            numberingSystem = new Intl.NumberFormat(bcp47).resolvedOptions().numberingSystem;
        } catch {
            numberingSystem = 'latn';
        }
    }

    return {
        code,
        bcp47,
        dir: RTL_SCRIPTS.has(script) ? 1 : 0,
        script,
        numberingSystem,
        families: [...(config.families ?? []), ...(known?.families ?? [])],
    };
}
