import { linear } from 'pixi-silk';
import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { GRAY, osc, W } from '../_sheets/kit5';
import { STYLE } from '../_sheets/style5';

export function tempCompare(c: Cx): void {
    const { g } = c;
    const grad = linear(
        [
            [0, 0x0d2440],
            [0.45, 0x3d6a8c],
            [1, 0xcdeede],
        ],
        { units: 'local', from: [0, 0], to: [200, 0] },
    );

    I.thermometer(g, 4, 10.5, 15, W);
    c.text('7°C', 11, 17, { size: 17.5, weight: '600' });
    c.text('COMPARE WITH', 176, 10.5, { size: 9.5, weight: '600', align: 'right' });
    c.text('YESTERDAY', 176, 20.5, { size: 9.5, weight: '600', align: 'right' });
    c.text('+2°', 178, 16.5, { size: 13.5, color: 0x64d2ff, weight: '600' });
    g.roundRect(-4, 22.3, 77.5, 40, 11).fill(grad);
    g.roundRect(77.3, 22.3, 124, 40, 11).fill(grad);
    g.rect(60, 31, 30, 23).fill(grad);
    const mx = 74 + osc(c.t, 0.3) * 1.5;

    g.line(mx, 31.5, mx, 53.5).stroke({ width: 2.4, color: W, cap: 'round' });
    I.arrow(g, 5, 77.5, 11, GRAY, 'down', 0.13);
    c.text('6°', 11, 83, { size: 16.5, color: GRAY, weight: '500' });
    I.arrow(g, 36, 77.5, 11, GRAY, 'up', 0.13);
    c.text('11°', 42, 83, { size: 16.5, color: GRAY, weight: '500' });
    c.text('Mostly Cloudy', 194, 83, { size: 16.5, weight: '500', align: 'right' });
}

export default card(tempCompare, { id: 's5-temp', name: 'Temperature compare', size: [196, 88], style: STYLE });
