import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { GLUCOSE, GLUCOSE_GRADS, osc } from '../_sheets/kit4';
import { STYLE } from '../_sheets/style4';

/** Glucose. */
export function glucose(c: Cx): void {
    const { g } = c;
    const lav = 0xb4b0f0;

    c.text('7.2', 27, 39, { size: 21, color: lav, weight: '400' });
    c.text('mmol/L', 59, 39, { size: 13.5, color: lav, weight: '500' });
    c.text('2.2', 266, 34, { size: 16, color: lav, weight: '400', align: 'right' });
    I.arrow(g, 233, 28.5, 12, lav, 'down', 0.12);
    for (const x of [25.5, 104.5, 192, 282]) g.line(x, 50, x, 133.5).stroke({ width: 1, color: 0x2e2e36 });
    GLUCOSE.forEach(([x, top, bottom], i) => {
        const dy = osc(c.t, 0.7, i) * 0.8;

        g.pill(x - 4, top + dy, 8, bottom - top).fill(GLUCOSE_GRADS[i]);
    });
    c.text('1PM', 97, 133, { size: 12, color: 0x6a6880, weight: '500', align: 'right' });
    c.text('2PM', 185, 133, { size: 12, color: 0x6a6880, weight: '500', align: 'right' });
    c.text('NOW', 270, 133, { size: 12, color: 0x6a6880, weight: '500', align: 'right' });
}

export default card(glucose, { id: 's4-glucose', name: 'Glucose', size: [293, 158], style: STYLE });
