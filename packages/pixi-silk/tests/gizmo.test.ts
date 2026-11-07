import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { SilkGraphics } from '../src/SilkGraphics';
import { TransformGizmo, type TransformGizmoOptions } from '../src/ui/gizmo';
import { boundsQuad, SelectionOutline } from '../src/ui/outline';
import { SnapEngine, SnapGuides } from '../src/ui/snap';

/** A 100 x 50 box centred on its origin, placed at (200, 100). */
const scene = () => {
    const root = new Container();
    const target = new Container();
    const art = new SilkGraphics();

    art.rect(-50, -25, 100, 50).fill(0xffffff);
    target.addChild(art);
    target.position.set(200, 100);
    root.addChild(target);

    return { root, target };
};

const ev = (x: number, y: number, id = 1) => ({
    pointerId: id,
    pointerType: 'mouse',
    button: 0,
    buttons: 1,
    global: { x, y },
    stopPropagation() {},
});

const rig = (options: TransformGizmoOptions = {}) => {
    const { root, target } = scene();
    const gizmo = new TransformGizmo({ ticker: null, readout: false, ...options });

    root.addChild(gizmo);
    gizmo.attach(target);
    // let the handles pop in: input waits for them
    for (let i = 0; i < 90; i++) gizmo.tick(1 / 60);
    const g = gizmo as unknown as Record<string, (e: unknown) => void>;
    const drag = (from: [number, number], to: [number, number]) => {
        g._onDown(ev(...from));
        g._onMove(ev(...to));
        g._onUp(ev(...to));
    };

    return { root, target, gizmo, drag };
};

describe('TransformGizmo', () => {
    it('picks handles where they are drawn', () => {
        const { gizmo } = rig();

        expect(gizmo.pick(0, 0)).toBe('move-free');
        expect(gizmo.pick(70, 0)).toBe('move-x');
        expect(gizmo.pick(0, 70)).toBe('move-y');
        expect(gizmo.pick(84 * 1.22, 0)).toBe('rotate');
        expect(gizmo.pick(84 * 0.58, 0)).toBe('scale-x');
        expect(gizmo.pick(40, 40)).toBeNull();
    });

    it('moves along one axis only', () => {
        const { target, drag } = rig({ mode: 'move' });

        drag([270, 100], [310, 130]);
        expect(target.x).toBeCloseTo(240);
        expect(target.y).toBeCloseTo(100);
    });

    it('moves along the rotated axis in local space and the parent axis in world space', () => {
        const local = rig({ mode: 'move' });

        local.target.rotation = Math.PI / 2;
        local.gizmo.tick(1 / 60);
        // local x now points down the screen
        local.drag([200, 170], [200, 200]);
        expect(local.target.y).toBeCloseTo(130);
        const world = rig({ mode: 'move', space: 'world' });

        world.target.rotation = Math.PI / 2;
        world.gizmo.tick(1 / 60);
        world.drag([270, 100], [300, 100]);
        expect(world.target.x).toBeCloseTo(230);
    });

    it('snaps free moves to the grid', () => {
        const { target, drag } = rig({ mode: 'move', snap: { enabled: true, translate: 10 } });

        drag([200, 100], [213, 107]);
        expect([target.x, target.y]).toEqual([210, 110]);
    });

    it('rotates and snaps the angle', () => {
        const { target, drag, gizmo } = rig({ mode: 'rotate', snap: { enabled: true } });
        const r = 84 * 0.92;

        drag([200 + r, 100], [200 + 3, 100 + r]);
        expect(target.rotation).toBeCloseTo(Math.PI / 2);
        expect(gizmo.state.dragging.value).toBe(false);
    });

    it('scales along an axis and evenly', () => {
        const { target, drag } = rig({ mode: 'scale' });

        drag([284, 100], [326, 100]);
        expect(target.scale.x).toBeCloseTo(1.5);
        expect(target.scale.y).toBeCloseTo(1);
        drag([216, 100], [232, 100]);
        expect(target.scale.x).toBeCloseTo(3);
        expect(target.scale.y).toBeCloseTo(2);
    });

    it('resizes from a box edge and keeps the opposite edge still', () => {
        const { target, drag, gizmo } = rig({ mode: 'box' });

        expect(gizmo.pick(50, 0)).toBe('box-e');
        drag([250, 100], [290, 100]);
        expect(target.scale.x).toBeCloseTo(1.4);
        expect(target.x).toBeCloseTo(220);
        // left edge stayed at 150
        expect(target.x - 50 * target.scale.x).toBeCloseTo(150);
    });

    it('resizes a rotated box in its own frame', () => {
        const { target, drag, gizmo } = rig({ mode: 'box' });

        target.rotation = Math.PI / 2;
        gizmo.tick(1 / 60);
        // the east edge now faces down: (200, 150)
        expect(gizmo.pick(0, 50)).toBe('box-e');
        drag([200, 150], [200, 170]);
        expect(target.scale.x).toBeCloseTo(1.2);
        expect(target.y).toBeCloseTo(110);
    });

    it('rotates a box about its centre', () => {
        const { target, drag } = rig({ mode: 'box' });

        target.pivot.set(-50, -25);
        target.position.set(150, 75);
        // a little outside the top right corner: the rotate zone
        drag([262, 62], [262, 138]);
        // the centre (200, 100) stays put
        const q = boundsQuad(target, target.parent as Container);

        expect((q[0].x + q[2].x) / 2).toBeCloseTo(200);
        expect((q[0].y + q[2].y) / 2).toBeCloseTo(100);
        expect(target.rotation).toBeGreaterThan(0.5);
    });

    it('snaps free moves with a SnapEngine', () => {
        const engine = new SnapEngine({ targets: [{ x: 300, y: 0, width: 50, height: 50 }] });
        const { target, drag } = rig({ mode: 'move', snapEngine: engine });

        // right edge at 250 + 47 = 297, three units from the other box's left edge
        drag([200, 100], [247, 100]);
        expect(target.x).toBeCloseTo(250);
    });
});

describe('SnapEngine', () => {
    it('aligns edges and centres within the threshold', () => {
        const e = new SnapEngine({ threshold: 5, targets: [{ x: 100, y: 100, width: 40, height: 40 }] });
        const r = e.snap({ x: 103, y: 0, width: 20, height: 20 });

        expect(r.dx).toBe(-3);
        expect(r.snappedX).toBe(true);
        expect(r.guides.some((g) => g.axis === 'x' && g.at === 100)).toBe(true);
        const c = e.snap({ x: 108, y: 300, width: 20, height: 20 });

        // centre 118 to centre 120
        expect(c.dx).toBe(2);
        expect(e.snap({ x: 200, y: 300, width: 10, height: 10 }).snappedX).toBe(false);
    });

    it('snaps to fixed lines and points', () => {
        const e = new SnapEngine({ lines: { x: [64] }, points: [{ x: 0, y: 32 }] });

        expect(e.snap({ x: 58, y: 300, width: 2, height: 2 }).dx).toBe(4);
        // the nearest of edges and centre wins: centre 65 to the line at 64
        expect(e.snap({ x: 60, y: 300, width: 10, height: 10 }).dx).toBe(-1);
        expect(e.snapPoint(500, 30).y).toBe(32);
    });

    it('centres between two neighbours and repeats existing gaps', () => {
        const a = { x: 0, y: 0, width: 50, height: 50 };
        const b = { x: 150, y: 0, width: 50, height: 50 };
        const e = new SnapEngine({ threshold: 6, targets: [a, b], edges: false, centres: false });
        const mid = e.snap({ x: 82, y: 10, width: 30, height: 30 });

        // gap of 35 each side: x = 85
        expect(82 + mid.dx).toBe(85);
        expect(mid.guides[0].kind).toBe('spacing');
        expect(mid.guides[0].gaps).toEqual([
            [50, 85],
            [115, 150],
        ]);
        // a 100 gap between a and b: a third box after b at 300
        const after = e.snap({ x: 296, y: 0, width: 50, height: 50 });

        expect(296 + after.dx).toBe(300);
    });
});

describe('SelectionOutline', () => {
    it('frames a rotated target with an oriented, padded box', () => {
        const { root, target } = scene();
        const outline = new SelectionOutline({ ticker: null, padding: 5 });

        root.addChild(outline);
        target.rotation = Math.PI / 2;
        outline.select(target);
        outline.tick(1 / 60);
        const q = outline.quad;

        expect(q).not.toBeNull();
        // rotated a quarter turn: 50 wide, 100 tall around (200, 100), plus padding
        const xs = q?.map((p) => p.x) ?? [];
        const ys = q?.map((p) => p.y) ?? [];

        expect(Math.min(...xs)).toBeCloseTo(170);
        expect(Math.max(...ys)).toBeCloseTo(155);
    });

    it('unions several targets and glides when asked to', () => {
        const { root, target } = scene();
        const other = new Container();
        const art = new SilkGraphics();

        art.rect(0, 0, 20, 20).fill(0xffffff);
        other.addChild(art);
        other.position.set(400, 300);
        root.addChild(other);
        const outline = new SelectionOutline({ ticker: null, padding: 0, transition: 'glide' });

        root.addChild(outline);
        outline.select(target);
        outline.tick(1 / 60);
        outline.select([target, other]);
        outline.tick(1 / 60);
        const mid = outline.quad?.[2].x ?? 0;

        expect(mid).toBeGreaterThan(250);
        expect(mid).toBeLessThan(420);
        for (let i = 0; i < 120; i++) outline.tick(1 / 60);
        expect(outline.quad?.[2].x).toBeCloseTo(420, 0);
        expect(outline.quad?.[2].y).toBeCloseTo(320, 0);
    });

    it('fades out and sleeps once cleared', () => {
        const { root, target } = scene();
        const outline = new SelectionOutline({ ticker: null, march: 0 });

        root.addChild(outline);
        outline.hover(target);
        outline.tick(1 / 60);
        outline.hover(null);
        let busy = true;

        for (let i = 0; i < 200 && busy; i++) busy = outline.tick(1 / 60);
        expect(busy).toBe(false);
    });

    it('pops: the new frame sits exactly on the new target while the old one shrinks away', () => {
        const { root, target } = scene();
        const other = new Container();
        const art = new SilkGraphics();

        art.rect(0, 0, 20, 20).fill(0xffffff);
        other.addChild(art);
        other.position.set(400, 300);
        root.addChild(other);
        const outline = new SelectionOutline({ ticker: null, padding: 0 });

        root.addChild(outline);
        outline.select(target);
        for (let i = 0; i < 60; i++) outline.tick(1 / 60);
        expect(outline.popping).toBe(false);
        outline.select(other);
        outline.tick(1 / 60);
        // no glide: the box is already around the new target
        expect(outline.quad?.[0]).toEqual({ x: 400, y: 300 });
        expect(outline.popping).toBe(true);
        for (let i = 0; i < 90; i++) outline.tick(1 / 60);
        expect(outline.popping).toBe(false);
    });

    it('follows the same target exactly, with no lag', () => {
        const { root, target } = scene();
        const outline = new SelectionOutline({ ticker: null, padding: 0 });

        root.addChild(outline);
        outline.select(target);
        outline.tick(1 / 60);
        target.x += 37;
        outline.tick(1 / 60);
        expect(outline.quad?.[0].x).toBeCloseTo(187);
    });
});

describe('TransformGizmo transitions', () => {
    it('pops between targets, ignoring the pointer until the handles land', () => {
        const { root, target, gizmo } = rig();
        const other = new Container();

        other.position.set(400, 300);
        root.addChild(other);
        expect(gizmo.pick(0, 0)).toBe('move-free');
        gizmo.attach(other);
        gizmo.tick(1 / 60);
        expect(gizmo.transitioning).toBe(true);
        expect(gizmo.pick(0, 0)).toBeNull();
        // the gizmo is already on the new target, not sliding towards it
        expect([gizmo.x, gizmo.y]).toEqual([400, 300]);
        for (let i = 0; i < 90; i++) gizmo.tick(1 / 60);
        expect(gizmo.transitioning).toBe(false);
        expect(gizmo.pick(0, 0)).toBe('move-free');
        void target;
    });

    it('draws the new handles in place after quick switches', () => {
        const { root, gizmo } = rig();
        const b = new Container();
        const c = new Container();

        b.position.set(400, 300);
        c.position.set(50, 50);
        root.addChild(b, c);
        gizmo.attach(b);
        for (let i = 0; i < 5; i++) gizmo.tick(1 / 60);
        gizmo.attach(c);
        for (let i = 0; i < 5; i++) gizmo.tick(1 / 60);
        const g = (gizmo as unknown as { _g: SilkGraphics })._g;

        expect([g.x, g.y, g.scale.x]).toEqual([0, 0, 1]);
    });

    it('glides when asked to', () => {
        const { root, gizmo } = rig({ transition: 'glide' });
        const other = new Container();

        other.position.set(400, 300);
        root.addChild(other);
        gizmo.attach(other);
        gizmo.tick(1 / 60);
        expect(gizmo.x).toBeGreaterThan(200);
        expect(gizmo.x).toBeLessThan(400);
        for (let i = 0; i < 120; i++) gizmo.tick(1 / 60);
        expect(gizmo.x).toBeCloseTo(400);
    });

    it('follows its target exactly while dragging', () => {
        const { target, gizmo } = rig({ mode: 'move' });
        const g = gizmo as unknown as Record<string, (e: unknown) => void>;

        g._onDown(ev(270, 100));
        g._onMove(ev(300, 100));
        gizmo.tick(1 / 60);
        expect(gizmo.x).toBe(target.x);
        g._onUp(ev(300, 100));
    });
});

describe('SnapGuides', () => {
    it('fades a lost alignment out instead of moving it to the new one', () => {
        const guides = new SnapGuides({ ticker: null });
        const a = { axis: 'x' as const, kind: 'edge' as const, at: 100, from: 0, to: 50 };
        const b = { axis: 'x' as const, kind: 'edge' as const, at: 160, from: 0, to: 50 };

        guides.show([a]);
        for (let i = 0; i < 30; i++) guides.tick(1 / 60);
        // the same alignment with a new extent stays the same guide
        guides.show([{ ...a, to: 80 }]);
        expect(guides.guides).toHaveLength(1);
        guides.show([b]);
        expect(guides.guides.map((g) => g.at)).toEqual([160]);
        let busy = true;

        for (let i = 0; i < 120 && busy; i++) busy = guides.tick(1 / 60);
        expect(busy).toBe(false);
        guides.clear();
        for (let i = 0; i < 120 && busy; i++) busy = guides.tick(1 / 60);
        expect(guides.guides).toHaveLength(0);
    });
});
