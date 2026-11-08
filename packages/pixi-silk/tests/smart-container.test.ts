import { Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { signal } from '../src/signal';
import { type LayoutData, placeBox, SmartContainer, type ViewportRect } from '../src/ui/layout';

/**
 * The placement of the SmartContainer the user's slot games ship, line for line: window size in,
 * position and scale out. Our container must give the same numbers for the same records.
 */
function games(portraitData: LayoutData, landscapeData: LayoutData, window: Required<ViewportRect>) {
    const base = {
        align: 'center',
        valign: 'center',
        height: 0,
        width: 0,
        stretchWidth: false,
        stretchHeight: false,
        correctionScaleX: 1,
        correctionScaleY: 1,
        correctionOffsetX: 0,
        correctionOffsetY: 0,
        fitCover: false,
    };
    const portrait = { ...base, viewportWidth: 1080, viewportHeight: 1920, ...portraitData } as Required<LayoutData>;
    const landscape = { ...base, viewportWidth: 1920, viewportHeight: 1080, ...landscapeData } as Required<LayoutData>;
    const { width: windowWidth, height: windowHeight, x: windowX, y: windowY } = window;
    const d = windowHeight > windowWidth ? portrait : landscape;
    const m = d.fitCover ? Math.max : Math.min;
    let { width, height } = d;
    let scaleX = m(windowWidth / 1920, windowHeight / 1080);
    let scaleY = scaleX;

    if (d.viewportWidth || d.viewportHeight) {
        scaleX = scaleY = m(windowWidth / (d.viewportWidth || 1920), windowHeight / (d.viewportHeight || 1080));
    }
    if (d.stretchWidth) {
        scaleX = windowWidth / width;
        width = windowWidth / scaleX;
    }
    if (d.stretchHeight) {
        scaleY = windowHeight / height;
        height = windowHeight / scaleY;
    }
    scaleX *= d.correctionScaleX;
    scaleY *= d.correctionScaleY;
    let posX = 0;
    let posY = 0;

    if (d.align === 'right') posX = windowWidth - width * scaleX;
    else if (d.align === 'center') posX = (windowWidth - width * scaleX) / 2;
    if (d.valign === 'bottom') posY = windowHeight - height * scaleY;
    else if (d.valign === 'center') posY = (windowHeight - height * scaleY) / 2;

    return {
        x: windowX + posX + d.correctionOffsetX * scaleX,
        y: windowY + posY + d.correctionOffsetY * scaleY,
        scaleX,
        scaleY,
    };
}

const RECORDS: [string, LayoutData, LayoutData][] = [
    ['defaults', {}, {}],
    ['centred box', { width: 1000, height: 1200 }, { width: 1600, height: 900 }],
    [
        'top left pin',
        { align: 'left', valign: 'top', width: 300, height: 120 },
        { align: 'left', valign: 'top', width: 400, height: 120 },
    ],
    [
        'bottom right pin',
        { align: 'right', valign: 'bottom', width: 300, height: 120 },
        { align: 'right', valign: 'bottom', width: 360, height: 100 },
    ],
    ['cover', { fitCover: true, width: 1080, height: 1920 }, { fitCover: true, width: 1920, height: 1080 }],
    [
        'stretch width',
        { valign: 'bottom', width: 1080, height: 160, stretchWidth: true },
        { valign: 'bottom', width: 1920, height: 140, stretchWidth: true },
    ],
    [
        'stretch both',
        { width: 1080, height: 1920, stretchWidth: true, stretchHeight: true },
        { width: 1920, height: 1080, stretchWidth: true, stretchHeight: true, align: 'left' },
    ],
    [
        'corrections',
        {
            width: 500,
            height: 500,
            correctionScaleX: 1.2,
            correctionScaleY: 0.8,
            correctionOffsetX: 40,
            correctionOffsetY: -30,
        },
        {
            width: 500,
            height: 500,
            align: 'right',
            correctionScaleX: 0.9,
            correctionOffsetX: -25,
            correctionOffsetY: 15,
        },
    ],
    [
        'own reference',
        { viewportWidth: 750, viewportHeight: 1334, width: 750, height: 1334 },
        { viewportWidth: 1280, viewportHeight: 720, width: 1280, height: 720, fitCover: true },
    ],
];
const WINDOWS: Required<ViewportRect>[] = [
    { x: 0, y: 0, width: 1920, height: 1080 },
    { x: 0, y: 0, width: 1280, height: 720 },
    { x: 0, y: 0, width: 2560, height: 1080 },
    { x: 0, y: 0, width: 1024, height: 768 },
    { x: 0, y: 0, width: 390, height: 844 },
    { x: 0, y: 0, width: 768, height: 1024 },
    { x: 12, y: 30, width: 360, height: 800 },
];

const rect = (r: ViewportRect) => ({ ...r });
const place = (c: SmartContainer) => ({ x: c.x, y: c.y, scaleX: c.scale.x, scaleY: c.scale.y });

describe('SmartContainer placement', () => {
    for (const [name, portraitData, landscapeData] of RECORDS) {
        it(`matches the games' SmartContainer: ${name}`, () => {
            for (const window of WINDOWS) {
                const c = new SmartContainer({ ticker: null, portraitData, landscapeData, viewport: rect(window) });
                const want = games(portraitData, landscapeData, window);
                const got = place(c);

                for (const k of ['x', 'y', 'scaleX', 'scaleY'] as const) expect(got[k]).toBeCloseTo(want[k], 9);
            }
        });
    }

    it('gives the hand-worked numbers', () => {
        expect(placeBox({ width: 400, height: 200 }, { width: 1280, height: 720 })).toMatchObject({
            x: (1280 - 400 * (2 / 3)) / 2,
            scaleX: 2 / 3,
        });
        const bar = new SmartContainer({
            ticker: null,
            portraitData: { width: 1080, height: 300, valign: 'bottom' },
            viewport: { width: 720, height: 1280 },
        });

        expect([bar.x, bar.y, +bar.scale.x.toFixed(4), bar.breakpoint]).toEqual([0, 1080, 0.6667, 'portrait']);
        const cover = new SmartContainer({
            ticker: null,
            landscapeData: { fitCover: true },
            viewport: { width: 1000, height: 1000 },
        });

        expect(cover.scale.x).toBeCloseTo(1000 / 1080);
        const stretched = new SmartContainer({
            ticker: null,
            landscapeData: { width: 1920, height: 140, stretchWidth: true, valign: 'bottom' },
            viewport: { width: 1000, height: 500 },
        });

        expect(stretched.scale.x).toBeCloseTo(1000 / 1920, 12);
        expect(stretched.scale.y).toBeCloseTo(500 / 1080, 12);
        expect(stretched.x).toBeCloseTo(0, 9);
    });
});

describe('SmartContainer viewport', () => {
    it('follows an application renderer, and stops on destroy', () => {
        const listeners = new Set<() => void>();
        const app = {
            screen: { x: 0, y: 0, width: 1920, height: 1080 },
            renderer: {
                on: (_: string, fn: () => void) => listeners.add(fn),
                off: (_: string, fn: () => void) => listeners.delete(fn),
            },
        };
        const c = new SmartContainer({
            ticker: null,
            landscapeData: { width: 100, height: 100 },
            viewport: app as never,
        });

        expect(c.scale.x).toBe(1);
        app.screen.width = 960;
        app.screen.height = 540;
        for (const fn of listeners) fn();
        expect(c.scale.x).toBe(0.5);
        c.destroy();
        expect(listeners.size).toBe(0);
    });

    it('follows a signal of a rectangle', () => {
        const view = signal<ViewportRect>({ width: 1920, height: 1080 });
        const c = new SmartContainer({ ticker: null, viewport: view });

        expect(c.breakpoint).toBe('landscape');
        view.value = { width: 1080, height: 1920 };
        expect(c.breakpoint).toBe('portrait');
        expect(c.scale.x).toBe(1);
    });

    it('picks the first named breakpoint that matches', () => {
        const c = new SmartContainer({
            ticker: null,
            breakpoints: [
                { name: 'ultrawide', when: (w, h) => w / h > 2, data: { viewportWidth: 2560, viewportHeight: 1080 } },
            ],
            viewport: { width: 2560, height: 1080 },
        });

        expect([c.breakpoint, c.scale.x]).toEqual(['ultrawide', 1]);
    });

    it('keeps the box clear of safe-area insets unless a record ignores them', () => {
        const pinned = new SmartContainer({
            ticker: null,
            safeArea: { top: 44, left: 20 },
            landscapeData: { align: 'left', valign: 'top', width: 100, height: 100 },
            viewport: { width: 1920, height: 1080 },
        });
        const bleed = new SmartContainer({
            ticker: null,
            safeArea: { top: 44, left: 20 },
            landscapeData: { align: 'left', valign: 'top', ignoreSafeArea: true },
            viewport: { width: 1920, height: 1080 },
        });

        expect([pinned.x, pinned.y]).toEqual([20, 44]);
        expect(pinned.scale.x).toBeCloseTo(Math.min(1900 / 1920, 1036 / 1080));
        expect([bleed.x, bleed.y, bleed.scale.x]).toEqual([0, 0, 1]);
    });

    it('glides to the new place after a breakpoint switch when asked', () => {
        const view = { width: 1920, height: 1080 };
        const c = new SmartContainer({
            ticker: null,
            switchTransition: true,
            portraitData: { valign: 'top', width: 1080, height: 200 },
            landscapeData: { valign: 'bottom', width: 1920, height: 200 },
            viewport: view,
        });

        expect(c.y).toBe(880);
        view.width = 1080;
        view.height = 1920;
        c.updateContainer();
        expect(c.y).toBe(880);
        c.tick(1 / 60);
        expect(c.y).toBeLessThan(880);
        for (let i = 0; i < 600 && c.tick(1 / 60); i++);
        expect(c.y).toBeCloseTo(0, 3);
        // a resize inside one breakpoint snaps
        view.width = 1000;
        c.updateContainer();
        expect(c.scale.x).toBeCloseTo(1000 / 1080);
    });
});

describe('SmartContainer inner layout', () => {
    it('leaves children alone without a layout', () => {
        const c = new SmartContainer({
            ticker: null,
            landscapeData: { width: 400, height: 200 },
            viewport: { width: 1920, height: 1080 },
        });
        const child = c.addChild(new Graphics().rect(0, 0, 10, 10).fill(0));

        child.position.set(33, 44);
        c.updateLayout();
        expect([child.x, child.y]).toEqual([33, 44]);
    });

    it('lays out children with flex inside the design box, extended to the window', () => {
        const c = new SmartContainer({
            ticker: null,
            layout: { justifyContent: 'space-between', alignItems: 'center', padding: 20 },
            landscapeData: { valign: 'bottom', width: 1920, height: 140, extendWidth: true },
            viewport: { width: 2560, height: 1080 },
        });
        const a = c.add(new Graphics().rect(0, 0, 100, 60).fill(0));
        const b = c.add(new Graphics().rect(0, 0, 100, 60).fill(0), { fit: 'contain', width: 200, height: 100 });

        c.updateLayout();
        // uniform scale 1, the box widened to the 2560 window
        expect([c.box.width, c.scale.x, c.scale.y, c.x, c.y]).toEqual([2560, 1, 1, 0, 940]);
        expect([a.x, a.y]).toEqual([20, 40]);
        expect([b.x, b.scale.x]).toEqual([2560 - 20 - 200 + (200 - 166.66666666666666) / 2, 100 / 60]);
    });

    it('switches flex styles by breakpoint name', () => {
        const view = { width: 1920, height: 1080 };
        const c = new SmartContainer({
            ticker: null,
            layout: { media: [{ breakpoint: 'portrait', style: { direction: 'column' } }], alignItems: 'start' },
            portraitData: { width: 1080, height: 1920 },
            landscapeData: { width: 1920, height: 1080 },
            viewport: view,
        });

        c.add(new Graphics().rect(0, 0, 100, 100).fill(0));
        const b = c.add(new Graphics().rect(0, 0, 100, 100).fill(0));

        c.updateLayout();
        expect([b.x, b.y]).toEqual([100, 0]);
        view.width = 1080;
        view.height = 1920;
        c.updateContainer();
        c.updateLayout();
        expect([b.x, b.y]).toEqual([0, 100]);
    });
});
