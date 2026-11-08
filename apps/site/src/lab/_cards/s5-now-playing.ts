import { linear, radial } from 'pixi-silk';
import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import { STYLE } from '../_sheets/style5';

/** Now playing. */
export function nowPlaying(c: Cx): void {
    const { g, fg } = c;

    g.rect(-8, -6, 212, 100).fill(
        radial(
            [
                [0, 0x0d2c3c, 0.95],
                [0.6, 0x071a24, 0.7],
                [1, 0x000000, 0],
            ],
            { center: [0.45, 0.55], radius: 0.62 },
        ),
    );
    // album art: stylised blue stone face
    g.roundRect(2.3, 19, 49, 48.3, 4).fill(
        radial(
            [
                [0, 0x2a86b0],
                [0.7, 0x145a80],
                [1, 0x0a3550],
            ],
            { center: [0.5, 0.45], radius: 0.75 },
        ),
    );
    const blots: [number, number, number, number, number][] = [
        [18, 36, 7, 5, 0.5],
        [34, 35, 7, 5, 0.5],
        [26, 47, 5, 8, 0.35],
        [26, 58, 9, 3, 0.45],
        [12, 55, 6, 9, 0.3],
        [41, 52, 6, 10, 0.3],
        [26, 28, 14, 4, 0.25],
    ];

    for (const [bx, by, rx, ry, a] of blots) g.ellipse(bx, by, rx, ry).fill({ color: 0x06253a, alpha: a, blur: 1.5 });
    for (const [bx, by] of [
        [22, 42],
        [31, 42],
        [20, 62],
        [35, 61],
    ])
        g.circle(bx, by, 2).fill({ color: 0x7cc4e4, alpha: 0.35, blur: 1 });
    c.text('JIM HALL', 5, 24.5, { size: 3.6, weight: '700' });
    c.text('CONCIERTO', 48, 24.5, { size: 3.6, weight: '700', align: 'right' });
    c.text('Concierto de Aran', 67, 30, { size: 17, weight: '500' });
    c.text('Jim Hall - Concierto', 67, 50, { size: 16, color: 0x98989d, weight: '500' });
    c.text('-07:29', 67, 71.5, { size: 16, weight: '600' });
    // truncate softly at the right edge
    fg.rect(160, 14, 54, 62).fill(
        linear(
            [
                [0, 0x06141b, 0],
                [0.4, 0x040e13, 1],
                [1, 0x000000, 1],
            ],
            { from: [0, 0.5], to: [1, 0.5] },
        ),
    );
}

export default card(nowPlaying, { id: 's5-now-playing', name: 'Now playing', size: [196, 88], style: STYLE });
