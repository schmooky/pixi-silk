import { cadence } from '../_cards/s4-cadence';
import { delivery } from '../_cards/s4-delivery';
import { espresso } from '../_cards/s4-espresso';
import { flight } from '../_cards/s4-flight';
import { glucose } from '../_cards/s4-glucose';
import { iss } from '../_cards/s4-iss';
import { meter } from '../_cards/s4-meter';
import { pickup } from '../_cards/s4-pickup';
import { pressure } from '../_cards/s4-pressure';
import { race } from '../_cards/s4-race';
import { sunset } from '../_cards/s4-sunset';
import type { SheetWidget } from './cx';
import {
    type Def,
    edgeBike,
    edgeBox,
    edgeBus,
    edgeDashes,
    edgeDrop,
    edgeDropOff,
    edgeEv,
    edgeF1,
    edgeHeart,
    edgeMt,
    edgeParking,
    edgePlane,
    none,
    train,
} from './kit4';

/* Reference sheet 4: where each widget sits. The widgets are in lab/_cards, one per file. */

const defs: Def[] = [
    ['s4-flight', 'Flight', 114, 32, 292, 102, flight],
    ['s4-pickup', 'Order pickup', 113, 178, 293, 132, pickup],
    ['s4-glucose', 'Glucose', 113, 354, 293, 158, glucose],
    ['s4-delivery', 'Delivery', 115, 561, 291, 132, delivery],
    ['s4-train', 'Train', 459, -60, 286, 128, train, true],
    ['s4-espresso', 'Espresso timer', 458, 106, 287, 137, espresso],
    ['s4-iss', 'ISS flyover', 457, 296, 286, 141, iss],
    ['s4-cadence', 'Run cadence', 456, 486, 286, 147, cadence],
    ['s4-sunset', 'Sunset', 796, 39, 282, 123, sunset],
    ['s4-pressure', 'Blood pressure', 797, 205, 282, 132, pressure],
    ['s4-meter', 'Parking meter', 796, 377, 280, 66, meter, false, 33],
    ['s4-race', 'Race', 797, 485, 281, 127, race],
    // cut by the sheet edges
    ['s4-edge-dashes', 'Edge', -130, 42, 205, 37, edgeDashes, true, 18.5],
    ['s4-edge-mt', 'Edge', -205, 143, 280, 64, edgeMt, true, 32],
    ['s4-edge-parking', 'Edge', -217, 271, 292, 144, edgeParking, true],
    ['s4-edge-plane', 'Edge', -130, 476, 206, 36, edgePlane, true, 18],
    ['s4-edge-box', 'Edge', -130, 573, 208, 37, edgeBox, true, 18.5],
    ['s4-edge-bottom', 'Edge', 501, 662, 197, 36, none, true, 18],
    ['s4-edge-top', 'Edge', 804, -25, 197, 36, none, true, 18],
    ['s4-edge-ev', 'Edge', 795, 651, 202, 40, edgeEv, true, 20],
    ['s4-edge-bike', 'Edge', 1109, 31, 205, 36, edgeBike, true, 18],
    ['s4-edge-bus', 'Edge', 1112, 132, 205, 36, edgeBus, true, 18],
    ['s4-edge-heart', 'Edge', 1113, 218, 280, 67, edgeHeart, true, 33.5],
    ['s4-edge-dropoff', 'Edge', 1116, 348, 290, 126, edgeDropOff, true],
    ['s4-edge-f1', 'Edge', 1112, 539, 205, 36, edgeF1, true, 18],
    ['s4-edge-drop', 'Edge', 1086, 641, 205, 36, edgeDrop, true, 18],
];

export const sheet4: SheetWidget[] = defs.map(([id, name, x, y, w, h, draw, partial, radius]) => ({
    id,
    name,
    x,
    y,
    w,
    h,
    draw,
    partial,
    radius,
}));
