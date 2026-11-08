import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import { DIM, osc, W } from '../_sheets/kit5';
import { STYLE } from '../_sheets/style5';

/** Crosshair grid. */
export function crosshair(c: Cx): void {
    const { g } = c;
    const green = 0x30d158;

    g.roundRect(20, 0.7, 176, 71.6, 8).fill(0x1c1c1e);
    for (let i = 1; i < 12; i++)
        g.line(20 + i * 14.67, 0.7, 20 + i * 14.67, 72.3).stroke({ width: 1, color: 0x2e2e31 });
    for (let j = 1; j < 7; j++) g.line(20, 0.7 + j * 10.23, 196, 0.7 + j * 10.23).stroke({ width: 1, color: 0x2e2e31 });
    [
        ['0', 11.5],
        ['45', 28],
        ['30', 42.3],
        ['15', 57],
        ['0', 71.3],
    ].forEach(([s, y]) => c.text(s as string, 15, y as number, { size: 12.5, weight: '700', align: 'right' }));
    const x = 158.3 + osc(c.t, 0.3) * 4;

    g.line(20, 45, 196, 45).stroke({ width: 1.5, color: green });
    g.line(x, 0.7, x, 76).stroke({ width: 1.5, color: green });
    g.circle(x, 45, 3.8).fill(W).stroke({ width: 1.2, color: 0x000000, alignment: 'outside' });
    c.text('25', 28, 43, { size: 13, color: green, weight: '700' });
    for (let i = 0; i < 12; i++) {
        const on = i === 9;

        c.text(String(i + 1), 26.7 + i * 14.4, 85, {
            size: 12.5,
            color: on ? green : DIM,
            weight: on ? '700' : '500',
            align: 'center',
        });
    }
}

export default card(crosshair, { id: 's5-crosshair', name: 'Crosshair grid', size: [196, 88], style: STYLE });
