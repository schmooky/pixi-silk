import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import { FAT_BARS, FAT_FUTURE, fatHeader, guides, now, osc, YELLOW } from '../_sheets/kit1';
import { STYLE } from '../_sheets/style1';

/** Body fat · daily. */
export function fatBars(c: Cx): void {
    const { g } = c;

    fatHeader(c, false);
    guides(c, [114, 133.5], ['50%', '35%'], 412, 7);
    FAT_BARS.forEach((top, i) => {
        const tt = top + osc(c.t, 0.8, i) * 0.8;

        g.roundRect(24 + 12 * i - 4, tt, 8, 172 - tt, 2.5).fill(YELLOW);
    });
    FAT_FUTURE.forEach((top, i) => g.roundRect(348 + 12 * i - 4, top, 8, 172 - top, 2.5).fill(0x483f18));
    now(g, 334);
}

export default card(fatBars, { id: 's1-fat-bars', name: 'Body fat · daily', size: [462, 191], style: STYLE });
