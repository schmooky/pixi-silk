import { linear, vertical } from 'pixi-silk';
import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { GRAY, W, wave } from '../_sheets/kit2';
import { STYLE } from '../_sheets/style2';

/** Network speed. */
export function network(c: Cx): void {
    const { g } = c;
    const blue = 0x6a67f5;
    const pink = 0xc56cf0;

    I.arrow(g, 4.5, 10.5, 12, blue, 'down', 0.14);
    let x = c.run(12, 16.5, [
        ['522', 17, W, '600', 3],
        ['Mbps', 12, GRAY, '500'],
    ]);

    I.arrow(g, x + 8, 10.5, 12, pink, 'up', 0.14);
    x = c.run(x + 15, 16.5, [
        ['32', 17, W, '600', 3],
        ['Mbps', 12, GRAY, '500'],
    ]);
    c.text('600', 0, 31.5, { size: 12, color: GRAY, weight: '500' });
    c.text('0', 0, 50, { size: 12, color: GRAY, weight: '500' });
    g.rect(31, 22, 163, 46).fill(
        vertical(
            [
                [0, 0x2a1a5a, 0],
                [0.45, 0x3b2170, 0.75],
                [0.7, 0x301a5a, 0.5],
                [1, 0x2a1a5a, 0],
            ],
            { easing: 'smooth' },
        ),
    );
    for (let i = 0; i < 24; i++) {
        const cx = 31 + i * 7;
        const top = 27 + wave(i, c.t * 1.3, 4) * 1.2;
        const bot = 46.2 + wave(i + 3, c.t * 1.1, 3) * 1.2;

        g.line(cx, top, cx, bot).stroke({
            width: 0.9,
            alpha: 0.75,
            gradient: linear([blue, pink], { units: 'local', from: [0, 27], to: [0, 46] }),
        });
        g.circle(cx, top, 1.7).fill(blue);
        g.circle(cx, bot, 1.7).fill(pink);
    }
    for (const lx of [31, 71, 113]) g.line(lx, 50, lx, 66).stroke({ width: 1, color: 0x3a3a3c });
    c.text('10m', 35, 63.5, { size: 12, color: 0x6e6e73, weight: '500' });
    c.text('20m', 75, 63.5, { size: 12, color: 0x6e6e73, weight: '500' });
    c.text('30m', 117, 63.5, { size: 12, color: 0x6e6e73, weight: '500' });
    c.text('NOW', 192, 63.5, { size: 12, weight: '600', align: 'right' });
    c.run(0, 83, [
        ['PING', 11.5, W, '600', 5],
        ['ms', 11.5, GRAY, '500'],
    ]);
    let rx = c.text('10', 193, 83, { size: 12, weight: '600', align: 'right' }).x;

    I.arrow(g, rx - 6, 78.5, 10, pink, 'up', 0.15);
    rx = c.text('34', rx - 13, 83, { size: 12, weight: '600', align: 'right' }).x;
    I.arrow(g, rx - 6, 78.5, 10, blue, 'down', 0.15);
    rx = c.text('16', rx - 13, 83, { size: 12, weight: '600', align: 'right' }).x;
    I.transfer(g, rx - 8, 78.5, 10, 0x30d158);
}

export default card(network, { id: 's2-network', name: 'Network speed', size: [196, 88], style: STYLE });
