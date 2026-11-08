import { describe, expect, it, vi } from 'vitest';
import { LayoutNode, type LayoutStyle, type MeasureFunction } from '../src/layout';

/*
 * Every expected box here is what a browser computes for the same CSS (box-sizing: border-box,
 * display: flex, empty divs), worked out by hand from css-flexbox-1 section 9.
 */

const node = (style: LayoutStyle = {}, ...children: LayoutNode[]): LayoutNode => {
    const n = new LayoutNode(style);

    for (const c of children) n.add(c);

    return n;
};
const leaf = (width: number, height: number, baseline?: number): LayoutNode =>
    new LayoutNode({}, () => ({ width, height, baseline }));
const box = (n: LayoutNode): number[] =>
    [n.layout.x, n.layout.y, n.layout.width, n.layout.height].map((v) => +v.toFixed(2));
const boxes = (n: LayoutNode): number[][] => n.children.map(box);

describe('flex basics', () => {
    it('places a fixed item and a growing item with padding and gap', () => {
        const root = node({ padding: 16, gap: 8 }, node({ width: 100 }), node({ grow: 1 })).calculate(400, 120);

        expect(boxes(root)).toEqual([
            [16, 16, 100, 88],
            [124, 16, 260, 88],
        ]);
        expect(box(root)).toEqual([0, 0, 400, 120]);
    });

    it('sizes an auto container to its measured content', () => {
        const root = node({ padding: 5, gap: 4 }, leaf(50, 20), leaf(30, 10)).calculate();

        expect(box(root)).toEqual([0, 0, 94, 30]);
        expect(boxes(root)).toEqual([
            [5, 5, 50, 20],
            [59, 5, 30, 20],
        ]);
    });

    it('resolves a percent root size against the space given', () => {
        expect(box(node({ width: '50%' }).calculate(400, 300))).toEqual([0, 0, 200, 300]);
    });
});

describe('grow and shrink', () => {
    it('freezes an item at its max and gives the rest to the others', () => {
        const root = node({}, node({ grow: 1, maxWidth: 100 }), node({ grow: 1 }), node({ grow: 2 })).calculate(
            500,
            10,
        );

        expect(boxes(root).map((b) => b[2])).toEqual([100, 133.33, 266.67]);
        expect(boxes(root).map((b) => b[0])).toEqual([0, 100, 233.33]);
    });

    it('freezes an item at its min while the others shrink further', () => {
        const root = node(
            {},
            node({ width: 200 }),
            node({ width: 200 }),
            node({ width: 200, minWidth: 180 }),
        ).calculate(300, 10);

        expect(boxes(root).map((b) => b[2])).toEqual([60, 60, 180]);
    });

    it('weights shrinking by the flex basis', () => {
        const root = node({}, node({ width: 100 }), node({ width: 300 })).calculate(300, 10);

        expect(boxes(root).map((b) => b[2])).toEqual([75, 225]);
    });

    it('hands out only part of the space when the grow factors sum below one', () => {
        const root = node({}, node({ grow: 0.25 }), node({ grow: 0.25 })).calculate(400, 10);

        expect(boxes(root).map((b) => b[2])).toEqual([100, 100]);
    });

    it('shrinks from the specified size, not the clamped one', () => {
        // basis 200 (max 100) and 100 in 150: the overflow of 150 splits 2:1 by basis
        const root = node({}, node({ width: 200, maxWidth: 100 }), node({ width: 100 })).calculate(150, 10);

        expect(boxes(root).map((b) => b[2])).toEqual([100, 50]);
    });

    it('does not shrink items with shrink 0', () => {
        const root = node({}, node({ width: 200, shrink: 0 }), node({ width: 200 })).calculate(300, 10);

        expect(boxes(root).map((b) => b[2])).toEqual([200, 100]);
    });

    it('lets a growing item fill a min-width auto container', () => {
        const root = node({ minWidth: 200 }, node({ grow: 1 })).calculate();

        expect(box(root.children[0])).toEqual([0, 0, 200, 0]);
    });

    it('uses an explicit basis over the width', () => {
        const root = node({}, node({ basis: '25%', width: 300 }), node({ grow: 1 })).calculate(400, 10);

        expect(boxes(root).map((b) => b[2])).toEqual([100, 300]);
    });
});

describe('justify and align', () => {
    const three = (justifyContent: LayoutStyle['justifyContent']) =>
        boxes(
            node({ justifyContent }, node({ width: 50 }), node({ width: 50 }), node({ width: 50 })).calculate(400, 10),
        ).map((b) => b[0]);

    it('distributes free space on the main axis', () => {
        expect(three('start')).toEqual([0, 50, 100]);
        expect(three('center')).toEqual([125, 175, 225]);
        expect(three('end')).toEqual([250, 300, 350]);
        expect(three('space-between')).toEqual([0, 175, 350]);
        expect(three('space-around')).toEqual([41.67, 175, 308.33]);
        expect(three('space-evenly')).toEqual([62.5, 175, 287.5]);
    });

    it('centres an overflowing line for space-around', () => {
        const root = node({ justifyContent: 'space-around', width: 100 }, node({ width: 140, shrink: 0 })).calculate();

        expect(box(root.children[0])[0]).toBe(-20);
    });

    it('aligns on the cross axis, and alignSelf overrides alignItems', () => {
        const root = node(
            { alignItems: 'center' },
            node({ width: 10, height: 40 }),
            node({ width: 10, height: 40, alignSelf: 'end' }),
            node({ width: 10, alignSelf: 'stretch' }),
            node({ width: 10, height: 40, alignSelf: 'start' }),
        ).calculate(100, 100);

        expect(boxes(root).map((b) => [b[1], b[3]])).toEqual([
            [30, 40],
            [60, 40],
            [0, 100],
            [0, 40],
        ]);
    });

    it('lines up baselines in a row', () => {
        const root = node({ alignItems: 'baseline' }, leaf(20, 40, 30), leaf(20, 20, 10)).calculate(100);

        expect(boxes(root).map((b) => b[1])).toEqual([0, 20]);
        expect(root.layout.height).toBe(40);
    });

    it('pushes items with auto margins', () => {
        const root = node(
            { direction: 'column' },
            node({ width: 100, height: 10, marginLeft: 'auto' }),
            node({ width: 100, height: 10, margin: [0, 'auto'] }),
            node({ width: 100, height: 10, margin: 10 }),
            node({ width: 100, height: 10, marginTop: 'auto' }),
        ).calculate(300, 200);

        expect(boxes(root)).toEqual([
            [200, 0, 100, 10],
            [100, 10, 100, 10],
            [10, 30, 100, 10],
            [0, 190, 100, 10],
        ]);
    });
});

describe('direction', () => {
    it('reverses a row from the right content edge', () => {
        const root = node(
            { direction: 'row-reverse', padding: [0, 10, 0, 20] },
            node({ width: 50 }),
            node({ width: 60 }),
        ).calculate(300, 10);

        expect(boxes(root).map((b) => b[0])).toEqual([240, 180]);
    });

    it('stacks a column and reverses it', () => {
        const col = node({ direction: 'column', gap: 5 }, node({ height: 20 }), node({ height: 30 })).calculate(
            100,
            100,
        );
        const rev = node({ direction: 'column-reverse', gap: 5 }, node({ height: 20 }), node({ height: 30 })).calculate(
            100,
            100,
        );

        expect(boxes(col)).toEqual([
            [0, 0, 100, 20],
            [0, 25, 100, 30],
        ]);
        expect(boxes(rev).map((b) => b[1])).toEqual([80, 45]);
    });
});

describe('wrap', () => {
    const six = (style: LayoutStyle) =>
        node({ wrap: 'wrap', gap: 10, ...style }, ...Array.from({ length: 6 }, () => node({ width: 70, height: 30 })));

    it('breaks into lines and sizes the container to them', () => {
        const root = six({}).calculate(250);

        expect(root.layout.height).toBe(70);
        expect(boxes(root).map((b) => [b[0], b[1]])).toEqual([
            [0, 0],
            [80, 0],
            [160, 0],
            [0, 40],
            [80, 40],
            [160, 40],
        ]);
    });

    it('stretches lines over a taller container by default', () => {
        expect(box(six({}).calculate(250, 200).children[3])[1]).toBe(105);
    });

    it('distributes lines with alignContent', () => {
        expect(box(six({ alignContent: 'center' }).calculate(250, 200).children[0])[1]).toBe(65);
        expect(box(six({ alignContent: 'space-between' }).calculate(250, 200).children[3])[1]).toBe(170);
        expect(box(six({ alignContent: 'end' }).calculate(250, 200).children[0])[1]).toBe(130);
    });

    it('stacks lines upwards with wrap-reverse', () => {
        const root = node(
            { wrap: 'wrap-reverse' },
            ...Array.from({ length: 4 }, () => node({ width: 50, height: 20 })),
        ).calculate(100);

        expect(boxes(root).map((b) => b[1])).toEqual([20, 20, 0, 0]);
    });

    it('grows items inside their own line', () => {
        const root = node(
            { wrap: 'wrap' },
            node({ width: 60, grow: 1 }),
            node({ width: 60, grow: 1 }),
            node({ width: 60, grow: 1 }),
        ).calculate(150, 20);

        expect(boxes(root).map((b) => b[2])).toEqual([75, 75, 150]);
    });
});

describe('sizes', () => {
    it('resolves percents against the parent content box', () => {
        const root = node({ padding: 20 }, node({ width: '50%', height: '25%' })).calculate(400, 200);

        expect(box(root.children[0])).toEqual([20, 20, 180, 40]);
    });

    it('resolves percent padding against the parent width', () => {
        const root = node({ direction: 'column' }, node({ padding: '10%' })).calculate(400, 300);

        expect(box(root.children[0])).toEqual([0, 0, 400, 80]);
    });

    it('reads two, three and four value edges as CSS does', () => {
        const three = node({ padding: [10, 20, 30] }, node({ grow: 1 })).calculate(200, 100);
        const two = node({ padding: [10, 20] }, node({ grow: 1 })).calculate(200, 100);

        expect(box(three.children[0])).toEqual([20, 10, 160, 60]);
        expect(box(two.children[0])).toEqual([20, 10, 160, 80]);
    });

    it('never makes a box smaller than its padding', () => {
        const root = node({}, node({ width: 10, padding: 20 })).calculate(400, 300);

        expect(root.children[0].layout.width).toBe(40);
    });

    it('derives the missing side from aspectRatio', () => {
        const row = node({}, node({ aspectRatio: 2 })).calculate(300, 100);
        const col = node({ direction: 'column' }, node({ aspectRatio: 3 })).calculate(300, 400);
        const fixed = node({ alignItems: 'start' }, node({ width: 120, aspectRatio: 1.5 })).calculate(300, 300);

        expect(box(row.children[0])).toEqual([0, 0, 200, 100]);
        expect(box(col.children[0])).toEqual([0, 0, 300, 100]);
        expect(box(fixed.children[0])).toEqual([0, 0, 120, 80]);
    });

    it('nests containers', () => {
        const sidebar = node({ width: 80 });
        const main = node({ grow: 1 });
        const body = node({ grow: 1 }, sidebar, main);
        const root = node(
            { direction: 'column', padding: 10, gap: 10, width: 300 },
            node({ height: 40 }),
            body,
            node({ height: 30 }),
        ).calculate(1000, 400);

        expect(boxes(root)).toEqual([
            [10, 10, 280, 40],
            [10, 60, 280, 290],
            [10, 360, 280, 30],
        ]);
        expect(boxes(body)).toEqual([
            [0, 0, 80, 290],
            [80, 0, 200, 290],
        ]);
    });

    it('wraps measured text to the width it is offered', () => {
        // 10 px per character, 20 px per line
        const text: MeasureFunction = (w) => {
            const perLine = Math.max(1, Math.floor(w / 10));
            const lines = Math.ceil(40 / perLine);

            return { width: Math.min(40, perLine) * 10, height: lines * 20 };
        };
        const root = node({ direction: 'column', width: 150 }, new LayoutNode({}, text)).calculate();

        expect(box(root.children[0])).toEqual([0, 0, 150, 60]);
    });

    it('takes display none out of the flow', () => {
        const root = node({}, node({ width: 50 }), node({ width: 50, display: 'none' }), node({ width: 50 })).calculate(
            300,
            10,
        );

        expect(boxes(root)).toEqual([
            [0, 0, 50, 10],
            [0, 0, 0, 0],
            [50, 0, 50, 10],
        ]);
    });
});

describe('absolute', () => {
    it('anchors to the parent box edges, with percents', () => {
        const root = node(
            { padding: 20 },
            node({ position: 'absolute', right: 10, bottom: '10%', width: 100, height: 50 }),
            node({ position: 'absolute', left: 10, right: 10, top: 0, height: 20 }),
            node({ position: 'absolute', inset: 0 }),
            node({ width: 30 }),
        ).calculate(400, 300);

        expect(boxes(root)).toEqual([
            [290, 220, 100, 50],
            [10, 0, 380, 20],
            [0, 0, 400, 300],
            [20, 20, 30, 260],
        ]);
    });

    it('falls back to the parent alignment without anchors', () => {
        const root = node(
            { justifyContent: 'center', alignItems: 'end' },
            node({ position: 'absolute', width: 100, height: 50 }),
        ).calculate(400, 300);

        expect(box(root.children[0])).toEqual([150, 250, 100, 50]);
    });
});

describe('incremental', () => {
    it('measures a leaf once per available size', () => {
        const measure = vi.fn(() => ({ width: 40, height: 10 }));
        const text = new LayoutNode({}, measure);
        const other = node({ width: 50 });
        const root = node({ direction: 'column' }, text, other).calculate(200, 200);
        const calls = measure.mock.calls.length;

        root.calculate(200, 200);
        expect(measure.mock.calls.length).toBe(calls);
        // a sibling change re-lays the column, the text sees the same space
        other.updateStyle({ height: 30 });
        root.calculate(200, 200);
        expect(measure.mock.calls.length).toBe(calls);
        // new content does measure again
        text.markDirty();
        root.calculate(200, 200);
        expect(measure.mock.calls.length).toBeGreaterThan(calls);
    });

    it('marks a changed node and its ancestors dirty, not its siblings', () => {
        const a = node({ width: 10 });
        const b = node({ width: 10 });
        const mid = node({}, a);
        const root = node({}, mid, b).calculate(100, 100);

        expect([root.dirty, mid.dirty, a.dirty, b.dirty]).toEqual([false, false, false, false]);
        a.updateStyle({ width: 20 });
        expect([root.dirty, mid.dirty, a.dirty, b.dirty]).toEqual([true, true, true, false]);
        root.calculate(100, 100);
        expect(box(b)).toEqual([20, 0, 10, 100]);
    });

    it('skips clean subtrees whose space did not change', () => {
        const measure = vi.fn(() => ({ width: 40, height: 10 }));
        const deep = node({ width: 100 }, node({}, new LayoutNode({}, measure)));
        const root = node({}, deep, node({ grow: 1 })).calculate(300, 100);

        measure.mockClear();
        root.children[1].updateStyle({ minWidth: 10 });
        root.calculate(300, 100);
        expect(measure).not.toHaveBeenCalled();
        expect(deep.dirty).toBe(false);
        expect(box(deep)).toEqual([0, 0, 100, 100]);
    });

    it('re-lays a child moved between parents', () => {
        const item = node({ width: 30 });
        const left = node({ width: 100 }, item);
        const right = node({ grow: 1 });
        const root = node({}, left, right).calculate(300, 50);

        right.add(item);
        root.calculate(300, 50);
        expect(left.children.length).toBe(0);
        expect(box(item)).toEqual([0, 0, 30, 50]);
    });
});
