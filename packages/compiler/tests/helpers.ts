import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ThemeData } from 'pixi-silk/i18n';
import { lintRows, type SheetRow } from '../src/author/lint';
import type { SilkConfig } from '../src/config';

export const fixtures = fileURLToPath(new URL('../fixtures/', import.meta.url));
export const config = JSON.parse(readFileSync(`${fixtures}silk.config.json`, 'utf8')) as SilkConfig;
export const theme = JSON.parse(readFileSync(`${fixtures}theme.json`, 'utf8')) as ThemeData;

/** A project from inline rows: `{ key: { 'ar.other': 'text' } }`, with slots per key. */
export function project(
    rows: Record<string, Record<string, string>>,
    slots: Record<string, string> = {},
    extra: Partial<SilkConfig> = {},
) {
    const sheet: SheetRow[] = Object.entries(rows).map(([key, cells], i) => ({
        sheet: 'test',
        row: i + 2,
        key,
        context: '',
        slots: slots[key] ?? '',
        maxLen: 0,
        cells: Object.entries(cells).map(([h, value]) => {
            const [locale, category] = h.split('.') as [string, 'other'];

            return { locale, category, value, column: 'E' };
        }),
    }));
    const locales = [...new Set(sheet.flatMap((r) => r.cells.map((c) => c.locale)))];
    const cfg: SilkConfig = {
        ...config,
        sourceLocale: locales[0],
        locales: Object.fromEntries(locales.map((l) => [l, config.locales[l] ?? {}])),
        ...extra,
        tags: ['b', 'strong'],
    };
    const styled: ThemeData = { ...theme, styles: { ...theme.styles, strong: { weight: 700 } } };

    return {
        config: cfg,
        root: fixtures,
        theme: styled,
        catalog: lintRows(sheet, cfg, Object.keys(styled.styles ?? {})),
    };
}
