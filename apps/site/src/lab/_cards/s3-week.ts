import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import { GRAY, osc } from '../_sheets/kit3';
import { STYLE } from '../_sheets/style3';

/** Week calendar. */
export function weekCalendar(c: Cx): void {
    const { g } = c;
    const xs = [31.7, 55, 79.3, 102.7, 126.7, 150.7, 174.3];
    const ny = 55.7 + osc(c.t, 0.15) * 1.5;

    c.text('Next', 3, 16, { size: 16, color: 0xeb4d3d, weight: '600' });
    c.text('Staff meet...', 43, 16, { size: 16.5, weight: '500' });
    c.text('8/15 - 8/21', 189, 17, { size: 11, color: GRAY, weight: '500', align: 'right' });
    ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach((d, i) =>
        c.text(d, xs[i], 33, { size: 11.5, color: i === 0 ? 0xeb4d3d : GRAY, weight: '600', align: 'center' }),
    );
    for (const x of [43.3, 67, 91, 114.7, 138.7, 162.5, 186.3])
        g.line(x, 20, x, 84).stroke({ width: 1, color: 0x2c2c2e });
    c.text('9', 3, 40.7, { size: 11.5, color: 0xd1d1d6, weight: '500' });
    c.text('12', 1, 60, { size: 11.5, color: 0xd1d1d6, weight: '500' });
    c.text('15', 1, 79, { size: 11.5, color: 0xd1d1d6, weight: '500' });
    g.roundRect(26, 39.5, 11, 2.5, 1.2).fill(0x1a6a3a);
    g.roundRect(26, 59, 14, 11.7, 3).fill(0x6e6cf5);
    g.roundRect(26, 74, 14, 10, 3).fill(0x1a8ae8);
    g.roundRect(50, 74, 12, 10, 3).fill(0xff2d55);
    g.roundRect(73, 43.3, 14, 16.7, 3).fill(0x6e6cf5);
    g.roundRect(73, 76, 14, 8, 3).fill(0x5ac8fa);
    g.roundRect(121, 37, 13, 2.5, 1.2).fill(0xf5c56b);
    g.roundRect(121, 42, 13, 2.5, 1.2).fill(0xf5c56b);
    g.roundRect(121, 64, 13, 20, 3).fill(0x6e6e73);
    g.line(19, ny, 200, ny).stroke({ width: 1.1, color: 0xd83a34 });
    g.circle(19, ny, 2.3).fill(0xe0443c);
}

export default card(weekCalendar, { id: 's3-week', name: 'Week calendar', size: [192, 88], style: STYLE });
