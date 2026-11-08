import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { PI, W } from '../_sheets/kit2';
import { STYLE } from '../_sheets/style2';

/** Home controls. */
export function home(c: Cx): void {
    const { g } = c;

    c.text('yuhang’s Home', 0, 16.5, { size: 17, weight: '600' });
    const cy = 52;
    const r = 24.5;
    const gap = 0.52;

    // fan: dark teal ring with a gap for the icon
    g.arcSweep(27.5, cy, r, -PI / 2 + gap, PI * 2 - gap * 2).stroke({ width: 6, color: 0x0f3b48, cap: 'round' });
    I.fan(g, 27.5, cy - r, 14, 0x22c3e6);
    c.text('23°', 29, cy + 5.5, { size: 15.5, weight: '500', align: 'center' });
    I.badge(g, 47.5, 71, 6.6, 0x38c6ee, 0x000000, 2);
    c.text('A', 47.5, 74.5, { size: 9.5, color: 0x000000, weight: '800', align: 'center' });
    // lamp: gray track, yellow level
    const lvl = 0.5 + 0.08 * Math.sin((c.t - 3) * 0.9);

    g.arcSweep(96, cy, r, -PI / 2 + gap, PI * 2 - gap * 2).stroke({ width: 6, color: 0x2c2c2e, cap: 'round' });
    g.arcSweep(96, cy, r, PI / 2 + 0.05, (PI - gap - 0.05) * (lvl / 0.5) - 0.12).stroke({
        width: 6,
        color: 0xffd23a,
        cap: 'round',
    });
    I.deskLamp(g, 96, cy - r - 1, 14.5, 0xffd23a);
    c.text(`${Math.round(lvl * 100)}%`, 96, cy + 5.5, { size: 15.5, weight: '500', align: 'center' });
    I.badge(g, 116, 71, 6.6, W, 0x000000, 2);
    c.text('6', 116, 74.5, { size: 9.5, color: 0x000000, weight: '800', align: 'center' });
    // lock
    g.circle(164.3, 51, 26).fill(0x1a5a55);
    I.lock(g, 164.3, 51, 21, 0x1ff3ec);
    I.badge(g, 184, 71, 6.6, W, 0x000000, 2);
    c.text('2', 184, 74.5, { size: 9.5, color: 0x000000, weight: '800', align: 'center' });
}

export default card(home, { id: 's2-home', name: 'Home controls', size: [196, 88], style: STYLE });
