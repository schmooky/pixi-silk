import { twoFactor } from '../_cards/s5-2fa';
import { activityRows } from '../_cards/s5-activity';
import { airpods } from '../_cards/s5-airpods';
import { barometer } from '../_cards/s5-barometer';
import { battery } from '../_cards/s5-battery';
import { bloodPressure } from '../_cards/s5-blood-pressure';
import { compass } from '../_cards/s5-compass';
import { crosshair } from '../_cards/s5-crosshair';
import { cycling } from '../_cards/s5-cycling';
import { energy } from '../_cards/s5-energy';
import { garage } from '../_cards/s5-garage';
import { moon } from '../_cards/s5-moon';
import { noise } from '../_cards/s5-noise';
import { nowPlaying } from '../_cards/s5-now-playing';
import { reading } from '../_cards/s5-reading';
import { screenTime } from '../_cards/s5-screen-time';
import { sleepBlocks } from '../_cards/s5-sleep-blocks';
import { tempCompare } from '../_cards/s5-temp';
import { weatherWeek } from '../_cards/s5-weather';
import { zone2 } from '../_cards/s5-zone';
import type { Cx, SheetWidget } from './cx';
import { XS, YS } from './kit5';

/* Reference sheet 5: where each widget sits. The widgets are in lab/_cards, one per file. */

const defs: [string, string, (c: Cx) => void][] = [
    ['s5-cycling', 'Cycling heart rate', cycling],
    ['s5-2fa', 'One-time code', twoFactor],
    ['s5-now-playing', 'Now playing', nowPlaying],
    ['s5-weather', 'Weather week', weatherWeek],
    ['s5-energy', 'Energy & cost', energy],
    ['s5-blood-pressure', 'Blood pressure', bloodPressure],
    ['s5-battery', 'Car battery day', battery],
    ['s5-crosshair', 'Crosshair grid', crosshair],
    ['s5-garage', 'Garage door', garage],
    ['s5-sleep-blocks', 'Sleep stages', sleepBlocks],
    ['s5-activity', 'Activity rows', activityRows],
    ['s5-noise', 'Noise', noise],
    ['s5-temp', 'Temperature compare', tempCompare],
    ['s5-screen-time', 'Screen time', screenTime],
    ['s5-airpods', 'Find AirPods', airpods],
    ['s5-compass', 'Compass', compass],
    ['s5-barometer', 'Barometer', barometer],
    ['s5-zone', 'Time in zone', zone2],
    ['s5-reading', 'Reading goal', reading],
    ['s5-moon', 'Moon phases', moon],
];

export const sheet5: SheetWidget[] = defs.map(([id, name, draw], i) => ({
    id,
    name,
    x: XS[i % 4],
    y: YS[Math.floor(i / 4)],
    w: 196,
    h: 88,
    draw,
}));
