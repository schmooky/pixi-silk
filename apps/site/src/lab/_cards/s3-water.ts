import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { GRAY, osc, W, WATER_GLOW } from '../_sheets/kit3';
import { STYLE } from '../_sheets/style3';

/** Water intake. */
export function water(c: Cx): void {
    const { g } = c;
    const xs = [13.3, 40.7, 68, 95, 122.3, 149.7, 176.7];
    const lv = [14, 26, 12, 7, 20, 0, 0];

    g.circle(7, 10.5, 7).fill(0x5ac8fa);
    I.drop(g, 7, 11, 8, 0x0a3a50);
    c.run(16, 17, [
        ['150', 16.5, 0x64d2ff, '600', 2],
        ['/300 ML', 11, GRAY, '600'],
    ]);
    xs.forEach((x, i) => {
        const h = lv[i] * (1 + osc(c.t, 0.8, i) * 0.05);

        g.roundRect(x - 10, 24, 20, 40, 4).fill(i === 4 ? 0x16414a : 0x0f3238);
        if (i === 4) g.rect(x - 10, 64 - h - 18, 20, 18).fill(WATER_GLOW);
        if (h > 0) g.roundRect(x - 10, 64 - h, 20, h, 4).fill(i === 4 ? 0x36d0f5 : 0x1e9dc0);
    });
    ['S', 'S', 'M', 'T', 'W', 'T', 'F'].forEach((d, i) =>
        c.text(d, xs[i], 81, { size: 12, color: i === 4 ? W : GRAY, weight: i === 4 ? '700' : '500', align: 'center' }),
    );
}

export default card(water, { id: 's3-water', name: 'Water intake', size: [192, 88], style: STYLE });
