import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lineBreaks } from '../src/shape/uax14';

const file = new URL('../.cache/ucd/LineBreakTest-16.txt', import.meta.url);

describe.skipIf(!existsSync(file))('UAX #14 conformance (LineBreakTest.txt, Unicode 16.0.0)', () => {
    it('finds the break opportunities of every test case', () => {
        const failures: string[] = [];
        let total = 0;

        for (const line of readFileSync(file, 'utf8').split('\n')) {
            const body = line.split('#')[0].trim();

            if (!body) continue;
            let text = '';
            const want: number[] = [];

            for (const p of body.split(/\s+/)) {
                if (p === '\u00f7') want.push(text.length);
                else if (p !== '\u00d7') text += String.fromCodePoint(Number.parseInt(p, 16));
            }
            const expected = want.filter((x) => x > 0 && x < text.length);
            const got = lineBreaks(text).map((b) => b.position);

            total++;
            if (got.join(',') !== expected.join(','))
                failures.push(`${body}\n  got ${got.join(',')} want ${expected.join(',')}`);
        }
        console.log(`LineBreakTest 16: ${total - failures.length} of ${total} pass`);
        expect(failures.slice(0, 15).join('\n')).toBe('');
    });
});
