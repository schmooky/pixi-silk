import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { axis, CANDLES, GRAY, osc, PALE, RED, stripes } from '../_sheets/kit3';
import { STYLE } from '../_sheets/style3';

/** Run heart rate. */
export function runCandles(c: Cx): void {
    const { g } = c;

    c.run(2, 16, [
        ['23:48', 16, PALE, '600', 7],
        ['1.17', 16, 0x6ab8ff, '600', 2],
        ['KM', 10.5, 0x6ab8ff, '600', 7],
        ['83', 16, RED, '600', 2],
        ['KCAL', 10.5, RED, '600'],
    ]);
    g.circle(182, 10.5, 8).fill(0xb8f03a);
    I.runner(g, 182, 10.5, 11, 0x000000);
    c.text('155', 0, 33, { size: 11.5, color: GRAY, weight: '500' });
    c.text('BPM', 0, 50.7, { size: 11.5, color: 0xd9504a, weight: '600' });
    c.text('97', 0, 68, { size: 11.5, color: GRAY, weight: '500' });
    stripes(g, 30, 185.7, 6.5, 24, 86);
    CANDLES.forEach(([x, top, bottom], i) => {
        const dy = osc(c.t, 1.5, i) * 0.8;

        g.pill(x - 1.1, top + dy - 0.5, 2.2, bottom - top + 1).fill(0xe0453c);
    });
    axis(
        c,
        [
            ['9:06', 32],
            ['9:12', 71],
            ['9:18', 111],
            ['9:24', 150],
        ],
        80.5,
        [30, 69, 108.5, 147.5],
    );
}

export default card(runCandles, { id: 's3-run', name: 'Run heart rate', size: [192, 88], style: STYLE });
