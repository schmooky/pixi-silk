import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { GOLDEN_BAR, KNOB_GLOW, osc, W } from '../_sheets/kit3';
import { STYLE } from '../_sheets/style3';

export function goldenTime(c: Cx): void {
    const { g } = c;
    const orange = 0xf0a060;
    const dx = 95.7 + osc(c.t, 0.2) * 3;

    I.sunIcon(g, 6.5, 10.5, 14, orange);
    c.text('19:52', 15, 16, { size: 16.5, color: orange, weight: '600', spacing: 0.6 });
    c.text('GOLDEN TIME', 67, 16, { size: 11.5, color: orange, weight: '600' });
    g.ellipse(dx, 38, 18, 12).fill(KNOB_GLOW);
    g.pill(2.3, 28, 186.7, 5.5).fill(GOLDEN_BAR);
    g.circle(dx, 30.7, 12).fill({ color: 0x000000, alpha: 0.85, blur: 4 });
    g.circle(dx, 30.7, 3.8).fill(W).stroke({ width: 1.4, color: 0x000000, alignment: 'outside' });
    g.circle(168, 30.7, 3.8).fill(0xc8b8a8).stroke({ width: 1.4, color: 0x000000, alignment: 'outside' });
    c.text('05:33', 3, 54, { size: 14.5, weight: '500' });
    c.text('20:40', 189, 54, { size: 14.5, color: orange, weight: '500', align: 'right' });
    c.text('DAYLIGHT', 3, 76, { size: 14, weight: '500' });
    c.run(
        188,
        76,
        [
            ['15', 14.5, W, '500', 1],
            ['HRS', 10, W, '600', 4],
            ['8', 14.5, W, '500', 1],
            ['MIN', 10, W, '600'],
        ],
        'right',
    );
}

export default card(goldenTime, { id: 's3-golden-time', name: 'Golden time', size: [192, 88], style: STYLE });
