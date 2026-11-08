import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { axis, GRAY, osc, RED, vlines, W } from '../_sheets/kit5';
import { STYLE } from '../_sheets/style5';

/** Screen time. */
export function screenTime(c: Cx): void {
    const { g } = c;
    const purple = 0x7d7aff;

    I.hourglass(g, 5, 10.5, 13, purple);
    c.run(13, 17, [
        ['4.8', 17, purple, '600', 3],
        ['HRS', 12.5, purple, '600'],
    ]);
    let rx = c.text('87', 194, 17, { size: 17, weight: '500', align: 'right' }).x;

    I.arrow(g, rx - 6, 11, 12, W, 'up', 0.13);
    rx = c.text('3%', rx - 15, 17, { size: 17, color: RED, weight: '600', align: 'right' }).x;
    I.chevron(g, rx - 7, 11.5, 10, RED, 'up', 0.18);
    c.text('60M', 0, 34, { size: 12.5, color: GRAY, weight: '500' });
    c.text('0', 0, 50, { size: 12.5, color: GRAY, weight: '500' });
    I.arrow(g, 4, 63.5, 10, GRAY, 'up', 0.14);
    c.text('20', 9, 68, { size: 12.5, color: GRAY, weight: '500' });
    vlines(g, 31.3, 194, 6.5, 24, 72);
    g.line(31.3, 46.7, 194, 46.7).stroke({ width: 1.2, color: 0x6e6e73 });
    const above: [number, number][] = [
        [33.7, 38.7],
        [40.3, 42.7],
        [47, 40],
        [53.7, 44.7],
        [60.3, 34.7],
        [99, 36],
        [105.7, 31],
        [112.3, 44],
        [118.7, 38.5],
        [125.3, 33],
        [131.7, 41],
    ];
    const below: [number, number][] = [
        [36, 55.5],
        [49, 55.5],
        [55.5, 55.5],
        [95, 62.5],
        [101.3, 57],
        [114, 52.5],
        [120.3, 56],
        [133, 55.5],
        [139.7, 58],
    ];

    above.forEach(([x, y], i) => g.circle(x, y + osc(c.t, 1.2, i) * 0.7, 2.1).fill(purple));
    below.forEach(([x, y]) => g.circle(x, y, 2.1).fill(W));
    g.line(105.7, 46.7, 102.3, 65.7).stroke({ width: 1.6, color: RED });
    g.circle(105.7, 46.7, 2.6).fill(RED);
    g.circle(102.3, 65.7, 2.2).fill(RED);
    g.line(126.3, 25, 126.3, 60).stroke({ width: 1.6, color: W });
    g.circle(126.3, 46.7, 3.2).fill(W);
    axis(
        c,
        [
            ['6AM', 34],
            ['12PM', 74],
            ['6PM', 114],
            ['12AM', 154],
        ],
        82,
        [31.3, 72, 112, 152],
    );
}

export default card(screenTime, { id: 's5-screen-time', name: 'Screen time', size: [196, 88], style: STYLE });
