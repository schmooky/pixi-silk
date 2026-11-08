import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { RED, W } from '../_sheets/kit5';
import { STYLE } from '../_sheets/style5';

/** Time in zone. */
export function zone2(c: Cx): void {
    const { g } = c;
    const teal = 0x3de0c0;
    const x = c.run(0, 16.5, [['49:27', 16.5, 0xffd60a, '600']]);

    I.clockOutline(g, x + 8, 10.5, 11.5, 0xffd60a);
    const x2 = c.run(x + 18, 16.5, [
        ['156', 16.5, RED, '600', 2],
        ['BPM', 10, W, '700', 3],
    ]);

    g.heart(x2 + 6, 11, 11, 0.08).fill(RED);
    I.runner(g, 186, 10.5, 14, 0x30d158);
    g.roundRect(8, 22.3, 166, 55, 11).fill(0x0a2723).stroke({ width: 1.3, color: 0x1f5a4f, alignment: 'inside' });
    c.run(
        168,
        36,
        [
            ['142-158', 14.5, W, '600', 3],
            ['BPM', 10.5, W, '700'],
        ],
        'right',
    );
    const secs = 25 * 60 + 27 + Math.floor(Math.max(0, c.t - 3));

    c.text(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, 16, 70, {
        size: 20.5,
        color: teal,
        weight: '500',
    });
    c.text('TIME IN ZONE 2', 168, 68, { size: 11, color: teal, weight: '700', align: 'right' });
    g.pill(0, 31, 3.2, 38).fill(0x2f5f9f);
    [0x6a7a1a, 0xa05a10, 0x8a1a2a].forEach((col, i) => g.pill(180 + i * 5, 31, 3.2, 38).fill(col));
}

export default card(zone2, { id: 's5-zone', name: 'Time in zone', size: [196, 88], style: STYLE });
