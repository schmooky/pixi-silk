import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import { GRAY, osc, PI, W } from '../_sheets/kit2';
import { STYLE } from '../_sheets/style2';

/** Two nested paperclip tracks with progress. */
export function tracks(c: Cx): void {
    const { g } = c;
    const clip = (y0: number, r: number, left: number) => {
        const pts: number[] = [left, y0, 152, y0];

        for (let i = 1; i <= 24; i++) {
            const a = -PI / 2 + (i / 24) * PI;

            pts.push(152 + Math.cos(a) * r, 43.5 + Math.sin(a) * r);
        }
        pts.push(118, 43.5 + r);

        return pts;
    };
    const partial = (pts: number[], frac: number) => {
        let total = 0;

        for (let i = 2; i < pts.length; i += 2) total += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
        let left = total * frac;
        const out = [pts[0], pts[1]];

        for (let i = 2; i < pts.length; i += 2) {
            const d = Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);

            if (d >= left) {
                const u = left / d;

                out.push(pts[i - 2] + (pts[i] - pts[i - 2]) * u, pts[i - 1] + (pts[i + 1] - pts[i - 1]) * u);
                break;
            }
            out.push(pts[i], pts[i + 1]);
            left -= d;
        }

        return out;
    };
    const outer = clip(11.3, 32.2, 6.5);
    const inner = clip(29.2, 14.3, 6.5);

    for (const pts of [outer, inner]) {
        g.polyline(pts).stroke({ width: 14, color: 0x3a3a3c, cap: 'round' });
        g.polyline(pts).stroke({ width: 12, color: 0x0e0e10, cap: 'round' });
    }
    const po = partial(outer, 0.58 + 0.02 * osc(c.t, 0.7));
    const pi = partial(inner, 0.47);

    g.polyline(po).stroke({ width: 12, color: 0x1c4a8f, cap: 'round' });
    g.polyline(pi).stroke({ width: 12, color: 0x3a3a3e, cap: 'round' });
    g.circle(po[po.length - 2], po[po.length - 1], 2.8).fill(0x3a8cff);
    g.circle(pi[pi.length - 2], pi[pi.length - 1], 2.6).fill(0x8e8e93);
    c.text('65%', 5, 15.5, { size: 12.5, color: 0x4a8cf0, weight: '500' });
    c.text('47%', 5, 33.5, { size: 12.5, color: GRAY, weight: '500' });
    c.text('DISTANCE', 0, 59.5, { size: 12.5, color: 0x3a8cff, weight: '600' });
    c.run(0, 82.5, [
        ['2.64', 19.5, W, '600', 3],
        ['mi', 13.5, W, '500'],
    ]);
    c.text('STEPS', 79, 59.5, { size: 12.5, color: GRAY, weight: '600' });
    c.text('3,378', 73, 82.5, { size: 19.5, weight: '600' });
}

export default card(tracks, { id: 's2-tracks', name: 'Distance & steps', size: [196, 88], style: STYLE });
