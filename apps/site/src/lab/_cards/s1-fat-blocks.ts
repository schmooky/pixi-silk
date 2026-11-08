import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import { DIM, fatHeader, osc, YELLOW } from '../_sheets/kit1';
import { STYLE } from '../_sheets/style1';

/** Body fat · weekly. */
export function fatBlocks(c: Cx): void {
    const { g } = c;
    const tops = [153, 138, 124, 110, 96];

    fatHeader(c, false);
    tops.forEach((top, i) => {
        const tt = top + (i < 3 ? osc(c.t, 0.6, i) * 1.2 : 0);

        g.roundRect(19 + 86 * i, tt, 81, 172 - tt, 4.5).fill(i < 3 ? YELLOW : DIM);
    });
}

export default card(fatBlocks, { id: 's1-fat-blocks', name: 'Body fat · weekly', size: [463, 191], style: STYLE });
