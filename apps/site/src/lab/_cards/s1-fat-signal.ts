import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import { fatHeader, YELLOW } from '../_sheets/kit1';
import { STYLE } from '../_sheets/style1';

/** Body fat · level. */
export function fatSignal(c: Cx): void {
    const { g } = c;
    const tops = [66, 54, 42, 31, 19];

    fatHeader(c, false);
    tops.forEach((top, i) => g.roundRect(376 + 14.5 * i, top, 9, 76 - top, 2).fill(i < 3 ? YELLOW : 0x494949));
}

export default card(fatSignal, { id: 's1-fat-signal', name: 'Body fat · level', size: [462, 95], style: STYLE });
