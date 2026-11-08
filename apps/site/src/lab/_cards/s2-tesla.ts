import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { GRAY, osc, PI, W } from '../_sheets/kit2';
import { STYLE } from '../_sheets/style2';

/** Car battery. */
export function tesla(c: Cx): void {
    const { g } = c;

    c.text('Tesla Model 3', 0, 16.5, { size: 17, weight: '600' });
    c.text('17M AGO', 193, 16.5, { size: 13.5, color: GRAY, weight: '500', align: 'right' });
    const cx = 27;
    const cy = 50.7;
    const sweep = ((165 * PI) / 180) * (1 + 0.03 * osc(c.t, 0.6));

    g.circle(cx, cy, 20.5).stroke({ width: 5, color: 0x2c2c2e });
    g.arcSweep(cx, cy, 20.5, PI * 0.75, sweep).stroke({ width: 5, color: 0x30d158, cap: 'round' });
    const e = PI * 0.75 + sweep;

    g.circle(cx + Math.cos(e) * 20.5, cy + Math.sin(e) * 20.5, 1.8).fill(W);
    c.run(
        cx,
        57,
        [
            ['60', 21, W, '600', 1],
            ['%', 11, GRAY, '500'],
        ],
        'center',
    );
    I.batteryBolt(g, cx, 65.5, 11.5, 0x30d158);
    g.pill(39.3, 67.3, 51.7, 13.4).fill(W);
    c.text('256 mi', 65.2, 78.6, { size: 13, color: 0x000000, weight: '600', align: 'center' });
    g.line(66, 24, 66, 72).stroke({ width: 1, color: 0x2c2c2e });
    g.rect(88.7, 23, 27.3, 47).fill(0x0d3a1b);
    I.bolt(g, 102.3, 29.5, 9, 0x30d158);
    const hs = [
        0.6, 0.56, 0.52, 0.48, 0.74, 0.9, 0.93, 0.96, 0.78, 0.74, 0.62, 0.6, 0.62, 0.6, 0.57, 0.57, 0.52, 0.54, 0.52,
        0.49, 0.47, 0.45, 0.52,
    ];

    hs.forEach((h, i) => {
        const x = 69 + i * 5.35;
        const hh = 40 * h * (1 + 0.03 * osc(c.t, 2, i));

        g.rect(x, 70 - hh, 2.7, hh).fill(i % 4 === 3 ? 0x1f8a3c : 0x30d158);
    });
    c.text('100%', 192, 36.5, { size: 12.5, color: GRAY, weight: '500', align: 'right' });
    c.run(
        192,
        83,
        [
            ['10AM TO', 12.5, GRAY, '500', 4],
            ['NOW', 12.5, W, '600'],
        ],
        'right',
    );
}

export default card(tesla, { id: 's2-tesla', name: 'Car battery', size: [196, 88], style: STYLE });
