import { existsSync, readFileSync } from 'node:fs';
import { paragraphLevel, resetWhitespace, resolveLevels, visualOrder } from 'pixi-silk/text/bidi';
import { describe, expect, it } from 'vitest';
import { exactBidiClass } from '../src/shape/bidi-classes';

const file = new URL('../.cache/ucd/BidiCharacterTest.txt', import.meta.url);

describe.skipIf(!existsSync(file))('UAX #9 conformance (BidiCharacterTest.txt, Unicode 16.0.0)', () => {
    it('resolves the levels and the visual order of every test case', () => {
        const lines = readFileSync(file, 'utf8').split('\n');
        const failures: string[] = [];
        let total = 0;

        for (const line of lines) {
            if (!line || line.startsWith('#')) continue;
            const [cps, dir, para, levelsField, orderField] = line.split(';');
            const chars = cps
                .trim()
                .split(' ')
                .map((h) => String.fromCodePoint(Number.parseInt(h, 16)));
            const types = chars.map((c) => exactBidiClass(c.codePointAt(0) ?? 0));
            const direction = dir === '0' ? 'ltr' : dir === '1' ? 'rtl' : 'auto';
            const level = paragraphLevel(types, direction);
            const levels = resolveLevels(types, level, chars);

            resetWhitespace(types, levels, level);
            const expected = levelsField.trim().split(' ');
            const kept = expected.map((e, i) => (e === 'x' ? -1 : i)).filter((i) => i >= 0);
            const got = kept.map((i) => String(levels[i]));
            const want = kept.map((i) => expected[i]);
            const order = visualOrder(kept.map((i) => levels[i])).map((j) => kept[j]);
            const wantOrder = orderField.trim() ? orderField.trim().split(' ').map(Number) : [];

            total++;
            if (String(level) !== para || got.join(' ') !== want.join(' ') || order.join(' ') !== wantOrder.join(' ')) {
                if (failures.length < 20)
                    failures.push(
                        `${line.trim()}\n  got para ${level} levels ${got.join(' ')} order ${order.join(' ')}`,
                    );
                else failures.push('');
            }
        }
        console.log(`BidiCharacterTest: ${total - failures.length} of ${total} pass`);
        expect(total).toBeGreaterThan(90000);
        expect(failures.length, failures.slice(0, 20).join('\n')).toBe(0);
    });
});
