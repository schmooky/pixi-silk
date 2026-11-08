import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { days, GRAY, osc, W } from '../_sheets/kit3';
import { STYLE } from '../_sheets/style3';

export function sleepQuality(c: Cx): void {
    const { g } = c;
    const purple = 0x7d7aff;
    const xs = [37.3, 60.7, 83.3, 106.7, 129, 151.7, 174];
    const bright = [47, 40.5, 33, 42];

    I.moonZ(g, 5.5, 10.5, 12, purple);
    c.run(13, 17, [
        ['78', 16, purple, '600', 1],
        ['% AVG', 10.5, purple, '600'],
    ]);
    c.text('12-18 AUG', 188, 17, { size: 13.5, color: 0xd1d1d6, weight: '500', align: 'right' });
    c.text('100', 3, 34.7, { size: 11, color: GRAY, weight: '500' });
    c.text('50', 3, 50.7, { size: 11, color: GRAY, weight: '500' });
    c.text('0', 3, 66.7, { size: 11, color: GRAY, weight: '500' });
    for (const x of [25.7, 49, 72, 95, 118, 141, 164, 187.3])
        g.line(x, 24, x, 70).stroke({ width: 1, color: 0x232325 });
    xs.forEach((x, i) => {
        if (i < 4) {
            const top = bright[i] + osc(c.t, 0.7, i) * 1;

            g.pill(x - 2.6, 27, 5.2, 39).fill(0x34336a);
            g.pill(x - 2.6, top, 5.2, 66 - top).fill(0x8e8cf8);
        } else g.pill(x - 2.6, 27, 5.2, 39).fill(0x2c2c2e);
    });
    g.line(26, 36.7, 188, 36.7).stroke({ width: 1.5, color: W });
    days(c, xs, 81);
}

export default card(sleepQuality, { id: 's3-sleep', name: 'Sleep quality', size: [192, 88], style: STYLE });
