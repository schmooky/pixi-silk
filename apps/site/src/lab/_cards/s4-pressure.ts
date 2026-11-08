import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import { osc, PRESSURE } from '../_sheets/kit4';
import { STYLE } from '../_sheets/style4';

/** Blood pressure. */
export function pressure(c: Cx): void {
    const { g } = c;
    const pink = 0xf06ac8;

    c.text('82', 24, 40, { size: 24, color: pink, weight: '400' });
    c.text('mmhg', 55, 39.5, { size: 13, color: pink, weight: '500' });
    c.text('5 min', 254, 37, { size: 13.5, weight: '400', align: 'right' });
    PRESSURE.forEach(([x, top, bottom], i) => {
        const k = 1 + osc(c.t, 0.9, i) * 0.06;
        const mid = (top + bottom) / 2;
        const a = mid + (top + 4 - mid) * k;
        const b = mid + (bottom - 4 - mid) * k;

        if (b - a > 1) g.line(x, a, x, b).stroke({ width: 6.5, color: 0x531944, cap: 'round' });
        g.circle(x, a, 3.8).fill(0xe765c3);
        if (b - a > 1) g.circle(x, b, 3.8).fill(0xe765c3);
    });
}

export default card(pressure, { id: 's4-pressure', name: 'Blood pressure', size: [282, 132], style: STYLE });
