import { vertical } from 'pixi-silk';
import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { GRAY, osc, RED, W } from '../_sheets/kit5';
import { STYLE } from '../_sheets/style5';

export function cycling(c: Cx): void {
    const { g } = c;

    g.roundRect(26, 1, 30, 20, 10).fill(0x16300d);
    g.roundRect(18, 1, 30, 20, 10).fill(0x2f5a1a);
    g.roundRect(0.7, 0.7, 40, 19.6, 9.8).fill(0xa8e63c);
    I.bike(g, 20.5, 11.5, 15, 0x000000, true);
    const x = c.run(63, 16.5, [
        ['156', 17, RED, '600', 2],
        ['BPM', 10.5, W, '700', 3],
    ]);

    g.heart(x + 6, 11.2, 11.5, 0.08).fill(RED);
    c.text('32:38', 194, 16.5, { size: 17, color: 0xffd60a, weight: '600', align: 'right' });
    c.text('128', 0, 33, { size: 12.5, color: GRAY, weight: '500' });
    c.text('HEART', 0, 45, { size: 10.5, color: RED, weight: '700' });
    c.text('RATE', 0, 57, { size: 10.5, color: RED, weight: '700' });
    c.text('104', 0, 70, { size: 12.5, color: GRAY, weight: '500' });
    for (const vx of [45, 82.3, 119, 156.3, 194]) g.line(vx, 24, vx, 86).stroke({ width: 1, color: 0x2c2c2e });
    g.line(45, 70.7, 194, 70.7).stroke({ width: 1, color: 0x3a3a3c });
    const steps: [number, number, number][] = [
        [45, 60, 47.3],
        [60, 65.7, 46.3],
        [65.7, 82.3, 44.7],
        [82.3, 95.7, 42.7],
        [95.7, 111.3, 39],
        [111.3, 120, 42.7],
        [120, 143.3, 46.3],
        [143.3, 156.7, 49],
        [156.7, 163, 44.7],
        [163, 177.3, 42.7],
        [177.3, 189, 46.3],
    ];

    steps.forEach(([x0, x1, y], i) => {
        const yy = y + osc(c.t, 1.1, i) * 0.8;

        g.rect(x0, yy, x1 - x0, 70.7 - yy).fill(
            vertical([
                [0, 0x6b0d0d, 0.95],
                [1, 0x2a0505, 0.6],
            ]),
        );
        g.rect(x0, yy - 1.1, x1 - x0, 2.2).fill(0xff3b30);
    });
    g.circle(191.5, 46.3, 3.1).fill(0x000000).stroke({ width: 1.6, color: 0xff3b30 });
    c.text('30 MINS AGO', 48, 83.5, { size: 12.5, color: GRAY, weight: '500' });
    c.text('NOW', 188, 83.5, { size: 12.5, weight: '700', align: 'right' });
}

export default card(cycling, { id: 's5-cycling', name: 'Cycling heart rate', size: [196, 88], style: STYLE });
