import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { GRAY, osc, W } from '../_sheets/kit3';
import { STYLE } from '../_sheets/style3';

/** UV index. */
export function uvWeek(c: Cx): void {
    const { g } = c;
    const green = 0x30d158;
    const orange = 0xff9f0a;
    const xs = [30, 54, 78, 101.7, 125.7, 149.7, 173.7];
    const fills = [
        [57, green],
        [55, green],
        [44, orange],
        [55, green],
        [55, green],
        [44, orange],
        [53, green],
    ] as const;

    I.navArrow(g, 8, 10.5, 14, green);
    c.text('UVI5', 19, 17, { size: 16, color: green, weight: '600' });
    c.text('MODERATE', 61, 17, { size: 16, weight: '500' });
    c.text('11', 3, 33, { size: 11.5, color: GRAY, weight: '500' });
    c.text('0', 3, 68, { size: 11.5, color: GRAY, weight: '500' });
    for (const x of [42, 66, 90, 114, 138, 162, 186]) g.line(x, 22, x, 70).stroke({ width: 1, color: 0x1f1f21 });
    xs.forEach((x, i) => {
        const [top, col] = fills[i];

        g.pill(x - 2.6, 27, 5.2, 38.5).fill(0x2c2c2e);
        g.pill(x - 2.6, top + osc(c.t, 0.6, i) * 0.8, 5.2, 64 - top).fill(col);
    });
    g.circle(30, 50, 2.1).fill(W).stroke({ width: 1.2, color: 0x000000, alignment: 'outside' });
    g.circle(30, 55.5, 1.8).fill(W).stroke({ width: 1.2, color: 0x000000, alignment: 'outside' });
    ['S', 'S', 'M', 'T', 'W', 'T', 'F'].forEach((d, i) =>
        c.text(d, xs[i], 81, { size: 12, color: i === 0 ? W : GRAY, weight: i === 0 ? '700' : '500', align: 'center' }),
    );
}

export default card(uvWeek, { id: 's3-uv', name: 'UV index', size: [192, 88], style: STYLE });
