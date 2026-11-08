import { boarding } from '../_cards/s3-boarding';
import { bpmScatter } from '../_cards/s3-bpm';
import { detected } from '../_cards/s3-detected';
import { elevation } from '../_cards/s3-elevation';
import { goldenTime } from '../_cards/s3-golden-time';
import { hikeMap } from '../_cards/s3-hike';
import { lamp } from '../_cards/s3-lamp';
import { london } from '../_cards/s3-london';
import { runPace } from '../_cards/s3-pace';
import { cyclingPower } from '../_cards/s3-power';
import { reminder } from '../_cards/s3-reminder';
import { restingHr } from '../_cards/s3-resting';
import { runCandles } from '../_cards/s3-run';
import { sleepQuality } from '../_cards/s3-sleep';
import { soundLevels } from '../_cards/s3-sound';
import { uvWeek } from '../_cards/s3-uv';
import { water } from '../_cards/s3-water';
import { weekCalendar } from '../_cards/s3-week';
import { wind } from '../_cards/s3-wind';
import { zoneStack } from '../_cards/s3-zone';
import type { Cx, SheetWidget } from './cx';
import { XS, YS } from './kit3';

/* Reference sheet 3: where each widget sits. The widgets are in lab/_cards, one per file. */

const defs: [string, string, (c: Cx) => void][] = [
    ['s3-golden-time', 'Golden time', goldenTime],
    ['s3-week', 'Week calendar', weekCalendar],
    ['s3-run', 'Run heart rate', runCandles],
    ['s3-bpm', 'Heart rate scatter', bpmScatter],
    ['s3-lamp', 'Accent lamp', lamp],
    ['s3-resting', 'Resting heart rate', restingHr],
    ['s3-uv', 'UV index', uvWeek],
    ['s3-hike', 'Hike map', hikeMap],
    ['s3-sound', 'Sound levels', soundLevels],
    ['s3-reminder', 'Next event', reminder],
    ['s3-detected', 'Motion detected', detected],
    ['s3-elevation', 'Elevation', elevation],
    ['s3-sleep', 'Sleep quality', sleepQuality],
    ['s3-power', 'Cycling power', cyclingPower],
    ['s3-water', 'Water intake', water],
    ['s3-pace', 'Run pace', runPace],
    ['s3-zone', 'Time in zone', zoneStack],
    ['s3-london', 'Weather', london],
    ['s3-boarding', 'Boarding', boarding],
    ['s3-wind', 'Wind', wind],
];

export const sheet3: SheetWidget[] = defs.map(([id, name, draw], i) => ({
    id,
    name,
    x: XS[i % 4],
    y: YS[Math.floor(i / 4)],
    w: 192,
    h: 88,
    draw,
}));
