import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { axis, GRAY, osc, PI, stripes, W, WIND, windLines } from '../_sheets/kit3';
import { STYLE } from '../_sheets/style3';

/** Wind. */
export function wind(c: Cx): void {
    const { g } = c;
    const blue = 0x5ac8fa;
    const ticks = [31, 70, 109, 148];
    const sway = osc(c.t, 0.5) * 0.8;
    const pts = WIND.map((v, i) => (i % 2 ? v + sway * Math.sin(WIND[i - 1] * 0.2) : v));

    windLines(g, 6.5, 10.5, 15, blue);
    c.run(17, 16.5, [
        ['8', 16, blue, '600', 2],
        ['mph', 10.5, blue, '600', 5],
        ['SW', 16, W, '600'],
    ]);
    c.text('GUSTS: 19', 188, 16.5, { size: 13, color: GRAY, weight: '500', align: 'right' });
    stripes(g, 31, 188.3, 4, 33, 70, 0x1c1c1e);
    for (const x of ticks) g.line(x, 20, x, 70).stroke({ width: 1, color: 0x3a3a3c });
    axis(
        c,
        [
            ['0', ticks[0] + 3.5],
            ['6 AM', ticks[1] + 3.5],
            ['12', ticks[2] + 3.5],
            ['6 PM', ticks[3] + 3.5],
        ],
        31.5,
    );
    c.text('15', 3, 49, { size: 11.5, color: GRAY, weight: '500' });
    c.text('0', 3, 67, { size: 11.5, color: GRAY, weight: '500' });
    g.polyline(pts, { smooth: 'monotone' }).stroke({ width: 7, color: blue, alpha: 0.22, blur: 3.5 });
    g.polyline(pts, { smooth: 'monotone' }).stroke({ width: 1.7, color: blue, cap: 'round' });
    g.circle(122.7, pts[pts.indexOf(122.7) + 1], 2.1).fill(W);
    c.text('GUSTS', 3, 83, { size: 8.5, color: GRAY, weight: '700' });
    [
        [40.5, 0, '18'],
        [79.5, 0, '14'],
        [118, PI / 4, '19'],
        [158, PI / 4, '17'],
    ].forEach(([ax, rot, n]) => {
        I.navArrow(g, ax as number, 79, 11, W, rot as number);
        c.text(n as string, (ax as number) + 28, 83.5, { size: 12, weight: '500', align: 'right' });
    });
}

export default card(wind, { id: 's3-wind', name: 'Wind', size: [192, 88], style: STYLE });
