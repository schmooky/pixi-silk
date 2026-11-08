import { vertical } from 'pixi-silk';
import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { GRAY, osc, PI } from '../_sheets/kit2';
import { STYLE } from '../_sheets/style2';

/** Streak. */
export function streak(c: Cx): void {
    const { g } = c;
    const cx = 25.7;
    const cy = 30;
    const p = 0.83 + 0.04 * osc(c.t, 0.8);

    g.arcSweep(cx, cy, 23, PI * 0.75, PI * 1.5).stroke({ width: 5, color: 0x0e3a3b, cap: 'round' });
    g.arcSweep(cx, cy, 23, PI * 0.75, PI * 1.5 * p).stroke({ width: 5, color: 0x39d6d6, cap: 'round' });
    const e = PI * 0.75 + PI * 1.5 * p;

    g.circle(cx + Math.cos(e) * 23, cy + Math.sin(e) * 23, 3.3)
        .fill(0x39d6d6)
        .stroke({ width: 1.5, color: 0x000000, alignment: 'outside' });
    c.text('32', cx, 38, { size: 21, weight: '500', align: 'center' });
    I.meditation(g, cx, 49.5, 11, 0x39d6d6);
    c.text('STREAK', 0, 79.5, { size: 13, color: GRAY, weight: '500' });
    c.text('TODAY', 62, 14.5, { size: 13.5, color: GRAY, weight: '500' });
    c.text('2', 193, 14.5, { size: 15.5, weight: '600', align: 'right' });
    c.text('THIS WEEK', 62, 34.5, { size: 13.5, color: GRAY, weight: '500' });
    c.text('3/14', 193, 34.5, { size: 15.5, weight: '600', align: 'right' });
    for (let i = 0; i < 5; i++) g.line(62 + i * 33.7, 44.7, 62 + i * 33.7, 65.7).stroke({ width: 1, color: 0x2c2c2e });
    [49, 55.7, 50].forEach((y, i) => {
        const x0 = 62.5 + i * 33.7;

        g.rect(x0, y, 32.7, 65.7 - y).fill(
            vertical([
                [0, 0x0f4a4a, 0.9],
                [1, 0x0f4a4a, 0.1],
            ]),
        );
        g.line(x0 + 1, y, x0 + 31.7, y).stroke({ width: 1.8, color: 0x39d6d6 });
    });
    ['1W', '2W', '3W', '4W'].forEach((s, i) =>
        c.text(s, 62 + i * 33.7, 79.5, { size: 12.5, color: 0x6e6e73, weight: '500' }),
    );
}

export default card(streak, { id: 's2-streak', name: 'Streak', size: [196, 88], style: STYLE });
