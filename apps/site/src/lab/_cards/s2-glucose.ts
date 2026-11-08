import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { GRAY, W } from '../_sheets/kit2';
import { STYLE } from '../_sheets/style2';

/** Glucose. */
export function glucose(c: Cx): void {
    const { g } = c;

    I.drop(g, 5, 10.5, 13, 0xff3b30, true);
    const x = c.run(13, 16.5, [
        ['150', 17, W, '600', 4],
        ['mg/dL', 12.5, W, '600'],
    ]);

    I.circledArrow(g, x + 13, 10.5, 13, 'right');
    g.rect(0, 22.3, 193, 18.4).fill(0x2e2805);
    g.line(0, 40.7, 193, 40.7).stroke({ width: 1.3, color: 0xe6cf6e });
    g.rect(0, 59, 193, 10).fill(0x360b0b);
    g.line(0, 59, 193, 59).stroke({ width: 1.3, color: 0xd63a3a });
    for (const vx of [36.7, 73.7, 111]) g.line(vx, 22, vx, 86).stroke({ width: 1, color: 0x2c2c2e });
    c.text('240', 190, 36.5, { size: 13, color: 0xf5d04a, weight: '600', align: 'right' });
    c.text('40', 190, 54, { size: 13, color: 0xff453a, weight: '600', align: 'right' });
    for (let dx = 2; dx < 146; dx += 3.1) {
        const y = 50.3 + 1.4 * Math.sin(dx * 0.16 + c.t * 0.3) - 11.5 * Math.exp(-(((dx - 71) / 4.2) ** 2));

        g.circle(dx, y, 0.95).fill(y < 40.7 ? 0xf5d04a : W);
    }
    g.line(147, 22, 147, 84).stroke({ width: 1.6, color: W });
    c.text('1', 31, 84.5, { size: 12.5, color: GRAY, weight: '500', align: 'center' });
    c.text('2', 68.7, 84.5, { size: 12.5, color: GRAY, weight: '500', align: 'center' });
    c.text('3', 104.3, 84.5, { size: 12.5, color: GRAY, weight: '500', align: 'center' });
    c.text('NOW', 131.7, 84.5, { size: 12.5, weight: '600', align: 'center' });
    c.text('hrs', 181, 84.5, { size: 12.5, color: GRAY, weight: '500', align: 'center' });
}

export default card(glucose, { id: 's2-glucose', name: 'Glucose', size: [196, 88], style: STYLE });
