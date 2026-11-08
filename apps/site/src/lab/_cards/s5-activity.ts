import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { axis, DIM, W } from '../_sheets/kit5';
import { STYLE } from '../_sheets/style5';

/** Activity rows. */
export function activityRows(c: Cx): void {
    const { g } = c;
    const pink = 0xff375f;
    const lime = 0xb8f03a;
    const cyan = 0x5ae0e0;

    c.run(0, 17, [
        ['399', 17, pink, '500', 3],
        ['kcal', 12.5, W, '700', 8],
        ['38', 17, lime, '500', 3],
        ['min', 12.5, W, '700', 8],
        ['8', 17, cyan, '500', 3],
        ['hr', 12.5, W, '700'],
    ]);
    for (const x of [24, 65.7, 107.3, 149, 190.7]) g.line(x, 20, x, 86).stroke({ width: 1, color: 0x2c2c2e });
    I.arrow(g, 7, 28, 10, pink, 'right', 0.15);
    I.chevron(g, 5, 46, 7, lime, 'right', 0.2);
    I.chevron(g, 9, 46, 7, lime, 'right', 0.2);
    I.arrow(g, 7, 64.3, 10, cyan, 'up', 0.15);
    g.pill(22.3, 26, 170, 4).fill(0x3d0f1e);
    g.pill(22.3, 44, 170, 4).fill(0x2c3d10);
    g.pill(22.3, 62.3, 170, 4).fill(0x103535);
    for (const [a, b] of [
        [69, 79],
        [84, 122.3],
        [133.3, 140.7],
        [145.7, 189],
    ])
        g.pill(a, 26, b - a, 4).fill(pink);
    for (const [a, b] of [
        [68, 79],
        [119, 127.3],
    ])
        g.pill(a, 43.6, b - a, 4.8).fill(lime);
    for (const x of [90, 96.3, 113, 138]) g.circle(x, 46, 2.3).fill(lime);
    const lit = [89, 100, 110.7, 122.3, 130.7, 138, 145.7, 153.3, 160.7, 186.7];

    lit.forEach((x, i) =>
        g.circle(x, 64.3, 2.3).fill({ color: cyan, alpha: 0.75 + 0.25 * Math.cos((c.t - 3) * 2 + i) }),
    );
    for (const x of [168, 175.7]) g.circle(x, 64.3, 2.3).fill(0x1d6b6b);
    axis(
        c,
        [
            ['00', 27, DIM],
            ['06', 69],
            ['12', 111],
            ['18', 153],
        ],
        83,
    );
}

export default card(activityRows, { id: 's5-activity', name: 'Activity rows', size: [196, 88], style: STYLE });
