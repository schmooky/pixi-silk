import { linear, radial } from 'pixi-silk';
import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { aqiDots, DIM, GRAY, RED, W } from '../_sheets/kit5';
import { STYLE } from '../_sheets/style5';

/** Weather week. */
export function weatherWeek(c: Cx): void {
    const { g } = c;

    I.sunIcon(g, 11.5, 7.5, 12, 0xffd60a);
    I.cloud(g, 7, 13, 12, W);
    c.text('22°C', 19, 17, { size: 17, weight: '600' });
    const gx = c.text('21-Good', 194, 17, { size: 17, color: 0x64d2ff, weight: '600', align: 'right' }).x;

    aqiDots(g, gx - 11, 11, 13, 0x64d2ff);
    c.text('27°', 0, 34.7, { size: 12.5, color: GRAY, weight: '500' });
    c.text('20°', 0, 50.7, { size: 12.5, color: GRAY, weight: '500' });
    c.text('18°', 0, 66.3, { size: 12.5, color: GRAY, weight: '500' });
    for (let i = 0; i <= 7; i++)
        g.line(25.7 + i * 24.3, 26, 25.7 + i * 24.3, 66.7).stroke({ width: 1, color: 0x2c2c2e });
    for (const y of [26, 36.3, 46.7, 56.7, 66.7]) g.line(25.7, y, 196, y).stroke({ width: 1, color: 0x2c2c2e });
    g.circle(121.3, 42.3, 20).fill({
        gradient: radial([
            [0, 0xffd60a, 0.35],
            [1, 0xffd60a, 0],
        ]),
    });
    const pts = [25.7, 62.3, 50, 62.3, 74.3, 51.7, 98.6, 51.7, 121.3, 42.3, 147, 42.3, 171.3, 30.7, 196, 30.7];

    g.polyline(pts).stroke({
        width: 2.4,
        cap: 'round',
        gradient: linear(
            [
                [0, 0x30d158],
                [0.3, 0xffd60a],
                [0.62, 0xffc02a],
                [1, 0xff453a],
            ],
            { units: 'local', from: [0, 62.3], to: [0, 30.7] },
        ),
    });
    g.circle(121.3, 42.3, 3.2).fill(W);
    c.text('18°', 27, 57.5, { size: 13.5, color: 0x30d158, weight: '600' });
    c.text('27°', 195, 49.5, { size: 13.5, color: RED, weight: '600', align: 'right' });
    ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach((d, i) =>
        c.text(d, 30 + i * 24.4, 83, {
            size: 12.5,
            color: i === 4 ? W : DIM,
            weight: i === 4 ? '700' : '500',
            align: 'center',
        }),
    );
}

export default card(weatherWeek, { id: 's5-weather', name: 'Weather week', size: [196, 88], style: STYLE });
