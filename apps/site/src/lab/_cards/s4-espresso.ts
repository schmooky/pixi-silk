import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import { mix } from '../_sheets/kit4';
import { STYLE } from '../_sheets/style4';

/** Espresso timer. */
export function espresso(c: Cx): void {
    const { g } = c;
    const orange = 0xff7a45;
    const sec = 16 + ((c.t - 3 + 1400) % 14);
    const lit = 12 + Math.floor((sec - 16) / 1.074);

    for (let i = 0; i < 23; i++) {
        const x = 17 + i * 11.59;
        const edge = Math.min(i, 22 - i);
        const blur = edge === 0 ? 2.6 : edge === 1 ? 1.4 : edge === 2 ? 0.6 : 0;
        const alpha = edge === 0 ? 0.55 : edge === 1 ? 0.85 : 1;
        const color =
            i < lit
                ? mix(0xc84a14, 0xf27905, Math.min(1, i / 11))
                : mix(0x777777, 0x484848, Math.min(1, (i - 12) / 10));

        g.roundRect(x - 3.5, 44, 7, 27.5, 3.5).fill({ color, alpha, blur });
    }
    c.text('10', 97.5, 38.5, { size: 12.5, color: 0xc86a3c, weight: '600', align: 'center' });
    c.text('20', 205.5, 40, { size: 12.5, color: 0x616161, weight: '600', align: 'center' });
    c.text('Espresso', 30, 103, { size: 15.5, color: orange, weight: '500' });
    g.circle(144.5, 103, 19).fill(0x6f1b00);
    g.roundRect(137, 95.5, 15, 15, 3.5).fill(0xfa7200);
    c.text(`${Math.floor(sec)}s`, 260, 111, { size: 33, color: 0xf27a48, weight: '300', align: 'right' });
}

export default card(espresso, { id: 's4-espresso', name: 'Espresso timer', size: [287, 137], style: STYLE });
