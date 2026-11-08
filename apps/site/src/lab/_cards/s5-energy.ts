import { vertical } from 'pixi-silk';
import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { axis, DIM, GRAY, osc, W } from '../_sheets/kit5';
import { STYLE } from '../_sheets/style5';

export function energy(c: Cx): void {
    const { g } = c;
    const green = 0x30d158;

    g.circle(6, 10.5, 6).stroke({ width: 1.4, color: green });
    I.bolt(g, 6, 10.5, 8, green);
    c.run(15, 17, [
        ['24.9', 17, green, '600', 3],
        ['hrs', 12.5, green, '600'],
    ]);
    c.run(88, 17, [
        ['49', 17, W, '600', 3],
        ['kWh', 12.5, W, '600'],
    ]);
    c.text('£398.2', 194, 17, { size: 17, color: green, weight: '600', align: 'right' });
    c.text('20', 0, 33, { size: 12.5, color: GRAY, weight: '500' });
    c.text('kWh', 0, 46, { size: 12.5, color: GRAY, weight: '500' });
    c.text('100', 0, 67.7, { size: 12.5, color: GRAY, weight: '500' });
    c.text('£', 0, 82, { size: 12.5, color: GRAY, weight: '500' });
    for (let x = 30.7; x <= 194; x += 6.8) g.line(x, 24, x, 72).stroke({ width: 0.8, color: 0x3a3a3c, dash: [1, 2.2] });
    const white: [number, number, number][] = [
        [30.7, 52, 38.3],
        [72.3, 100, 30],
        [100, 132.3, 36.3],
        [132.3, 194, 33.3],
    ];
    const greens: [number, number, number][] = [
        [30.7, 52, 54],
        [72.3, 100, 54],
        [100, 132.3, 64],
        [132.3, 194, 58],
    ];

    for (const [x0, x1, y] of white) {
        g.rect(x0, y, x1 - x0, 46.3 - y).fill(
            vertical([
                [0, 0xffffff, 0.3],
                [1, 0xffffff, 0.02],
            ]),
        );
        g.line(x0, y, x1, y).stroke({ width: 1.8, color: 0xe5e5ea });
    }
    for (const [x0, x1, y] of greens) {
        g.rect(x0, 46.3, x1 - x0, y - 46.3).fill(
            vertical([
                [0, green, 0.05],
                [1, green, 0.35],
            ]),
        );
        g.line(x0, y, x1, y).stroke({ width: 1.8, color: green });
    }
    g.line(30.7, 46.3, 194, 46.3).stroke({ width: 1.1, color: 0xd1d1d6 });
    const cx = 146.3 + osc(c.t, 0.25) * 6;

    g.line(cx, 25, cx, 72).stroke({ width: 1.5, color: W });
    g.circle(cx, 46.3, 3.3).fill(W);
    axis(
        c,
        [
            ['00', 36.7, DIM],
            ['06', 78],
            ['12', 118],
            ['18', 159],
        ],
        82,
        [30.7, 72.3, 113.3, 154.7],
    );
}

export default card(energy, { id: 's5-energy', name: 'Energy & cost', size: [196, 88], style: STYLE });
