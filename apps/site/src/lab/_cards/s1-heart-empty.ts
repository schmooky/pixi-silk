import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import { AURA_BRIDGE, AURA_HEART, AURA_TILE, heartCandles } from '../_sheets/kit1';
import { STYLE } from '../_sheets/style1';

/** Heart rate · app. */
export function heartEmpty(c: Cx): void {
    const { g } = c;

    heartCandles(c, true);
    // Aura app icon: a green tile and a white tile melting into each other, lettering and a heart
    g.roundRect(386.75, 37.75, 38.75, 38.75, 9, 0.3).fill(0x10cf46);
    g.roundRect(404.25, 19, 40, 40, 9, 0.3).fill(AURA_TILE);
    g.roundRect(398, 31, 30, 30, 13).fill(AURA_BRIDGE);
    g.heart(428.6, 33.5, 20, 0.14).fill(AURA_HEART);
    c.text('ΛU', 394, 55.5, { size: 13.5, color: 0x0b3a18, weight: '500', spacing: 3 });
    c.text('RΛ', 394, 70, { size: 13.5, color: 0x0b3a18, weight: '500', spacing: 3 });
}

export default card(heartEmpty, { id: 's1-heart-empty', name: 'Heart rate · app', size: [463, 191], style: STYLE });
