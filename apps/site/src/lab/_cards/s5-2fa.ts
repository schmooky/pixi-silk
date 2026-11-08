import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import { googleG, PI, W } from '../_sheets/kit5';
import { STYLE } from '../_sheets/style5';

/** One-time code. */
export function twoFactor(c: Cx): void {
    const { g } = c;

    g.roundRect(1, 1, 22.5, 22.5, 5.5, 0.6).fill(W);
    googleG(g, 12.2, 12.2, 6.3);
    c.text('Google.com', 29, 18, { size: 17.5, weight: '600' });
    const p = 0.62 - (((((c.t - 3) / 30) % 1) + 1) % 1) * 0.62;

    c.text('12', 171, 17, { size: 16.5, color: 0x6e6cf5, weight: '500', align: 'right' });
    g.circle(185.3, 11.2, 6.2).stroke({ width: 4, color: 0x1c1c3a });
    g.arcSweep(185.3, 11.2, 6.2, -PI / 2, PI * 2 * Math.max(0.02, p)).stroke({ width: 4, color: 0x6e6cf5 });
    c.text('7luyuhang@gmail.com', 0, 43, { size: 16, weight: '500' });
    const x = c.run(0, 77.5, [['197', 30, 0x6e6cf5, '500', 5]]);

    g.circle(x + 2.5, 66.5, 1.9).fill(0x6e6e73);
    c.run(x + 10, 77.5, [['072', 30, 0x6e6cf5, '500']]);
}

export default card(twoFactor, { id: 's5-2fa', name: 'One-time code', size: [196, 88], style: STYLE });
