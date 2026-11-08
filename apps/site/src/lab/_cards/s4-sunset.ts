import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import { osc, SUN_DUSK, SUN_NOW, SUN_SET, W } from '../_sheets/kit4';
import { STYLE } from '../_sheets/style4';

export function sunset(c: Cx): void {
    const { g } = c;
    const gray = 0x727272;
    const sun = 48 + osc(c.t, 0.1) * 6;

    c.text('Now', 31, 35, { size: 11.5, weight: '400' });
    c.text('Sunset', 148, 35, { size: 11.5, color: gray, weight: '500', align: 'center' });
    c.text('Dusk', 216.5, 35, { size: 11.5, color: gray, weight: '500', align: 'center' });
    g.pill(21.5, 45, 99, 33.5).fill(SUN_NOW);
    g.pill(125.5, 45, 46, 33.5).fill(SUN_SET);
    g.pill(176.5, 45, 80, 33.5).fill(SUN_DUSK);
    g.circle(sun, 61.5, 11).fill({ color: W, alpha: 0.45, blur: 3 });
    g.circle(sun, 61.5, 8.5).fill(W);
    for (const [x, y, r] of [
        [232, 57, 1.1],
        [243, 60, 0.8],
        [237, 66.5, 0.9],
        [250, 55, 0.8],
        [247, 70, 1],
        [226, 70, 0.7],
    ])
        g.circle(x, y, r).fill({ color: W, alpha: 0.9 });
    c.text('5:50 PM', 30, 97, { size: 11.5, weight: '400' });
    c.text('in 57m', 148, 97, { size: 11.5, color: gray, weight: '500', align: 'center' });
    c.text('8:12', 216, 97, { size: 11.5, color: gray, weight: '500', align: 'center' });
}

export default card(sunset, { id: 's4-sunset', name: 'Sunset', size: [282, 123], style: STYLE });
