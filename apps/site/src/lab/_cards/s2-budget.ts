import { linear } from 'pixi-silk';
import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { DIM, GRAY, W } from '../_sheets/kit2';
import { STYLE } from '../_sheets/style2';

/** Budget. */
export function budget(c: Cx): void {
    const { g } = c;

    I.dollarCycle(g, 6.5, 10.5, 13, W);
    c.text('$', 6.5, 14, { size: 9, weight: '700', align: 'center' });
    c.run(16, 16.5, [
        ['$382', 17, W, '600', 5],
        ['LEFT OF BUDGET', 13, GRAY, '500'],
    ]);
    c.text('3K', 0, 32, { size: 12.5, color: GRAY, weight: '500' });
    c.text('1.5K', 0, 50, { size: 12.5, color: GRAY, weight: '500' });
    c.text('0', 0, 68, { size: 12.5, color: GRAY, weight: '500' });
    c.text('SEP', 0, 85, { size: 12.5, color: DIM, weight: '500' });
    for (let i = 0; i <= 24; i++) g.line(30 + i * 6.8, 24, 30 + i * 6.8, 86).stroke({ width: 0.8, color: 0x1f1f21 });
    g.line(30, 46, 192, 46).stroke({ width: 1, color: 0x8e8e93, alpha: 0.7, dash: [0, 2.6], cap: 'round' });
    const pts = [
        30, 70.7, 38, 68, 44, 66.6, 50, 66.2, 56, 67, 62, 65.8, 67, 61, 71, 54.5, 76, 51, 84, 50, 100, 49, 120, 48, 140,
        47, 160, 45.8, 170, 44, 178, 40.5, 186, 37.2, 192.3, 34.7,
    ];

    g.polyline(pts, { smooth: 'monotone', step: 1 }).stroke({
        width: 2.4,
        cap: 'round',
        gradient: linear(
            [
                [0, 0x30d158],
                [0.28, 0x30d158],
                [0.45, 0x8d8a52],
                [0.7, 0xc84f4a],
                [1, 0xff453a],
            ],
            { units: 'local', from: [30, 0], to: [192, 0] },
        ),
    });
    g.line(192.3, 25, 192.3, 31).stroke({ width: 1.3, color: W, dash: [2, 2] });
    g.line(192.3, 34.7, 192.3, 86).stroke({ width: 1.3, color: W });
    g.circle(192.3, 34.7, 2.4).fill(W);
    c.text('1', 33, 85, { size: 12.5, color: DIM, weight: '500' });
    c.text('7', 76, 85, { size: 12.5, color: GRAY, weight: '500' });
    c.text('13', 120, 85, { size: 12.5, color: GRAY, weight: '500' });
    c.text('TODAY', 189.5, 85, { size: 12.5, weight: '600', align: 'right' });
}

export default card(budget, { id: 's2-budget', name: 'Budget', size: [196, 88], style: STYLE });
