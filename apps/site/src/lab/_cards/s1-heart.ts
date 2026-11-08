import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import { heartCandles } from '../_sheets/kit1';
import { STYLE } from '../_sheets/style1';

/** Heart rate. */
export function heartRate(c: Cx): void {
    heartCandles(c, false);
}

export default card(heartRate, { id: 's1-heart', name: 'Heart rate', size: [462, 191], style: STYLE });
