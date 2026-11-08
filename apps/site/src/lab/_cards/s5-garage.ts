import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { axis, RED } from '../_sheets/kit5';
import { STYLE } from '../_sheets/style5';

export function garage(c: Cx): void {
    const { g } = c;

    g.roundRect(0.7, 6.7, 49.3, 44, 9).fill(0x2c2c2e);
    g.rect(16, 13, 19, 32).stroke({ width: 2.2, color: 0x0a84ff, alignment: 'inside' });
    g.rect(18.7, 15.7, 13.6, 29.3).fill(0xd1d1d6);
    g.circle(29, 31, 1.1).fill(0x3a3a3c);
    g.roundRect(0.7, 53.3, 49.3, 26.7, 8).fill(0x3a3414);
    I.lock(g, 22, 66, 14, 0xd1d1d6);
    I.warning(g, 31.5, 70.5, 9, 0xffd60a);
    c.text('Garage Door', 60, 24, { size: 15, color: 0x98989d, weight: '500' });
    c.text('Closed', 194, 24, { size: 15.5, weight: '600', align: 'right' });
    c.text('Detected', 60, 44.5, { size: 15, color: 0x98989d, weight: '500' });
    c.text('5', 194, 44.5, { size: 16, weight: '600', align: 'right' });
    g.rect(59, 49, 113.3, 16.7).stroke({ width: 1, color: 0x3a3a3c });
    for (let x = 62; x < 171; x += 4.9) g.line(x, 55, x, 59.5).stroke({ width: 1.2, color: 0xd1d1d6 });
    for (const x of [109, 145.7]) g.line(x, 55, x, 59.5).stroke({ width: 1.4, color: 0x5ac8fa });
    const hit = Math.floor((((c.t - 3) * 0.8) % 5) + 5) % 5;

    [113.3, 117.7, 132.3, 136.7, 141].forEach((x, i) =>
        g.line(x, 50, x, 65).stroke({ width: 1.7, color: RED, alpha: i === hit ? 1 : 0.85 }),
    );
    c.text('>3', 194, 63, { size: 17, color: RED, weight: '600', align: 'right' });
    c.text('MINS', 194, 82, { size: 12.5, color: RED, weight: '600', align: 'right' });
    axis(
        c,
        [
            ['13', 62],
            ['14', 84],
            ['15', 107],
            ['16', 129],
        ],
        82,
    );
}

export default card(garage, { id: 's5-garage', name: 'Garage door', size: [196, 88], style: STYLE });
