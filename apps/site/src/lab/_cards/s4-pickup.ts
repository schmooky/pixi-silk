import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { avatar, osc } from '../_sheets/kit4';
import { STYLE } from '../_sheets/style4';

/** Order pickup. */
export function pickup(c: Cx): void {
    const { g } = c;
    const purple = 0xb77cf0;
    const fill = 89.5 + osc(c.t, 0.08) * 10;

    c.text('Picking up order', 28, 34.5, { size: 13, color: purple, weight: '500' });
    c.text('ETA 5:50', 266, 34.5, { size: 13, color: purple, weight: '500', align: 'right' });
    g.pill(34.5, 54.5, 225, 12).fill(0x562c6f);
    g.pill(34.5, 54.5, fill - 34.5, 12).fill(0xcc6cff);
    g.circle(147, 60.5, 12.5).fill(0x5a3278);
    g.circle(259.5, 60.5, 12.5).fill(0x5a3278);
    g.circle(34.5, 60.5, 12.5).fill(0xc86af4);
    I.box(g, 34.5, 60.5, 11, 0xf7ecff, 0xc86af4);
    I.carFront(g, 147, 61, 11, 0xb88ad8, 0x5a3278);
    I.house(g, 259.5, 60.5, 11, 0xb88ad8, 0x5a3278);
    avatar(g, 35.5, 97, 13.5);
    c.text('Dave', 61, 101, { size: 13, weight: '400' });
    g.pill(146, 84.5, 59.5, 30).fill(0x313131);
    g.pill(216, 84.5, 59.5, 30).fill(0x313131);
    I.phone(g, 176, 99.5, 15, 0x9a9a9e);
    I.bubble(g, 246, 99.5, 16, 0x9a9a9e);
}

export default card(pickup, { id: 's4-pickup', name: 'Order pickup', size: [293, 132], style: STYLE });
