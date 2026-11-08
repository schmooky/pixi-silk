import { Container } from 'pixi.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { History } from '../src/history';
import {
    type BezierPath,
    cubicPoint,
    drawPath,
    inferAnchorType,
    insertAnchor,
    nearestOnPath,
    parseSvgPath,
    pathBounds,
    pathFromPoints,
    pathToSvg,
    removeAnchors,
    reversePath,
    segmentAt,
    setAnchorType,
    setHandle,
    splitCubic,
    toggleAnchorType,
} from '../src/path';
import { SilkGraphics } from '../src/SilkGraphics';
import { PathGizmo, PenTool } from '../src/ui/pathgizmo';

beforeAll(() => {
    (globalThis as Record<string, unknown>).window ??= new EventTarget();
});

/** A curved closed path: a rounded square drawn with four smooth anchors. */
const blob = (): BezierPath => ({
    closed: true,
    anchors: [
        { x: 0, y: -100, in: { x: -55, y: 0 }, out: { x: 55, y: 0 }, type: 'mirrored' },
        { x: 100, y: 0, in: { x: 0, y: -55 }, out: { x: 0, y: 55 }, type: 'mirrored' },
        { x: 0, y: 100, in: { x: 55, y: 0 }, out: { x: -55, y: 0 }, type: 'mirrored' },
        { x: -100, y: 0, in: { x: 0, y: 55 }, out: { x: 0, y: -55 }, type: 'mirrored' },
    ],
});

const close = (a: { x: number; y: number }, b: { x: number; y: number }, digits = 9) => {
    expect(a.x).toBeCloseTo(b.x, digits);
    expect(a.y).toBeCloseTo(b.y, digits);
};

describe('bezier math', () => {
    it('splits a cubic exactly with de Casteljau', () => {
        const c = segmentAt(blob(), 0);

        for (const t of [0.1, 0.37, 0.5, 0.9]) {
            const [l, r] = splitCubic(c, t);

            close(l[3], cubicPoint(c, t));
            close(r[0], cubicPoint(c, t));
            // each half traces its part of the original curve
            for (const u of [0, 0.25, 0.5, 0.75, 1]) {
                close(cubicPoint(l, u), cubicPoint(c, u * t));
                close(cubicPoint(r, u), cubicPoint(c, t + u * (1 - t)));
            }
        }
    });

    it('inserts an anchor without changing the shape', () => {
        const path = blob();
        const { path: out, index } = insertAnchor(path, 1, 0.3);

        expect(index).toBe(2);
        expect(out.anchors).toHaveLength(5);
        const before = segmentAt(path, 1);
        const [left, right] = [segmentAt(out, 1), segmentAt(out, 2)];

        for (const u of [0, 0.2, 0.5, 0.8, 1]) {
            close(cubicPoint(left, u), cubicPoint(before, u * 0.3));
            close(cubicPoint(right, u), cubicPoint(before, 0.3 + u * 0.7));
        }
        expect(out.anchors[2].type).toBe('smooth');
        // the neighbours' handles were shortened, so they are no longer mirrored
        expect(out.anchors[1].type).toBe('smooth');
        // the input is untouched
        expect(path.anchors).toHaveLength(4);
    });

    it('inserts on the closing segment and on straight lines', () => {
        const { path, index } = insertAnchor(blob(), 3, 0.5);

        expect(index).toBe(4);
        close(path.anchors[4], cubicPoint(segmentAt(blob(), 3), 0.5));
        const line = pathFromPoints([
            { x: 0, y: 0 },
            { x: 100, y: 0 },
        ]);
        const split = insertAnchor(line, 0, 0.25).path;

        expect(split.anchors[1]).toEqual({ x: 25, y: 0, type: 'corner' });
    });

    it('removes anchors and opens a closed path left with one', () => {
        const out = removeAnchors(blob(), [1, 2]);

        expect(out.anchors.map((a) => a.x)).toEqual([0, -100]);
        expect(out.closed).toBe(true);
        expect(removeAnchors(out, [0]).closed).toBe(false);
    });

    it('keeps handles mirrored, smooth or free by anchor type', () => {
        const path = blob();
        const mirrored = setHandle(path, 0, 'out', { x: 30, y: 30 });

        expect(mirrored.anchors[0].in).toEqual({ x: -30, y: -30 });
        const smooth = setHandle(setAnchorType(path, 0, 'smooth'), 0, 'out', { x: 0, y: 20 });

        close(smooth.anchors[0].in as { x: number; y: number }, { x: 0, y: -55 });
        const broken = setHandle(path, 0, 'out', { x: 10, y: 40 }, true);

        expect(broken.anchors[0].type).toBe('corner');
        expect(broken.anchors[0].in).toEqual({ x: -55, y: 0 });
    });

    it('toggles corner and smooth, growing handles from the neighbours', () => {
        const square = pathFromPoints(
            [
                { x: 0, y: 0 },
                { x: 90, y: 0 },
                { x: 90, y: 90 },
            ],
            false,
        );
        const smooth = toggleAnchorType(square, 1);
        const a = smooth.anchors[1];

        expect(a.type).toBe('smooth');
        expect(inferAnchorType(a)).not.toBe('corner');
        expect(Math.hypot(a.out?.x ?? 0, a.out?.y ?? 0)).toBeCloseTo(30, 6);
        const back = toggleAnchorType(smooth, 1);

        expect(back.anchors[1]).toEqual({ x: 90, y: 0, type: 'corner' });
    });

    it('finds the nearest point and the tight bounds', () => {
        const hit = nearestOnPath(blob(), { x: 200, y: 0 });

        expect(hit?.segment === 0 || hit?.segment === 1).toBe(true);
        close(hit as { x: number; y: number }, { x: 100, y: 0 }, 4);
        const b = pathBounds(blob());

        expect(b.x).toBeCloseTo(-100, 6);
        expect(b.width).toBeCloseTo(200, 6);
    });

    it('round-trips SVG path data and reads quadratics, arcs and relative commands', () => {
        const svg = pathToSvg(blob());
        const [back] = parseSvgPath(svg);

        expect(back.closed).toBe(true);
        expect(back.anchors).toHaveLength(4);
        expect(back.anchors.every((a) => a.type === 'mirrored')).toBe(true);
        expect(pathToSvg(back)).toBe(svg);
        const [tri] = parseSvgPath('m10 10 h 50 v 50 z');

        expect(tri.anchors.map((a) => [a.x, a.y])).toEqual([
            [10, 10],
            [60, 10],
            [60, 60],
        ]);
        const [quad] = parseSvgPath('M0 0 Q 50 100 100 0');

        close(cubicPoint(segmentAt(quad, 0), 0.5), { x: 50, y: 50 });
        const [arc] = parseSvgPath('M -50 0 A 50 50 0 0 1 50 0');
        const top = cubicPoint(segmentAt(arc, 0), 1);

        // a half circle above the axis passes the top at y = -50
        expect(arc.anchors.length).toBeGreaterThanOrEqual(3);
        expect(Math.min(...arc.anchors.map((a) => a.y))).toBeCloseTo(-50, 6);
        expect(Number.isFinite(top.x)).toBe(true);
    });

    it('draws into SilkGraphics as one shape', () => {
        const g = new SilkGraphics();
        const calls: string[] = [];
        const spy = {
            moveTo: () => calls.push('M'),
            lineTo: () => calls.push('L'),
            bezierCurveTo: () => calls.push('C'),
            closePath: () => calls.push('Z'),
        };

        drawPath(
            spy,
            pathFromPoints(
                [
                    { x: 0, y: 0 },
                    { x: 10, y: 0 },
                    { x: 10, y: 10 },
                ],
                true,
            ),
        );
        expect(calls.join('')).toBe('MLLZ');
        expect(() => drawPath(g, blob()).fill(0xffffff).stroke({ width: 2, color: 0 })).not.toThrow();
    });

    it('reverses a path', () => {
        const r = reversePath(blob());

        expect(r.anchors[0].x).toBe(-100);
        expect(r.anchors[0].out).toEqual({ x: 0, y: 55 });
    });
});

describe('PenTool', () => {
    it('clicks corners, drags curves and closes on the first anchor', () => {
        const pen = new PenTool();

        expect(pen.down({ x: 0, y: 0 })).toBe('Add point');
        pen.up();
        expect(pen.phase).toBe('drawing');
        pen.down({ x: 100, y: 0 });
        expect(pen.phase).toBe('dragging');
        pen.move({ x: 130, y: 40 });
        pen.up();
        const b = pen.path.anchors[1];

        expect(b.type).toBe('mirrored');
        expect(b.out).toEqual({ x: 30, y: 40 });
        expect(b.in).toEqual({ x: -30, y: -40 });
        pen.move({ x: 50, y: 80 });
        expect(pen.preview?.[3]).toEqual({ x: 50, y: 80 });
        pen.down({ x: 50, y: 80 });
        pen.up();
        expect(pen.down({ x: 0, y: 0 }, { on: 'first' })).toBe('Close path');
        expect(pen.phase).toBe('closing');
        pen.up();
        expect(pen.path.closed).toBe(true);
        expect(pen.phase).toBe('idle');
        expect(pen.down({ x: 5, y: 5 })).toBeNull();
    });

    it('breaks symmetry with Alt and makes a cusp on the last anchor', () => {
        const pen = new PenTool();

        pen.down({ x: 0, y: 0 });
        pen.move({ x: 0, y: 50 });
        pen.move({ x: 20, y: 0 }, { alt: true });
        pen.up();
        const a = pen.path.anchors[0];

        expect(a.type).toBe('corner');
        expect(a.out).toEqual({ x: 20, y: 0 });
        expect(a.in).toEqual({ x: 0, y: -50 });
        pen.down({ x: 0, y: 0 }, { on: 'last' });
        pen.up();
        expect(pen.path.anchors[0].out).toBeUndefined();
        expect(pen.path.anchors).toHaveLength(1);
    });

    it('snaps new anchors and handles to 45 degrees with Shift, and resumes an open path', () => {
        const pen = new PenTool();

        pen.down({ x: 0, y: 0 });
        pen.up();
        pen.down({ x: 100, y: 10 }, { shift: true });
        pen.up();
        expect(pen.path.anchors[1].y).toBeCloseTo(0, 9);
        pen.finish();
        expect(pen.phase).toBe('idle');
        // a press on the first anchor of an open path continues from that end
        pen.down({ x: 0, y: 0 }, { on: 'first' });
        expect(pen.phase).toBe('drawing');
        expect(pen.path.anchors[1].x).toBe(0);
    });
});

const ev = (x: number, y: number, mods: { shiftKey?: boolean; altKey?: boolean } = {}, id = 1) => ({
    pointerId: id,
    pointerType: 'mouse',
    button: 0,
    buttons: 1,
    global: { x, y },
    shiftKey: false,
    altKey: false,
    ...mods,
    stopPropagation() {},
});

const rig = (path: BezierPath = blob()) => {
    const root = new Container();
    const space = new Container();
    const history = new History();

    space.position.set(200, 200);
    root.addChild(space);
    const gizmo = new PathGizmo({ path, space, history, ticker: null, keys: false });

    root.addChild(gizmo);
    const settle = () => {
        for (let i = 0; i < 60; i++) gizmo.tick(1 / 60);
    };
    const g = gizmo as unknown as Record<string, (e: unknown) => void>;
    const drag = (from: [number, number], to: [number, number], mods = {}) => {
        g._onDown(ev(...from, mods));
        g._onMove(ev((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, mods));
        g._onMove(ev(...to, mods));
        g._onUp(ev(...to, mods));
        settle();
    };
    const click = (at: [number, number], mods = {}) => drag(at, at, mods);

    settle();

    return { gizmo, history, drag, click, settle, g };
};

describe('PathGizmo', () => {
    it('picks anchors, handles and segments in screen space', () => {
        const { gizmo, click } = rig();

        expect(gizmo.pick(300, 200)).toEqual({ kind: 'anchor', index: 1 });
        expect(gizmo.pick(271, 129)?.kind).toBe('segment');
        expect(gizmo.pick(50, 50)).toBeNull();
        // handles show once their anchor is selected
        expect(gizmo.pick(255, 100)?.kind).not.toBe('handle');
        click([200, 100]);
        expect(gizmo.selected).toEqual([0]);
        expect(gizmo.pick(255, 100)).toEqual({ kind: 'handle', index: 0, side: 'out' });
    });

    it('drags selected anchors as one undoable step', () => {
        const { gizmo, history, drag, click } = rig();

        click([200, 100]);
        click([300, 200], { shiftKey: true });
        expect(gizmo.selected).toEqual([0, 1]);
        drag([300, 200], [320, 230]);
        expect(gizmo.path.anchors[0]).toMatchObject({ x: 20, y: -70 });
        expect(gizmo.path.anchors[1]).toMatchObject({ x: 120, y: 30 });
        expect(history.past).toHaveLength(1);
        expect(history.state.undoLabel.value).toBe('Move points');
        history.undo();
        expect(gizmo.path.anchors[1]).toMatchObject({ x: 100, y: 0 });
        history.redo();
        expect(gizmo.path.anchors[1]).toMatchObject({ x: 120, y: 30 });
    });

    it('bends a curve by its handle, and Alt breaks the symmetry', () => {
        const { gizmo, drag, click } = rig();

        click([200, 100]);
        drag([255, 100], [255, 130]);
        expect(gizmo.path.anchors[0].out).toEqual({ x: 55, y: 30 });
        expect(gizmo.path.anchors[0].in).toEqual({ x: -55, y: -30 });
        drag([255, 130], [270, 100], { altKey: true });
        expect(gizmo.path.anchors[0].type).toBe('corner');
        expect(gizmo.path.anchors[0].in).toEqual({ x: -55, y: -30 });
    });

    it('inserts an anchor where a segment is clicked, and deletes it again', () => {
        const { gizmo, history, click } = rig();
        const hit = gizmo.pick(271, 129);

        expect(hit?.kind).toBe('segment');
        click([271, 129]);
        expect(gizmo.path.anchors).toHaveLength(5);
        expect(gizmo.selected).toEqual([1]);
        expect(history.state.undoLabel.value).toBe('Add point');
        gizmo.deleteSelected();
        expect(gizmo.path.anchors).toHaveLength(4);
        history.undo();
        expect(gizmo.path.anchors).toHaveLength(5);
        history.undo();
        expect(gizmo.path.anchors).toHaveLength(4);
    });

    it('toggles a point on double-click and nudges merge into one step', () => {
        const { gizmo, history, click } = rig();

        click([300, 200]);
        click([300, 200]);
        expect(gizmo.path.anchors[1].type).toBe('corner');
        expect(gizmo.path.anchors[1].in).toBeUndefined();
        gizmo.nudge(1, 0);
        gizmo.nudge(1, 0);
        gizmo.nudge(0, 1);
        expect(gizmo.path.anchors[1]).toMatchObject({ x: 102, y: 1 });
        expect(history.past.at(-1)?.label).toBe('Nudge');
        history.undo();
        expect(gizmo.path.anchors[1]).toMatchObject({ x: 100, y: 0 });
    });

    it('draws a path with the pen and closes it, each click one step', () => {
        const { gizmo, history, click, drag } = rig({ anchors: [], closed: false });

        gizmo.state.tool.set('pen');
        click([200, 200]);
        drag([300, 200], [330, 240]);
        click([250, 300]);
        expect(gizmo.path.anchors).toHaveLength(3);
        expect(gizmo.path.anchors[1].type).toBe('mirrored');
        click([200, 200]);
        expect(gizmo.path.closed).toBe(true);
        expect(gizmo.state.tool.value).toBe('edit');
        expect(history.past.map((s) => s.label)).toEqual(['Add point', 'Add point', 'Add point', 'Close path']);
        history.undo();
        expect(gizmo.path.closed).toBe(false);
        history.undo();
        expect(gizmo.path.anchors).toHaveLength(2);
    });

    it('selects anchors in a rectangle for a marquee and runs the snap hook', () => {
        const { gizmo, drag } = rig();

        gizmo.selectInRect({ x: -10, y: -110, width: 120, height: 120 });
        expect(gizmo.selected).toEqual([0, 1]);
        gizmo.snap = (p) => ({ x: Math.round(p.x / 50) * 50, y: Math.round(p.y / 50) * 50 });
        drag([300, 200], [318, 233]);
        expect(gizmo.path.anchors[1]).toMatchObject({ x: 100, y: 50 });
    });
});
