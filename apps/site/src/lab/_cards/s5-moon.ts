import { radial } from 'pixi-silk';
import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import { osc, PI, W } from '../_sheets/kit5';
import { STYLE } from '../_sheets/style5';

/** Moon phases. */
export function moon(c: Cx): void {
    const { g } = c;
    const pos: [number, number, number][] = [
        [25.7, 64, 0.62],
        [46.7, 49, 0.72],
        [70.7, 38, 0.84],
        [96.7, 34.7, 0.93],
        [123.7, 36.3, 1.0],
        [147.3, 47.3, -0.86],
        [169, 64, -0.7],
    ];

    g.rect(-6, 22, 208, 70).fill(
        radial(
            [
                [0, 0x1b4cb0, 0.85],
                [0.45, 0x0c2a6a, 0.7],
                [1, 0x000000, 0],
            ],
            { center: [0.5, 0.85], radius: 0.62 },
        ),
    );
    c.text('Waxing Gibbous', 0, 17, { size: 17.5, weight: '600' });
    c.text('72%', 194, 17, { size: 17.5, color: 0x64a8ff, weight: '600', align: 'right' });
    pos.forEach(([x, y, f], i) => {
        const lift = osc(c.t, 0.8, i) * 0.6;
        const r = 9.6;
        const yy = y + lift;
        const k = Math.abs(f);

        // lit part = half disc on the lit side + terminator half-ellipse (all inside the disc)
        g.circle(x, yy, r).fill(0x0c2360);
        if (k >= 0.999) g.circle(x, yy, r).fill(W);
        else {
            const start = f > 0 ? -PI / 2 : PI / 2;

            g.sector(x, yy, r, start, start + PI).fill(W);
            g.ellipse(x, yy, r * Math.abs(2 * k - 1), r).fill(k > 0.5 ? W : 0x0c2360);
        }
        g.circle(x, yy, r + 1).stroke({ width: 1.3, color: W });
    });
    g.circle(36.3, 78.3, 1.8).fill(0x8e8e93);
    c.text('SUN 7', 96.7, 84, { size: 15.5, weight: '700', align: 'center' });
}

export default card(moon, { id: 's5-moon', name: 'Moon phases', size: [196, 88], style: STYLE });
