import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import { PI } from '../_sheets/kit4';
import { STYLE } from '../_sheets/style4';

/** Parking meter. */
export function meter(c: Cx): void {
    const { g } = c;
    const cyan = 0x6ad8e8;
    const left = Math.max(0, 97 - Math.floor(Math.max(0, c.t - 3)));

    g.circle(32.5, 34, 15.5).stroke({ width: 3.5, color: 0x296671 });
    g.arcSweep(32.5, 34, 15.5, -PI / 2, (left / 97) * PI * 0.72).stroke({ width: 3.5, color: 0x58d8de });
    g.line(37.5, 34, 41.5, 34.8).stroke({ width: 3, color: 0x58d8de, cap: 'round' });
    c.text('Meter Remaining', 209, 45, { size: 13, color: cyan, weight: '500', align: 'right' });
    c.text(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, 212, 44, {
        size: 29,
        color: cyan,
        weight: '300',
    });
}

export default card(meter, { id: 's4-meter', name: 'Parking meter', size: [280, 66], radius: 33, style: STYLE });
