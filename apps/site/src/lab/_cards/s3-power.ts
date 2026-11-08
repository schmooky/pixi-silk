import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { GRAY, osc, PALE, POWER_FILL } from '../_sheets/kit3';
import { STYLE } from '../_sheets/style3';

/** Cycling power. */
export function cyclingPower(c: Cx): void {
    const { g } = c;
    const lime = 0x9be15d;
    const pts: number[] = [];

    I.bike(g, 8, 10.5, 15, lime, true);
    c.run(17, 17, [
        ['235', 16.5, lime, '600', 2],
        ['W', 10.5, lime, '600', 7],
        ['31:47', 16.5, PALE, '600'],
    ]);
    c.text('NEXT', 176, 16.5, { size: 11.5, color: GRAY, weight: '600', align: 'right' });
    I.runner(g, 183, 10.5, 12, GRAY);
    c.text('275', 0, 33, { size: 11.5, color: GRAY, weight: '500' });
    c.text('AVERAGE', 2, 44.5, { size: 9, color: lime, weight: '700' });
    c.text('POWER', 2, 54.5, { size: 9, color: lime, weight: '700' });
    c.text('180', 0, 68, { size: 11.5, color: GRAY, weight: '500' });
    for (const x of [45, 80, 116.7, 153.3]) g.line(x, 24, x, 70).stroke({ width: 1, color: 0x2c2c2e });
    g.line(45, 66.7, 188.3, 66.7).stroke({ width: 1, color: 0x3a3a3c });
    for (let x = 46; x <= 188; x += 2.4) {
        const y =
            48 -
            4 * Math.sin(x * 0.07 + 0.6) +
            2 * Math.sin(x * 0.23) +
            1.5 * Math.cos(x * 0.5) +
            osc(c.t, 1.1, x * 0.1) * 0.5;

        pts.push(x, y);
    }
    g.area(pts, 66.7).fill(POWER_FILL);
    for (let i = 0; i < pts.length; i += 2) g.circle(pts[i], pts[i + 1], 1).fill(0xd9f99d);
    c.text('30 MINS AGO', 47, 81, { size: 12, color: GRAY, weight: '600' });
    c.text('NOW', 188, 81, { size: 12, weight: '700', align: 'right' });
}

export default card(cyclingPower, { id: 's3-power', name: 'Cycling power', size: [192, 88], style: STYLE });
