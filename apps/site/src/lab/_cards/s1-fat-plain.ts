import { card } from '../_sheets/card';
import type { Cx } from '../_sheets/cx';
import { fatHeader } from '../_sheets/kit1';
import { STYLE } from '../_sheets/style1';

/** Body fat. */
export function fatPlain(c: Cx): void {
    fatHeader(c, false);
}

export default card(fatPlain, { id: 's1-fat-plain', name: 'Body fat', size: [463, 95], style: STYLE });
