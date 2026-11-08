import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import { GRAY, PALE, ROUTE, W, walker } from '../_sheets/kit3';
import { STYLE } from '../_sheets/style3';

/** Hike map. */
export function hikeMap(c: Cx): void {
    const { g } = c;
    const streets = [
        [80, 20, 140, 10],
        [78, 44, 132, 36],
        [84, 70, 186, 52],
        [104, 8, 96, 78],
        [120, 6, 130, 78],
        [150, 8, 158, 78],
        [168, 30, 186, 44],
        [78, 58, 118, 76],
        [136, 46, 186, 30],
    ];

    walker(g, 7, 10.5, 15, 0x6ab8ff);
    c.run(18, 17, [
        ['1.37', 16, 0x6ab8ff, '600', 2],
        ['KM', 10.5, 0x6ab8ff, '600'],
    ]);
    c.run(2, 36, [
        ['17-32', 15, 0x9be15d, '600', 2],
        ['M', 10.5, 0x9be15d, '600'],
    ]);
    c.text('ELEVATION', 2, 49, { size: 8.5, color: GRAY, weight: '600' });
    c.run(2, 66, [
        ['74-145', 15, 0xe8574f, '600', 2],
        ['BPM', 10.5, 0xe8574f, '600'],
    ]);
    c.text('HEART RATE', 2, 79, { size: 8.5, color: GRAY, weight: '600' });
    g.roundRect(76.7, 5.7, 111.6, 73.3, 7).fill(0x18212a);
    g.roundRect(150, 8, 34, 24, 3).fill(0x1b3326);
    for (const [x0, y0, x1, y1] of streets) g.line(x0, y0, x1, y1).stroke({ width: 1.1, color: 0x2a3540 });
    g.polyline(ROUTE).stroke({ width: 1.8, color: 0x6ac4f0, cap: 'round' });
    g.circle(89, 65.7, 2.8).fill(0xffe0e6).stroke({ width: 1.5, color: 0xff3b5c, alignment: 'outside' });
    g.circle(173.3, 15.7, 2.8).fill(0x5ad19a).stroke({ width: 1.3, color: W, alignment: 'outside' });
    c.text('23:51', 181, 75, { size: 14, color: PALE, weight: '600', align: 'right' });
}

export default card(hikeMap, { id: 's3-hike', name: 'Hike map', size: [192, 88], style: STYLE });
