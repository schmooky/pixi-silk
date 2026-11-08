import { along, radial } from 'pixi-silk';
import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { W } from '../_sheets/kit2';
import { STYLE } from '../_sheets/style2';

export function goldenHour(c: Cx): void {
    const { g } = c;

    g.ellipse(96, 30, 52, 20).fill({
        gradient: radial([
            [0, 0x2b2152, 0.85],
            [1, 0x2b2152, 0],
        ]),
        blur: 6,
    });
    c.text('18:43 - 19:41', 0, 16.5, { size: 17, weight: '600' });
    c.text('GOLDEN', 192, 15.5, { size: 12.5, weight: '600', align: 'right' });
    c.text('HOUR', 192, 30.5, { size: 12.5, weight: '600', align: 'right' });
    g.line(0, 47.3, 192, 47.3).stroke({ width: 1, color: 0x48484a });
    const pts: number[] = [];

    for (let i = 0; i <= 40; i++) {
        const u = i / 40;

        pts.push(64 + 103 * u, 25.7 + 51 * (1 - (1 - u) ** 2.3));
    }
    g.polyline(pts).stroke({
        width: [1.2, 5.2],
        cap: 'round',
        gradient: along(
            [
                [0, 0xf4d9c6, 0],
                [0.12, 0xf0b89a, 0.55],
                [0.26, 0xe0643a],
                [0.55, 0x9a4cf0],
                [1, 0x7b4cff],
            ],
            { easing: 'smooth' },
        ),
    });
    I.cloud(g, 7.5, 77, 14, W);
    c.text('17%', 16.5, 82.5, { size: 14, weight: '600' });
    I.drop(g, 61.5, 76.5, 11.5, W);
    c.text('0%', 67.5, 82.5, { size: 14, weight: '600' });
    I.navArrow(g, 184, 77, 11, W);
}

export default card(goldenHour, { id: 's2-golden', name: 'Golden hour', size: [196, 88], style: STYLE });
