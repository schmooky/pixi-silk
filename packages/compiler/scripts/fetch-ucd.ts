/**
 * Downloads the Unicode data the compiler's tests and generators read into .cache/ucd (not committed):
 * DerivedBidiClass.txt and BidiCharacterTest.txt (Unicode 16.0.0), LineBreakTest.txt (13.0.0, the
 * version the linebreak package implements).
 *
 *   node scripts/fetch-ucd.ts
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const dir = new URL('../.cache/ucd/', import.meta.url);
const FILES: Record<string, string> = {
    'DerivedBidiClass.txt': 'https://www.unicode.org/Public/16.0.0/ucd/extracted/DerivedBidiClass.txt',
    'BidiCharacterTest.txt': 'https://www.unicode.org/Public/16.0.0/ucd/BidiCharacterTest.txt',
    'LineBreakTest-13.txt': 'https://www.unicode.org/Public/13.0.0/ucd/auxiliary/LineBreakTest.txt',
};

mkdirSync(dir, { recursive: true });
for (const [name, url] of Object.entries(FILES)) {
    const target = new URL(name, dir);

    if (existsSync(target)) continue;
    const response = await fetch(url);

    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    writeFileSync(target, new Uint8Array(await response.arrayBuffer()));
    console.log(`fetched ${name}`);
}
