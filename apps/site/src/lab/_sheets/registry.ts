import { sheet1Card } from './kit1';
import { sheet4Backdrop, sheet4Card } from './kit4';
import type { SheetOptions } from './sheet';
import { sheet1 } from './sheet1';
import { sheet2 } from './sheet2';
import { sheet3 } from './sheet3';
import { sheet4 } from './sheet4';
import { sheet5 } from './sheet5';

export interface SheetDef extends SheetOptions {
    /** Short name for pickers. */
    label: string;
    /** Context (in sheet pixels) shown around a widget in the viewer. */
    margin: number;
}

/** Every reference sheet with the settings its rebuild needs. */
export const SHEETS: SheetDef[] = [
    {
        label: 'Sheet 1: Health cards',
        title: 'Sheet: health cards',
        subtitle:
            'Reference sheet 1 rebuilt 1:1: ten Health cards with area, bar, candle and range charts. Use "Compare with reference" and drag the handle.',
        ref: '1.jpg',
        width: 1080,
        height: 1080,
        background: 0x000000,
        card: sheet1Card,
        widgets: sheet1,
        margin: 16,
    },
    {
        label: 'Sheet 2: Complications',
        title: 'Sheet: watch complications',
        subtitle:
            'Reference sheet 2 rebuilt 1:1 in reference pixels: twenty live complications. Use "Compare with reference" and drag the handle.',
        ref: '2.jpg',
        width: 1200,
        height: 900,
        background: 0x000000,
        condense: 0.93,
        widgets: sheet2,
        margin: 14,
    },
    {
        label: 'Sheet 3: Fitness & home',
        title: 'Sheet: fitness & home',
        subtitle:
            'Reference sheet 3 rebuilt 1:1 in reference pixels: twenty complications with charts, maps and gauges. Use "Compare with reference" and drag the handle.',
        ref: '3.jpg',
        width: 1080,
        height: 1080,
        background: 0x000000,
        condense: 0.93,
        widgets: sheet3,
        margin: 14,
    },
    {
        label: 'Sheet 4: Live Activities',
        title: 'Sheet: live activities',
        subtitle:
            'Reference sheet 4 rebuilt 1:1: black Live Activity cards with continuous corners and big soft shadows on a light backdrop. Use "Compare with reference" and drag the handle.',
        ref: '4.jpg',
        width: 1200,
        height: 672,
        background: 0xe8e8e8,
        optical: 2,
        backdrop: sheet4Backdrop,
        card: sheet4Card,
        widgets: sheet4,
        margin: 30,
    },
    {
        label: 'Sheet 5: Watch widgets',
        title: 'Sheet: watch widgets',
        subtitle:
            'Reference sheet 5 rebuilt 1:1: twenty live complications. Compare with the reference, or switch to List for one widget per row.',
        ref: '5.jpg',
        width: 1200,
        height: 900,
        background: 0x000000,
        condense: 0.93,
        widgets: sheet5,
        margin: 14,
    },
];
