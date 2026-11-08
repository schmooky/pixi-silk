import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import { AREA_GOLD, CARD, fatHeader, guides, lineY, now, osc, TREND, TREND_DOTS, W, YELLOW } from '../_sheets/kit1';
import { STYLE } from '../_sheets/style1';

export function fatArea(c: Cx): void {
    const { g } = c;
    const wob = osc(c.t, 0.5) * 0.8;
    const pts = [...TREND, 332.5, 134.5].map((v, i) => (i % 2 ? v + wob * Math.sin(i * 0.3) : v));

    fatHeader(c, true);
    guides(c, [114, 133.5], ['50', '35'], 412, 7);
    g.area(pts, 172).fill(AREA_GOLD);
    g.polyline(pts).stroke({ width: 2, color: YELLOW });
    for (const x of TREND_DOTS) {
        const i = Math.round((x - 19) / 8) * 2 + 1;

        g.circle(x, lineY(x) + wob * Math.sin(i * 0.3), 3.5)
            .fill(YELLOW)
            .stroke({ width: 1.2, color: CARD, alignment: 'outside' });
    }
    g.line(339, 135.2, 392, 142.5).stroke({ width: 2.2, color: YELLOW, dash: [3, 3.5] });
    now(g, 332.5);
    g.circle(332.5, pts[pts.length - 1], 7)
        .fill(W)
        .stroke({ width: 1.5, color: CARD, alignment: 'outside' });
}

export default card(fatArea, { id: 's1-fat-area', name: 'Body fat trend', size: [462, 191], style: STYLE });
