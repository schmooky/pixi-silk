import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { axis, BPM_HIGH, BPM_LOW, DIM, GRAY, osc, stripes, W } from '../_sheets/kit3';
import { STYLE } from '../_sheets/style3';

/** Heart rate scatter. */
export function bpmScatter(c: Cx): void {
    const { g } = c;

    I.heartOutline(g, 11, 11, 14, W);
    c.run(22, 16, [
        ['76', 16, W, '600', 3],
        ['BPM', 10.5, W, '600', 6],
        ['AVG', 10.5, GRAY, '600'],
    ]);
    c.text('25 JUL, MON', 187, 17, { size: 14, color: GRAY, weight: '500', align: 'right' });
    c.text('150', 0, 33, { size: 11.5, color: 0xd1d1d6, weight: '500' });
    c.text('100', 0, 50.7, { size: 11.5, color: 0xd1d1d6, weight: '500' });
    c.text('50', 0, 68, { size: 11.5, color: 0xd1d1d6, weight: '500' });
    g.rect(27.3, 22, 159.4, 25).fill(BPM_HIGH);
    g.rect(27.3, 50, 159.4, 19).fill(BPM_LOW);
    stripes(g, 27.3, 186.7, 6.5, 22, 47, 0x4a2a6a);
    stripes(g, 27.3, 186.7, 6.5, 50, 69, 0x17485a);
    g.line(27.3, 54.7, 186.7, 54.7).stroke({ width: 1.2, color: W });
    g.circle(27.3, 54.7, 1.8).fill(W);
    g.circle(186.7, 54.7, 1.8).fill(W);
    for (const [x, y] of [
        [105, 40],
        [111, 42],
        [118, 38],
        [124, 38.5],
        [130, 40],
        [137, 44],
    ])
        g.circle(x, y, 1.6).fill(0xc89bff);
    for (let i = 0; i < 30; i++) {
        const x = 60 + i * 4.1;
        const y = 60 + 4 * Math.sin(i * 1.9 + 1) + osc(c.t, 1.2, i) * 0.6;

        g.circle(x, y, 1.6).fill(0x5ac8fa);
    }
    axis(
        c,
        [
            ['00', 32, DIM],
            ['06', 70.7],
            ['12', 108],
            ['18', 147],
        ],
        83,
        [27.3, 66, 105, 144],
    );
}

export default card(bpmScatter, { id: 's3-bpm', name: 'Heart rate scatter', size: [192, 88], style: STYLE });
