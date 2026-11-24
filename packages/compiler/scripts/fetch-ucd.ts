/**
 * Downloads the Unicode 16.0.0 data the compiler's tests and generators read into .cache/ucd (not
 * committed): bidi classes and BidiCharacterTest.txt, line break classes, East Asian widths and
 * LineBreakTest.txt.
 *
 *   node scripts/fetch-ucd.ts
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const dir = new URL('../.cache/ucd/', import.meta.url);
const FILES: Record<string, string> = {
    'DerivedBidiClass.txt': 'https://www.unicode.org/Public/16.0.0/ucd/extracted/DerivedBidiClass.txt',
    'BidiCharacterTest.txt': 'https://www.unicode.org/Public/16.0.0/ucd/BidiCharacterTest.txt',
    'LineBreak.txt': 'https://www.unicode.org/Public/16.0.0/ucd/extracted/DerivedLineBreak.txt',
    'EastAsianWidth.txt': 'https://www.unicode.org/Public/16.0.0/ucd/EastAsianWidth.txt',
    'LineBreakTest-16.txt': 'https://www.unicode.org/Public/16.0.0/ucd/auxiliary/LineBreakTest.txt',
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
