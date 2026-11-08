import { linear } from 'pixi-silk';
import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { GRAY, osc, PI, W } from '../_sheets/kit2';
import { STYLE } from '../_sheets/style2';

/** Jupiter. */
export function jupiter(c: Cx): void {
    const { g } = c;
    const blue = 0x8a93c8;

    I.angle(g, 5.5, 11, 11, blue);
    c.run(13, 16.5, [
        ['-35°12′', 16.5, blue, '600', 6],
        ['Jupiter', 17, W, '600'],
    ]);
    I.eye(g, 185.5, 10.5, 13, W);
    g.rect(0, 19, 196, 67).fill(
        linear(
            [
                [0, 0x1a212c],
                [1, 0x07090d],
            ],
            { from: [0.8, 0], to: [0.2, 1] },
        ),
    );
    for (const vx of [1, 41.7, 84.3, 126, 167.7]) g.line(vx, 19, vx, 86).stroke({ width: 1, color: 0x353b46 });
    g.line(0, 50, 196, 50).stroke({ width: 1.2, color: 0x9a9da6 });
    const cy = (x: number) => 50 - 13.7 * Math.cos((PI * (x - 56)) / 90);
    const pts: number[] = [];

    for (let x = 0; x <= 196; x += 2) pts.push(x, cy(x));
    g.polyline(pts).stroke({ width: 1.3, color: 0xaeb2ba });
    const nx = 112 + osc(c.t, 0.2) * 2;

    g.line(nx, 19, nx, 86).stroke({ width: 1.5, color: W });
    g.circle(nx, cy(nx), 2.7).fill(W);
    c.text('90°', 192, 31.5, { size: 12.5, color: GRAY, weight: '500', align: 'right' });
    c.text('-90°', 192, 83, { size: 12.5, color: GRAY, weight: '500', align: 'right' });
    c.text('18', 4, 83, { size: 12.5, color: GRAY, weight: '500' });
    c.text('OCT 14', 51.5, 83, { size: 11.5, color: GRAY, weight: '500' });
    c.text('06', 94, 83, { size: 11.5, color: GRAY, weight: '500' });
    c.text('12', 134, 83, { size: 12.5, color: GRAY, weight: '500' });
}

export default card(jupiter, { id: 's2-jupiter', name: 'Jupiter', size: [196, 88], style: STYLE });
