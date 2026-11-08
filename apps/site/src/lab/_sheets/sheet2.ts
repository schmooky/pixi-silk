import { budget } from '../_cards/s2-budget';
import { calendar } from '../_cards/s2-calendar';
import { cardSpend } from '../_cards/s2-card';
import { analogClock } from '../_cards/s2-clock';
import { energy } from '../_cards/s2-energy';
import { glucose } from '../_cards/s2-glucose';
import { goldenHour } from '../_cards/s2-golden';
import { home } from '../_cards/s2-home';
import { jupiter } from '../_cards/s2-jupiter';
import { mood } from '../_cards/s2-mood';
import { network } from '../_cards/s2-network';
import { pillsMatrix } from '../_cards/s2-pills';
import { sleep } from '../_cards/s2-sleep';
import { streak } from '../_cards/s2-streak';
import { sunAltitude } from '../_cards/s2-sun';
import { tesla } from '../_cards/s2-tesla';
import { totalTime } from '../_cards/s2-total-time';
import { tracks } from '../_cards/s2-tracks';
import { weather } from '../_cards/s2-weather';
import { zones } from '../_cards/s2-zones';
import type { Cx, SheetWidget } from './cx';
import { XS, YS } from './kit2';

/* Reference sheet 2: where each widget sits. The widgets are in lab/_cards, one per file. */

const defs: [string, string, (c: Cx) => void][] = [
    ['s2-zones', 'Heart rate zones', zones],
    ['s2-total-time', 'Total time', totalTime],
    ['s2-network', 'Network speed', network],
    ['s2-home', 'Home controls', home],
    ['s2-calendar', 'All-day events', calendar],
    ['s2-sun', 'Sun altitude', sunAltitude],
    ['s2-card', 'Card spending', cardSpend],
    ['s2-glucose', 'Glucose', glucose],
    ['s2-golden', 'Golden hour', goldenHour],
    ['s2-clock', 'Watch face', analogClock],
    ['s2-streak', 'Streak', streak],
    ['s2-jupiter', 'Jupiter', jupiter],
    ['s2-energy', 'Energy', energy],
    ['s2-weather', 'Rain', weather],
    ['s2-budget', 'Budget', budget],
    ['s2-tracks', 'Distance & steps', tracks],
    ['s2-pills', 'Pills', pillsMatrix],
    ['s2-mood', 'Mood tracker', mood],
    ['s2-sleep', 'Sleep', sleep],
    ['s2-tesla', 'Car battery', tesla],
];

export const sheet2: SheetWidget[] = defs.map(([id, name, draw], i) => ({
    id,
    name,
    x: XS[i % 4],
    y: YS[Math.floor(i / 4)],
    w: 196,
    h: 88,
    draw,
}));
