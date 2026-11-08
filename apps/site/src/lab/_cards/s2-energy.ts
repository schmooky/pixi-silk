import { vertical } from 'pixi-silk';
import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { DIM, GRAY, osc, W } from '../_sheets/kit2';
import { STYLE } from '../_sheets/style2';

export function energy(c: Cx): void {
    const { g } = c;

    g.circle(7.5, 10.5, 5.8).fill(0xf5c518);
    c.text('3', 7.5, 13.8, { size: 9, color: 0x000000, weight: '800', align: 'center' });
    I.bulb(g, 22, 10.5, 12.5, 0xf5c518);
    c.run(31, 16.5, [
        ['4.26', 17, W, '600', 3],
        ['kWh', 12.5, W, '600'],
    ]);
    c.text('24', 0, 32, { size: 12.5, color: GRAY, weight: '500' });
    c.text('12', 0, 50.5, { size: 12.5, color: GRAY, weight: '500' });
    c.text('0', 0, 68.5, { size: 12.5, color: GRAY, weight: '500' });
    c.text('HRS', 0, 81.5, { size: 12.5, color: DIM, weight: '500' });
    g.rect(30, 24, 162, 60).fill(
        vertical([
            [0, 0x2e2600],
            [1, 0x2e2600, 0],
        ]),
    );
    for (let i = 0; i <= 24; i++) g.line(30 + i * 6.75, 24, 30 + i * 6.75, 84).stroke({ width: 0.8, color: 0x3d3306 });
    const ys = [
        45.7, 55.7, 26.3, 41.7, 50.7, 41.7, 45.7, 53.3, 33.3, 48.3, 47.3, 0, 45.7, 53.3, 0, 45.7, 57.3, 43, 47.3, 33.3,
        50.7, 0, 48.3,
    ];

    ys.forEach((y, i) => {
        const x = 36 + i * 6.7;

        if (!y) g.circle(x, 64.7, 2.3).stroke({ width: 1, color: 0x8a7520 });
        else {
            g.circle(x, 64.7, 0.75).fill(0x5a4c10);
            g.circle(x, y + osc(c.t, 1.4, i) * 0.8, 2.3).fill(0xf5d33a);
        }
    });
    c.text('12 SEP', 32, 81.5, { size: 12.5, color: GRAY, weight: '500' });
    c.text('TOTAL 24 DAYS', 192, 81.5, { size: 12.5, weight: '600', align: 'right' });
}

export default card(energy, { id: 's2-energy', name: 'Energy', size: [196, 88], style: STYLE });
