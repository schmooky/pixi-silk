import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { axis, DIM, EDGE_FADE, hash, osc, stripes, W } from '../_sheets/kit3';
import { STYLE } from '../_sheets/style3';

export function zoneStack(c: Cx): void {
    const { g, fg } = c;

    g.pill(26, 2.7, 28, 4).fill(0x1f4f8a);
    g.roundRect(20, 12.3, 40, 14.4, 4).fill(0x4ad8e8);
    c.text('ZONE 2', 40, 22.8, { size: 9.5, color: 0x083a40, weight: '800', align: 'center' });
    g.triangle(36.5, 30.5, 43.5, 30.5, 40, 26.5, 0.4).fill(W);
    g.pill(26, 32.5, 28, 4.5).fill(0x1a5a3a);
    g.pill(26, 39, 28, 4.5).fill(0x5a3a1a);
    g.pill(26, 45.5, 28, 4.5).fill(0x5a1a2a);
    c.text('TIME IN ZONE', 38, 62, { size: 10.5, weight: '600', align: 'center' });
    c.text('03:15', 37, 77.5, { size: 11, color: 0x5ac8fa, weight: '600', align: 'center' });
    const x = c.run(78, 16, [
        ['136', 16.5, W, '500', 2],
        ['BPM', 10.5, W, '600', 3],
    ]);

    g.heart(x + 6, 11, 11, 0.08).fill(0xff453a);
    c.text('AVG', x + 13, 16, { size: 10.5, weight: '600' });
    I.runner(g, 182, 10.5, 14, 0x30d158);
    stripes(g, 77.3, 195.7, 6.5, 24, 70);
    // audio-like waveform in two bursts, traced from the reference
    for (let bx = 80; bx <= 128; bx += 2) {
        const k = Math.round(bx);
        const burst = (bx > 86 && bx < 106) || (bx > 109 && bx < 126);
        const a = (burst ? 0.55 + 0.45 * hash(k) : 0.15 + 0.25 * hash(k)) * (1 + osc(c.t, 1.6, k) * 0.1);

        if (hash(k + 3) < 0.12) continue;
        g.line(bx, 44.7 - 10.5 * a, bx, 44.7 + 12 * a * (0.5 + 0.5 * hash(k + 7))).stroke({
            width: 1,
            color: 0xd83a34,
        });
    }
    g.line(77.3, 44.7, 195.7, 44.7).stroke({ width: 1.2, color: W });
    g.circle(77.3, 44.7, 2.3).fill(W);
    c.text('138', 187, 32, { size: 10.5, weight: '700', align: 'right' });
    c.text('129', 187, 67, { size: 10.5, weight: '700', align: 'right' });
    axis(
        c,
        [
            ['02:00', 80, DIM],
            ['03:00', 119, DIM],
            ['04:00', 158, DIM],
        ],
        81,
        [77.3, 116, 155],
    );
    fg.rect(176, 70, 24, 16).fill(EDGE_FADE);
}

export default card(zoneStack, { id: 's3-zone', name: 'Time in zone', size: [192, 88], style: STYLE });
