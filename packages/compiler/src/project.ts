import { readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { type ThemeData, validateTheme } from 'pixi-silk/i18n';
import { type Catalog, type Diagnostic, lintRows } from './author/lint';
import type { SilkConfig } from './config';
import { type ImportResult, readCsvRows, readSheetRows } from './import/xlsx';

/** Inputs of one compile: the config, the theme and the strings, with paths resolved. */
export interface Project {
    /** The config. Font paths are resolved against `root`. */
    config: SilkConfig;
    /** Folder of the config file. */
    root: string;
    /** The theme. */
    theme: ThemeData;
    /** The linted strings. */
    catalog: Catalog;
}

/** Loads `silk.config.json`, `.mjs` or `.ts` (default export). */
export async function loadConfig(path: string): Promise<SilkConfig> {
    const ext = extname(path);

    if (ext === '.json') return JSON.parse(readFileSync(path, 'utf8')) as SilkConfig;
    const mod = (await import(pathToFileURL(resolve(path)).href)) as { default: SilkConfig };

    return mod.default;
}

/** Reads strings from .xlsx, or from a UTF-8 CSV with a byte order mark when `allowCsv` is set. */
export async function readStrings(path: string, allowCsv = false): Promise<ImportResult> {
    const data = readFileSync(path);

    if (extname(path).toLowerCase() === '.csv') {
        if (!allowCsv) {
            return {
                rows: [],
                diagnostics: [
                    {
                        severity: 'error',
                        code: 'csv-not-allowed',
                        message: 'CSV loses information Excel cannot round-trip: use .xlsx, or pass --allow-csv',
                    },
                ],
            };
        }
        return readCsvRows(new Uint8Array(data), path);
    }

    return readSheetRows(new Uint8Array(data));
}

/** Loads the config, the theme and the strings, and lints them. */
export async function loadProject(options: {
    config: string;
    strings: string;
    theme: string;
    allowCsv?: boolean;
}): Promise<Project> {
    const config = await loadConfig(options.config);
    const theme = JSON.parse(readFileSync(options.theme, 'utf8')) as ThemeData;
    const themeErrors: Diagnostic[] = validateTheme(theme).map((message) => ({
        severity: 'error',
        code: 'bad-theme',
        message: `${options.theme}: ${message}`,
    }));
    const imported = await readStrings(options.strings, options.allowCsv);
    const catalog = lintRows(imported.rows, config, Object.keys(theme.styles ?? {}));

    catalog.diagnostics.unshift(...themeErrors, ...imported.diagnostics);

    return { config, root: dirname(resolve(options.config)), theme, catalog };
}
