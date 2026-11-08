import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import { GRAY, LAMP_TRACK, osc, tableLamp, timer, W } from '../_sheets/kit3';
import { STYLE } from '../_sheets/style3';

export function lamp(c: Cx): void {
    const { g } = c;
    const orange = 0xff9f0a;
    const v = 0.64 + osc(c.t, 0.4) * 0.06;

    tableLamp(g, 5.5, 11, 15, 0xf5a54a);
    c.text('Accent Lamp', 13, 18.5, { size: 17.5, color: 0xf5a54a, weight: '400' });
    c.text('BEDROOM', 188, 17, { size: 10.5, color: GRAY, weight: '600', align: 'right' });
    g.roundRect(4, 30, 150, 25.7, 4).fill(LAMP_TRACK);
    g.roundRect(4, 30, 150 * v, 25.7, 4).fill({ color: orange, alpha: 0.5, blur: 3 });
    g.roundRect(4, 30, 150 * v, 25.7, 4).fill(orange);
    c.text(`${Math.round(v * 100)}%`, 150 * v + 1, 47.5, { size: 13, color: 0x5a2d00, weight: '600', align: 'right' });
    g.circle(175, 43, 12.8).fill(W);
    g.circle(175, 43, 11.3).fill(0x000000);
    g.circle(175, 43, 10.2).fill(orange);
    timer(g, 6.5, 72, 12, GRAY);
    c.run(14, 76.5, [
        ['TIMING SET TO', 11.5, GRAY, '500', 5],
        ['10:45', 13, W, '600', 2],
        ['AM', 9.5, W, '600'],
    ]);
}

export default card(lamp, { id: 's3-lamp', name: 'Accent lamp', size: [192, 88], style: STYLE });
