import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import { osc, PI, W } from '../_sheets/kit2';
import { STYLE } from '../_sheets/style2';

/** Rectangular watch face: ticks along a stadium, seconds sub-dial, date. */
export function analogClock(c: Cx): void {
    const { g } = c;
    const cx = 96;
    const cy = 43;
    const a = 97;
    const b = 43;
    const sd = (x: number, y: number) => Math.hypot(Math.max(Math.abs(x) - (a - b), 0), y) - b;

    for (let i = 0; i < 60; i++) {
        const ang = -PI / 2 + (i / 60) * PI * 2;
        const dx = Math.cos(ang);
        const dy = Math.sin(ang);
        let lo = 0;
        let hi = 200;

        for (let k = 0; k < 24; k++) {
            const m = (lo + hi) / 2;

            if (sd(dx * m, dy * m) < -2) lo = m;
            else hi = m;
        }
        const major = i % 5 === 0;
        const len = major ? 6 : 3.5;

        g.line(cx + dx * lo, cy + dy * lo, cx + dx * (lo - len), cy + dy * (lo - len)).stroke({
            width: major ? 1.6 : 0.9,
            color: major ? 0xe5e5ea : 0x6e6e73,
            cap: 'round',
        });
    }
    c.text('12', cx, 24.5, { size: 16, weight: '600', align: 'center' });
    c.text('6', cx, 69.5, { size: 16, weight: '600', align: 'center' });
    c.text('9', 16, 49.5, { size: 16, weight: '600', align: 'center' });
    c.text('3', 176, 49.5, { size: 16, weight: '600', align: 'center' });
    // seconds sub-dial
    const sx = 51;
    const sy = 41;

    for (let i = 0; i < 60; i++) {
        const ang = (i / 60) * PI * 2;

        g.line(
            sx + Math.cos(ang) * 21.5,
            sy + Math.sin(ang) * 21.5,
            sx + Math.cos(ang) * (i % 5 ? 23 : 24),
            sy + Math.sin(ang) * (i % 5 ? 23 : 24),
        ).stroke({ width: 0.7, color: 0x8e8e93 });
    }
    ['60', '10', '20', '30', '40', '50'].forEach((s, i) => {
        const ang = -PI / 2 + (i / 6) * PI * 2;

        c.text(s, sx + Math.cos(ang) * 14.5, sy + Math.sin(ang) * 14.5, {
            size: 7.5,
            color: 0xc7c7cc,
            weight: '500',
            rotation: ang + PI / 2,
        });
    });
    const sec = -PI / 2 + (((c.t - 3) % 60) / 60) * PI * 2 + 2.62;

    g.line(sx, sy, sx + Math.cos(sec) * 18, sy + Math.sin(sec) * 18).stroke({
        width: 1.5,
        color: 0xf5a524,
        cap: 'round',
    });
    g.circle(sx, sy, 2.4).fill(0x000000).stroke({ width: 1.2, color: 0xf5a524 });
    // hands
    const mx = 96;
    const my = 40.7;

    g.line(mx, my, 84.3, 37.3).stroke({ width: 2.2, color: 0xf5a524, cap: 'round' });
    const mAng = -0.52 + osc(c.t, 0.05) * 0.02;

    g.line(mx, my, mx + Math.cos(mAng) * 38, my + Math.sin(mAng) * 38).stroke({
        width: 1.6,
        color: 0xf5a524,
        cap: 'round',
    });
    g.circle(mx, my, 2.8).fill(0x000000).stroke({ width: 1.3, color: 0xf5a524 });
    c.run(120, 49.5, [
        ['TUE', 13, 0xff453a, '600', 3],
        ['25', 13, W, '600'],
    ]);
}

export default card(analogClock, { id: 's2-clock', name: 'Watch face', size: [196, 88], style: STYLE });
