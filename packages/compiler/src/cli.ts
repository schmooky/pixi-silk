#!/usr/bin/env node
/**
 * The `silk` command. Exit codes: 0 done, 1 errors in the input, 2 bad usage.
 *
 *   silk compile  --config silk.config.json --strings strings.xlsx --theme theme.json --out dist/i18n [--emit-json] [--split-by sheet|keyPrefix] [--allow-csv]
 *   silk bake     same as compile
 *   silk lint     --config ... --strings ... --theme ...        no files written
 *   silk size     --out dist/i18n                                 bundle and page sizes, raw and brotli
 *   silk export   --config ... --strings ... --locale ar --file ar.xlsx
 *   silk import   --config ... --strings ... --locale ar --file ar.xlsx [--write]
 *   silk preview  --config ... --strings ... --theme ... [--port 5179]   compiles on every save, serves a preview page
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { brotliCompressSync, constants } from 'node:zlib';
import { encodeAtlasPages } from './atlas/pack';
import { type Diagnostic, formatDiagnostic, lintRows } from './author/lint';
import { compileProject } from './compile';
import { checkKeys, exportWorkbook, mergeTranslations, writeWorkbook } from './exchange';
import { readSheetRows } from './import/xlsx';
import { loadConfig, loadProject, readStrings } from './project';

const USAGE = `usage: silk <compile|bake|lint|size|export|import|preview> [options]
  --config <file>     silk.config.json (default ./silk.config.json)
  --strings <file>    strings .xlsx (default ./strings.xlsx)
  --theme <file>      theme.json (default ./theme.json)
  --out <dir>         output folder (default ./dist/i18n)
  --emit-json         also write <locale>.debug.json
  --split-by <mode>   sheet or keyPrefix: one bundle per chunk
  --allow-csv         accept a UTF-8 CSV with a byte order mark
  --atlas-kind <kind> msdf, sdf or mtsdf: overrides atlas.kind of the config
  --max-page-size <n> largest page side in pixels: overrides atlas.maxPageSize
  --locale <locale>   export and import: the target locale
  --file <file>       export and import: the translator workbook
  --write             import: write the merged strings back
  --port <port>       preview: the port (default 5179)
  --quiet             print errors only`;

function report(diagnostics: Diagnostic[], quiet: boolean): number {
    let errors = 0;

    for (const d of diagnostics) {
        if (d.severity === 'error') errors++;
        if (d.severity === 'error' || !quiet) console.error(formatDiagnostic(d));
    }
    const warnings = diagnostics.length - errors;

    if (!quiet || errors)
        console.error(
            `silk: ${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}`,
        );

    return errors;
}

const brotli = (b: Uint8Array) => brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
const kb = (n: number) => `${(n / 1024).toFixed(2)} kB`;

async function main(argv: string[]): Promise<number> {
    let parsed: ReturnType<typeof parse>;
    const parse = () =>
        parseArgs({
            args: argv,
            allowPositionals: true,
            options: {
                config: { type: 'string', default: 'silk.config.json' },
                strings: { type: 'string', default: 'strings.xlsx' },
                theme: { type: 'string', default: 'theme.json' },
                out: { type: 'string', default: 'dist/i18n' },
                'emit-json': { type: 'boolean', default: false },
                'split-by': { type: 'string' },
                'allow-csv': { type: 'boolean', default: false },
                'atlas-kind': { type: 'string' },
                'max-page-size': { type: 'string' },
                locale: { type: 'string' },
                file: { type: 'string' },
                write: { type: 'boolean', default: false },
                quiet: { type: 'boolean', default: false },
                port: { type: 'string' },
                help: { type: 'boolean', default: false },
            },
        });

    try {
        parsed = parse();
    } catch (e) {
        console.error(`silk: ${(e as Error).message}\n${USAGE}`);
        return 2;
    }
    const { values: o, positionals } = parsed;
    const command = positionals[0];

    if (o.help || !command) {
        console.log(USAGE);
        return command || o.help ? 0 : 2;
    }
    const split = o['split-by'];

    if (split !== undefined && split !== 'sheet' && split !== 'keyPrefix') {
        console.error(`silk: --split-by must be sheet or keyPrefix\n${USAGE}`);
        return 2;
    }
    const inputs = { config: o.config, strings: o.strings, theme: o.theme, allowCsv: o['allow-csv'] };

    switch (command) {
        case 'lint': {
            const project = await loadProject(inputs);

            return report(project.catalog.diagnostics, o.quiet) ? 1 : 0;
        }
        case 'compile':
        case 'bake': {
            const project = await loadProject(inputs);
            const kind = o['atlas-kind'];

            if (kind !== undefined) {
                if (kind !== 'msdf' && kind !== 'sdf' && kind !== 'mtsdf') {
                    console.error(`silk: --atlas-kind must be msdf, sdf or mtsdf\n${USAGE}`);
                    return 2;
                }
                project.config.atlas = { ...project.config.atlas, kind };
            }
            if (o['max-page-size'] !== undefined) {
                project.config.atlas = { ...project.config.atlas, maxPageSize: Number(o['max-page-size']) };
            }

            if (
                report(
                    project.catalog.diagnostics.filter((d) => d.severity === 'error'),
                    true,
                )
            )
                return 1;
            const result = compileProject(project, { splitBy: split });

            if (report(result.diagnostics, o.quiet)) return 1;
            mkdirSync(join(o.out, 'atlas'), { recursive: true });
            for (const [name, bytes] of result.bundles) writeFileSync(join(o.out, `${name}.silk`), bytes);
            for (const [file, bytes] of await encodeAtlasPages(result.atlas))
                writeFileSync(join(o.out, 'atlas', file), bytes);
            writeFileSync(join(o.out, 'atlas', 'pages.json'), `${JSON.stringify(result.manifest, null, 2)}\n`);
            writeFileSync(join(o.out, 'messages.d.ts'), result.dts);
            if (o['emit-json']) {
                for (const [name, dump] of result.debug)
                    writeFileSync(join(o.out, `${name}.debug.json`), `${JSON.stringify(dump, null, 1)}\n`);
            }
            if (!o.quiet)
                console.log(
                    `silk: wrote ${result.bundles.size} bundles and ${result.atlas.pages.length} atlas pages to ${o.out}`,
                );
            return 0;
        }
        case 'size': {
            const rows: [string, number, number][] = [];
            const walk = (dir: string) => {
                for (const name of readdirSync(dir).sort()) {
                    const path = join(dir, name);

                    if (statSync(path).isDirectory()) walk(path);
                    else if (/\.(silk|png|webp|ktx2)$/.test(name)) {
                        const bytes = new Uint8Array(readFileSync(path));

                        rows.push([path.slice(o.out.length + 1), bytes.length, brotli(bytes)]);
                    }
                }
            };

            walk(o.out);
            const width = Math.max(4, ...rows.map((r) => r[0].length));

            console.log(`${'file'.padEnd(width)}  ${'raw'.padStart(10)}  ${'brotli'.padStart(10)}`);
            for (const [name, raw, br] of rows)
                console.log(`${name.padEnd(width)}  ${kb(raw).padStart(10)}  ${kb(br).padStart(10)}`);
            return 0;
        }
        case 'export': {
            if (!o.locale || !o.file) {
                console.error(`silk export needs --locale and --file\n${USAGE}`);
                return 2;
            }
            const config = await loadConfig(o.config);
            const { rows } = await readStrings(o.strings, o['allow-csv']);

            writeFileSync(o.file, await exportWorkbook(rows, config, o.locale));
            if (!o.quiet) console.log(`silk: wrote ${rows.length} rows to ${o.file}`);
            return 0;
        }
        case 'import': {
            if (!o.locale || !o.file) {
                console.error(`silk import needs --locale and --file\n${USAGE}`);
                return 2;
            }
            const config = await loadConfig(o.config);
            const master = await readStrings(o.strings, o['allow-csv']);
            const back = await readSheetRows(new Uint8Array(readFileSync(o.file)));
            const keyProblems = checkKeys(master.rows, back.rows);
            const merged = mergeTranslations(master.rows, back.rows, o.locale);
            const lint = lintRows(merged, config);
            const problems = [
                ...back.diagnostics,
                ...keyProblems,
                ...lint.diagnostics.filter((d) => d.locale === o.locale),
            ];

            if (report(problems, o.quiet)) return 1;
            if (o.write) {
                writeFileSync(o.strings, await writeWorkbook(merged));
                if (!o.quiet) console.log(`silk: merged ${o.locale} into ${o.strings}`);
            }
            return 0;
        }
        case 'preview': {
            const { startPreview } = await import('./preview');

            await startPreview({ ...inputs, port: o.port ? Number(o.port) : undefined });
            // keeps running until the process is stopped
            return await new Promise<number>(() => undefined);
        }
        default:
            console.error(`silk: unknown command "${command}"\n${USAGE}`);
            return 2;
    }
}

process.exitCode = await main(process.argv.slice(2));
