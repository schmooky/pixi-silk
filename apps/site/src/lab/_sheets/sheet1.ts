import { fatArea } from '../_cards/s1-fat-area';
import { fatBars } from '../_cards/s1-fat-bars';
import { fatBlocks } from '../_cards/s1-fat-blocks';
import { fatEmpty } from '../_cards/s1-fat-empty';
import { fatPlain } from '../_cards/s1-fat-plain';
import { fatProgress } from '../_cards/s1-fat-progress';
import { fatSignal } from '../_cards/s1-fat-signal';
import { heartRate } from '../_cards/s1-heart';
import { heartEmpty } from '../_cards/s1-heart-empty';
import { heartRange } from '../_cards/s1-heart-range';
import type { Cx, SheetWidget } from './cx';

/* Reference sheet 1: where each widget sits. The widgets are in lab/_cards, one per file. */

const defs: [string, string, number, number, number, number, (c: Cx) => void][] = [
    ['s1-fat-area', 'Body fat · trend', 60, 60, 462, 191, fatArea],
    ['s1-fat-empty', 'Body fat · no data', 557, 60, 463, 191, fatEmpty],
    ['s1-fat-bars', 'Body fat · daily', 60, 286, 462, 191, fatBars],
    ['s1-fat-blocks', 'Body fat · weekly', 557, 286, 463, 191, fatBlocks],
    ['s1-heart', 'Heart rate', 60, 511, 462, 191, heartRate],
    ['s1-heart-empty', 'Heart rate · app', 557, 511, 463, 191, heartEmpty],
    ['s1-fat-progress', 'Body fat · goal', 60, 737, 462, 153, fatProgress],
    ['s1-heart-range', 'Heart rate · range', 557, 737, 463, 153, heartRange],
    ['s1-fat-signal', 'Body fat · level', 60, 925, 462, 95, fatSignal],
    ['s1-fat-plain', 'Body fat', 557, 925, 463, 95, fatPlain],
];

export const sheet1: SheetWidget[] = defs.map(([id, name, x, y, w, h, draw]) => ({
    id,
    name,
    x,
    y,
    w,
    h,
    draw,
    radius: 18,
}));
