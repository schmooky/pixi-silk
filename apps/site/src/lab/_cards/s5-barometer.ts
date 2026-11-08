import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { GRAY, osc, PI, W } from '../_sheets/kit5';
import { STYLE } from '../_sheets/style5';

export function barometer(c: Cx): void {
    const { g } = c;
    const purple = 0xbf5af2;
    const cx = 97.3;
    const cy = 44;
    const lit = -1.06 + osc(c.t, 0.3) * 0.02;

    c.text('1,012', 26, 40, { size: 19, weight: '600', align: 'center' });
    c.text('hPa', 26, 57.5, { size: 14, color: GRAY, weight: '500', align: 'center' });
    for (let i = 0; i <= 10; i++) {
        const a = PI * 0.75 + (i / 10) * PI * 1.5;
        const on = Math.abs(((a - lit + PI * 3) % (PI * 2)) - PI) < 0.2;

        g.circle(cx + Math.cos(a) * 35, cy + Math.sin(a) * 35, 3.4).fill(on ? purple : 0x5a5a5e);
        g.circle(cx + Math.cos(a) * 22, cy + Math.sin(a) * 22, 2.3).fill(on ? purple : 0x333336);
    }
    I.arrow(g, cx, cy, 16, W, 'up', 0.12);
    c.text('LOW', 64, 78.5, { size: 12.5, color: GRAY, weight: '500' });
    c.text('HIGH', 119, 78.5, { size: 12.5, color: GRAY, weight: '500' });
    I.gauge(g, 173, 32, 15, purple);
    c.text('Rising', 173, 58, { size: 17.5, color: purple, weight: '600', align: 'center' });
}

export default card(barometer, { id: 's5-barometer', name: 'Barometer', size: [196, 88], style: STYLE });
