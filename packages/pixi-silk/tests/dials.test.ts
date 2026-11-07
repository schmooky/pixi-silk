import { describe, expect, it, vi } from 'vitest';
import { JogDial, rubberBand, Scrubber } from '../src/ui/dial';
import { countDuration, digitCount, Odometer, odometerColumns } from '../src/ui/odometer';
import { MiniTimeline } from '../src/ui/timeline';

const ev = (x: number, y: number, buttons = 1, id = 1) => ({
    pointerId: id,
    pointerType: 'mouse',
    button: 0,
    buttons,
    shiftKey: false,
    global: { x, y },
});
type Handlers = Record<string, (e: unknown) => void>;
const settle = (w: { tick(dt: number): boolean }) => {
    for (let i = 0; i < 600 && w.tick(1 / 60); i++);
};

describe('rubberBand', () => {
    it('passes through inside and stretches less and less outside', () => {
        expect(rubberBand(5, 0, 10, 2)).toBe(5);
        const a = rubberBand(11, 0, 10, 2) - 10;
        const b = rubberBand(20, 0, 10, 2) - 10;

        expect(a).toBeGreaterThan(0);
        expect(b).toBeLessThan(2);
        expect(b - a).toBeLessThan(10 - 1);
        expect(rubberBand(-100, 0, 10, 2)).toBeGreaterThanOrEqual(-2);
    });
});

describe('JogDial', () => {
    const make = (o: ConstructorParameters<typeof JogDial>[0] = {}) =>
        new JogDial({ ticker: null, readout: false, inertia: false, ...o });

    it('adds up full turns across the seam', () => {
        const dial = make({ turn: 10 });
        const m = dial as unknown as Handlers;

        m._onDown(ev(60, 0));
        // two full clockwise turns in small steps
        for (let i = 1; i <= 64; i++) {
            const a = (i / 32) * Math.PI * 2;

            m._onMove(ev(Math.cos(a) * 60, Math.sin(a) * 60));
        }
        expect(dial.state.value.value).toBeCloseTo(20, 1);
    });

    it('turns slower far from the ring', () => {
        const near = make({ turn: 1, radius: 50, thickness: 10 });
        const far = make({ turn: 1, radius: 50, thickness: 10 });

        for (const [dial, r] of [
            [near, 50],
            [far, 220],
        ] as const) {
            (dial as unknown as Handlers)._onDown(ev(r, 0));
            for (let i = 1; i <= 8; i++) {
                const a = (i / 32) * Math.PI * 2;

                dial.dragTo(Math.cos(a) * r, Math.sin(a) * r);
            }
        }
        expect(near.state.value.value).toBeCloseTo(0.25, 2);
        expect(far.state.value.value).toBeLessThan(near.state.value.value / 3);
    });

    it('snaps to steps, clamps, springs back and commits once', () => {
        const onCommit = vi.fn();
        const onChange = vi.fn();
        const dial = make({ turn: 10, step: 1, min: 0, max: 5, onCommit, onChange });
        const m = dial as unknown as Handlers;

        m._onDown(ev(60, 0));
        for (let i = 1; i <= 30; i++) {
            const a = (i / 32) * Math.PI * 2;

            m._onMove(ev(Math.cos(a) * 60, Math.sin(a) * 60));
        }
        expect(dial.state.value.value).toBe(5);
        expect(onChange.mock.calls.map((c) => c[0])).toEqual([1, 2, 3, 4, 5]);
        // stretched past the limit while held
        for (let i = 0; i < 20; i++) dial.tick(1 / 60);
        expect(dial.shownValue).toBeGreaterThan(5);
        m._onUp(ev(0, -60, 0));
        settle(dial);
        expect(dial.shownValue).toBeCloseTo(5, 3);
        expect(onCommit).toHaveBeenCalledTimes(1);
        expect(onCommit).toHaveBeenCalledWith(5);
    });

    it('steps on a tap by side', () => {
        const dial = make({ step: 0.5 });
        const m = dial as unknown as Handlers;

        m._onDown(ev(40, 10));
        m._onUp(ev(40, 10, 0));
        m._onDown(ev(-40, 10));
        m._onUp(ev(-40, 10, 0));
        m._onDown(ev(-40, 10));
        m._onUp(ev(-40, 10, 0));
        expect(dial.state.value.value).toBe(-0.5);
    });
});

describe('Scrubber', () => {
    it('scrubs by pixels, finely, snapped and clamped', () => {
        const s = new Scrubber({ ticker: null, readout: false, step: 1, perPixel: 0.5, min: 0, max: 100, value: 10 });
        const m = s as unknown as Handlers;

        m._onDown(ev(50, 10));
        s.scrubTo(20);
        expect(s.state.value.value).toBe(20);
        s.scrubTo(40, true); // 20 px more, at a tenth of the speed
        expect(s.state.value.value).toBeCloseTo(21);
        s.scrubTo(41, false, true);
        expect(s.state.value.value).toBe(22);
        s.scrubTo(1000);
        expect(s.state.value.value).toBe(100);
    });

    it('steps on a tap at either end', () => {
        const onCommit = vi.fn();
        const s = new Scrubber({ ticker: null, readout: false, width: 100, step: 2, value: 4, onCommit });
        const m = s as unknown as Handlers;

        m._onDown(ev(90, 10));
        m._onUp(ev(90, 10, 0));
        m._onDown(ev(5, 10));
        m._onUp(ev(5, 10, 0));
        m._onDown(ev(5, 10));
        m._onUp(ev(5, 10, 0));
        expect(s.state.value.value).toBe(2);
        expect(onCommit).toHaveBeenCalledTimes(3);
    });
});

describe('Odometer', () => {
    it('rolls a column only during the last unit below it', () => {
        expect(odometerColumns(1234, 4)).toEqual([4, 3, 2, 1]);
        const mid = odometerColumns(1299.5, 4);

        expect(mid[0]).toBeCloseTo(9.5);
        expect(mid[1]).toBeCloseTo(9.5);
        expect(mid[2]).toBeCloseTo(2.5);
        expect(mid[3]).toBeCloseTo(1);
        expect(digitCount(0)).toBe(1);
        expect(digitCount(999)).toBe(3);
        expect(digitCount(1000, 6)).toBe(6);
    });

    it('formats with prefix, separators and decimals', () => {
        const o = new Odometer({ ticker: null, decimals: 2, prefix: '$', suffix: ' won' });

        expect(o.format(1234567.891)).toBe('$1,234,567.89 won');
        expect(new Odometer({ ticker: null, thousands: '', minDigits: 3 }).format(7)).toBe('007');
    });

    it('counts up with easing, takes longer for big jumps and can skip', () => {
        expect(countDuration(1, 10_000, true)).toBeGreaterThan(countDuration(1, 10, true));
        expect(countDuration(1, 1e12, true)).toBeLessThanOrEqual(3);
        const onDone = vi.fn();
        const o = new Odometer({ ticker: null, duration: 1, speedUp: false, onDone });

        o.renderable = false;
        o.set(100);
        for (let i = 0; i < 5; i++) o.tick(0.1); // the driver caps a frame at 0.1 s
        const half = o.state.shown.value;

        expect(half).toBeGreaterThan(50); // outCubic is ahead of linear
        expect(half).toBeLessThan(100);
        o.skip();
        o.tick(1 / 60);
        expect(o.state.shown.value).toBe(100);
        expect(o.state.counting.value).toBe(false);
        expect(onDone).toHaveBeenCalledWith(100);
    });
});

describe('MiniTimeline', () => {
    const make = (o: ConstructorParameters<typeof MiniTimeline>[0] = {}) =>
        new MiniTimeline({
            ticker: null,
            labels: false,
            width: 400,
            height: 60,
            duration: 100,
            keys: [
                { id: 'a', time: 10 },
                { id: 'b', time: 20 },
                { id: 'c', time: 80 },
            ],
            ...o,
        });

    it('scrubs the playhead, snapped and clamped, with a stretch past the end', () => {
        const onScrub = vi.fn();
        const tl = make({ onScrub });

        tl.pressAt(101, 8); // 25.25 frames
        expect(tl.state.time.value).toBe(25);
        tl.dragTo(480);
        expect(tl.state.time.value).toBe(100);
        const over = (tl as unknown as { _headOver: number })._headOver;

        expect(over).toBeGreaterThan(0);
        expect(over).toBeLessThan(28);
        tl.release();
        settle(tl);
        expect((tl as unknown as { _headOver: number })._headOver).toBe(0);
        expect(onScrub).toHaveBeenCalled();
    });

    it('drags selected keys together, snapped, stopping at the track end', () => {
        const onKeysChange = vi.fn();
        const tl = make({ onKeysChange });

        tl.pressAt(tl.xAt(10), 40);
        tl.pressAt(tl.xAt(20), 40, true);
        expect(tl.state.selection.value).toEqual(['a', 'b']);
        tl.dragTo(tl.xAt(20) + tl.xAt(5.4) - tl.xAt(0));
        tl.release();
        expect(tl.keys.map((k) => k.time)).toEqual([15, 25, 80]);
        tl.pressAt(tl.xAt(25), 40);
        tl.dragTo(5000);
        tl.release();
        expect(tl.keys.map((k) => k.time)).toEqual([90, 100, 80]);
        expect(onKeysChange).toHaveBeenCalledTimes(2);
    });

    it('selects keys with a box, and shift adds', () => {
        const tl = make();

        tl.pressAt(tl.xAt(70), 40);
        tl.dragTo(tl.xAt(90));
        tl.release();
        expect(tl.state.selection.value).toEqual(['c']);
        tl.pressAt(tl.xAt(5), 40, true);
        tl.dragTo(tl.xAt(12));
        tl.release();
        expect(tl.state.selection.value).toEqual(['c', 'a']);
    });

    it('plays inside the loop range and moves its handles', () => {
        const tl = make({ loop: [20, 40], fps: 30 });

        tl.state.time.set(38);
        tl.state.playing.set(true);
        tl.tick(0.1); // 3 frames: past the end, back to the start
        expect(tl.state.time.value).toBeCloseTo(21);
        tl.pressAt(tl.xAt(40), 6);
        tl.dragTo(tl.xAt(60));
        tl.release();
        expect(tl.state.range.value).toEqual([20, 60]);
    });

    it('zooms around a time and keeps it under the pointer', () => {
        const tl = make();

        tl.zoomBy(4, 50);
        const [a, b] = tl.state.view.value;

        expect(b - a).toBe(25);
        expect(tl.xAt(50)).toBeCloseTo(200);
        tl.panBy(1000);
        expect(tl.state.view.value[1]).toBe(100);
        tl.showAll();
        expect(tl.state.view.value).toEqual([0, 100]);
    });
});
