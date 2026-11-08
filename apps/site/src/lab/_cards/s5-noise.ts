import { linear } from 'pixi-silk';
import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { axis, DIM, GRAY, osc, vlines, W } from '../_sheets/kit5';
import { STYLE } from '../_sheets/style5';

/** Noise. */
export function noise(c: Cx): void {
    const { g } = c;

    I.checkCircle(g, 6.5, 10.5, 13, 0x30d158);
    c.run(16, 17, [
        ['OK', 17, W, '600', 4],
        ['AVG', 11.5, GRAY, '600'],
    ]);
    g.roundRect(88, 0.5, 56, 21, 6).fill(0x3a3310);
    I.warning(g, 97, 11, 11, 0xffd60a);
    c.text('LOUD', 104, 15.8, { size: 12.5, color: 0xffd60a, weight: '700' });
    c.run(
        194,
        17,
        [
            ['1.2', 17, W, '600', 3],
            ['HRS', 11.5, W, '600'],
        ],
        'right',
    );
    c.text('100', 0, 33, { size: 12.5, color: 0xd1d1d6, weight: '600' });
    c.text('80', 0, 47.3, { size: 12.5, color: 0xd1d1d6, weight: '600' });
    c.text('0', 0, 68.7, { size: 12.5, color: GRAY, weight: '500' });
    c.text('dB', 0, 83, { size: 12.5, color: GRAY, weight: '600' });
    vlines(g, 31.3, 194, 6.8, 24, 72);
    g.line(31.3, 43.3, 194, 43.3).stroke({ width: 1, color: 0x6e6e73, dash: [1.2, 2.2] });
    g.line(31.3, 69, 194, 25.7).stroke({
        width: 1.4,
        gradient: linear([0x3a7bd5, 0xd4b44a], { units: 'local', from: [31, 0], to: [194, 0] }),
    });
    const candles: [number, number, number][] = [
        [82.3, 45.7, 64],
        [89, 48, 57],
        [95.7, 44, 54],
        [102.3, 52, 62],
        [109, 40, 51],
        [115.7, 47, 58],
        [122.3, 50, 59],
        [129, 44, 55],
        [135.7, 48, 54],
        [142.3, 33, 39],
        [149, 30, 37],
        [149, 42, 55],
        [155.7, 47, 57],
        [162.3, 38, 48],
        [169, 44, 52],
        [182.3, 36, 45],
        [182.3, 50, 56],
    ];

    candles.forEach(([x, a, b], i) => {
        const k = osc(c.t, 1.3, i) * 0.8;

        g.pill(x - 1.1, a + k, 2.2, b - a).fill(W);
    });
    axis(
        c,
        [
            ['00', 36, DIM],
            ['06', 78],
            ['12', 118],
            ['18', 158],
        ],
        83,
        [31.3, 72, 112, 152],
    );
}

export default card(noise, { id: 's5-noise', name: 'Noise', size: [196, 88], style: STYLE });
