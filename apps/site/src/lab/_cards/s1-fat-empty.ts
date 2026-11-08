import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import { AREA_GRAY, fatHeader, guides, now, osc, TREND } from '../_sheets/kit1';
import { STYLE } from '../_sheets/style1';

/** Body fat · no data. */
export function fatEmpty(c: Cx): void {
    const { g } = c;
    const pulse = 1 + osc(c.t, 2) * 0.02;

    fatHeader(c, true, true);
    g.circle(415, 48, 29 * pulse).fill(0x1ed23c);
    g.line(400, 48, 430, 48).stroke({ width: 4, color: 0x0b1a10 });
    g.line(415, 33, 415, 63).stroke({ width: 4, color: 0x0b1a10 });
    guides(c, [114, 133.5], ['50%', '35%'], 413, 7);
    g.area(TREND, 172).fill(AREA_GRAY);
    g.polyline(TREND).stroke({ width: 1.5, color: 0x9a9a9a });
    g.line(306, 132, 400, 137).stroke({ width: 1.5, color: 0x9a9a9a, dash: [2.4, 3] });
    now(g, 334);
}

export default card(fatEmpty, { id: 's1-fat-empty', name: 'Body fat · no data', size: [463, 191], style: STYLE });
