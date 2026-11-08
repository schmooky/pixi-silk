import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import * as I from '../_sheets/icons';
import { GRAY, W } from '../_sheets/kit2';
import { STYLE } from '../_sheets/style2';

/** Mood tracker. */
export function mood(c: Cx): void {
    const { g } = c;

    I.smiley(g, 6.5, 10.5, 6.3, W);
    c.text('MOOD TRACKER', 16, 16.5, { size: 15.5, weight: '600' });
    const lines = [-1.3, 27, 55.3, 83.7, 112, 140.3, 168.7, 197];

    for (const x of lines) g.line(x, 24, x, 86).stroke({ width: 1, color: 0x2c2c2e });
    const days = ['17', '18', '19', '20', '21', '22', '23'];
    const letters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const faces: Record<number, string> = { 0: '🙂', 2: '🥵', 3: '🥶' };

    days.forEach((d, i) => {
        const x = (lines[i] + lines[i + 1]) / 2;
        const today = i === 4;

        c.text(d, x, 30.5, { size: 13, color: today ? W : GRAY, weight: today ? '600' : '500', align: 'center' });
        if (faces[i]) c.text(faces[i], x, 51, { size: 21, rotation: 0 });
        else I.smiley(g, x, 50.5, 8.3, 0x48484a, true);
        c.text(letters[i], x, 80.5, {
            size: 12.5,
            color: today ? W : GRAY,
            weight: today ? '600' : '500',
            align: 'center',
        });
    });
}

export default card(mood, { id: 's2-mood', name: 'Mood tracker', size: [196, 88], style: STYLE });
