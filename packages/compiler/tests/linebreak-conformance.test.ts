import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { breakOpportunities } from '../src/shape/linebreak';

const file = new URL('../.cache/ucd/LineBreakTest-13.txt', import.meta.url);

/**
 * Cases the linebreak package (UAX #14 for Unicode 13) resolves differently from LineBreakTest.txt.
 * Each one is listed by its test line, so a new failure is caught. See DECISIONS.md D13.
 * `UPDATE_KNOWN=1 pnpm test` rewrites the list after a deliberate change.
 */
const KNOWN = new Set<number>(JSON.parse(readFileSync(new URL('./linebreak-known.json', import.meta.url), 'utf8')));

describe.skipIf(!existsSync(file))('UAX #14 conformance (LineBreakTest.txt, Unicode 13.0.0)', () => {
    it('finds the break opportunities of every test case except the listed ones', () => {
        const lines = readFileSync(file, 'utf8').split('\n');
        const failures: number[] = [];
        let total = 0;

        lines.forEach((line, n) => {
            const body = line.split('#')[0].trim();

            if (!body) return;
            const parts = body.split(/\s+/);
            let text = '';
            const want: number[] = [];

            for (const p of parts) {
                if (p === '\u00f7') want.push(text.length);
                else if (p !== '\u00d7') text += String.fromCodePoint(Number.parseInt(p, 16));
            }
            while (want.length && (want[want.length - 1] === text.length || want[0] === 0)) {
                if (want[want.length - 1] === text.length) want.pop();
                else want.shift();
            }
            total++;
            const got = breakOpportunities(text).map((b) => b.position);

            if (got.join(',') !== want.join(',')) failures.push(n + 1);
        });
        if (process.env.UPDATE_KNOWN) {
            writeFileSync(new URL('./linebreak-known.json', import.meta.url), `${JSON.stringify(failures)}\n`);
            return;
        }
        const unexpected = failures.filter((n) => !KNOWN.has(n));
        const fixed = [...KNOWN].filter((n) => !failures.includes(n));

        console.log(`LineBreakTest: ${total - failures.length} of ${total} pass, ${KNOWN.size} known differences`);
        expect(unexpected, `new failures on lines ${unexpected.slice(0, 20).join(', ')}`).toEqual([]);
        expect(fixed, `now passing, remove from linebreak-known.json: ${fixed.join(', ')}`).toEqual([]);
    });
});
