import { Container } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import type { SilkGraphics } from '../src';
import { BrushCursor } from '../src/ui/brush';
import { ContextHalo } from '../src/ui/halo';
import { ModeSwitcher, SegmentedSwitch } from '../src/ui/modes';

const dot = (g: SilkGraphics, size: number) => {
    g.circle(0, 0, size / 2).fill(0xffffff);
};
const settle = (w: { tick(dt: number): boolean }, frames = 300) => {
    for (let i = 0; i < frames && w.tick(1 / 60); i++);
};
const pointer = (x: number, y: number, buttons = 1, extra: Record<string, unknown> = {}) => ({
    pointerId: 1,
    pointerType: 'mouse',
    button: 0,
    buttons,
    pressure: 0.5,
    global: { x, y },
    ...extra,
});
type Handlers = Record<string, (...args: unknown[]) => void>;

/** A target with a fixed box: getBounds is all the halo reads. */
const box = (x: number, y: number, w: number, h: number) => {
    const c = new Container();

    c.getBounds = (() => ({ x, y, width: w, height: h, maxX: x + w, maxY: y + h })) as never;

    return c;
};

describe('ContextHalo', () => {
    const items = ['a', 'b', 'c'].map((id) => ({ id, icon: dot }));

    it('lines buttons up above the target, evenly spaced', () => {
        const halo = new ContextHalo({ items, ticker: null });

        halo.attach(box(100, 100, 80, 40));
        halo.tick(1 / 60);
        const pos = halo.positions;

        expect(pos.every((p) => p.y < 100)).toBe(true);
        expect(pos[1].x).toBeCloseTo(140, 0);
        const d1 = Math.hypot(pos[1].x - pos[0].x, pos[1].y - pos[0].y);
        const d2 = Math.hypot(pos[2].x - pos[1].x, pos[2].y - pos[1].y);

        expect(d1).toBeCloseTo(d2, 0);
        expect(d1).toBeGreaterThan(36);
    });

    it('turns to another side near the edge of its bounds', () => {
        const halo = new ContextHalo({ items, ticker: null, bounds: { x: 0, y: 0, width: 400, height: 400 } });

        halo.attach(box(150, 5, 80, 40));
        halo.tick(1 / 60);
        expect(halo.positions.every((p) => p.y > 45)).toBe(true);
    });

    it('selects on release over the same button and ignores disabled ones', () => {
        const onSelect = vi.fn();
        const halo = new ContextHalo({
            items: [
                { id: 'a', icon: dot },
                { id: 'b', icon: dot, disabled: true },
            ],
            ticker: null,
            onSelect,
        });
        const h = halo as unknown as Handlers;

        halo.attach(box(100, 100, 80, 40));
        settle(halo, 60);
        const [a, b] = halo.positions;

        h._onDown(pointer(a.x, a.y));
        h._onUp(pointer(a.x + 2, a.y, 0));
        h._onDown(pointer(b.x, b.y));
        h._onUp(pointer(b.x, b.y, 0));
        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(onSelect.mock.calls[0][0].id).toBe('a');
    });

    it('pops out at the old target, then pops in around the new one', () => {
        const halo = new ContextHalo({ items, ticker: null });
        const a = box(100, 100, 80, 40);
        const b = box(400, 300, 80, 40);
        const slots = () => (halo as unknown as { _slots: { open: { value: number }; x: number; y: number }[] })._slots;

        halo.attach(a);
        settle(halo, 90);
        expect(halo.state.phase.value).toBe('shown');
        halo.attach(b);
        expect(halo.state.phase.value).toBe('out');
        expect(halo.eventMode).toBe('none');
        // popping out: the buttons shrink where they are, near the old target
        let sawGone = false;

        for (let i = 0; i < 60 && !sawGone; i++) {
            halo.tick(1 / 60);
            const all = slots();

            if (all.every((s) => s.open.value < 0.05)) sawGone = true;
            else for (const s of all) expect(s.y).toBeLessThan(100);
        }
        expect(sawGone).toBe(true);
        settle(halo, 90);
        expect(halo.state.phase.value).toBe('shown');
        expect(halo.eventMode).toBe('static');
        for (const s of slots()) {
            expect(Math.hypot(s.x - 440, s.y - 320)).toBeLessThan(120);
            expect(s.open.value).toBeCloseTo(1, 1);
        }
    });

    it('glides instead with transition: glide', () => {
        const halo = new ContextHalo({ items, ticker: null, transition: 'glide' });

        halo.attach(box(100, 100, 80, 40));
        settle(halo, 90);
        halo.attach(box(400, 300, 80, 40));
        halo.tick(1 / 60);
        expect(halo.state.phase.value).toBe('shown');
    });

    it('folds away on detach and goes to sleep', () => {
        const halo = new ContextHalo({ items, ticker: null });

        halo.attach(box(100, 100, 80, 40));
        settle(halo, 60);
        halo.detach();
        settle(halo);
        expect(halo.tick(1 / 60)).toBe(false);
    });
});

describe('BrushCursor', () => {
    it('resizes from where the gesture began: sideways is size, vertical is hardness', () => {
        const brush = new BrushCursor({ size: 40, hardness: 0.5, ticker: null });

        brush.setPointer(100, 100);
        brush.beginResize();
        brush.setPointer(130, 60);
        expect(brush.state.size.value).toBe(70);
        expect(brush.state.hardness.value).toBeCloseTo(0.7);
        brush.endResize();
        brush.setPointer(10, 10);
        expect(brush.state.size.value).toBe(70);
    });

    it('clamps size and steps it with brackets', () => {
        const brush = new BrushCursor({ size: 40, minSize: 5, maxSize: 60, ticker: null });
        const h = brush as unknown as Handlers;

        h._onKey('BracketRight', true);
        expect(brush.state.size.value).toBeCloseTo(46);
        for (let i = 0; i < 10; i++) h._onKey('BracketRight', true);
        expect(brush.state.size.value).toBe(60);
        brush.setBrushSize(-10);
        expect(brush.state.size.value).toBe(5);
    });

    it('holding the resize key resizes', () => {
        const brush = new BrushCursor({ size: 20, ticker: null });
        const h = brush as unknown as Handlers;

        brush.setPointer(0, 0);
        h._onKey('KeyF', true);
        expect(brush.state.resizing.value).toBe(true);
        brush.setPointer(-10, 0);
        h._onKey('KeyF', false);
        expect(brush.state.resizing.value).toBe(false);
        expect(brush.state.size.value).toBe(10);
    });

    it('pops the ring in under the pointer when a resize ends', () => {
        const brush = new BrushCursor({ ticker: null });
        const pop = () => (brush as unknown as { _pop: { value: number } })._pop.value;

        brush.setPointer(0, 0);
        brush.beginResize();
        brush.setPointer(50, 0);
        brush.endResize();
        expect(pop()).toBeCloseTo(0.4);
        settle(brush);
        expect(pop()).toBeCloseTo(1, 2);
    });

    it('reads pen pressure', () => {
        const brush = new BrushCursor({ ticker: null });
        const h = brush as unknown as Handlers;

        h._onMove(pointer(5, 5, 1, { pointerType: 'pen', pressure: 0.8 }));
        expect(brush.state.pressure.value).toBeCloseTo(0.8);
        h._onMove(pointer(5, 5, 0, { pointerType: 'pen', pressure: 0 }));
        expect(brush.state.pressure.value).toBe(0);
    });
});

describe('ModeSwitcher', () => {
    const modes = ['brush', 'eraser', 'smudge', 'fill'].map((id) => ({ id, icon: dot }));
    const keyHeld = (s: ModeSwitcher) => {
        const h = s as unknown as Handlers & { _pointer: { x: number; y: number; t: number } };

        h._pointer = { x: 0, y: 0, t: performance.now() };

        return h;
    };

    it('keeps the most recent modes first and taps back to the previous one', () => {
        const onChange = vi.fn();
        const s = new ModeSwitcher({ modes, ticker: null, onChange });
        const h = keyHeld(s);

        s.set('smudge');
        s.set('fill');
        expect(s.state.recent.value.slice(0, 3)).toEqual(['fill', 'smudge', 'brush']);
        h._onKey('Space', true);
        h._onKey('Space', false);
        expect(s.mode).toBe('smudge');
        expect(onChange).toHaveBeenCalledTimes(3);
    });

    it('holding the key opens the ring, previous mode on top, release picks', async () => {
        const s = new ModeSwitcher({ modes, ticker: null, holdMs: 10 });
        const h = keyHeld(s);

        s.set('eraser');
        h._onKey('Space', true);
        await new Promise((r) => setTimeout(r, 30));
        expect(s.menu.isOpen).toBe(true);
        // straight up: the first ring item, the previous mode
        s.menu.pointerAt(0, -60);
        expect(s.menu.state.hover.value?.id).toBe('brush');
        s.menu.pointerAt(60, 0);
        const picked = s.menu.state.hover.value?.id;

        h._onKey('Space', false);
        expect(s.mode).toBe(picked);
    });

    it('reopening elsewhere pops the ring out first instead of sliding it', () => {
        const s = new ModeSwitcher({ modes, ticker: null });

        s.open(0, 0);
        settle(s, 60);
        s.open(200, 100);
        expect(s.menu.state.phase.value).toBe('closing');
        expect(s.menu.position.x).toBe(0);
        settle(s);
        expect(s.menu.state.phase.value).toBe('open');
        expect(s.menu.position.x).toBe(200);
    });

    it('ignores the key when the pointer is not over the canvas', () => {
        const s = new ModeSwitcher({ modes, ticker: null });
        const h = s as unknown as Handlers;

        s.set('fill');
        h._onKey('Space', true);
        h._onKey('Space', false);
        expect(s.mode).toBe('fill');
    });
});

describe('SegmentedSwitch', () => {
    const options = ['slow', 'normal', 'turbo'].map((id) => ({ id, icon: dot }));

    it('picks by tap and by sliding, committing on release', () => {
        const onChange = vi.fn();
        const sw = new SegmentedSwitch({ options, segmentWidth: 60, ticker: null, onChange });
        const h = sw as unknown as Handlers;

        expect(sw.switchWidth).toBe(180);
        h._onDown(pointer(0, 0));
        h._onUp(pointer(0, 0, 0));
        expect(sw.state.value.value).toBe('normal');
        h._onDown(pointer(-80, 0));
        h._onMove(pointer(80, 0));
        expect(sw.state.value.value).toBe('normal');
        h._onUp(pointer(80, 0, 0));
        expect(sw.state.value.value).toBe('turbo');
        expect(onChange.mock.calls.map((c) => c[0])).toEqual(['normal', 'turbo']);
    });

    it('slides the thumb with the leading edge first, then settles', () => {
        const sw = new SegmentedSwitch({ options, segmentWidth: 60, ticker: null });
        const s = sw as unknown as { _left: { value: number }; _right: { value: number } };

        sw.state.value.set('turbo');
        sw.tick(1 / 30);
        const stretch = s._right.value - s._left.value;

        expect(stretch).toBeGreaterThan(54);
        settle(sw);
        expect(s._right.value - s._left.value).toBeCloseTo(54, 1);
        expect(sw.tick(1 / 60)).toBe(false);
    });

    it('ignores input when disabled', () => {
        const sw = new SegmentedSwitch({ options, ticker: null });
        const h = sw as unknown as Handlers;

        sw.state.enabled.set(false);
        h._onDown(pointer(60, 0));
        h._onUp(pointer(60, 0, 0));
        expect(sw.state.value.value).toBe('slow');
        expect(sw.eventMode).toBe('none');
    });
});
