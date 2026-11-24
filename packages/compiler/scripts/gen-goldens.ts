/**
 * Writes tests/goldens/shaping.json: plain HarfBuzz output (glyph ids and advances, logical order)
 * for every run of the corpus, shaped as one buffer each with guessed properties. The compiler's
 * baked runs must match it. Run after a HarfBuzz upgrade, and review the diff.
 *
 *   node scripts/gen-goldens.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import * as hb from 'harfbuzzjs';
import { CORPUS } from '../tests/corpus.ts';

const out: Record<string, [number, number][][]> = {};

for (const c of CORPUS) {
    out[c.name] = c.runs.map((run) => {
        const font = new hb.Font(
            new hb.Face(new hb.Blob(readFileSync(new URL(`../fixtures/fonts/${run.font}`, import.meta.url)))),
        );
        const buffer = new hb.Buffer();

        buffer.addText(run.text);
        buffer.guessSegmentProperties();
        buffer.setDirection(run.dir === 'rtl' ? hb.Direction.RTL : hb.Direction.LTR);
        buffer.setLanguage(c.locale);
        hb.shape(font, buffer);
        const glyphs = buffer.getGlyphInfosAndPositions().map((g): [number, number] => [g.codepoint, g.xAdvance ?? 0]);

        return run.dir === 'rtl' ? glyphs.reverse() : glyphs;
    });
}
const body = Object.entries(out)
    .map(
        ([name, runs]) =>
            `    ${JSON.stringify(name)}: [\n${runs.map((r) => `      ${JSON.stringify(r)}`).join(',\n')}\n    ]`,
    )
    .join(',\n');

writeFileSync(
    new URL('../tests/goldens/shaping.json', import.meta.url),
    `{\n  "harfbuzz": ${JSON.stringify(hb.versionString())},\n  "cases": {\n${body}\n  }\n}\n`,
);
console.log(`harfbuzz ${hb.versionString()}: ${Object.keys(out).length} cases`);
