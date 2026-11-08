import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { GRAY, osc, PI, W } from '../_sheets/kit2';
import { STYLE } from '../_sheets/style2';

export function pillsMatrix(c: Cx): void {
    const { g } = c;
    const purple = 0x6a67f0;

    I.pills(g, 7, 10.5, 13.5, purple);
    c.run(15, 16.5, [
        ['6', 17.5, purple, '600', 1],
        ['/30', 12.5, GRAY, '500'],
    ]);
    c.text('TIMES', 73, 15.5, { size: 13, weight: '600' });
    const xs = [2.3, 19, 35.7, 52.7, 69.7, 86.7, 103.3];
    const ys = [26.3, 38.3, 50.7, 63, 75.7];
    const data = [
        [0, 0, 0, 2, 3, 1, 1],
        [3, 2, 2, 2, 1, 1, 1],
        [1, 1, 1, 1, 3, 3, 1],
        [1, 2, 2, 4, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1],
    ];

    data.forEach((row, r) =>
        row.forEach((v, i) => {
            const x = xs[i];
            const y = ys[r];

            if (v === 1) g.circle(x, y, 3.1).fill(0x2a2a2c);
            else if (v === 2) g.circle(x, y, 3.2).fill(purple);
            else if (v === 3) g.circle(x, y, 2.7).stroke({ width: 1.2, color: purple });
            else if (v === 4) g.circle(x, y, 3.2).fill(W);
        }),
    );
    const dx = 155;
    const dy = 40.7;

    g.circle(dx, dy, 36).fill(0x1c1c1e);
    for (let i = 0; i < 24; i++) {
        const a = (i / 24) * PI * 2;

        if (i % 6 === 0) continue;
        g.line(dx + Math.cos(a) * 31, dy + Math.sin(a) * 31, dx + Math.cos(a) * 34, dy + Math.sin(a) * 34).stroke({
            width: 1,
            color: 0xd1d1d6,
        });
    }
    c.text('24', dx, dy - 21.5, { size: 12.5, weight: '600', align: 'center' });
    c.text('06', dx + 27, dy + 4.5, { size: 12.5, weight: '600', align: 'center' });
    c.text('12', dx, dy + 31, { size: 12.5, weight: '600', align: 'center' });
    c.text('18', dx - 27, dy + 4.5, { size: 12.5, weight: '600', align: 'center' });
    for (const a of [151, 120, 29])
        g.circle(dx + Math.cos((a * PI) / 180) * 32.5, dy + Math.sin((a * PI) / 180) * 32.5, 2.4).fill(purple);
    g.circle(dx, dy, 16.5).fill(0x000000);
    const ha = (45 * PI) / 180 + osc(c.t, 0.1) * 0.02;

    g.line(dx, dy, dx + Math.cos(ha) * 17, dy + Math.sin(ha) * 17).stroke({ width: 2.4, color: W, cap: 'round' });
    g.circle(dx, dy, 3.2).fill(W);
}

export default card(pillsMatrix, { id: 's2-pills', name: 'Pills', size: [196, 88], style: STYLE });
