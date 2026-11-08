import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import { DIM, fatHeader, osc, ticks, YELLOW } from '../_sheets/kit1';
import { STYLE } from '../_sheets/style1';

/** Body fat goal. */
export function fatProgress(c: Cx): void {
    const { g } = c;
    const fill = 258 + osc(c.t, 0.3) * 4;

    fatHeader(c, false);
    ticks(c, [136, 310], ['40%', '60%']);
    g.roundRect(19, 114.5, 424, 19.5, 4).fill(DIM);
    g.roundRect(19, 114.5, fill - 19, 19.5, 4).fill(YELLOW);
}

export default card(fatProgress, { id: 's1-fat-progress', name: 'Body fat goal', size: [462, 153], style: STYLE });
