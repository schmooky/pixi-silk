import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import { W } from '../_sheets/kit4';
import { STYLE } from '../_sheets/style4';

/** Delivery. */
export function delivery(c: Cx): void {
    const { g } = c;
    const mint = 0x6ff0c8;

    c.text('STATUS', 24, 29, { size: 11, color: mint, weight: '600' });
    c.text('Out for delivery', 23, 48.5, { size: 19, color: mint, weight: '500' });
    c.text('ETA', 24, 71, { size: 10, weight: '600' });
    c.text('15-30 min', 23, 91, { size: 18.5, weight: '500' });
    g.roundRect(187.5, 14, 89, 91, 14, 0.3).fill(0x305b54);
    const rows = [14, 27.75, 49.6, 71.5, 90.25, 105];
    const streets = [[210, 235, 253.75], [207, 247.5], [203.75, 225.6, 260], [216, 241], [228]];

    for (const y of rows.slice(1, -1)) g.line(187.5, y, 276.5, y).stroke({ width: 1.4, color: 0x3d6e64 });
    streets.forEach((xs, i) =>
        xs.forEach((x) => g.line(x, rows[i], x, rows[i + 1]).stroke({ width: 1.4, color: 0x3d6e64 })),
    );
    g.polyline([212.5, 44, 212.5, 56.5, 217.5, 61.5, 245.5, 61.5, 250, 66, 250, 74]).stroke({
        width: 3,
        color: 0x6ff5cc,
        cap: 'round',
    });
    g.roundRect(209, 33, 7, 12, 3).fill(W);
    g.circle(250, 75, 3).fill(W);
}

export default card(delivery, { id: 's4-delivery', name: 'Delivery', size: [291, 132], style: STYLE });
