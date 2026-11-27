import { Container } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { signal } from '../src/signal';
import {
    createRenderStats,
    Island,
    IslandFrame,
    IslandMenu,
    IslandMeter,
    IslandStack,
    islandShape,
} from '../src/ui/island';

const VIEW = { x: 0, y: 0, width: 800, height: 600 };
const settle = (w: { tick(dt: number): boolean }) => {
    for (let i = 0; i < 900 && w.tick(1 / 60); i++);
};
const box = (w: number, h: number) => {
    const c = new Container();

    c.getLocalBounds = (() => ({ x: 0, y: 0, width: w, height: h })) as never;

    return c;
};
type Drag = {
    _dragStart(p: unknown): void;
    _dragMove(p: unknown): void;
    _dragEnd(): void;
};
const pt = (dx: number, dy: number) => ({ dx, dy });
const drag = (i: Island) => i as unknown as Drag;

describe('islandShape', () => {
    it('grows a right-edge body from the edge with two concave flares', () => {
        const s = islandShape('right', VIEW, 300, 200, 80, 28, 22);

        expect(s).not.toBeNull();
        expect(s?.box).toEqual({ x: 720, y: 200, width: 80, height: 200 });
        // the body reaches one unit past the edge, so the edge is not anti-aliased
        expect(s?.body.x).toBe(720);
        expect(s?.body.width).toBe(81);
        // far corners rounded, near ones square: [tl, tr, br, bl]
        expect(s?.body.radii).toEqual([28, 0, 0, 28]);
        expect(s?.flares).toHaveLength(2);
        expect(s?.flares[0].circle).toEqual({ x: 778, y: 178, r: 22 });
    });

    it('keeps the flares on the straight part of the sides when shallow', () => {
        const s = islandShape('top', VIEW, 400, 120, 12, 28, 22, { smoothing: 0.6 });

        // radius capped by depth, flare by what is left of the side
        const r = s?.body.radii[2] ?? 0;

        expect(r * 1.6).toBeLessThanOrEqual(12 * 0.6 + 1e-9);
        for (const f of s?.flares ?? []) expect(f.circle.r).toBeLessThanOrEqual(12 - r * 1.6 + 1e-9);
    });

    it('meets the side edges flush when it runs the whole edge', () => {
        const s = islandShape('bottom', VIEW, 0, 0 + 800, 130, 26, 0, { full: true });

        expect(s?.box).toEqual({ x: 0, y: 470, width: 800, height: 130 });
        // square corners on the island, concave corners on the window above it
        expect(s?.body.radii).toEqual([0, 0, 0, 0]);
        expect(s?.flares.map((f) => f.circle)).toEqual([
            { x: 26, y: 600 - 130 - 26, r: 26 },
            { x: 774, y: 600 - 130 - 26, r: 26 },
        ]);
    });

    it('keeps the window corners no deeper than a hairline', () => {
        const s = islandShape('bottom', VIEW, 0, 800, 5, 26, 0, { full: true });

        expect(s?.flares[0].circle.r).toBe(5);
    });

    it('does not reach past the edge with no bleed', () => {
        const card = { x: 100, y: 100, width: 300, height: 200 };
        const s = islandShape('bottom', card, 150, 120, 50, 18, 12, { bleed: 0 });

        expect((s?.body.y ?? 0) + (s?.body.height ?? 0)).toBe(300);
        for (const f of s?.flares ?? []) expect(f.square.y + f.square.height).toBe(300);
    });

    it('draws nothing at depth 0', () => {
        expect(islandShape('left', VIEW, 300, 100, 0, 28, 22)).toBeNull();
    });
});

describe('Island', () => {
    const make = (o: ConstructorParameters<typeof Island>[0] = {}) =>
        new Island({ viewport: VIEW, ticker: null, length: 240, depth: 100, ...o });

    it('rests as a lip and springs open', () => {
        const island = make();

        expect(island.box.width).toBe(12);
        island.open();
        settle(island);
        expect(island.box.width).toBe(100);
        expect(island.box.height).toBe(240);
        expect(island.box.x).toBe(700);
        expect(island.state.openness.value).toBe(1);
        island.close();
        settle(island);
        expect(island.state.openness.value).toBe(0);
    });

    it('stays clear of the safe area and grows from the true edge', () => {
        const island = make({ edge: 'top', safeArea: { top: 30, left: 50 }, align: 0 });

        island.go('open', true);
        // content depth plus the inset on its edge
        expect(island.box.y).toBe(0);
        expect(island.box.height).toBe(130);
        // the start of the edge keeps the inset and the flare
        expect(island.box.x).toBe(50 + 22);
    });

    it('snaps a drag to the nearest state and morphs the length on the way', () => {
        const island = make({ sizes: { mid: { length: 200, depth: 50 } } });

        drag(island)._dragStart(pt(0, 0));
        drag(island)._dragMove(pt(-40, 0));
        // a drag morphs the length between the states around its depth
        expect(island.box.width).toBeCloseTo(52, 5);
        // depth 52 lies between mid (50 deep, 200 long) and open (100, 240)
        expect(island.box.height).toBeCloseTo(201.6, 5);
        vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 500);
        drag(island)._dragEnd();
        vi.restoreAllMocks();
        expect(island.state.name.value).toBe('mid');
        settle(island);
        expect(island.box.width).toBe(50);
    });

    it('spans the edge when its length fills it', () => {
        const island = make({ edge: 'bottom', peek: 5, peekLength: 2000, flare: 0, length: 2000, depth: 200 });

        expect(island.box).toEqual({ x: 0, y: 595, width: 800, height: 5 });
        island.go('open', true);
        expect(island.shape?.body.radii).toEqual([0, 0, 0, 0]);
        expect(island.shape?.flares).toHaveLength(2);
    });

    it('rubber-bands past the deepest state', () => {
        const island = make();

        drag(island)._dragStart(pt(0, 0));
        drag(island)._dragMove(pt(-400, 0));
        expect(island.box.width).toBeGreaterThan(100);
        expect(island.box.width).toBeLessThan(130);
    });

    it('fades each view in at its own state', () => {
        const compact = new Container();
        const panel = new Container();
        const island = make({
            edge: 'top',
            sizes: { compact: { length: 300, depth: 60 } },
            views: { compact, open: panel },
        });

        island.go('compact', true);
        expect(compact.alpha).toBe(1);
        expect(panel.visible).toBe(false);
        island.go('open', true);
        expect(compact.visible).toBe(false);
        expect(panel.alpha).toBe(1);
        // the open view is laid out in its box, anchored to the far side
        expect(panel.position.x).toBe(400 - 120);
        expect(panel.position.y).toBe(0);
    });

    it('tells apart views of states with the same depth', () => {
        const gear = new Container();
        const menu = new Container();
        const island = make({ peek: 48, peekLength: 48, length: 200, depth: 48, views: { peek: gear, open: menu } });

        expect(gear.alpha).toBe(1);
        expect(menu.visible).toBe(false);
        island.go('open', true);
        expect(gear.visible).toBe(false);
        expect(menu.alpha).toBe(1);
    });

    it('shows the hover state while hovered at rest', () => {
        const island = make({ hover: 'open' });
        const hover = (on: boolean) => (island as unknown as { _hover(on: boolean): void })._hover(on);

        hover(true);
        expect(island.state.name.value).toBe('open');
        hover(false);
        expect(island.state.name.value).toBe('peek');
    });

    it('sizes its open state from the items', () => {
        const island = new Island({
            viewport: VIEW,
            ticker: null,
            items: [box(50, 70), box(40, 70)],
            gap: 10,
            padding: 16,
        });

        expect(island.sizeOf('open')).toEqual({ length: 70 + 70 + 10 + 32, depth: 50 + 32 });
        expect(island.boxOf('open')).toEqual({ width: 82, height: 182 });
    });

    it('follows a signal viewport', () => {
        const view = signal({ x: 0, y: 0, width: 400, height: 300 });
        const island = new Island({
            viewport: view,
            ticker: null,
            edge: 'left',
            length: 100,
            depth: 40,
            state: 'open',
        });

        expect(island.box.x).toBe(0);
        view.value = { x: 64, y: 0, width: 400, height: 300 };
        expect(island.box.x).toBe(64);
    });
});

describe('Island hints and touch', () => {
    const make = (o: ConstructorParameters<typeof Island>[0] = {}) =>
        new Island({ viewport: VIEW, ticker: null, length: 240, depth: 100, ...o });
    const near = (i: Island, x: number, y: number, pointerType = 'mouse') =>
        (i as unknown as { _near(e: unknown): void })._near({ global: { x, y }, pointerType });

    it('pulses out and back', () => {
        const island = make();
        let peak = 0;

        island.hint('pulse');
        for (let i = 0; i < 60; i++) {
            island.tick(1 / 60);
            peak = Math.max(peak, island.box.width);
        }
        expect(peak).toBeGreaterThan(16);
        settle(island);
        expect(island.box.width).toBeCloseTo(12, 3);
    });

    it('wiggles along the edge and comes back to its place', () => {
        const island = make();
        const y0 = island.box.y;
        let moved = 0;

        island.hint('wiggle');
        for (let i = 0; i < 30; i++) {
            island.tick(1 / 60);
            moved = Math.max(moved, Math.abs(island.box.y - y0));
        }
        expect(moved).toBeGreaterThan(5);
        settle(island);
        expect(island.box.y).toBeCloseTo(y0, 3);
    });

    it('peeks a hidden island out for a hint', () => {
        const island = make({ peek: 0 });
        let peak = 0;

        expect(island.shape).toBeNull();
        island.hint();
        for (let i = 0; i < 30; i++) {
            island.tick(1 / 60);
            peak = Math.max(peak, island.box.width);
        }
        expect(peak).toBeGreaterThan(3);
    });

    it('leans toward a pointer near the lip and lets go when it leaves', () => {
        const island = make();

        near(island, 790, 330);
        settle(island);
        expect(island.box.width).toBeGreaterThan(17);
        // it slid toward the pointer, below the centre
        expect(island.box.y + island.box.height / 2).toBeGreaterThan(300);
        near(island, 200, 330);
        settle(island);
        expect(island.box.width).toBeCloseTo(12, 3);
    });

    it('does not lean while open', () => {
        const island = make();

        island.go('open', true);
        near(island, 790, 300);
        settle(island);
        expect(island.box.width).toBe(100);
    });

    it('lets go of a finger shortly after its last move', () => {
        vi.useFakeTimers();
        const island = make();

        near(island, 795, 300, 'touch');
        settle(island);
        expect(island.box.width).toBeGreaterThan(17);
        vi.advanceTimersByTime(600);
        settle(island);
        expect(island.box.width).toBeCloseTo(12, 3);
        vi.useRealTimers();
    });

    it('takes touches in a zone wider than the lip, at rest only', () => {
        const island = make({ grab: 30 });
        const zone = island.children[0];
        const area = zone.hitArea as unknown as { x: number; y: number; width: number; height: number };

        expect(zone.eventMode).toBe('static');
        expect(area.width).toBe(42);
        expect(area.height).toBe(island.box.height + 60);
        island.go('open', true);
        expect(zone.eventMode).toBe('none');
    });

    it('flashes a state and goes back to rest', () => {
        vi.useFakeTimers();
        const island = make();

        island.flash('open', 1000);
        expect(island.state.name.value).toBe('open');
        vi.advanceTimersByTime(1100);
        expect(island.state.name.value).toBe('peek');
        // a pointer over it holds it until it leaves
        island.flash('open', 1000);
        const hover = (on: boolean) => (island as unknown as { _hover(on: boolean): void })._hover(on);

        hover(true);
        vi.advanceTimersByTime(1100);
        expect(island.state.name.value).toBe('open');
        hover(false);
        expect(island.state.name.value).toBe('peek');
        vi.useRealTimers();
    });

    it('hints on a timer until it is first opened', () => {
        vi.useFakeTimers();
        const island = make({ hintEvery: 1000 });
        const hint = vi.spyOn(island, 'hint');

        vi.advanceTimersByTime(2100);
        expect(hint).toHaveBeenCalledTimes(2);
        island.go('open', true);
        vi.advanceTimersByTime(3000);
        expect(hint).toHaveBeenCalledTimes(2);
        vi.useRealTimers();
    });
});

describe('IslandFrame', () => {
    it('cuts a window out of the bands and springs them', () => {
        const frame = new IslandFrame({
            viewport: VIEW,
            bands: { left: 64, top: 8, right: 8, bottom: 8 },
            ticker: null,
        });

        expect(frame.inner.value).toEqual({ x: 64, y: 8, width: 728, height: 584 });
        frame.setBands({ left: 8 });
        settle(frame);
        expect(frame.inner.value.x).toBe(8);
        expect(frame.bands.left).toBe(8);
    });

    it('fades its rail out when the band gets thin', () => {
        const frame = new IslandFrame({
            viewport: VIEW,
            bands: { left: 64 },
            rail: { start: [box(24, 24)] },
            ticker: null,
        });

        expect(frame.rail?.start.alpha).toBe(1);
        frame.setBands({ left: 6 }, true);
        expect(frame.rail?.start.visible).toBe(false);
    });
});

describe('IslandStack', () => {
    it('stacks along its axis and centres across it', () => {
        const a = box(20, 10);
        const b = box(40, 10);
        const s = new IslandStack([a, b], { gap: 5 });

        expect(s.along).toBe(25);
        expect(s.across).toBe(40);
        expect(a.position.x).toBe(10);
        expect(b.position.y).toBe(15);
        s.layout(60, 45);
        expect(a.position.y).toBe(10);
    });
});

describe('IslandMenu', () => {
    it('toggles switches and steps through choices', () => {
        const fast = signal(false);
        const mode = signal('Low');
        const picked: string[] = [];
        const menu = new IslandMenu({
            ticker: null,
            items: [
                { id: 'fast', label: 'Fast', type: 'toggle', value: fast },
                { id: 'mode', label: 'Mode', type: 'choice', options: ['Low', 'High'], value: mode },
                { id: 'about', label: 'About' },
            ],
            onSelect: (id) => picked.push(id),
        });

        menu.select(0);
        menu.select(1);
        menu.select(2);
        expect(fast.value).toBe(true);
        expect(mode.value).toBe('High');
        expect(picked).toEqual(['fast', 'mode', 'about']);
        expect(menu.boxHeight).toBe(12 + 3 * 40 + 8);
        expect(menu.tick(1 / 60)).toBe(true);
        settle(menu);
    });
});

describe('IslandMeter', () => {
    it('keeps recent samples and shows a dash for null', () => {
        const v = signal<number | null>(60);
        const m = new IslandMeter({ title: 'fps', value: v, history: 3 });

        v.value = 58;
        v.value = 61;
        v.value = 30;
        expect(m.samples).toEqual([58, 61, 30]);
        v.value = null;
        expect(m.samples).toEqual([58, 61, 30]);
    });
});

describe('createRenderStats', () => {
    afterEach(() => vi.useRealTimers());

    it('counts frames and draw calls, and puts the context back', () => {
        vi.useFakeTimers();
        const lists: Record<string, Set<Record<string, () => void>>> = { prerender: new Set(), postrender: new Set() };
        const runner = (name: string) => ({
            add: (o: Record<string, () => void>) => lists[name].add(o),
            remove: (o: Record<string, () => void>) => lists[name].delete(o),
        });
        const draw = vi.fn();
        const gl = { drawElements: draw };
        const renderer = { gl, runners: { prerender: runner('prerender'), postrender: runner('postrender') } };
        const stats = createRenderStats({ renderer } as never, { interval: 1000 });
        const frame = (calls: number) => {
            for (const o of lists.prerender) o.prerender();
            for (let i = 0; i < calls; i++) gl.drawElements();
            for (const o of lists.postrender) o.postrender();
        };

        for (let i = 0; i < 30; i++) frame(3);
        vi.advanceTimersByTime(1000);
        expect(stats.fps.value).toBeGreaterThan(0);
        expect(stats.drawCalls.value).toBe(3);
        expect(stats.frames).toBe(30);
        expect(draw).toHaveBeenCalledTimes(90);
        stats.destroy();
        expect(gl.drawElements).toBe(draw);
        expect(lists.postrender.size).toBe(0);
    });
});
