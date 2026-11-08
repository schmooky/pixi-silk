import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import { GRAY, W } from '../_sheets/kit5';
import { STYLE } from '../_sheets/style5';

/** Sleep stages. */
export function sleepBlocks(c: Cx): void {
    const { g } = c;
    const B = 0x2d7cf0;
    const I2 = 0x3a3ab8;
    const L = 0x5ac8fa;
    const C = 0xff6b6b;
    const blocks: [number, number, number][] = [
        [0.7, 12, B],
        [13, 15, C],
        [16.7, 18.7, L],
        [21.3, 27.3, B],
        [29, 56.7, I2],
        [60.7, 78, B],
        [79, 81.3, L],
        [83, 110, B],
        [111.3, 112.7, I2],
        [114.7, 116, I2],
        [118, 126, I2],
        [128, 172.3, B],
        [174, 175.3, L],
        [177, 178, I2],
        [179.5, 180.5, I2],
        [182, 183, I2],
        [186.7, 190, C],
        [191, 194, C],
    ];

    c.run(0, 17, [
        ['6', 17, W, '600', 2],
        ['hr', 12.5, W, '600', 5],
        ['38', 17, W, '600', 2],
        ['min', 12.5, W, '600'],
    ]);
    const ax = c.text('AVG', 194, 16.5, { size: 11.5, color: 0xff375f, weight: '700', align: 'right' }).x;

    g.heart(ax - 7, 11.5, 11, 0.08).fill(0xff375f);
    c.text('51-68 BPM', ax - 14, 17, { size: 14.5, color: 0xff375f, weight: '600', align: 'right' });
    for (const [x0, x1, col] of blocks) g.roundRect(x0, 25.7, x1 - x0, 40, Math.min(2, (x1 - x0) / 2)).fill(col);
    ['01:00', '03:00', '05:00', '07:00'].forEach((s, i) =>
        c.text(s, [0.7, 56.7, 110, 164][i], 82, { size: 13, color: GRAY, weight: '500' }),
    );
}

export default card(sleepBlocks, { id: 's5-sleep-blocks', name: 'Sleep stages', size: [196, 88], style: STYLE });
