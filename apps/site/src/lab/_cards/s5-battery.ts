import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { axis, carBolt, DIM, GRAY, osc, vlines } from '../_sheets/kit5';
import { STYLE } from '../_sheets/style5';

/** Car battery day. */
export function battery(c: Cx): void {
    const { g } = c;
    const cyan = 0x5ac8fa;

    carBolt(g, 8.5, 10.5, 16, cyan);
    c.run(19, 17, [
        ['56%', 17, cyan, '600', 4],
        ['REMAINING', 12.5, cyan, '600'],
    ]);
    c.text('9.3%', 182, 17, { size: 17, weight: '400', align: 'right' });
    I.chevron(g, 189, 12, 8, GRAY, 'up', 0.16);
    c.text('100', 0, 33, { size: 12.5, color: GRAY, weight: '500' });
    c.text('0', 0, 68, { size: 12.5, color: GRAY, weight: '500' });
    c.text('%', 0, 82, { size: 12.5, color: GRAY, weight: '500' });
    vlines(g, 30, 194, 6.8, 24, 72);
    const k = osc(c.t, 0.4) * 1.5;

    g.polyline([30, 46.3, 82.3, 46.3, 104, 61.3, 125.7, 61.3]).stroke({ width: 1.4, color: GRAY });
    g.polyline([132.3, 54, 170.7, 32.3, 185.7, 25.7, 193.3, 25.7]).stroke({ width: 1.4, color: GRAY });
    g.polyline([
        30,
        25.7,
        74,
        25.7,
        94,
        40,
        107,
        40,
        125.7,
        56.3,
        150.7,
        56.3,
        165.7,
        45.7 + k,
        193.3,
        45.7 + k,
    ]).stroke({ width: 1.7, color: 0x6ab0ff });
    c.text('TDAY', 31, 40.5, { size: 12.5, color: 0x6ab0ff, weight: '700' });
    c.text('YDAY', 31, 61, { size: 12.5, color: GRAY, weight: '700' });
    axis(
        c,
        [
            ['00', 36, DIM],
            ['06', 78],
            ['12', 118],
            ['18', 159],
        ],
        82,
        [30, 72, 113, 154],
    );
}

export default card(battery, { id: 's5-battery', name: 'Car battery day', size: [196, 88], style: STYLE });
