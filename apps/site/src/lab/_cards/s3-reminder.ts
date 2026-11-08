import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import { GRAY, W } from '../_sheets/kit3';
import { STYLE } from '../_sheets/style3';

/** Next event. */
export function reminder(c: Cx): void {
    const { g } = c;
    const mins = Math.max(1, 10 - Math.floor(Math.max(0, c.t - 3) / 60));

    g.pill(1.7, 12.3, 3.5, 35).fill(0x2f7de0);
    c.text('Catch up system desi...', 12.5, 26.5, { size: 17, weight: '500' });
    c.run(12.5, 48, [
        [`IN ${mins} MINS`, 14, W, '600', 7],
        ['45 MINS', 14, GRAY, '600'],
    ]);
    g.pill(1.5, 63, 3.5, 16).fill(0x30d158);
    g.pill(10, 63, 3.5, 16).fill(0xff453a);
    g.pill(18.5, 63, 3.5, 16).fill(0xffd60a);
    c.text('3 MORE EVENTS', 27.5, 76.5, { size: 14, weight: '600' });
}

export default card(reminder, { id: 's3-reminder', name: 'Next event', size: [192, 88], style: STYLE });
