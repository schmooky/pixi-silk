import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import { GRAY, PALE, W, walker } from '../_sheets/kit3';
import { STYLE } from '../_sheets/style3';

/** Elevation. */
export function elevation(c: Cx): void {
    const { g } = c;
    const lime = 0x9be15d;

    walker(g, 7, 12, 15, lime, true);
    c.run(19, 19, [
        ['428', 15.5, lime, '600', 2],
        ['FT', 10.5, lime, '600', 7],
        ['56:32', 15.5, PALE, '600'],
    ]);
    c.text('436 FT', 188, 19, { size: 13.5, color: GRAY, weight: '500', align: 'right' });
    c.text('438', 0, 33, { size: 11.5, color: GRAY, weight: '500' });
    c.text('ELEV', 0, 46, { size: 9, color: lime, weight: '700' });
    c.text('GAINED', 0, 56.5, { size: 9, color: lime, weight: '700' });
    c.text('26', 0, 69, { size: 11.5, color: GRAY, weight: '500' });
    for (const x of [80, 116.7, 153.3]) g.line(x, 24, x, 70).stroke({ width: 1, color: 0x2c2c2e });
    for (let i = 0; i < 70; i++) {
        const x = 44 + i * 2.07;
        let h = 8 + 16 * (i / 70) + 5 * Math.sin(i * 0.35) + 2 * Math.sin(i * 1.3);

        if (i >= 67) h = 24 + (i - 66) * 3;
        g.rect(x, 69 - h, 1.35, h).fill(i >= 67 ? W : lime);
    }
    c.text('30 MINS AGO', 45, 81, { size: 12, color: GRAY, weight: '600' });
    c.text('NOW', 188, 81, { size: 12, weight: '700', align: 'right' });
}

export default card(elevation, { id: 's3-elevation', name: 'Elevation', size: [192, 88], style: STYLE });
