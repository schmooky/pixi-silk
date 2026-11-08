import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { GRAY, PI } from '../_sheets/kit2';
import { STYLE } from '../_sheets/style2';

/** Sleep. */
export function sleep(c: Cx): void {
    const { g } = c;

    c.text('02:03 - 08:26', 0, 16.5, { size: 17, weight: '600' });
    g.roundRect(0, 24, 44, 24.5, 7).fill(0x1b1e3c);
    I.bed(g, 22, 36.5, 14, 0x6f6cf5);
    g.roundRect(147, 24, 44, 24.5, 7).fill(0x0d3533);
    I.alarm(g, 169, 36.5, 13.5, 0x39d6d0);
    const R = 85;

    for (let i = 0; i <= 20; i++) {
        const a = -PI / 2 - 0.569 + (i / 20) * 1.138;

        g.circle(96 + Math.cos(a) * R, 107.3 + Math.sin(a) * R, 1.05).fill(0x7f95c4);
    }
    c.text('6 HR 23 MIN', 96, 47.5, { size: 12.5, color: GRAY, weight: '500', align: 'center' });
    const seq: [number, number][] = [
        [5, 0x5ac8fa],
        [2, 0x5e5ce6],
        [1.2, 0xff6b5b],
        [10, 0x5e5ce6],
        [4, 0x0a84ff],
        [10, 0x0a84ff],
        [1.3, 0xff6b5b],
        [18, 0x0a84ff],
        [1.3, 0xff6b5b],
        [8, 0x0a84ff],
        [4, 0x5ac8fa],
        [12, 0x0a84ff],
        [1.3, 0xff6b5b],
        [1.3, 0xff6b5b],
        [9, 0x5ac8fa],
        [12, 0x0a84ff],
        [9, 0x5ac8fa],
        [7, 0x5ac8fa],
        [1.3, 0xff6b5b],
    ];
    const total = seq.reduce((s, [w]) => s + w, 0);
    let x = 2;

    for (const [w, col] of seq) {
        const ww = (w / total) * 190;

        g.roundRect(x + 0.4, 55.3, Math.max(1.2, ww - 0.8), 6.3, Math.min(2, ww / 2)).fill(col);
        x += ww;
    }
    I.moonZ(g, 6, 76.5, 13.5, 0x3ec5d8);
    c.text('89%', 15, 82.5, { size: 15.5, color: 0x3ec5d8, weight: '600' });
    const ax = c.text('AVG', 192, 82.5, { size: 15.5, color: 0xff5a5f, weight: '600', align: 'right' }).x;

    g.heart(ax - 9, 77, 12.5, 0.08).fill(0xff3b53);
    c.text('72 BPM', ax - 17, 82.5, { size: 15.5, color: 0xff5a5f, weight: '600', align: 'right' });
}

export default card(sleep, { id: 's2-sleep', name: 'Sleep', size: [196, 88], style: STYLE });
