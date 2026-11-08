import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import { osc, PI, RED, W } from '../_sheets/kit5';
import { STYLE } from '../_sheets/style5';

/** Compass. */
export function compass(c: Cx): void {
    const { g } = c;
    const cx = 97.3;
    const cy = 140.6;
    const R = 116.6;
    const a0 = -2.62;
    const a1 = -0.52;

    c.run(0, 17, [
        ['~135°', 17.5, RED, '600', 5],
        ['SE', 17.5, W, '600'],
    ]);
    c.run(
        194,
        17,
        [
            ['128', 17.5, RED, '600', 1],
            ['M', 11, RED, '700', 4],
            ['elev', 17.5, W, '600'],
        ],
        'right',
    );
    g.arcSweep(cx, cy, R, a0, a1 - a0).stroke({ width: 1, color: W, alpha: 0.3 });
    for (let a = a0; a <= a1 + 1e-6; a += (a1 - a0) / 60) {
        g.line(
            cx + Math.cos(a) * (R - 3),
            cy + Math.sin(a) * (R - 3),
            cx + Math.cos(a) * (R - 9),
            cy + Math.sin(a) * (R - 9),
        ).stroke({ width: 1, color: 0x6e6e73 });
    }
    for (let k = 0; k <= 6; k++) {
        const a = -2.36 + k * 0.26;

        g.line(
            cx + Math.cos(a) * (R - 3),
            cy + Math.sin(a) * (R - 3),
            cx + Math.cos(a) * (R - 13),
            cy + Math.sin(a) * (R - 13),
        ).stroke({ width: 1.6, color: W });
    }
    [
        ['90', -2.24],
        ['120', -1.84],
        ['150', -1.3],
        ['180', -0.9],
    ].forEach(([s, a]) => {
        const ang = a as number;

        c.text(s as string, cx + Math.cos(ang) * (R - 24), cy + Math.sin(ang) * (R - 24), {
            size: 13,
            color: 0xd1d1d6,
            weight: '600',
            rotation: ang + PI / 2,
        });
    });
    const needle = -PI / 2 + osc(c.t, 0.4) * 0.05;
    const nx = cx + Math.cos(needle) * R;
    const ny = cy + Math.sin(needle) * R;

    g.arcSweep(cx, cy, R, -2.345, needle + 2.345).stroke({ width: 2.4, color: RED, cap: 'round' });
    g.circle(cx + Math.cos(-2.345) * R, cy + Math.sin(-2.345) * R, 2.8).fill(RED);
    g.line(nx, ny, cx, 70).stroke({ width: 1.6, color: W });
    g.circle(nx, ny, 3.4).fill(RED);
    g.pill(78.3, 69, 38, 17).fill(RED);
    c.text('75°', cx, 82, { size: 14, weight: '700', align: 'center' });
}

export default card(compass, { id: 's5-compass', name: 'Compass', size: [196, 88], style: STYLE });
