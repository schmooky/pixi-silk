import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { ALERT_GLOW, axis, DIM, GRAY, osc, pin, stripes, W } from '../_sheets/kit3';
import { STYLE } from '../_sheets/style3';

/** Motion detected. */
export function detected(c: Cx): void {
    const { g } = c;
    const red = 0xe0443c;

    pin(g, 8.5, 12, 15, red);
    c.text('DETECTED', 19, 19.5, { size: 16, color: red, weight: '600' });
    c.text('GARAGE', 188, 19, { size: 11, color: GRAY, weight: '600', align: 'right' });
    c.text('5', 0, 33, { size: 11.5, color: GRAY, weight: '500' });
    c.text('MIN', 0, 50.7, { size: 11.5, color: GRAY, weight: '500' });
    c.text('0', 0, 68, { size: 11.5, color: GRAY, weight: '500' });
    stripes(g, 29, 187.3, 6.5, 24, 70);
    g.rect(100, 24, 33.3, 46).fill(ALERT_GLOW);
    I.warning(g, 116.7, 38, 13, 0xff453a, W);
    [24, 15, 18, 14, 12, 10].forEach((h, i) => {
        const hh = h * (1 + osc(c.t, 1.3, i) * 0.06);

        g.rect(102 + i * 5, 70 - hh, 2.6, hh).fill(0xff453a);
    });
    for (const [x, h] of [
        [48, 6],
        [55, 4],
        [72, 3],
        [76, 4],
        [80, 3],
        [84, 5],
        [88, 4],
        [92, 6],
        [143, 5],
        [148, 3],
        [157, 5],
    ])
        g.rect(x, 70 - h, 2, h).fill(0xe5e5ea);
    axis(
        c,
        [
            ['13:00', 36, DIM],
            ['14:00', 76],
            ['15:00', 115],
            ['16:00', 150],
        ],
        81.5,
        [33, 72, 112, 147],
        12,
    );
}

export default card(detected, { id: 's3-detected', name: 'Motion detected', size: [192, 88], style: STYLE });
