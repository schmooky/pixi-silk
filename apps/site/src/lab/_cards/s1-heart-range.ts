import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import { DIM, heartHeader, osc, PINK, ticks } from '../_sheets/kit1';
import { STYLE } from '../_sheets/style1';

/** Heart rate range. */
export function heartRange(c: Cx): void {
    const { g } = c;
    const s = osc(c.t, 0.3) * 3;

    heartHeader(c);
    ticks(c, [137, 311], ['50', '90']);
    g.roundRect(19, 114.5, 424, 19.5, 4).fill(DIM);
    g.roundRect(119 + s, 114.5, 127, 19.5, 4).fill(PINK);
}

export default card(heartRange, { id: 's1-heart-range', name: 'Heart rate range', size: [463, 153], style: STYLE });
