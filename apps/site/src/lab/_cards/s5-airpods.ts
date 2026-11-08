import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { GRAY, osc, PI, W } from '../_sheets/kit5';
import { STYLE } from '../_sheets/style5';

/** Find AirPods. */
export function airpods(c: Cx): void {
    const { g } = c;

    c.text('20 FT', 0, 17, { size: 16.5, color: 0x30d158, weight: '600' });
    c.run(
        194,
        17,
        [
            ['TO YOUR', 15.5, GRAY, '600', 4],
            ['RIGHT', 15.5, W, '700'],
        ],
        'right',
    );
    c.text('yuhang’s AirPods Max', 0, 42.5, { size: 19, weight: '500' });
    g.circle(15.3, 64, 15).fill(0x2c2c2e);
    I.headphones(g, 15.3, 63, 15, 0xc7c7cc);
    c.text('5M AGO', 42, 60.5, { size: 14.5, color: GRAY, weight: '600' });
    g.roundRect(42.5, 65, 14, 7, 2).stroke({ width: 1.1, color: W, alignment: 'inside' });
    g.roundRect(44.3, 66.8, 7.5, 3.4, 1).fill(W);
    g.roundRect(57, 67.3, 1.4, 2.6, 0.7).fill(W);
    const cx = 150.7;
    const cy = 86;
    const aim = -0.8 + osc(c.t, 0.5) * 0.08;

    g.arcSweep(cx, cy, 40, PI, PI).stroke({ width: 8, color: 0x3a3a3c });
    g.arcSweep(cx, cy, 40, -1.6, aim + 1.6).stroke({ width: 8, color: 0x6e6e73 });
    g.circle(cx + Math.cos(-1.6) * 40, cy + Math.sin(-1.6) * 40, 3.4).fill(0x8e8e93);
    g.circle(cx + Math.cos(aim) * 40, cy + Math.sin(aim) * 40, 3.6).fill(W);
    g.moveTo(143, 88).quadraticCurveTo(145, 71, 164, 67).stroke({ width: 2.6, color: W, cap: 'round' });
    g.polyline([158.5, 64.5, 166, 66.5, 161, 72.5]).stroke({ width: 2.6, color: W, cap: 'round' });
}

export default card(airpods, { id: 's5-airpods', name: 'Find AirPods', size: [196, 88], style: STYLE });
