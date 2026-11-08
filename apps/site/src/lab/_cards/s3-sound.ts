import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { AXIS, ear, GRAY, hash, osc, PALE, stripes } from '../_sheets/kit3';
import { STYLE } from '../_sheets/style3';

export function soundLevels(c: Cx): void {
    const { g } = c;
    const blue = 0x3a8ad8;

    ear(g, 7.5, 12, 16, PALE);
    I.warning(g, 13, 16.5, 6.5, 0xffd60a);
    c.run(21, 18.5, [
        ['95', 16.5, PALE, '600', 2],
        ['dB', 10.5, PALE, '600'],
    ]);
    c.text('SOUND LEVELS HIT', 189, 18.5, { size: 11.5, color: GRAY, weight: '600', align: 'right' });
    c.text('107', 0, 33, { size: 11.5, color: GRAY, weight: '500' });
    c.text('90', 0, 50.7, { size: 11.5, color: blue, weight: '600' });
    c.text('0', 0, 68, { size: 11.5, color: GRAY, weight: '500' });
    stripes(g, 25.7, 187.3, 6.5, 24, 70);
    g.line(25.7, 48, 187.3, 48).stroke({ width: 1.3, color: blue });
    for (let i = 0; i < 25; i++) {
        const x = 29 + i * 6.5;
        const yc = 55 + 4 * Math.sin(i * 1.3 + 0.4) + osc(c.t, 1.4, i) * 0.7;
        const h = 4 + 6 * hash(i);

        if (i === 10 || i === 11 || i === 13 || i === 15) continue;
        g.pill(x - 1.5, yc - h / 2, 3, h).fill(0x6e6e73);
    }
    g.pill(94.5, 42, 3, 7).fill(blue);
    g.pill(106.5, 46, 3, 12).fill(blue);
    g.pill(115, 27 + osc(c.t, 0.9) * 1, 3, 23).fill(blue);
    g.pill(127, 41, 3, 19).fill(blue);
    c.text('09:30', 30, 81, { size: 12, color: AXIS, weight: '500' });
    c.text('09:45', 188, 81, { size: 12, color: AXIS, weight: '500', align: 'right' });
}

export default card(soundLevels, { id: 's3-sound', name: 'Sound levels', size: [192, 88], style: STYLE });
