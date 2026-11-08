import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { osc, PALE, RED, timer, W } from '../_sheets/kit3';
import { STYLE } from '../_sheets/style3';

/** Run pace. */
export function runPace(c: Cx): void {
    const { g } = c;
    const pink = 0xff375f;
    const knob = 140.5 + osc(c.t, 0.3) * 3;
    const pts: number[] = [];

    timer(g, 8, 10.5, 14, PALE);
    c.text('26:04', 21, 17, { size: 16, color: PALE, weight: '600' });
    let rx = c.text('56', 188, 16.5, { size: 14.5, color: RED, weight: '500', align: 'right' }).x;

    g.heart(rx - 7, 11, 11, 0.1).stroke({ width: 1.5, color: RED });
    rx = c.text('147', rx - 14, 16.5, { size: 14.5, color: RED, weight: '500', align: 'right' }).x;
    g.heart(rx - 7, 11, 11, 0.1).fill(RED);
    for (const x of [65, 133]) g.line(x, 26, x, 50).stroke({ width: 1, color: 0x2c2c2e });
    g.line(3, 26, 188, 26).stroke({ width: 1, color: 0x2c2c2e });
    for (let i = 0; i <= 26; i++) {
        const x = 4 + i * 5;

        pts.push(x, 42 + 5 * Math.sin(i * 1.7 + 0.3) + 2 * Math.cos(i * 0.9));
    }
    g.polyline(pts).stroke({ width: 0.9, color: 0xe0443c });
    for (let i = 0; i < pts.length; i += 2) g.circle(pts[i], pts[i + 1], 1.2).fill(0xe0443c);
    g.pill(2.7, 49.8, 185.6, 5).fill({ color: 0xff9ab0, alpha: 0.85 });
    g.pill(2.7, 49.8, knob - 2.7, 5).fill(pink);
    g.circle(knob, 52.3, 11).fill(0x5a0f1f).stroke({ width: 2, color: pink, alignment: 'inside' });
    I.runner(g, knob, 52.3, 12, W);
    c.run(3, 81, [
        ['12′23″', 16.5, 0x6ab8ff, '600', 2],
        ['/KM', 10.5, 0x6ab8ff, '600'],
    ]);
    c.run(
        188,
        81,
        [
            ['AVG', 10.5, pink, '700', 3],
            ['148', 16.5, pink, '500', 2],
            ['KCAL', 10.5, pink, '700'],
        ],
        'right',
    );
}

export default card(runPace, { id: 's3-pace', name: 'Run pace', size: [192, 88], style: STYLE });
