/**
 * Runtime numbers for the v2 brief (sec. 10), reported, never gated: timings vary between
 * machines. The hard gates (which tier runs, which instances change) are tests.
 *
 *   pnpm bench
 */
import { layoutMessage, SilkBundle, StyleTable, updateNumberSlot } from 'pixi-silk/i18n';
import { afterAll, describe, it } from 'vitest';
import { compileProject } from '../src/compile';
import { project, theme } from '../tests/helpers';

const words = ['لديك', 'عملات', 'ذهبية', 'في', 'المتجر'];
const sentence = (n: number) => Array.from({ length: n }, (_, i) => words[i % words.length]).join(' ');
const rows: Record<string, Record<string, string>> = {};
const slots: Record<string, string> = {};

for (let i = 0; i < 200; i++) {
    rows[`m${i}`] = { 'ar.other': `${sentence(4 + (i % 6))} {n}` };
    slots[`m${i}`] = 'n:number(maxDigits=7,tabular)';
}
rows.long = { 'ar.other': `${sentence(30)} {n}` };
slots.long = 'n:number(maxDigits=7,tabular)';
const result = compileProject(project(rows, slots));
const ar = new SilkBundle(result.bundles.get('ar')?.slice().buffer as ArrayBuffer);
const styles = new StyleTable(theme);
const options = { size: 24, maxWidth: 0, align: 'start' as const, lineHeight: 1.35, values: { n: 1250 }, styles };
const keys = Object.keys(rows).filter((k) => k !== 'long');
const long = ar.variant(ar.message('long'));
const threeLines = { ...options, maxWidth: layoutMessage(ar, long, options).width / 2.6 };

const results: [string, string][] = [];

/** Runs `fn` for about 300 ms after a warm-up and records the mean time per call. */
function bench(name: string, fn: () => void, per = 1): void {
    it(name, () => {
        for (let i = 0; i < 50; i++) fn();
        let runs = 0;
        const t0 = performance.now();

        while (performance.now() - t0 < 300) {
            fn();
            runs++;
        }
        const us = ((performance.now() - t0) * 1000) / runs / per;

        results.push([name, us < 10 ? `${us.toFixed(2)} us` : `${us.toFixed(1)} us`]);
    });
}

afterAll(() => {
    const width = Math.max(...results.map((r) => r[0].length));

    console.log(results.map(([n, t]) => `${n.padEnd(width)}  ${t.padStart(10)}`).join('\n'));
});

describe('runtime (brief sec. 10)', () => {
    bench(
        'prepare and lay out one of 200 messages',
        () => {
            for (const key of keys) layoutMessage(ar, ar.variant(ar.message(key)), options);
        },
        keys.length,
    );

    bench('lay out a 3-line Arabic message', () => {
        layoutMessage(ar, long, threeLines);
    });

    const fast = layoutMessage(ar, ar.variant(ar.message('m0')), options);
    const slot = ar.slot(fast.slots[0].slot);
    let n = 1000;

    bench('value-fast: same-length number update', () => {
        n = n === 9999 ? 1000 : n + 1;
        updateNumberSlot(fast.instances, fast.slots[0], ar.formatNumber(slot, n));
    });

    // rows that include the style, as composite stacks do
    styles.rowFor(['gold']);
    styles.rowFor(['title', 'gold']);
    bench('paint: theme change of one style (two rows)', () => {
        styles.set('gold', { fill: n % 2 ? '#ffffff' : '#ffc53d' });
    });
});
