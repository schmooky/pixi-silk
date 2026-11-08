import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { CADENCE, osc, W } from '../_sheets/kit4';
import { STYLE } from '../_sheets/style4';

/** Run cadence. */
export function cadence(c: Cx): void {
    const { g } = c;
    const yellow = 0xfbf03c;

    c.text('24:15', 25, 40, { size: 20, color: 0xfff05a, weight: '400' });
    c.text('1.8', 249, 38.5, { size: 20, color: 0xfff05a, weight: '400', align: 'right' });
    c.text('MI', 250, 31, { size: 9.5, color: 0xfff05a, weight: '600' });
    CADENCE.forEach((top, i) => {
        const x = 25 + i * 9.07;
        const tt = top + (i < 19 ? osc(c.t, 1.2, i) * 1.2 : 0);

        g.pill(x - 3, tt, 6, 84 - tt).fill(i < 19 ? yellow : i === 19 ? W : 0x645402);
    });
    g.pill(21.5, 100, 82.5, 29).fill(0x53460a);
    g.pill(183, 100, 82, 29).fill(0x53460a);
    I.xMark(g, 62.75, 114.5, 13, yellow, 0.14);
    g.roundRect(133, 104, 7, 22.5, 2).fill(yellow);
    g.roundRect(144, 104, 7, 22.5, 2).fill(yellow);
    I.crosshair(g, 224, 114.5, 17, yellow);
}

export default card(cadence, { id: 's4-cadence', name: 'Run cadence', size: [286, 147], style: STYLE });
