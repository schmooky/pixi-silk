import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import { GRAY, osc } from '../_sheets/kit2';
import { STYLE } from '../_sheets/style2';

export function calendar(c: Cx): void {
    const { g } = c;

    g.roundRect(0, 1, 187, 24, 6).fill(0x242426);
    g.rect(136, 1, 25, 24).fill(0x3d3413);
    g.roundRect(161, 1, 26, 24, [0, 6, 6, 0]).fill(0x113a1e);
    c.text('ALL DAY EVENT', 6, 17.5, { size: 12.5, weight: '600' });
    c.text('2', 148.5, 18.5, { size: 15.5, color: 0xf5d04a, weight: '600', align: 'center' });
    c.text('3', 174, 18.5, { size: 15.5, color: 0x30d158, weight: '600', align: 'center' });
    for (let y = 9; y < 88; y += 5.4) g.line(191.5, y, 195, y).stroke({ width: 1, color: 0x6e6e73 });
    g.pill(137, 40, 50, 7).fill(0x4f4dc8);
    g.pill(137, 49, 50, 7).fill(0x4f4dc8);
    const ny = 46.7 + osc(c.t, 0.5) * 0.6;

    g.line(127, ny, 190, ny).stroke({ width: 1.6, color: 0xff3b30 });
    g.triangle(195, ny - 4, 195, ny + 4, 188, ny, 0.8).fill(0xff3b30);
    g.polyline([137.5, 89, 137.5, 83, 137.5, 81, 140, 79, 184, 79, 186.5, 81, 186.5, 83, 186.5, 89]).stroke({
        width: 1.8,
        color: 0x0a84ff,
    });
    g.circle(3, 37, 2.8).fill(0x5e5ce6);
    c.text('10:00', 12, 42.5, { size: 17, weight: '600' });
    c.text('1H', 126, 42.5, { size: 15, color: GRAY, weight: '500', align: 'right' });
    g.circle(3, 57.5, 2.4).stroke({ width: 1.3, color: 0x0a84ff });
    c.text('13:30', 12, 63, { size: 17, weight: '600' });
    c.text('1.5H', 126, 63, { size: 15, color: GRAY, weight: '500', align: 'right' });
    c.text('8 MORE EVENTS', 0, 81.5, { size: 12.5, color: GRAY, weight: '600' });
}

export default card(calendar, { id: 's2-calendar', name: 'All-day events', size: [196, 88], style: STYLE });
