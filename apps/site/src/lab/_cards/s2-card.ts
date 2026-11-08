import { vertical } from 'pixi-silk';
import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { GRAY, osc, W } from '../_sheets/kit2';
import { STYLE } from '../_sheets/style2';

/** Card spending. */
export function cardSpend(c: Cx): void {
    const { g } = c;

    I.creditCard(g, 6.5, 10.5, 11, W);
    c.text('$3,812', 17, 16.5, { size: 17, weight: '600' });
    c.text('**** 6753', 193, 16.5, { size: 15, color: GRAY, weight: '500', align: 'right' });
    I.transfer(g, 6, 30, 10, 0x98989d);
    I.suitcase(g, 6, 46.5, 11, 0x98989d);
    I.moreCircle(g, 6, 63, 11.5, 0x98989d);
    I.triangleDown(g, 6, 79.5, 9, 0x30d158);
    c.text('20%', 56, 34.5, { size: 13, color: GRAY, weight: '500', align: 'right' });
    c.text('16%', 56, 51, { size: 13, color: GRAY, weight: '500', align: 'right' });
    c.text('64%', 56, 68, { size: 13, color: GRAY, weight: '500', align: 'right' });
    c.text('$568', 56, 84.5, { size: 13, color: 0x30d158, weight: '600', align: 'right' });
    g.rect(64.7, 37, 128.3, 21).fill(
        vertical([
            [0, 0x0b2f60],
            [1, 0x0b2f60, 0],
        ]),
    );
    for (const vx of [64.7, 107.5, 150.3, 193])
        g.line(vx, 24, vx, 86).stroke({ width: 1, color: vx === 64.7 ? 0x3a3a3c : 0x222226 });
    c.text('$1.36K', 129, 34.5, { size: 12.5, color: GRAY, weight: '500', align: 'center' });
    g.line(64.7, 56.3, 193, 56.3).stroke({ width: 1.1, color: 0x9be38a, alpha: 0.6, dash: [0, 2.6], cap: 'round' });
    const bars: [number, number][] = [
        [76.7, 60.7],
        [103, 47.3],
        [128.3, 62.3],
        [154.7, 42.3],
        [180.7, 64],
    ];

    bars.forEach(([bx, top], i) => {
        const h = (69 - top) * (1 + 0.08 * osc(c.t, 1.2, i));

        g.roundRect(bx - 5, 69 - h, 10, h, 2).fill(0x0a84ff);
    });
    c.text('1-7', 76, 84.5, { size: 12.5, color: GRAY, weight: '500', align: 'center' });
    c.text('15-21', 130, 84.5, { size: 12.5, color: GRAY, weight: '500', align: 'center' });
    c.text('29-30', 172, 84.5, { size: 12.5, color: GRAY, weight: '500', align: 'center' });
}

export default card(cardSpend, { id: 's2-card', name: 'Card spending', size: [196, 88], style: STYLE });
