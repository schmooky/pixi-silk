import { vertical } from 'pixi-silk';
import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { GRAY, W } from '../_sheets/kit2';
import { STYLE } from '../_sheets/style2';

/** Sun altitude. */
export function sunAltitude(c: Cx): void {
    const { g } = c;
    let x = c.run(0, 16.5, [['10:07', 17, W, '600']]);

    I.circledArrow(g, x + 9, 10.5, 12.5, 'up');
    x = c.run(x + 18, 16.5, [['0°N', 17, W, '600']]);
    c.run(
        192,
        16.5,
        [
            ['ALTITUDE', 11.5, W, '500', 5],
            ['-56°', 17, W, '600'],
        ],
        'right',
    );
    g.rect(3, 28, 188, 44).fill(
        vertical([
            [0, 0x0a2a55, 0],
            [0.42, 0x0a2a55, 0.95],
            [0.6, 0x082347, 0.85],
            [1, 0x082347, 0],
        ]),
    );
    g.line(2.7, 24, 2.7, 86).stroke({ width: 1, color: 0x2a3140 });
    g.line(191, 24, 191, 86).stroke({ width: 1, color: 0x2a3140 });
    for (const vx of [49.3, 96, 142.7]) g.line(vx, 38, vx, 70).stroke({ width: 1, color: 0x2a3548 });
    g.line(2.7, 46.7, 191, 46.7).stroke({ width: 1.2, color: 0x9fb2cf });
    c.text('239° WSW', 7, 33.5, { size: 12, color: GRAY, weight: '500' });
    c.text('115° ESE', 187, 33.5, { size: 12, color: GRAY, weight: '500', align: 'right' });
    for (let i = 0; i <= 26; i++) {
        const dx = 29 + (i / 26) * 135;
        const u = (dx - 96.5) / 67.5;

        g.circle(dx, 68 - 25 * u * u, 0.95).fill(W);
    }
    c.text('SET 02:08', 0, 84.5, { size: 12.5, weight: '600' });
    c.text('RISE 17:45', 192, 84.5, { size: 12.5, weight: '600', align: 'right' });
}

export default card(sunAltitude, { id: 's2-sun', name: 'Sun altitude', size: [196, 88], style: STYLE });
