import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { GRAY, W } from '../_sheets/kit2';
import { STYLE } from '../_sheets/style2';

/** Total time. */
export function totalTime(c: Cx): void {
    const { g } = c;

    I.clockFilled(g, 6, 10.5, 12.5);
    c.run(17, 16.5, [
        ['13', 17, W, '600', 1],
        ['H', 11.5, W, '600', 5],
        ['47', 17, W, '600', 1],
        ['M', 11.5, W, '600'],
    ]);
    c.text('TOTAL TIME', 193, 16, { size: 12, color: GRAY, weight: '500', align: 'right' });
    I.cup(g, 6.5, 26.5, 12.5, 0x98989d);
    I.book(g, 6.5, 44, 12.5, 0x6461e0);
    I.runner(g, 6.5, 60.5, 13.5, 0x1fd47f);
    c.text('30%', 55, 31, { size: 13, color: GRAY, weight: '500', align: 'right' });
    c.text('40%', 55, 48.5, { size: 13, color: 0x6461e0, weight: '500', align: 'right' });
    c.text('60%', 55, 65, { size: 13, color: 0x1fd47f, weight: '500', align: 'right' });
    for (let i = 0; i < 8; i++) g.line(58.5 + i * 19.2, 21, 58.5 + i * 19.2, 86).stroke({ width: 1, color: 0x1f2a24 });
    const rows: [number[], number][] = [
        [[0, 0, 1, 0, 1, 1, 0], 0x98989d],
        [[1, 0, 0, 1, 1, 1, 0], 0x6461e0],
        [[1, 1, 1, 0, 1, 0, 0], 0x1fd47f],
    ];
    const ys = [26.5, 44, 60.5];

    rows.forEach(([row, color], r) =>
        row.forEach((on, i) => {
            const x = 67.7 + i * 19.2;

            if (on) g.roundRect(x - 3.1, ys[r] - 3.1, 6.2, 6.2, 1.5).fill(color);
            else g.roundRect(x - 2.7, ys[r] - 2.7, 5.4, 5.4, 1.3).stroke({ width: 0.9, color: 0x6e6e73 });
        }),
    );
    ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach((d, i) =>
        c.text(d, 67.7 + i * 19.2, 80.5, { size: 12, color: GRAY, weight: '500', align: 'center' }),
    );
}

export default card(totalTime, { id: 's2-total-time', name: 'Total time', size: [196, 88], style: STYLE });
