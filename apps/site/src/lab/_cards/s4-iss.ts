import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { arcPoint, CONE, DEG, osc, W } from '../_sheets/kit4';
import { STYLE } from '../_sheets/style4';

/** ISS flyover. */
export function iss(c: Cx): void {
    const { g } = c;
    const cx = 141.25;
    const cy = 198.9;
    const R = 140;
    const upper: number[] = [];
    const lower: number[] = [];
    const dot = (-120.4 + osc(c.t, 0.05) * 4) * DEG;

    c.text('ISS Flyover', 25, 32, { size: 14, weight: '500' });
    c.text('in 15 min', 261, 32, { size: 13.5, color: 0x64d8f0, weight: '500', align: 'right' });
    g.arcSweep(cx, cy, R, -141 * DEG, 102 * DEG).stroke({ width: 13, color: 0x395d8f, cap: 'round' });
    // visibility cone: between the arc's inner edge and a V down to the tip
    for (let x = 92; x <= 186; x += 2) {
        const top = cy - Math.sqrt(134 * 134 - (x - cx) ** 2);
        const v = 119 - Math.abs(x - 137) * 1.13;

        upper.push(x, top);
        lower.push(x, Math.max(top, v));
    }
    g.area(upper, lower).fill(CONE);
    g.arcSweep(cx, cy, R, -111 * DEG, 40.5 * DEG).stroke({ width: 15, color: 0x59e4ff, cap: 'round' });
    I.satellite(g, 57, 59, 20, W, -35 * DEG);
    const [dx, dy] = arcPoint(cx, cy, R, dot);

    g.circle(dx, dy, 4.5).fill(W);
}

export default card(iss, { id: 's4-iss', name: 'ISS flyover', size: [286, 141], style: STYLE });
