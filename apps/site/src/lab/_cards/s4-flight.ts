import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { FLIGHT_FILL, osc, W } from '../_sheets/kit4';
import { STYLE } from '../_sheets/style4';

export function flight(c: Cx): void {
    const { g } = c;
    const px = 183 + osc(c.t, 0.05) * 6;

    c.text('San Francisco', 25, 30, { size: 13, weight: '400' });
    c.text('Edmonton', 270, 30, { size: 13, weight: '400', align: 'right' });
    c.text('SFO', 24, 58, { size: 25, weight: '300' });
    c.text('YEG', 270, 58, { size: 25, weight: '300', align: 'right' });
    g.pill(76, 44.5, 144, 10).fill(0x1a6e75);
    g.pill(76, 44.5, px - 76 + 4, 10).fill({ color: 0x22f6f2, alpha: 0.35, blur: 3 });
    g.pill(76, 44.5, px - 76 + 4, 10).fill(FLIGHT_FILL);
    I.plane(g, px, 49.5, 17, W);
    c.text('9:59 PM', 26, 76, { size: 12.5, weight: '400' });
    c.text('Arrives in 47m', 145.5, 76, { size: 12.5, color: 0x7aecec, weight: '500', align: 'center' });
    c.text('12:59 AM', 269, 76, { size: 12.5, weight: '400', align: 'right' });
}

export default card(flight, { id: 's4-flight', name: 'Flight', size: [292, 102], style: STYLE });
