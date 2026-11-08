import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { GRAY, osc, W } from '../_sheets/kit3';
import { STYLE } from '../_sheets/style3';

/** Boarding. */
export function boarding(c: Cx): void {
    const { g } = c;
    const green = 0x34c759;
    const p = 114.7 + osc(c.t, 0.25) * 2;
    const x = c.run(2, 15.5, [['SFO', 15.5, W, '600']]);

    I.plane(g, x + 10, 10.5, 13, 0x8e8e93);
    c.text('JFK', x + 19, 15.5, { size: 15.5, weight: '600' });
    c.text('NOW BOARDING', 188, 16, { size: 12.5, color: green, weight: '600', align: 'right' });
    g.pill(2.3, 24.1, 42.4, 3.2).fill(green);
    g.pill(50, 24.1, 42.3, 3.2).fill(green);
    g.pill(97.3, 24.1, 41.7, 3.2).fill(0x3a3a3c);
    g.pill(97.3, 24.1, p - 97.3, 3.2).fill(green);
    g.circle(p, 25.7, 3.1).fill(green);
    g.pill(145.7, 24.1, 41.6, 3.2).fill(0x3a3a3c);
    c.text('20:30', 3, 53, { size: 22, weight: '400' });
    c.text('5H 30M', 94.5, 52, { size: 12.5, color: GRAY, weight: '600', align: 'center' });
    c.text('5:00', 177, 53, { size: 22, weight: '400', align: 'right' });
    c.text('+1', 178, 41.5, { size: 10, weight: '600' });
    c.text('Gate 24', 2, 74, { size: 15.5, weight: '500' });
    c.text('Seat 30A', 188, 74, { size: 15.5, weight: '500', align: 'right' });
}

export default card(boarding, { id: 's3-boarding', name: 'Boarding', size: [192, 88], style: STYLE });
