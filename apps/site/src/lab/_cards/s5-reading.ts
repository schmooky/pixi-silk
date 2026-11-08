import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { PI, W } from '../_sheets/kit5';
import { STYLE } from '../_sheets/style5';

/** Reading goal. */
export function reading(c: Cx): void {
    const { g } = c;
    const purple = 0x7d7aff;
    const xs = [4, 26.7, 49, 71.7, 94, 116.7, 139];
    const ys = [9, 25.7, 40.7, 56.3, 72.3];
    const rows = [
        ['_', '_', '_', 'f', 'q.5', 'd', 'd'],
        ['q.75', 'f', 'f', 'f', 'd', 'd', 'd'],
        ['d', 'd', 'd', 'd', 'q.25', 'r.8', 'd'],
        ['d', 'f', 'f', 'w', 'h', 'h', 'h'],
        ['h', 'h', 'h', 'h', 'h', '_', '_'],
    ];

    g.line(xs[1], ys[1], xs[3], ys[1]).stroke({ width: 2.4, color: purple });
    g.line(xs[1], ys[3], xs[2], ys[3]).stroke({ width: 2.4, color: purple });
    rows.forEach((row, r) =>
        row.forEach((v, i) => {
            const x = xs[i];
            const y = ys[r];
            const k = v[0];
            const f = Number(v.slice(1)) || 0;

            if (k === 'f') g.circle(x, y, 4.2).fill(purple);
            else if (k === 'd') g.circle(x, y, 4.2).fill(0x3a3a3c);
            else if (k === 'h') g.circle(x, y, 3.6).stroke({ width: 1.3, color: 0x48484a });
            else if (k === 'w') g.circle(x, y, 3.6).stroke({ width: 1.8, color: W });
            else if (k === 'q') {
                g.circle(x, y, 4.2).fill(0x3a3a3c);
                g.sector(x, y, 4.2, -PI / 2, -PI / 2 + f * PI * 2).fill(purple);
            } else if (k === 'r') {
                g.circle(x, y, 4.2).fill(0x3a3a3c);
                g.arcSweep(x, y, 3.5, -PI / 2, f * PI * 2).stroke({ width: 1.4, color: purple });
            }
        }),
    );
    g.roundRect(158, 4, 34.3, 53.3, 8, 0.6).fill(0x1d1d3a);
    I.book(g, 175.2, 17.5, 15, purple);
    I.checkCircle(g, 175.2, 40, 17, W);
    g.polyline([170.5, 40, 173.8, 43.3, 179.8, 36.8]).stroke({ width: 2, color: purple, cap: 'round' });
    c.text('22%', 194, 81, { size: 18, weight: '600', align: 'right' });
}

export default card(reading, { id: 's5-reading', name: 'Reading goal', size: [196, 88], style: STYLE });
