import { vertical } from 'pixi-silk';
import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { GRAY, W } from '../_sheets/kit2';
import { STYLE } from '../_sheets/style2';

/** Rain. */
export function weather(c: Cx): void {
    const { g } = c;

    I.cloudRain(g, 6.5, 10.5, 13.5, W, 0x5ac8fa);
    c.text('16°C', 17, 16.5, { size: 17, weight: '600' });
    let rx = c.text('6MM', 192, 16.5, { size: 16, color: 0x5ac8fa, weight: '600', align: 'right' }).x;

    rx = c.text('6°', rx - 7, 16.5, { size: 16, weight: '600', align: 'right' }).x;
    I.chevron(g, rx - 6, 11.5, 8, W, 'down', 0.2);
    rx = c.text('18°', rx - 13, 16.5, { size: 16, weight: '600', align: 'right' }).x;
    I.chevron(g, rx - 6, 11, 8, W, 'up', 0.2);
    g.rect(0, 30, 163, 42).fill(
        vertical([
            [0, 0x0c2638],
            [1, 0x061520],
        ]),
    );
    for (const vx of [41, 81, 121]) g.line(vx, 30, vx, 72).stroke({ width: 1, color: 0x22384a });
    // cloud cover: one tapered stroke, width per point
    const xs = [0, 8, 14, 22, 30, 50, 55, 60, 70, 76, 108, 114, 124, 130, 142, 150, 162];
    const ws = [2, 2, 3, 8, 9, 9, 3, 2, 2, 8, 8, 5, 5, 3, 3, 8, 8];

    g.polyline(xs.flatMap((x) => [x, 26.3])).stroke({ width: ws, color: 0xf2f2f7, cap: 'round' });
    [12.5, 20, 27.5, 35, 92, 100, 108, 131, 139].forEach((x) => g.circle(x, 43.3, 1.35).fill(0x4fc3f7));
    const pts: number[] = [];

    for (let x = 0; x <= 162; x += 2)
        pts.push(x, 60 + 2.2 * Math.sin(x * 0.14 + c.t * 0.6) + 1.4 * Math.sin(x * 0.05) - (x / 162) ** 6 * 6);
    g.polyline(pts).stroke({ width: 1.6, color: 0x8c99a6, cap: 'round' });
    g.circle(162.5, pts[pts.length - 1], 2.3).fill(W);
    I.cloud(g, 186, 30, 12, 0x6e6e73);
    I.chevron(g, 188, 48, 7, 0x6e6e73, 'up', 0.18);
    I.chevron(g, 188, 61.5, 7, 0x6e6e73, 'down', 0.18);
    for (const vx of [41, 81, 121, 162.7]) g.line(vx, 72, vx, 86).stroke({ width: 1, color: 0x3a3a3c });
    c.text('00', 3, 81.5, { size: 12.5, color: GRAY, weight: '500' });
    I.navArrow(g, 35, 77, 8.5, W);
    c.text('06', 46, 81.5, { size: 12.5, color: GRAY, weight: '500' });
    I.navArrow(g, 75, 77, 8.5, W);
    c.text('12', 86, 81.5, { size: 12.5, color: GRAY, weight: '500' });
    I.windArrow(g, 115, 77, 8.5, W);
    c.text('18', 126, 81.5, { size: 12.5, color: GRAY, weight: '500' });
    I.navArrow(g, 155, 77, 8.5, W);
    c.text('NOW', 192, 81.5, { size: 12.5, weight: '600', align: 'right' });
}

export default card(weather, { id: 's2-weather', name: 'Rain', size: [196, 88], style: STYLE });
