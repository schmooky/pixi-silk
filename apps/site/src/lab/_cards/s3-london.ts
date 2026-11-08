import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { DIM, days, GRAY, osc, TEMP_LINE } from '../_sheets/kit3';
import { STYLE } from '../_sheets/style3';

/** Weather. */
export function london(c: Cx): void {
    const { g } = c;
    const pts: [number, number, number][] = [
        [38.3, 27.3, 0],
        [60.7, 33.3, 0],
        [83.3, 56.7, 1],
        [106.7, 64, 1],
        [130, 54, 1],
        [152.3, 61.7, 1],
        [175, 36.7, 0],
    ];
    const flat = pts.flatMap(([x, y], i) => [x, y + osc(c.t, 0.6, i) * 0.8]);

    I.navArrow(g, 7, 10.5, 13, 0x64d2ff);
    c.text('23°', 15, 16.5, { size: 16.5, color: 0x64d2ff, weight: '600' });
    c.text('LONDON, UK', 46, 16.5, { size: 13, weight: '600' });
    c.text('19-25 AUG', 189, 16.5, { size: 12.5, color: GRAY, weight: '500', align: 'right' });
    c.text('25°', 3, 35, { size: 11.5, color: GRAY, weight: '500' });
    c.text('15°', 3, 64, { size: 11.5, color: GRAY, weight: '500' });
    for (const [x] of pts) g.line(x, 24, x, 70).stroke({ width: 1, color: 0x232325 });
    g.line(26, 44, 188, 44).stroke({ width: 1, color: 0x6e6e73, dash: [1.4, 2.2] });
    g.polyline(flat).stroke({ width: 1.2, gradient: TEMP_LINE });
    pts.forEach(([, , b], i) =>
        g
            .circle(flat[i * 2], flat[i * 2 + 1], 2.3)
            .fill(b ? 0x4a6ae8 : 0x6fd66f)
            .stroke({ width: 1.2, color: 0x000000, alignment: 'outside' }),
    );
    days(
        c,
        pts.map(([x]) => x),
        81,
        3,
        DIM,
    );
}

export default card(london, { id: 's3-london', name: 'Weather', size: [192, 88], style: STYLE });
