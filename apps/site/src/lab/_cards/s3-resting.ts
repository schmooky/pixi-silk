import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { GRAY, osc, stripes } from '../_sheets/kit3';
import { STYLE } from '../_sheets/style3';

/** Resting heart rate. */
export function restingHr(c: Cx): void {
    const { g } = c;
    const pink = 0xff375f;
    const py = 39.7 + osc(c.t, 0.5) * 0.8;

    g.heart(6.5, 11, 14, 0.1).fill(0xff6482);
    I.arrow(g, 6.5, 11, 6, 0x000000, 'up', 0.2);
    c.text('8%', 16, 17, { size: 16, color: 0xff6482, weight: '500' });
    c.text('RESTING HEART RATES', 188, 17, { size: 11, color: GRAY, weight: '600', align: 'right' });
    c.text('74', 3, 33, { size: 11.5, color: 0xd1d1d6, weight: '500' });
    c.text('BPM', 0, 50.7, { size: 11.5, color: pink, weight: '600' });
    c.text('54', 3, 68, { size: 11.5, color: 0xd1d1d6, weight: '500' });
    stripes(g, 30.7, 186.7, 6.5, 24, 86);
    for (let i = 0; i < 17; i++) {
        const x = 33 + i * 6.5;
        const y = 51 + 7 * Math.sin(i * 2.3 + 1);

        if (i % 3 !== 1) g.circle(x, y, 0.95).fill(GRAY);
    }
    g.line(30.7, 51.3, 141.7, 51.3).stroke({ width: 2.4, color: 0xb0b0b5 });
    c.text('62', 32, 48.5, { size: 11.5, color: 0xd1d1d6, weight: '500' });
    g.line(141.7, 24, 141.7, 86).stroke({ width: 1.3, color: 0xaeaeb2 });
    for (let i = 0; i < 7; i++) g.circle(145 + i * 6.5, 48 + 4 * Math.sin(i * 2.1), 0.95).fill(pink);
    g.line(141.7, py, 186.7, py).stroke({ width: 2.4, color: pink });
    c.text('67', 144, py - 3.2, { size: 11.5, color: pink, weight: '500' });
    c.text('17D AVG', 33, 80.5, { size: 11.5, color: GRAY, weight: '600' });
    c.text('7D AVG', 186, 80.5, { size: 11.5, color: pink, weight: '600', align: 'right' });
}

export default card(restingHr, { id: 's3-resting', name: 'Resting heart rate', size: [192, 88], style: STYLE });
