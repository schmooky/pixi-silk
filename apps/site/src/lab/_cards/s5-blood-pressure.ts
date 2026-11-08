import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { DIM, GRAY, osc, W } from '../_sheets/kit5';
import { STYLE } from '../_sheets/style5';

/** Blood pressure. */
export function bloodPressure(c: Cx): void {
    const { g } = c;
    const purple = 0xbf5af2;

    I.drop(g, 5, 10.5, 13, purple);
    c.run(13, 17, [
        ['119/75', 17, purple, '600', 4],
        ['AVG mmHg', 12.5, purple, '600'],
    ]);
    c.text('120', 0, 33, { size: 12.5, color: GRAY, weight: '500' });
    c.text('95', 0, 50.7, { size: 12.5, color: GRAY, weight: '500' });
    c.text('60', 0, 68, { size: 12.5, color: GRAY, weight: '500' });
    const tops = [30, 29, 34, 34, 33, 29, 34, 33, 34, 29, 30, 31];
    const bots = [57, 60, 54, 54, 57, 60, 54, 57, 54, 60, 57, 57];

    g.line(185.7, 26, 185.7, 70).stroke({ width: 1, color: 0x6e6e73, dash: [2, 2] });
    tops.forEach((top, i) => {
        const x = 31.3 + i * 13.5;
        const k = osc(c.t, 0.9, i) * 0.6;

        g.line(x, top + k, x, bots[i] - k).stroke({ width: 1.5, color: purple });
        g.circle(x, top + k, 2.7)
            .fill(0x000000)
            .stroke({ width: 1.5, color: purple });
        g.circle(x, bots[i] - k, 2.7)
            .fill(0x000000)
            .stroke({ width: 1.5, color: purple });
    });
    g.line(193, 34, 193, 54).stroke({ width: 1.5, color: W });
    g.circle(193, 34, 2.7).fill(0x000000).stroke({ width: 1.5, color: W });
    g.circle(193, 54, 2.7).fill(0x000000).stroke({ width: 1.5, color: W });
    c.text('30 MINS AGO', 40, 82, { size: 12.5, color: DIM, weight: '500' });
    c.text('NOW', 194, 82, { size: 12.5, weight: '700', align: 'right' });
}

export default card(bloodPressure, { id: 's5-blood-pressure', name: 'Blood pressure', size: [196, 88], style: STYLE });
