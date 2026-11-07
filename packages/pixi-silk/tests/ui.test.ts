import { Ticker } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { batch, computed, signal, watch } from '../src/signal';
import { ButtonDock } from '../src/ui/ButtonDock';
import { angleDelta, type RadialItem, RadialMenu } from '../src/ui/RadialMenu';
import { SilkButton } from '../src/ui/SilkButton';

const dot = (g: import('../src').SilkGraphics, size: number) => {
    g.circle(0, 0, size / 2).fill(0xffffff);
};
const item = (id: string, extra: Partial<RadialItem> = {}): RadialItem => ({ id, icon: dot, ...extra });

/** Runs the widget until it settles (or 5 s). */
const settle = (w: { tick(dt: number): boolean }) => {
    for (let i = 0; i < 300 && w.tick(1 / 60); i++);
};

const pointer = (x: number, y: number, buttons = 1, id = 1) => ({
    pointerId: id,
    pointerType: 'mouse',
    buttons,
    global: { x, y },
});

describe('signal', () => {
    it('notifies on change only', () => {
        const s = signal(1);
        const fn = vi.fn();

        s.subscribe(fn);
        s.value = 1;
        s.set(2);
        s.update((v) => v + 1);
        expect(fn.mock.calls).toEqual([
            [2, 1],
            [3, 2],
        ]);
    });

    it('batches notifications and drops no-op round trips', () => {
        const a = signal(0);
        const fn = vi.fn();

        a.subscribe(fn);
        batch(() => {
            a.set(1);
            a.set(2);
        });
        batch(() => {
            a.set(5);
            a.set(2);
        });
        expect(fn.mock.calls).toEqual([[2, 0]]);
    });

    it('derives values and stops on dispose', () => {
        const a = signal(2);
        const b = signal(3);
        const sum = computed([a, b], () => a.value + b.value);
        const seen: number[] = [];

        watch(sum, (v) => seen.push(v));
        a.set(10);
        sum.dispose();
        b.set(0);
        expect(seen).toEqual([5, 13]);
        expect(sum.value).toBe(13);
    });
});

describe('RadialMenu', () => {
    const make = (extra: Partial<ConstructorParameters<typeof RadialMenu>[0]> = {}) =>
        new RadialMenu({
            items: [item('n'), item('e'), item('s', { disabled: true }), item('w')],
            ticker: null,
            escapeCloses: false,
            ...extra,
        });

    it('wraps angle differences', () => {
        expect(angleDelta(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(-0.2);
    });

    it('picks by angle anywhere in the wedge, out to the falloff', () => {
        const menu = make();

        menu.openAt(0, 0);
        menu.pointerAt(0, -60);
        expect(menu.state.hover.value?.id).toBe('n');
        menu.pointerAt(200, 10);
        expect(menu.state.hover.value?.id).toBe('e');
        // inside the dead zone: nothing
        menu.pointerAt(4, 4);
        expect(menu.state.hover.value).toBeNull();
        // far beyond outer radius + falloff: let go of the item, stay open
        menu.pointerAt(0, -900);
        expect(menu.state.hover.value).toBeNull();
        expect(menu.state.phase.value).toBe('open');
    });

    it('holds the current item across the boundary (hysteresis)', () => {
        const menu = make();

        menu.openAt(0, 0);
        menu.pointerAt(0, -60);
        // the n/e boundary is at -45deg; step a hair past it
        const a = -Math.PI / 4 + 0.01;

        menu.pointerAt(Math.cos(a) * 60, Math.sin(a) * 60);
        expect(menu.state.hover.value?.id).toBe('n');
        const b = -Math.PI / 4 + 0.2;

        menu.pointerAt(Math.cos(b) * 60, Math.sin(b) * 60);
        expect(menu.state.hover.value?.id).toBe('e');
    });

    it('marks: press, drag, release selects and closes', () => {
        const onSelect = vi.fn();
        const menu = make({ onSelect });
        const m = menu as unknown as Record<string, (e: unknown) => void>;

        menu.openAt(0, 0, pointer(0, 0) as never);
        m._onMove(pointer(70, 0));
        m._onUp(pointer(70, 0, 0));
        expect(onSelect).toHaveBeenCalledWith(menu.state.hover.value ?? expect.anything(), expect.any(Array));
        expect(onSelect.mock.calls[0][0].id).toBe('e');
        expect(menu.state.phase.value).toBe('closing');
        settle(menu);
        expect(menu.state.phase.value).toBe('closed');
        expect(menu.visible).toBe(false);
    });

    it('stays open after the opening tap, then a second tap selects', () => {
        const onSelect = vi.fn();
        const menu = make({ onSelect });
        const m = menu as unknown as Record<string, (e: unknown) => void>;

        menu.openAt(0, 0, pointer(0, 0) as never);
        m._onUp(pointer(0, 0, 0));
        expect(menu.state.phase.value).toBe('open');
        m._onDown(pointer(-70, 0));
        m._onUp(pointer(-70, 0, 0));
        expect(onSelect.mock.calls[0][0].id).toBe('w');
    });

    it('ignores disabled items and closes on a tap outside', () => {
        const onSelect = vi.fn();
        const menu = make({ onSelect });
        const m = menu as unknown as Record<string, (e: unknown) => void>;

        menu.openAt(0, 0);
        m._onDown(pointer(0, 70));
        m._onUp(pointer(0, 70, 0));
        expect(onSelect).not.toHaveBeenCalled();
        m._onDown(pointer(0, -2000));
        m._onUp(pointer(0, -2000, 0));
        expect(menu.state.phase.value).toBe('closing');
    });

    it('opens a sub-ring for items with children and picks on it', () => {
        const onSelect = vi.fn();
        const menu = make({
            onSelect,
            items: [
                item('move', { children: [item('free'), item('axis'), item('uniform')] }),
                item('rotate'),
                item('scale'),
                item('more'),
            ],
        });

        menu.openAt(0, 0);
        menu.pointerAt(0, -70);
        expect(menu.state.path.value.map((i) => i.id)).toEqual(['move']);
        // middle child sits straight up on the second ring
        menu.pointerAt(0, -130);
        expect(menu.state.hover.value?.id).toBe('axis');
        expect(menu.state.path.value.map((i) => i.id)).toEqual(['move', 'axis']);
        const axis = menu.state.hover.value as RadialItem;

        menu.select(axis);
        expect(onSelect.mock.calls[0][1].map((i: RadialItem) => i.id)).toEqual(['move', 'axis']);
    });

    it('settles and stops animating once open', () => {
        const menu = make();

        menu.openAt(0, 0);
        settle(menu);
        expect(menu.tick(1 / 60)).toBe(false);
    });
});

describe('SilkButton', () => {
    it('animates out and in, refusing input meanwhile', async () => {
        const b = new SilkButton({ icon: dot, ticker: null });

        expect(b.state.active.value).toBe(true);
        expect(b.eventMode).toBe('static');
        const hidden = b.hide();

        expect(b.state.phase.value).toBe('hiding');
        expect(b.eventMode).toBe('none');
        settle(b);
        await expect(hidden).resolves.toBe(true);
        expect(b.visible).toBe(false);
        const shown = b.show();

        settle(b);
        await expect(shown).resolves.toBe(true);
        expect(b.state.active.value).toBe(true);
    });

    it('resolves false when reversed half way', async () => {
        const b = new SilkButton({ icon: dot, ticker: null });
        const hidden = b.hide();

        b.tick(1 / 60);
        const shown = b.show();

        await expect(hidden).resolves.toBe(false);
        settle(b);
        await expect(shown).resolves.toBe(true);
    });

    it('fires on release within slop, not while busy', () => {
        const onPress = vi.fn();
        const b = new SilkButton({ icon: dot, width: 100, height: 40, ticker: null, onPress });
        const m = b as unknown as Record<string, (e: unknown) => void>;

        m._onDown(pointer(0, 0));
        m._onUp(pointer(55, 0, 0)); // slid 5 px off the edge
        expect(onPress).toHaveBeenCalledTimes(1);
        m._onDown(pointer(0, 0));
        m._onUp(pointer(200, 0, 0));
        expect(onPress).toHaveBeenCalledTimes(1);
        b.state.busy.set(true);
        b.press();
        expect(onPress).toHaveBeenCalledTimes(1);
        expect(b.eventMode).toBe('none');
    });

    it('long press fires onHold instead of onPress', () => {
        const onPress = vi.fn();
        const onHold = vi.fn();
        const b = new SilkButton({ icon: dot, holdMs: 300, ticker: null, onPress, onHold });
        const m = b as unknown as Record<string, (e: unknown) => void>;

        m._onDown(pointer(0, 0));
        for (let i = 0; i < 30; i++) b.tick(1 / 60);
        m._onUp(pointer(0, 0, 0));
        expect(onHold).toHaveBeenCalledTimes(1);
        expect(onPress).not.toHaveBeenCalled();
    });
});

describe('teardown', () => {
    it('survives its ticker being destroyed first (Application.destroy order)', () => {
        const ticker = new Ticker();
        const b = new SilkButton({ icon: dot, ticker });
        const menu = new RadialMenu({ items: [item('a')], ticker, escapeCloses: false });

        menu.openAt(0, 0);
        ticker.destroy();
        expect(() => {
            b.destroy();
            menu.destroy();
        }).not.toThrow();
    });
});

describe('ButtonDock', () => {
    it('closes the gap of a hidden button', async () => {
        const a = new SilkButton({ icon: dot, width: 100, ticker: null });
        const b = new SilkButton({ icon: dot, width: 100, ticker: null });
        const c = new SilkButton({ icon: dot, width: 100, ticker: null });
        const dock = new ButtonDock({ gap: 10, ticker: null }).add(a, b, c);

        settle(dock);
        expect([a.x, b.x, c.x]).toEqual([-110, 0, 110]);
        const done = b.hide();

        for (let i = 0; i < 300; i++) {
            b.tick(1 / 60);
            dock.tick(1 / 60);
        }
        await done;
        expect(a.x).toBeCloseTo(-55, 0);
        expect(c.x).toBeCloseTo(55, 0);
    });
});
