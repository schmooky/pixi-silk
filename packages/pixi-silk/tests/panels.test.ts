import { Container, type FederatedPointerEvent } from 'pixi.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { History } from '../src/history';
import { Selection } from '../src/selection';
import { signal } from '../src/signal';
import { type GlyphContext, SdfAtlas } from '../src/text/atlas';
import { Camera } from '../src/ui/camera';
import { bindSignals, fieldValue, getPath, setPath } from '../src/ui/panels/binding';
import { type NumberField, ToggleField, type VectorField } from '../src/ui/panels/fields';
import { Inspector } from '../src/ui/panels/Inspector';
import { LayerTree } from '../src/ui/panels/LayerTree';
import {
    Minimap,
    minimapFit,
    minimapToWorld,
    unionRect,
    worldRectToMinimap,
    worldToMinimap,
} from '../src/ui/panels/Minimap';
import { dockAt, dockRect, Panel } from '../src/ui/panels/Panel';
import { pixiTreeAdapter } from '../src/ui/panels/pixi-tree';
import { ScrollView } from '../src/ui/panels/ScrollView';
import {
    applyDrop,
    dropTarget,
    flattenTree,
    redoMoves,
    type TreeAdapter,
    topLevelNodes,
    undoMoves,
    visibleRange,
} from '../src/ui/panels/tree';

// ------------------------------------------------------------------------------------ helpers

/** A glyph context with no ink: every character is half an em wide. */
function blankContext(): GlyphContext {
    let size = 48;
    let font = '';

    return {
        get font() {
            return font;
        },
        set font(v: string) {
            font = v;
            size = Number(/(\d+(?:\.\d+)?)px/.exec(v)?.[1] ?? 48);
        },
        fillStyle: '#000',
        textBaseline: 'alphabetic',
        textAlign: 'left',
        canvas: { width: 64, height: 64 },
        measureText(s: string) {
            const metrics = s.length > 2 && s.startsWith('|');

            return {
                width: Array.from(s).length * 0.5 * size,
                actualBoundingBoxLeft: 0,
                actualBoundingBoxRight: 0,
                actualBoundingBoxAscent: metrics ? 0.8 * size : 0,
                actualBoundingBoxDescent: metrics ? 0.2 * size : 0,
            };
        },
        clearRect() {},
        fillText() {},
        getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    };
}

const atlas = new SdfAtlas({ context: blankContext() });

/** Enough of a DOM element for the camera: events, size and hover. */
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

/** The fields of a Pixi pointer event the widgets read. */
const pointer = (x: number, y: number, extra: Record<string, unknown> = {}) =>
    ({
        global: { x, y },
        pointerId: 1,
        pointerType: 'mouse',
        button: 0,
        shiftKey: false,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        stopPropagation() {},
        ...extra,
    }) as unknown as FederatedPointerEvent;

const settle = (w: { tick(dt: number): boolean }, frames = 400) => {
    for (let i = 0; i < frames && w.tick(1 / 60); i++);
};

beforeAll(() => {
    (globalThis as Record<string, unknown>).window ??= new EventTarget();
});

/** A plain tree: nodes with names and children. */
interface Node {
    name: string;
    children: Node[];
    hidden?: boolean;
}

const node = (name: string, ...children: Node[]): Node => ({ name, children });

function plainAdapter(
    root: Node,
): Required<Pick<TreeAdapter<Node>, 'getChildren' | 'getName' | 'move'>> & TreeAdapter<Node> {
    const parentOf = (n: Node): Node | null => {
        const stack = [root];

        while (stack.length) {
            const p = stack.pop() as Node;

            if (p.children.includes(n)) return p;
            stack.push(...p.children);
        }

        return null;
    };

    return {
        getChildren: (n) => n.children,
        getName: (n) => n.name,
        getParent: parentOf,
        setName: (n, name) => {
            n.name = name;
        },
        isVisible: (n) => !n.hidden,
        setVisible: (n, v) => {
            n.hidden = !v;
        },
        canHaveChildren: (n) => n.name.startsWith('group'),
        move: (n, parent, index) => {
            const from = parentOf(n);

            if (from) from.children.splice(from.children.indexOf(n), 1);
            parent.children.splice(index, 0, n);
        },
    };
}

/** root: groupA (a1, a2), b, groupC (c1 (deep)) */
function sample() {
    const deep = node('deep');
    const c1 = node('group c1', deep);
    const a1 = node('a1');
    const a2 = node('a2');
    const groupA = node('groupA', a1, a2);
    const b = node('b');
    const groupC = node('groupC', c1);
    const root = node('root', groupA, b, groupC);

    return { root, groupA, a1, a2, b, groupC, c1, deep };
}

const names = (rows: readonly { node: Node }[]) => rows.map((r) => r.node.name);

// ------------------------------------------------------------------------------------ tree model

describe('tree flattening', () => {
    it('lists expanded nodes depth first with depth, parent and index', () => {
        const s = sample();
        const expanded = new Set<Node>([s.groupA]);
        const rows = flattenTree(plainAdapter(s.root), s.root, (n) => expanded.has(n));

        expect(names(rows)).toEqual(['groupA', 'a1', 'a2', 'b', 'groupC']);
        expect(rows.map((r) => r.depth)).toEqual([0, 1, 1, 0, 0]);
        expect(rows[2].parent).toBe(s.groupA);
        expect(rows[2].index).toBe(1);
        expect(rows[4].hasChildren).toBe(true);
        expect(rows[4].expanded).toBe(false);
    });

    it('shows the root as the first row with showRoot', () => {
        const s = sample();
        const rows = flattenTree(plainAdapter(s.root), s.root, () => true, true);

        expect(rows[0].node).toBe(s.root);
        expect(rows[0].parent).toBeNull();
        expect(rows.at(-1)?.depth).toBe(3);
        expect(rows).toHaveLength(8);
    });

    it('only puts the rows in view on screen, with a little overscan', () => {
        expect(visibleRange(0, 300, 28, 5000, 2)).toEqual({ start: 0, end: 13 });
        expect(visibleRange(28 * 1000 + 10, 300, 28, 5000, 2)).toEqual({ start: 998, end: 1014 });
        expect(visibleRange(1e9, 300, 28, 50, 2)).toEqual({ start: 50, end: 50 });
        expect(visibleRange(0, 300, 28, 0)).toEqual({ start: 0, end: 0 });
    });
});

describe('drop targets', () => {
    const rowsOf = () => {
        const s = sample();
        const rows = flattenTree(plainAdapter(s.root), s.root, (n) => n === s.groupA || n === s.groupC);

        // groupA, a1, a2, b, groupC, group c1
        return { s, rows };
    };
    const canNest = (n: Node) => n.name.startsWith('group');

    it('drops between rows in the top and bottom halves', () => {
        const { s, rows } = rowsOf();
        const before = dropTarget(rows, 3 * 28 + 4, 28, { canNest });

        expect(before).toMatchObject({ parent: s.root, index: 1, position: 'before', row: 3, depth: 0 });
        const after = dropTarget(rows, 1 * 28 + 24, 28, { canNest });

        expect(after).toMatchObject({ parent: s.groupA, index: 1, position: 'after', row: 1 });
    });

    it('drops inside a group in the middle of its row', () => {
        const { s, rows } = rowsOf();

        expect(dropTarget(rows, 4 * 28 + 14, 28, { canNest })).toMatchObject({
            parent: s.groupC,
            index: 0,
            position: 'inside',
        });
        // a row that takes no children has no middle band
        expect(dropTarget(rows, 3 * 28 + 10, 28, { canNest })?.position).toBe('before');
    });

    it('goes to the first child slot right below an open group', () => {
        const { s, rows } = rowsOf();

        expect(dropTarget(rows, 0 * 28 + 25, 28, { canNest })).toMatchObject({ parent: s.groupA, index: 0 });
    });

    it('lets x pick how far out a drop below the last child of a group goes', () => {
        const { s, rows } = rowsOf();
        const y = 2 * 28 + 25;

        // under a2 (depth 1, the last child of groupA): deep x stays in the group, shallow x leaves it
        expect(dropTarget(rows, y, 28, { canNest, x: 20, indent: 14 })).toMatchObject({ parent: s.groupA, index: 2 });
        expect(dropTarget(rows, y, 28, { canNest, x: 0, indent: 14 })).toMatchObject({
            parent: s.root,
            index: 1,
            depth: 0,
        });
    });

    it('drops below the last row at the top level', () => {
        const { s, rows } = rowsOf();

        expect(dropTarget(rows, 1000, 28, { canNest, x: 0 })).toMatchObject({ parent: s.root, index: 3 });
    });

    it('refuses to drop a node into itself or under itself', () => {
        const { s, rows } = rowsOf();

        expect(dropTarget(rows, 4 * 28 + 14, 28, { canNest, dragged: [s.groupC] })?.position).not.toBe('inside');
        expect(dropTarget(rows, 5 * 28 + 4, 28, { canNest, dragged: [s.groupC] })).toBeNull();
        expect(dropTarget(rows, 1 * 28 + 4, 28, { canNest, dragged: [s.groupA] })).toBeNull();
    });

    it('keeps only the top nodes of a selection, in row order', () => {
        const { s, rows } = rowsOf();

        expect(topLevelNodes(rows, [s.b, s.a1, s.groupA])).toEqual([s.groupA, s.b]);
    });
});

describe('reorder and reparent', () => {
    it('moves nodes in order before the first sibling that stays, and undoes and redoes', () => {
        const s = sample();
        const adapter = plainAdapter(s.root);
        const parentOf = adapter.getParent as (n: Node) => Node | null;
        const start = JSON.stringify(s.root);
        // a2 and b to the top of the root list
        const steps = applyDrop(adapter, [s.a2, s.b], { parent: s.root, index: 0 }, parentOf);

        expect(names(s.root.children.map((node) => ({ node })))).toEqual(['a2', 'b', 'groupA', 'groupC']);
        expect(s.groupA.children).toEqual([s.a1]);
        undoMoves(adapter, steps);
        expect(JSON.stringify(s.root)).toBe(start);
        redoMoves(adapter, steps);
        expect(names(s.root.children.map((node) => ({ node })))).toEqual(['a2', 'b', 'groupA', 'groupC']);
    });

    it('moves down within the same parent without an off by one', () => {
        const s = sample();
        const adapter = plainAdapter(s.root);

        // groupA after b: target index 2 counts groupA itself
        applyDrop(adapter, [s.groupA], { parent: s.root, index: 2 }, adapter.getParent as (n: Node) => Node | null);
        expect(s.root.children.map((n) => n.name)).toEqual(['b', 'groupA', 'groupC']);
    });

    it('reorders and reparents Pixi containers front to back and keeps them in place on screen', () => {
        const world = new Container();
        const back = new Container({ label: 'back' });
        const front = new Container({ label: 'front' });
        const group = new Container({ label: 'group' });
        const item = new Container({ label: 'item' });

        group.position.set(100, 50);
        item.position.set(10, 10);
        world.addChild(back, group, front);
        world.addChild(item);
        const adapter = pixiTreeAdapter();

        // front first: the last child is the top row
        expect(adapter.getChildren(world).map((c) => c.label)).toEqual(['item', 'front', 'group', 'back']);
        adapter.move(back, world, 0);
        expect(adapter.getChildren(world).map((c) => c.label)).toEqual(['back', 'item', 'front', 'group']);
        expect(world.children.at(-1)).toBe(back);
        // into the group: same place on screen
        adapter.move(item, group, 0);
        expect(item.parent).toBe(group);
        expect(item.position.x).toBeCloseTo(-90);
        expect(item.position.y).toBeCloseTo(-40);
        adapter.setLocked(group, true);
        expect(group.eventMode).toBe('none');
        expect(adapter.isLocked(group)).toBe(true);
        adapter.setLocked(group, false);
        expect(group.eventMode).toBe('passive');
    });
});

// ------------------------------------------------------------------------------------ layer tree

describe('LayerTree', () => {
    const big = (count: number) => {
        const root = node('root');

        for (let i = 0; i < count; i++) root.children.push(node(`layer ${i}`));

        return root;
    };

    it('draws only the rows in view for thousands of nodes', () => {
        const root = big(5000);
        const tree = new LayerTree({ adapter: plainAdapter(root), root, height: 300, atlas, ticker: null });

        expect(tree.rows).toHaveLength(5000);
        const shown = () => tree.scroll.content.children.filter((c) => c.label === 'FlexContainer' && c.visible);

        expect(shown().length).toBeLessThan(20);
        tree.scroll.scrollTo(28 * 2500, false);
        expect(shown().length).toBeLessThan(20);
        expect(tree.scroll.contentHeight).toBe(5000 * 28 + 4);
    });

    it('selects with clicks, ranges with Shift and moves with the arrow keys', () => {
        const s = sample();
        const selection = new Selection<Node>();
        const tree = new LayerTree({ adapter: plainAdapter(s.root), root: s.root, selection, atlas, ticker: null });

        tree.emit('pointerdown', pointer(120, 14));
        tree.emit('pointerup', pointer(120, 14));
        expect(selection.items).toEqual([s.groupA]);
        tree.emit('pointerdown', pointer(120, 3 * 28 + 14, { shiftKey: true }));
        tree.emit('pointerup', pointer(120, 3 * 28 + 14));
        expect(selection.items).toEqual([s.groupA, s.a1, s.a2, s.b]);
        expect(selection.primary).toBe(s.b);
        tree.handleKey('ArrowDown');
        expect(selection.items).toEqual([s.groupC]);
        // groupC starts open: Right goes to its first child, then opens it
        tree.handleKey('ArrowRight');
        expect(selection.primary).toBe(s.c1);
        tree.handleKey('ArrowRight');
        expect(tree.isExpanded(s.c1)).toBe(true);
        tree.handleKey('ArrowLeft');
        expect(tree.isExpanded(s.c1)).toBe(false);
        tree.handleKey('ArrowLeft');
        expect(selection.primary).toBe(s.groupC);
    });

    it('opens the groups of a node picked on the canvas', () => {
        const s = sample();
        const selection = new Selection<Node>();
        const tree = new LayerTree({ adapter: plainAdapter(s.root), root: s.root, selection, atlas, ticker: null });

        selection.pick(s.deep);
        expect(tree.isExpanded(s.groupC)).toBe(true);
        expect(tree.isExpanded(s.c1)).toBe(true);
        expect(names(tree.rows)).toContain('deep');
    });

    it('drags rows into a group as one undo step', () => {
        const s = sample();
        const history = new History();
        const selection = new Selection<Node>();
        const tree = new LayerTree({
            adapter: plainAdapter(s.root),
            root: s.root,
            selection,
            history,
            atlas,
            ticker: null,
        });
        // rows: groupA, a1, a2, b, groupC
        const yB = 3 * 28 + 14;

        tree.emit('pointerdown', pointer(120, yB));
        tree.dragTo(120, yB + 10);
        tree.dragTo(120, 4 * 28 + 14);
        expect(tree.state.dragging.value).toBe(true);
        tree.release();
        expect(s.groupC.children).toContain(s.b);
        expect(s.root.children).not.toContain(s.b);
        expect(history.past).toHaveLength(1);
        history.undo();
        expect(s.root.children.map((n) => n.name)).toEqual(['groupA', 'b', 'groupC']);
    });

    it('toggles visibility from the eye and records it', () => {
        const s = sample();
        const history = new History();
        const tree = new LayerTree({
            adapter: plainAdapter(s.root),
            root: s.root,
            history,
            atlas,
            ticker: null,
            width: 240,
        });
        // the eye sits second from the right: 240 - 12 padding - 22 lock - 11
        const x = 240 - 12 - 22 - 11;

        tree.emit('pointermove', pointer(x, 3 * 28 + 14));
        tree.emit('pointerdown', pointer(x, 3 * 28 + 14));
        expect(s.b.hidden).toBe(true);
        history.undo();
        expect(s.b.hidden).toBe(false);
    });
});

// ------------------------------------------------------------------------------------ inspector

describe('inspector binding', () => {
    it('reads and writes dot paths', () => {
        const o = { position: { x: 1, y: 2 }, alpha: 1 };

        expect(getPath(o, 'position.x')).toBe(1);
        setPath(o, 'position.y', 5);
        expect(o.position.y).toBe(5);
        setPath(o, 'missing.deep', 1);
        expect(o).not.toHaveProperty('missing');
    });

    it('folds a multi-selection into one value or mixed', () => {
        expect(fieldValue([1, 1, 1])).toEqual({ value: 1, mixed: false, empty: false });
        expect(fieldValue([1, 2]).mixed).toBe(true);
        expect(fieldValue([]).empty).toBe(true);
        expect(fieldValue([0.1 + 0.2, 0.3]).mixed).toBe(false);
    });

    it('edits signals and follows their changes', () => {
        const grid = signal(8);
        const binding = bindSignals({ grid });
        let calls = 0;
        const stop = binding.subscribe?.(() => calls++);

        expect(binding.read('grid')).toEqual([8]);
        binding.write('grid', [16]);
        expect(grid.value).toBe(16);
        expect(calls).toBe(1);
        stop?.();
    });
});

describe('Inspector', () => {
    const make = (targets: object[], history = new History()) => {
        const inspector = new Inspector({
            schema: [
                { type: 'vector', keys: ['x', 'y'], label: 'Position' },
                { type: 'vector', keys: ['w', 'h'], label: 'Size', labels: ['W', 'H'], lockAspect: true },
                { type: 'number', key: 'alpha', label: 'Opacity', min: 0, max: 1, step: 0.01 },
                {
                    type: 'section',
                    label: 'Layer',
                    fields: [
                        { type: 'toggle', key: 'visible', label: 'Visible' },
                        {
                            type: 'choice',
                            key: 'blend',
                            label: 'Blend',
                            options: [
                                { value: 'normal', label: 'Normal' },
                                { value: 'add', label: 'Add' },
                            ],
                        },
                    ],
                },
            ],
            binding: targets,
            history,
            atlas,
            ticker: null,
        });

        inspector.setStyle({ ...inspector.layoutStyle, width: 260 }).updateLayout();

        return { inspector, history };
    };

    it('shows shared values, and Mixed where the selection differs', () => {
        const a = { x: 10, y: 20, w: 100, h: 50, alpha: 1, visible: true, blend: 'normal' };
        const b = { x: 10, y: 99, w: 100, h: 50, alpha: 0.5, visible: false, blend: 'normal' };
        const { inspector } = make([a, b]);
        const position = inspector.field('x') as VectorField;
        const alpha = inspector.field('alpha') as NumberField;
        const visible = inspector.field('visible') as ToggleField;

        expect(position.axes[0].mixed).toBe(false);
        expect(position.axes[1].mixed).toBe(true);
        expect(alpha.mixed).toBe(true);
        expect(visible).toBeInstanceOf(ToggleField);
        expect(visible.value).toBe(false);
    });

    it('scrubs mixed values together and makes the whole drag one undo step', () => {
        const a = { x: 10, y: 0, w: 1, h: 1, alpha: 1, visible: true, blend: 'normal' };
        const b = { x: 50, y: 0, w: 1, h: 1, alpha: 1, visible: true, blend: 'normal' };
        const { inspector, history } = make([a, b]);
        const x = (inspector.field('x') as VectorField).axes[0];

        x.beginScrub();
        for (let dx = 1; dx <= 20; dx++) x.scrubTo(dx);
        x.endScrub();
        expect(a.x).toBe(30);
        expect(b.x).toBe(70);
        expect(history.past).toHaveLength(1);
        expect(history.past[0].label).toBe('Change Position');
        history.undo();
        expect([a.x, b.x]).toEqual([10, 50]);
        history.redo();
        expect([a.x, b.x]).toEqual([30, 70]);
    });

    it('keeps the aspect ratio with the lock on', () => {
        const a = { x: 0, y: 0, w: 200, h: 100, alpha: 1, visible: true, blend: 'normal' };
        const { inspector, history } = make([a]);
        const size = inspector.field('w') as VectorField;

        size.setLocked(true);
        size.axes[0].commitText('300');
        expect(a.w).toBe(300);
        expect(a.h).toBe(150);
        expect(history.past).toHaveLength(1);
        history.undo();
        expect([a.w, a.h]).toEqual([200, 100]);
    });

    it('clamps typed numbers and ignores text that is not one', () => {
        const a = { x: 0, y: 0, w: 1, h: 1, alpha: 1, visible: true, blend: 'normal' };
        const { inspector, history } = make([a]);
        const alpha = inspector.field('alpha') as NumberField;

        alpha.commitText('3');
        expect(a.alpha).toBe(1);
        alpha.commitText('0.256');
        expect(a.alpha).toBe(0.26);
        expect(alpha.commitText('abc')).toBe(false);
        expect(history.past).toHaveLength(1);
    });

    it('turns a mixed toggle on for everything in one step', () => {
        const a = { visible: true };
        const b = { visible: false };
        const { inspector, history } = make([a, b]);
        const visible = inspector.field('visible') as ToggleField;

        visible.toggle();
        expect([a.visible, b.visible]).toEqual([true, true]);
        history.undo();
        expect([a.visible, b.visible]).toEqual([true, false]);
    });

    it('dims the rows while nothing is bound', () => {
        const { inspector } = make([]);
        const alpha = inspector.field('alpha') as NumberField;

        expect(alpha.eventMode).toBe('none');
        inspector.bind([{ alpha: 0.5 }]);
        expect(alpha.eventMode).toBe('static');
        expect(alpha.values).toEqual([0.5]);
    });
});

// ------------------------------------------------------------------------------------ minimap

describe('minimap math', () => {
    it('fits the world centred with padding and maps points both ways', () => {
        const t = minimapFit({ x: 0, y: 0, width: 400, height: 100 }, 200, 120, 10);

        expect(t.scale).toBeCloseTo(0.45);
        expect(worldToMinimap(t, { x: 200, y: 50 })).toEqual({ x: 100, y: 60 });
        const back = minimapToWorld(t, worldToMinimap(t, { x: 37, y: -12 }));

        expect(back.x).toBeCloseTo(37);
        expect(back.y).toBeCloseTo(-12);
        expect(worldRectToMinimap(t, { x: 0, y: 0, width: 400, height: 100 }).width).toBeCloseTo(180);
    });

    it('frames the content and the view together', () => {
        expect(unionRect({ x: 0, y: 0, width: 10, height: 10 }, { x: -5, y: 5, width: 10, height: 20 })).toEqual({
            x: -5,
            y: 0,
            width: 15,
            height: 25,
        });
    });

    it('pans the camera when the view frame is dragged, and jumps on a click', () => {
        const world = new Container();
        const element = fakeElement(800, 600);
        const camera = new Camera({ world, element, ticker: null });
        const thing = new Container();

        // a 2000 by 1000 world, the view at 100% shows the top left 800 by 600
        thing.boundsArea = { x: 0, y: 0, width: 2000, height: 1000, contains: () => false } as never;
        world.addChild(thing);
        const map = new Minimap({ camera, width: 200, height: 120, ticker: null, padding: 0 });

        map.tick(1 / 60);
        const t = map.transform;
        const centre = worldToMinimap(t, { x: 400, y: 300 });

        map.emit('pointerdown', pointer(centre.x, centre.y));
        map.dragTo({ x: centre.x + 10 * t.scale * 10, y: centre.y });
        expect(camera.view.x).toBeCloseTo(100);
        map.emit('pointerup', pointer(0, 0));
        map.jumpTo(worldToMinimap(map.transform, { x: 1500, y: 500 }), false);
        expect(camera.view.x + camera.view.width / 2).toBeCloseTo(1500);
        expect(camera.view.y + camera.view.height / 2).toBeCloseTo(500);
        camera.destroy();
        map.destroy();
    });
});

// ------------------------------------------------------------------------------------ panel

describe('panel docking', () => {
    const vp = { width: 1000, height: 700 };

    it('spans the height on the left and right, and sits in corners at its own size', () => {
        expect(dockRect('left', vp, { width: 240, height: 300 }, 8)).toEqual({ x: 8, y: 8, width: 240, height: 684 });
        expect(dockRect('right', vp, { width: 240, height: 300 }, 8, { top: 40 })).toEqual({
            x: 752,
            y: 48,
            width: 240,
            height: 644,
        });
        expect(dockRect('bottom-right', vp, { width: 200, height: 120 }, 8, { right: 250 })).toEqual({
            x: 542,
            y: 572,
            width: 200,
            height: 120,
        });
        expect(dockRect('bottom', vp, { width: 200, height: 120 }, 0)).toEqual({
            x: 0,
            y: 580,
            width: 1000,
            height: 120,
        });
    });

    it('finds the edge or corner a drag points at', () => {
        expect(dockAt({ x: 5, y: 300 }, vp)).toBe('left');
        expect(dockAt({ x: 995, y: 690 }, vp)).toBe('bottom-right');
        expect(dockAt({ x: 500, y: 10 }, vp)).toBe('top');
        expect(dockAt({ x: 500, y: 300 }, vp)).toBeNull();
    });
});

describe('Panel', () => {
    const make = (options: ConstructorParameters<typeof Panel>[0] = {}) =>
        new Panel({ title: 'Layers', atlas, ticker: null, viewport: { width: 1000, height: 700 }, ...options });

    it('docks where a title bar drag ends near an edge', () => {
        const panel = make({ x: 300, y: 200, width: 240, height: 300 });

        panel.emit('pointerdown', pointer(400, 210, { target: panel }));
        panel.dragBy(-300, 0, { x: 4, y: 210 });
        expect(panel.position.x).toBe(0);
        panel.release();
        expect(panel.state.dock.value).toBe('left');
        settle(panel);
        expect(panel.shownRect).toEqual({ x: 8, y: 8, width: 240, height: 684 });
    });

    it('tears off a docked panel at its floating size', () => {
        const panel = make({ dock: 'right', width: 240, height: 300 });

        settle(panel);
        expect(panel.shownRect.height).toBe(684);
        panel.emit('pointerdown', pointer(800, 20, { target: panel }));
        panel.dragBy(-200, 100, { x: 600, y: 120 });
        panel.release();
        settle(panel);
        expect(panel.docked).toBe(false);
        expect(panel.shownRect.height).toBe(300);
    });

    it('folds to its title bar on a spring', () => {
        const panel = make({ width: 240, height: 300 });

        panel.collapse();
        panel.tick(1 / 60);
        expect(panel.shownRect.height).toBeLessThan(300);
        expect(panel.shownRect.height).toBeGreaterThan(34);
        settle(panel);
        expect(panel.shownRect.height).toBe(34);
        panel.expand();
        settle(panel);
        expect(panel.shownRect.height).toBe(300);
    });

    it('resizes from an edge within its limits', () => {
        const panel = make({ x: 100, y: 100, width: 240, height: 300, minWidth: 180 });

        panel.emit('pointerdown', pointer(100 + 240, 250, { target: panel }));
        panel.dragBy(-200, 0);
        panel.release();
        expect(panel.shownRect.width).toBe(180);
        expect(panel.shownRect.x).toBe(100);
    });

    it('scrolls content taller than its body', () => {
        const panel = make({ width: 240, height: 200 });
        const tall = new Container();

        tall.boundsArea = { x: 0, y: 0, width: 200, height: 900, contains: () => false } as never;
        panel.content.add(tall, { height: 900 });
        panel.content.updateLayout();
        expect(panel.scroll?.maxScroll).toBeGreaterThan(600);
    });
});

describe('ScrollView', () => {
    it('glides to wheel targets and springs back from a stretch', () => {
        const view = new ScrollView({ width: 200, height: 100, contentHeight: 400, ticker: null });

        view.scrollBy(120);
        settle(view);
        expect(view.scrollY).toBe(120);
        view.scrollTo(9999);
        settle(view);
        expect(view.scrollY).toBe(300);
        view.emit('pointerdown', pointer(50, 50, { pointerType: 'touch' }));
        view.dragBy(-200);
        expect(view.scrollY).toBeGreaterThan(300);
        expect(view.scrollY).toBeLessThan(400);
        view.release();
        settle(view);
        expect(view.scrollY).toBeCloseTo(300, 0);
    });
});
