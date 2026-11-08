import { describe, expect, it, vi } from 'vitest';
import {
    ChannelSliders,
    ColorModel,
    ColorSlider,
    ColorWheel,
    Eyedropper,
    HueSquarePicker,
    HueTrianglePicker,
    hexToRgb,
    hsvToRgb,
    inGamut,
    maxChroma,
    OklchPicker,
    oklchToRgb,
    readChannel,
    rgbToHex,
    rgbToHsv,
    rgbToOklch,
    SwatchPalette,
    SwatchPopup,
    writeChannel,
} from '../src/ui/color';

type Priv = Record<string, (...args: unknown[]) => unknown>;
const priv = (o: object) => o as unknown as Priv;
const settle = (w: { tick(dt: number): boolean }) => {
    for (let i = 0; i < 400 && w.tick(1 / 60); i++);
};
const close = (a: number[], b: number[], digits = 3) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], digits));

describe('colour conversions', () => {
    it('converts HSV and RGB both ways', () => {
        close(hsvToRgb(0, 1, 1), [1, 0, 0]);
        close(hsvToRgb(120, 1, 1), [0, 1, 0]);
        close(hsvToRgb(240, 0.5, 0.5), [0.25, 0.25, 0.5]);
        const hsv = rgbToHsv(0.25, 0.25, 0.5);

        close([hsv.h, hsv.s, hsv.v], [240, 0.5, 0.5]);
    });

    it('keeps the hue of greys', () => {
        expect(rgbToHsv(0.5, 0.5, 0.5, 200).h).toBe(200);
        expect(rgbToOklch([0.5, 0.5, 0.5], 33)[2]).toBe(33);
    });

    it('round-trips hex', () => {
        expect(rgbToHex(hexToRgb(0x12abef))).toBe(0x12abef);
    });

    it('converts OKLCH and clamps to the gamut', () => {
        const [L, C] = rgbToOklch([1, 1, 1]);

        expect(L).toBeCloseTo(1, 3);
        expect(C).toBeCloseTo(0, 3);
        const lch = rgbToOklch([0.2, 0.6, 0.9]);

        close(oklchToRgb(...lch), [0.2, 0.6, 0.9]);
        const cm = maxChroma(0.7, 30);

        expect(inGamut(0.7, cm, 30)).toBe(true);
        expect(inGamut(0.7, cm + 0.01, 30)).toBe(false);
        // far outside: chroma is reduced, lightness kept
        const out = oklchToRgb(0.7, 0.5, 30);

        expect(out.every((c) => c >= 0 && c <= 1)).toBe(true);
        expect(rgbToOklch(out)[0]).toBeCloseTo(0.7, 2);
    });
});

describe('ColorModel', () => {
    it('reads and writes every form and records history without duplicates', () => {
        const m = new ColorModel({ color: 0xff0000, historySize: 2 });
        const fn = vi.fn();

        m.value.subscribe(fn);
        expect(m.hex).toBe(0xff0000);
        m.setHsv({ h: 120 });
        expect(m.hex).toBe(0x00ff00);
        m.setHsv({ h: 120 });
        expect(fn).toHaveBeenCalledTimes(1);
        m.commit();
        m.setHex(0x0000ff);
        m.commit();
        m.setHex(0x00ff00);
        m.commit();
        expect(m.history.value).toEqual([0x00ff00, 0x0000ff]);
        expect(m.committed.value).toBe(3);
    });
});

describe('ring pickers', () => {
    it('square: area maps to saturation / value, a ring drag stays on the ring', () => {
        const model = new ColorModel({ color: 0x808080 });
        const p = new HueSquarePicker({ model, size: 220, ticker: null });
        const half = priv(p)._half as unknown as number;

        priv(p)._begin(110 + half, 110 - half);
        expect(model.s).toBeCloseTo(1);
        expect(model.v).toBeCloseTo(1);
        priv(p)._move(500, 500);
        expect(model.s).toBe(1);
        expect(model.v).toBe(0);
        priv(p)._end();
        expect(model.history.value.length).toBe(1);

        // press on the ring at 3 o'clock: hue 90, then the drag crosses the centre and stays a hue drag
        priv(p)._begin(220 - 10, 110);
        expect(model.h).toBeCloseTo(90, 0);
        priv(p)._move(110, 220);
        expect(model.h).toBeCloseTo(180, 0);
        expect(model.v).toBe(0);
        priv(p)._end();
    });

    it('triangle: corners are pure hue, white and black', () => {
        const model = new ColorModel({ color: 0xff0000 });
        const p = new HueTrianglePicker({ model, ticker: null });
        const toArea = (s: number, v: number) => priv(p)._svToArea(s, v) as [number, number];
        const fromArea = (x: number, y: number) => priv(p)._areaToSv(x, y) as [number, number];

        close(fromArea(...toArea(1, 1)), [1, 1]);
        expect(fromArea(...toArea(0.3, 1))[1]).toBeCloseTo(1);
        close(fromArea(...toArea(0.4, 0.6)), [0.4, 0.6]);
        // black corner: value 0
        expect(fromArea(...toArea(0.5, 0))[1]).toBeCloseTo(0);
    });

    it('two pickers on one model stay in sync and settle', () => {
        const model = new ColorModel();
        const a = new HueSquarePicker({ model, ticker: null });
        const b = new ColorWheel({ model, ticker: null });

        priv(a)._begin(220 - 10, 110);
        priv(a)._end();
        settle(b);
        expect(priv(b)._angle).toBeCloseTo(0, 3);
        expect(b.tick(1 / 60)).toBe(false);
    });
});

describe('ColorWheel', () => {
    it('picks saturation by distance and value on the strip', () => {
        const model = new ColorModel({ color: 0xff0000 });
        const w = new ColorWheel({ model, size: 200, ticker: null });

        priv(w)._begin(100, 100);
        expect(model.s).toBe(0);
        priv(w)._move(100, -500);
        expect(model.s).toBe(1);
        expect(model.h).toBeCloseTo(0, 3);
        priv(w)._end();
        priv(w)._begin(200 + 14 + 9, 50);
        expect(model.v).toBeCloseTo(0.75);
    });
});

describe('OklchPicker', () => {
    it('keeps chroma inside the gamut while dragging', () => {
        const model = new ColorModel();
        const p = new OklchPicker({ model, width: 240, height: 160, ticker: null });

        priv(p)._begin(240, 0.3 * 160);
        const [L, C, h] = p.lch;

        expect(L).toBeCloseTo(0.7, 2);
        expect(C).toBeLessThanOrEqual(maxChroma(L, h) + 1e-9);
        expect(rgbToOklch(model.rgb)[0]).toBeCloseTo(0.7, 2);
        priv(p)._move(120, 160 + 12 + 8);
        priv(p)._end();
        // a drag started on the plane stays on the plane
        expect(p.lch[0]).toBe(0);
    });
});

describe('ColorSlider', () => {
    it('reads and writes every channel', () => {
        const model = new ColorModel({ color: 0x3366cc });

        for (const ch of ['h', 's', 'v', 'r', 'g', 'b', 'a', 'L'] as const) {
            writeChannel(model, ch, 0.4);
            expect(readChannel(model, ch)).toBeCloseTo(0.4, 2);
        }
    });

    it('maps the track with its round ends', () => {
        const model = new ColorModel({ color: 0xff0000 });
        const s = new ColorSlider({ model, channel: 's', width: 200, height: 20, ticker: null });

        priv(s)._begin(10, 10);
        expect(model.s).toBe(0);
        priv(s)._move(190, 10);
        expect(model.s).toBe(1);
        priv(s)._end();
    });
});

describe('ChannelSliders', () => {
    it('shares one model across its tracks when none is passed', () => {
        const sliders = new ChannelSliders({ ticker: null });
        const [hue, sat] = sliders.sliders;

        expect(new Set(sliders.sliders.map((s) => s.model)).size).toBe(1);
        expect(sliders.model).toBe(hue.model);
        writeChannel(hue.model, 'h', 0.5);
        expect(readChannel(sat.model, 'h')).toBeCloseTo(0.5, 2);
    });

    it('uses the model it is given', () => {
        const model = new ColorModel({ color: 0x336699 });
        const sliders = new ChannelSliders({ model, mode: 'rgb', ticker: null });

        expect(sliders.model).toBe(model);
        for (const s of sliders.sliders) expect(s.model).toBe(model);
    });
});

describe('swatches', () => {
    it('palette sets the colour on press and commits on release', () => {
        const model = new ColorModel();
        const pal = new SwatchPalette({
            model,
            colors: [0xff0000, 0x00ff00, 0x0000ff],
            size: 20,
            gap: 4,
            ticker: null,
        });

        priv(pal)._press(24 + 10, 10);
        expect(model.hex).toBe(0x00ff00);
        priv(pal)._release();
        expect(model.history.value).toEqual([0x00ff00]);
    });

    it('history palette follows commits', () => {
        const model = new ColorModel();
        const pal = new SwatchPalette({ model, ticker: null });

        model.setHex(0x123456);
        model.commit();
        expect(pal.colors).toEqual([0x123456]);
    });

    it('popup picks by angle in one gesture', () => {
        const model = new ColorModel();
        const onPick = vi.fn();
        const pop = new SwatchPopup({ model, colors: [0xff0000, 0x00ff00, 0x0000ff, 0xffff00], ticker: null, onPick });
        const ev = (x: number, y: number, buttons = 1) => ({
            pointerId: 1,
            pointerType: 'mouse',
            buttons,
            global: { x, y },
        });

        pop.openAt(0, 0, ev(0, 0) as never);
        priv(pop)._onMove(ev(80, 0));
        expect(pop.hovered.value).toBe(1);
        priv(pop)._onUp(ev(80, 0, 0));
        expect(onPick).toHaveBeenCalledWith(0x00ff00);
        expect(model.hex).toBe(0x00ff00);
        expect(pop.open.value).toBe(false);
    });

    it('popup stays open after the opening tap', () => {
        const pop = new SwatchPopup({ colors: [0xff0000, 0x00ff00], ticker: null });
        const ev = (x: number, y: number, buttons = 1) => ({
            pointerId: 1,
            pointerType: 'mouse',
            buttons,
            global: { x, y },
        });

        pop.openAt(0, 0, ev(0, 0) as never);
        priv(pop)._onUp(ev(0, 0, 0));
        expect(pop.open.value).toBe(true);
    });
});

describe('Eyedropper', () => {
    it('samples under the pointer and commits on release', () => {
        const model = new ColorModel();
        const onDone = vi.fn();
        const drop = new Eyedropper({ model, sample: (x) => (x < 50 ? 0xff0000 : null), ticker: null, onDone });
        const ev = (x: number) => ({ pointerId: 1, button: 0, global: { x, y: 0 } });

        drop.start();
        priv(drop)._onMove(ev(10));
        expect(drop.sampled.value).toBe(0xff0000);
        priv(drop)._onUp(ev(10));
        expect(model.hex).toBe(0xff0000);
        expect(onDone).toHaveBeenCalledWith(0xff0000);
        expect(drop.active.value).toBe(false);
    });
});
