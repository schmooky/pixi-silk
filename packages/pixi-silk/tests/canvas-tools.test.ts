import { CanvasTextMetrics, Container, Rectangle } from 'pixi.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Camera } from '../src/ui/camera';
import { TransformGizmo } from '../src/ui/gizmo';
import { CanvasGrid, gridLevels } from '../src/ui/grid';
import { SelectionGroup } from '../src/ui/group';
import { Guides, snapValue } from '../src/ui/guides';
import { combineSelection, Marquee, quadInside, quadIntersects } from '../src/ui/marquee';
import { boundsQuad, type Quad } from '../src/ui/outline';
import { niceStep, Ruler, tickDivisions } from '../src/ui/ruler';
import { SnapEngine } from '../src/ui/snap';
import { findSpacing, gapsBetween, SpacingMarkers, spacingFromSnap } from '../src/ui/spacing';

/** Enough of a DOM element for the camera and the ruler: events, size and hover. */
function fakeElement(width = 800, height = 600): HTMLElement {
    const el = new EventTarget() as unknown as HTMLElement & Record<string, unknown>;

    Object.assign(el, {
        clientWidth: width,
        clientHeight: height,
        style: { setProperty() {}, removeProperty() {} },
        contains: (n: unknown) => n === el,
        matches: () => true,
        getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
    });

    return el;
}

const settle = (w: { tick(dt: number): boolean }, frames = 300) => {
    for (let i = 0; i < frames && w.tick(1 / 60); i++);
};

/** A pointer event the way Pixi hands it to listeners. */
const ev = (x: number, y: number, extra: Record<string, unknown> = {}) => ({
    pointerId: 1,
    pointerType: 'mouse',
    button: 0,
    buttons: 1,
    global: { x, y },
    shiftKey: false,
    altKey: false,
    stopPropagation() {},
    ...extra,
});

/** A container with a fixed local box. */
const box = (x: number, y: number, w: number, h: number) => {
    const c = new Container();

    c.boundsArea = new Rectangle(0, 0, w, h);
    c.position.set(x, y);

    return c;
};

const rig = (zoom = 1) => {
    const root = new Container();
    const world = new Container();
    const overlay = new Container();
    const element = fakeElement();
    const camera = new Camera({ world, element, ticker: null, keys: false });

    root.addChild(world, overlay);
    if (zoom !== 1) camera.zoomTo(zoom, { x: 0, y: 0 }, false);

    return { root, world, overlay, element, camera };
};

beforeAll(() => {
    (globalThis as Record<string, unknown>).window ??= new EventTarget();
    // node has no canvas to measure label text with
    vi.spyOn(CanvasTextMetrics, 'measureText').mockReturnValue({
        width: 20,
        height: 12,
        lines: ['0'],
        lineWidths: [20],
        lineHeight: 12,
        maxLineWidth: 20,
        fontProperties: { ascent: 10, descent: 2, fontSize: 12 },
    } as never);
});

describe('grid', () => {
    it('fades levels in with their spacing and adds up to full strength', () => {
        const levels = gridLevels(1, { alpha: 0.1, fade: [6, 120] });

        // 1 unit is 1 px: too dense. 10 px fades in, 100 and up are near full
        expect(levels[0].step).toBe(10);
        const total = 1 - levels.reduce((k, l) => k * (1 - l.alpha), 1);

        // levels that would add almost nothing are skipped
        expect(total).toBeCloseTo(0.1, 2);
        expect(levels.every((l, i) => i === 0 || l.step === levels[i - 1].step * 10)).toBe(true);
        // zooming in brings the finer level in, smoothly
        const a = gridLevels(0.7, { alpha: 0.1 })[0];
        const b = gridLevels(0.72, { alpha: 0.1 })[0];

        expect(Math.abs(a.alpha - b.alpha)).toBeLessThan(0.01);
    });

    it('draws a level in two shapes and only what shows', () => {
        const { camera } = rig(4);
        const grid = new CanvasGrid({ camera, ticker: null, axes: true });

        settle(grid);
        const levels = grid.levels.length;

        expect(levels).toBeGreaterThan(0);
        // two strokes per level plus the two axes
        expect(grid.shapes).toBe(levels * 2 + 2);
        grid.state.style.set('dots');
        settle(grid);
        // dots: one row per visible line, bounded by the view
        expect(grid.shapes).toBeLessThan(600 / 12 + 10);
    });
});

describe('ruler', () => {
    it('steps in 1, 2, 5 and divides each step into ticks', () => {
        expect(niceStep(0.7)).toBe(1);
        expect(niceStep(13)).toBe(20);
        expect(niceStep(21)).toBe(50);
        expect(niceStep(51)).toBe(100);
        expect(tickDivisions(20)).toBe(4);
        expect(tickDivisions(50)).toBe(5);
    });

    it('labels world values and follows the selection', () => {
        const { camera, world, overlay } = rig(2);
        const ruler = new Ruler({ camera, ticker: null, trackCursor: false });
        const item = box(100, 40, 50, 30);

        world.addChild(item);
        overlay.addChild(ruler);
        settle(ruler, 60);
        // 72 px at 200% is 36 units: labels every 50
        expect(ruler.step).toBe(50);
        expect(ruler.labels).toContain('100');
        ruler.highlight(item);
        ruler.tick(1 / 60);
        expect(ruler.state.selection.value).toEqual({ x: 100, y: 40, width: 50, height: 30 });
        item.x = 120;
        ruler.tick(1 / 60);
        expect(ruler.state.selection.value?.x).toBe(120);
        expect(ruler.side({ x: 300, y: 10 })).toBe('top');
        expect(ruler.side({ x: 10, y: 300 })).toBe('left');
        expect(ruler.side({ x: 300, y: 300 })).toBeNull();
    });
});

describe('guides', () => {
    const make = () => {
        const r = rig();
        const ruler = new Ruler({ camera: r.camera, ticker: null, trackCursor: false });
        const engine = new SnapEngine({ targets: [{ x: 200, y: 100, width: 100, height: 50 }] });
        const guides = new Guides({ camera: r.camera, ruler, snap: engine, ticker: null });

        r.overlay.addChild(guides, ruler);

        return { ...r, ruler, guides, engine };
    };

    it('drags a guide out of the ruler and snaps it to an edge', () => {
        const { ruler, guides } = make();

        ruler.emit('pointerdown', ev(10, 300) as never);
        guides.emit('globalpointermove', ev(197, 300) as never);
        expect(guides.state.dragging.value?.guide.at).toBe(200);
        ruler.emit('pointerupoutside', ev(197, 300) as never);
        expect(guides.guides).toEqual([{ id: expect.any(Number), axis: 'x', at: 200 }]);
    });

    it('moves a guide, and removes it when dropped on the ruler', () => {
        const { guides, engine } = make();
        const g = guides.add('y', 300);

        guides.bindSnap(engine);
        expect(engine.lines.y).toEqual([300]);
        guides.emit('pointerdown', ev(400, 301) as never);
        guides.emit('globalpointermove', ev(400, 420) as never);
        guides.emit('pointerup', ev(400, 420) as never);
        expect(guides.guides[0]).toMatchObject({ id: g.id, at: 420 });
        expect(engine.lines.y).toEqual([420]);
        guides.emit('pointerdown', ev(400, 420) as never);
        guides.emit('globalpointermove', ev(400, 8) as never);
        expect(guides.state.dragging.value?.removing).toBe(true);
        guides.emit('pointerupoutside', ev(400, 8) as never);
        expect(guides.guides).toHaveLength(0);
        settle(guides);
    });

    it('snaps to the nearest candidate within reach', () => {
        expect(snapValue(10, [4, 12, 30], 3)).toBe(12);
        expect(snapValue(10, [30], 3)).toBe(10);
    });
});

describe('marquee', () => {
    const make = (mode: 'intersect' | 'contain' = 'intersect') => {
        const r = rig();
        const a = box(100, 100, 50, 50);
        const b = box(300, 100, 50, 50);
        const items = [a, b];

        r.world.addChild(a, b);
        let selection: readonly Container[] = [];
        const surface = r.root;
        const marquee = new Marquee({
            camera: r.camera,
            surface,
            candidates: () => items,
            mode,
            selection: () => selection,
            onChange: (next) => {
                selection = next;
            },
            ticker: null,
        });

        r.overlay.addChild(marquee);
        const drag = (from: [number, number], to: [number, number], extra: Record<string, unknown> = {}) => {
            surface.emit('pointerdown', ev(...from, { target: surface, ...extra }) as never);
            surface.emit('globalpointermove', ev(...to, extra) as never);
            surface.emit('pointerup', ev(...to, extra) as never);
        };

        return {
            ...r,
            a,
            b,
            marquee,
            drag,
            surface,
            get selection() {
                return selection;
            },
        };
    };

    it('selects what the rectangle touches, live', () => {
        const m = make();

        m.drag([80, 80], [120, 120]);
        expect(m.selection).toEqual([m.a]);
        m.drag([80, 80], [320, 120], { shiftKey: true });
        expect(m.selection).toEqual([m.a, m.b]);
        m.drag([90, 90], [110, 110], { altKey: true });
        expect(m.selection).toEqual([m.b]);
    });

    it('contain mode only takes what is fully inside, and a click clears', () => {
        const m = make('contain');

        m.drag([80, 80], [120, 120]);
        expect(m.selection).toEqual([]);
        m.drag([80, 80], [160, 160]);
        expect(m.selection).toEqual([m.a]);
        m.surface.emit('pointerdown', ev(500, 500, { target: m.surface }) as never);
        m.surface.emit('pointerup', ev(500, 500) as never);
        expect(m.selection).toEqual([]);
    });

    it('ignores presses that land on an object, and a pan cancels it', () => {
        const m = make();

        m.surface.emit('pointerdown', ev(80, 80, { target: m.a }) as never);
        m.surface.emit('globalpointermove', ev(120, 120) as never);
        expect(m.marquee.state.active.value).toBe(false);
        m.surface.emit('pointerdown', ev(80, 80, { target: m.surface }) as never);
        m.surface.emit('globalpointermove', ev(120, 120) as never);
        expect(m.marquee.state.active.value).toBe(true);
        const down = new Event('pointerdown');

        for (const [k, v] of Object.entries({ pointerId: 2, pointerType: 'mouse', button: 1, clientX: 0, clientY: 0 }))
            Object.defineProperty(down, k, { value: v });
        Object.defineProperty(down, 'target', { value: m.element });
        // a middle drag starts a pan
        window.dispatchEvent(down);
        expect(m.marquee.state.active.value).toBe(false);
        expect(m.selection).toEqual([]);
    });

    it('tests rotated boxes exactly', () => {
        const diamond: Quad = [
            { x: 50, y: 0 },
            { x: 100, y: 50 },
            { x: 50, y: 100 },
            { x: 0, y: 50 },
        ];

        // the corner of the bounding box, outside the diamond itself
        expect(quadIntersects(diamond, { x: 0, y: 0, width: 20, height: 20 })).toBe(false);
        expect(quadIntersects(diamond, { x: 40, y: 40, width: 5, height: 5 })).toBe(true);
        expect(quadInside(diamond, { x: -1, y: -1, width: 102, height: 102 })).toBe(true);
        const [x, y] = [new Container(), new Container()];

        expect(combineSelection([x], [y], 'add')).toEqual([x, y]);
        expect(combineSelection([x, y], [y], 'subtract')).toEqual([x]);
    });
});

describe('selection group', () => {
    const make = () => {
        const world = new Container();
        const a = box(0, 0, 100, 100);
        const b = box(200, 0, 100, 100);
        const group = new SelectionGroup();

        world.addChild(a, b, group);
        group.set([a, b]);

        return { world, a, b, group };
    };

    it('frames several objects and hands a single one to the gizmo itself', () => {
        const { a, group } = make();

        expect(group.target).toBe(group);
        expect(group.position).toMatchObject({ x: 150, y: 50 });
        expect(group.getLocalBounds().width).toBe(300);
        group.set([a]);
        expect(group.target).toBe(a);
    });

    it('turns every object about the common centre', () => {
        const { world, a, b, group } = make();

        group.begin();
        group.rotation = Math.PI / 2;
        group.apply();
        group.end();
        // a's top left corner (0, 0) turns a quarter about (150, 50)
        expect(a.x).toBeCloseTo(200);
        expect(a.y).toBeCloseTo(-100);
        expect(a.rotation).toBeCloseTo(Math.PI / 2);
        const q = boundsQuad(b, world);

        expect(Math.min(...q.map((p) => p.y))).toBeCloseTo(100);
    });

    it('moves and scales through a box gizmo', () => {
        const { world, a, b, group } = make();
        const gizmo = new TransformGizmo({ ticker: null, readout: false, mode: 'box', ...group.hooks() });

        world.addChild(gizmo);
        gizmo.attach(group.target);
        for (let i = 0; i < 90; i++) gizmo.tick(1 / 60);
        const g = gizmo as unknown as Record<string, (e: unknown) => void>;

        g._onDown(ev(150, 50));
        g._onMove(ev(170, 80));
        g._onUp(ev(170, 80));
        expect(a.position).toMatchObject({ x: 20, y: 30 });
        expect(b.position).toMatchObject({ x: 220, y: 30 });
        // drag the right edge out by 300: twice as wide, the left edge stays
        g._onDown(ev(320, 80));
        g._onMove(ev(620, 80));
        g._onUp(ev(620, 80));
        expect(a.x).toBeCloseTo(20);
        expect(a.scale.x).toBeCloseTo(2);
        expect(b.x).toBeCloseTo(420);
    });
});

describe('smart spacing', () => {
    const r = (x: number, y: number, w = 50, h = 50) => ({ x, y, width: w, height: h });

    it('finds every gap equal to the moving box gap in its row', () => {
        // gaps of 20 between the first two, and the moving box 20 after the second
        const res = findSpacing(r(140, 0), [r(0, 0), r(70, 0), r(400, 300)]);

        expect(res.gaps.map((g) => [g.from, g.to])).toEqual([
            [120, 140],
            [50, 70],
        ]);
        expect(res.gaps.every((g) => g.value === 20 && g.at === 25)).toBe(true);
    });

    it('shows nothing when the gaps differ, and lines for shared edges and centres', () => {
        const res = findSpacing(r(150, 0), [r(0, 0), r(70, 0)]);

        expect(res.gaps).toHaveLength(0);
        // tops, centres and bottoms line up across the row
        expect(res.lines.filter((l) => l.axis === 'y').map((l) => l.at)).toEqual([0, 25, 50]);
        const centre = findSpacing(r(0, 200, 50, 10), [r(0, 0, 50, 50)]).lines.find((l) => l.kind === 'centre');

        expect(centre).toMatchObject({ axis: 'x', at: 25, from: 0, to: 210 });
    });

    it('reads gaps in a column and converts snap guides', () => {
        expect(gapsBetween([r(0, 0), r(0, 70), r(0, 160)], 'y').map((g) => g.value)).toEqual([20, 40]);
        const out = spacingFromSnap([
            { axis: 'x', kind: 'spacing', at: 5, from: 0, to: 40, gaps: [[0, 10]], gap: 10 },
            { axis: 'y', kind: 'centre', at: 3, from: 0, to: 9 },
        ]);

        expect(out.gaps[0]).toMatchObject({ axis: 'x', value: 10 });
        expect(out.lines[0]).toMatchObject({ kind: 'centre', at: 3 });
    });

    it('fades markers in and out', () => {
        const world = new Container();
        const root = new Container();
        const markers = new SpacingMarkers({ space: world, ticker: null });

        world.scale.set(2);
        root.addChild(world, markers);
        markers.show(findSpacing(r(140, 0), [r(0, 0), r(70, 0)]));
        markers.tick(1 / 60);
        expect(markers.shown.gaps).toHaveLength(2);
        markers.clear();
        settle(markers);
        expect(markers.shown.gaps).toHaveLength(0);
        expect(markers.tick(1 / 60)).toBe(false);
    });
});
