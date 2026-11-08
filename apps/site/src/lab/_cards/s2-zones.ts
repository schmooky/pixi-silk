import { linear } from 'pixi-silk';
import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import { GRAY, W } from '../_sheets/kit2';
import { STYLE } from '../_sheets/style2';

export function zones(c: Cx): void {
    const { g } = c;
    const lv = [57, 45.7, 33, 20.7, 9];

    ['1', '2', '3', '4', '5'].forEach((s, i) => c.text(s, 0, lv[i] + 4.3, { size: 12.5, weight: '600' }));
    for (const y of [2.3, 20.7, 33, 45.7, 64.7]) g.line(17, y, 189, y).stroke({ width: 1, color: 0x3a3a3c });
    g.line(17, 2.3, 17, 64.7).stroke({ width: 1, color: 0x3a3a3c });
    g.line(189, 2.3, 189, 64.7).stroke({ width: 1, color: 0x3a3a3c });
    for (const x of [74, 131]) g.line(x, 2.3, x, 64.7).stroke({ width: 1, color: 0x3a3a3c, dash: [2, 2] });
    c.text('>178 BPM', 23, 12, { size: 11.5, color: 0xd1d1d6, weight: '500' });
    c.text('<140 BPM', 186, 62, { size: 11.5, color: 0xd1d1d6, weight: '500', align: 'right' });
    const pts = [
        17, 57, 52, 57, 62, 45.7, 74, 45.7, 85.7, 33, 100.7, 33, 109, 20.7, 124, 20.7, 135.7, 33, 145.7, 33, 159, 9,
        174, 45.7, 189, 45.7,
    ];
    const phase = ((((c.t - 3) * 0.18) % 1.6) + 1.6) % 1.6;
    const reveal = phase < 0.6 ? 1 : phase - 0.6;
    const n = Math.max(2, Math.round((pts.length / 2) * reveal));

    g.polyline(pts.slice(0, n * 2), { smooth: 'monotone', step: 1 }).stroke({
        width: 2.3,
        cap: 'round',
        gradient: linear(
            [
                [0, 0x2f8bff],
                [0.24, 0x2fd67a],
                [0.5, 0xc2e534],
                [0.76, 0xff8f1f],
                [1, 0xff2d55],
            ],
            { units: 'local', from: [0, 57], to: [0, 9] },
        ),
    });
    if (n * 2 >= pts.length) g.circle(189, 45.7, 2.3).fill(W);
    c.text('15m', 17, 80.5, { size: 12, color: GRAY, weight: '500' });
    c.text('25m', 76, 80.5, { size: 12, color: GRAY, weight: '500' });
    c.text('35m', 134, 80.5, { size: 12, color: GRAY, weight: '500' });
    c.text('NOW', 166, 80.5, { size: 12, weight: '600' });
}

export default card(zones, { id: 's2-zones', name: 'Heart rate zones', size: [196, 88], style: STYLE });
