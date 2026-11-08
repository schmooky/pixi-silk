import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import { osc, TRACK_BRIGHT, TRACK_DARK, W } from '../_sheets/kit4';
import { STYLE } from '../_sheets/style4';

/** Race. */
export function race(c: Cx): void {
    const { g } = c;
    const red = 0xf06470;

    g.polyline(TRACK_DARK, { smooth: 'catmull' }).stroke({ width: 5.5, color: 0x923640, cap: 'round' });
    g.polyline(TRACK_BRIGHT, { smooth: 'catmull' }).stroke({ width: 5.5, color: 0xef4e5a, cap: 'round' });
    g.save().translateTransform(37, 62).rotateTransform(0.35);
    g.ellipse(0, 0, 2.7, 4.6).fill(0xf5d32a);
    g.restore();
    const u = 0.5 + osc(c.t, 0.3) * 0.08;

    g.circle(59.5 + (85 - 59.5) * u, 75 + (90 - 75) * u, 2.6).fill(W);
    c.text('Sector 2', 23, 104, { size: 13, color: red, weight: '500' });
    c.text('Lap 5', 255, 30, { size: 13, color: red, weight: '500', align: 'right' });
    [
        ['Lap 4', '1:16:36'],
        ['Lap 3', '1:17:24'],
        ['Lap 2', '1:18:15'],
    ].forEach(([lap, time], i) => {
        const y = 56 + i * 22;

        g.line(152, y - 15, 256, y - 15).stroke({ width: 1, color: 0x5a1a22 });
        c.text(lap, 153, y, { size: 13, color: red, weight: '500' });
        c.text(time, 255, y, { size: 13, color: red, weight: '500', align: 'right' });
    });
}

export default card(race, { id: 's4-race', name: 'Race', size: [281, 127], style: STYLE });
