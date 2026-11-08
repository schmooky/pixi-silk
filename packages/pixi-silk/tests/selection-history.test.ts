import { Container } from 'pixi.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { bindHistoryKeys, type Command, History, recordGizmo, recordSignals } from '../src/history';
import { bindGizmo, bindMeasure, bindOutline, Selection } from '../src/selection';
import { signal } from '../src/signal';
import { TransformGizmo } from '../src/ui/gizmo';
import { SelectionOutline } from '../src/ui/outline';

beforeAll(() => {
    (globalThis as Record<string, unknown>).window ??= new EventTarget();
});

const flush = () => new Promise<void>((r) => queueMicrotask(r));

describe('Selection', () => {
    it('keeps the order things were picked in and tracks the primary item', () => {
        const s = new Selection<string>();

        s.add('a', 'b');
        expect(s.items).toEqual(['a', 'b']);
        expect(s.primary).toBe('b');
        s.add('a');
        // picking again moves it to the end and makes it primary
        expect(s.items).toEqual(['b', 'a']);
        expect(s.primary).toBe('a');
        s.remove('a');
        expect(s.items).toEqual(['b']);
        expect(s.primary).toBe('b');
    });

    it('toggles, replaces, clears and picks like clicks', () => {
        const s = new Selection<number>();

        s.pick(1).pick(2, 'add').pick(3, 'toggle');
        expect(s.items).toEqual([1, 2, 3]);
        s.toggle(2);
        expect(s.items).toEqual([1, 3]);
        s.replace([7, 7, 8]);
        expect(s.items).toEqual([7, 8]);
        s.pick(null);
        expect(s.size).toBe(0);
        expect(s.primary).toBeNull();
    });

    it('selects by predicate, honours the filter and single mode', () => {
        const s = new Selection<number>({ filter: (n) => n !== 4 });

        s.selectWhere([1, 2, 3, 4, 5, 6], (n) => n % 2 === 0);
        expect(s.items).toEqual([2, 6]);
        s.selectWhere([1, 3], () => true, 'add');
        expect(s.items).toEqual([2, 6, 1, 3]);
        const one = new Selection<number>({ multiple: false });

        one.add(1, 2, 3);
        expect(one.items).toEqual([3]);
    });

    it('reports what joined and what left, once per change', () => {
        const s = new Selection<string>({ items: ['a'] });
        const log: string[] = [];

        s.onChange((c) => log.push(`+${c.added.join('')} -${c.removed.join('')} ${c.primary}`));
        s.replace(['a', 'b']);
        s.replace(['a', 'b']);
        s.focus('a');
        s.clear();
        expect(log).toEqual(['+b - b', '+ - a', '+ -ab null']);
    });

    it('drives an outline, a gizmo and a measure with one call each', () => {
        const root = new Container();
        const a = new Container();
        const b = new Container();

        root.addChild(a, b);
        const s = new Selection<Container>();
        const outline = new SelectionOutline({ ticker: null });
        const hover = new SelectionOutline({ ticker: null });
        const gizmo = new TransformGizmo({ ticker: null, readout: false });
        const measured: unknown[] = [];

        bindOutline(s, outline, hover);
        bindGizmo(s, gizmo);
        bindMeasure(s, { size: (t) => measured.push(['size', t]), between: (x, y) => measured.push([x, y]) });
        s.pick(a);
        expect(outline.state.targets.value).toEqual([a]);
        expect(gizmo.target).toBe(a);
        s.state.hovered.set(b);
        expect(hover.state.targets.value).toEqual([b]);
        expect(measured.at(-1)).toEqual([a, b]);
        s.pick(b, 'add');
        expect(gizmo.target).toBe(b);
        expect(outline.state.targets.value).toEqual([a, b]);
        // a selected item under the pointer gets no hover outline
        expect(hover.state.targets.value).toEqual([]);
        s.clear();
        expect(gizmo.target).toBeNull();
    });
});

/** A command that pushes to a log, for checking what runs when. */
const counter = () => {
    const state = { value: 0 };
    const add = (n: number, label = `+${n}`): Command => ({
        label,
        do: () => {
            state.value += n;
        },
        undo: () => {
            state.value -= n;
        },
    });

    return { state, add };
};

describe('History', () => {
    it('undoes and redoes steps and exposes signals for buttons', () => {
        const h = new History();
        const { state, add } = counter();

        expect(h.state.canUndo.value).toBe(false);
        h.execute(add(1)).execute(add(2));
        expect(state.value).toBe(3);
        expect(h.state.undoLabel.value).toBe('+2');
        h.undo();
        expect(state.value).toBe(1);
        expect(h.state.canRedo.value).toBe(true);
        expect(h.state.redoLabel.value).toBe('+2');
        h.redo();
        expect(state.value).toBe(3);
        expect(h.redo()).toBe(false);
    });

    it('drops the redo steps when something new is recorded', () => {
        const h = new History();
        const { state, add } = counter();

        h.execute(add(1)).execute(add(2));
        h.undo();
        h.execute(add(10));
        expect(state.value).toBe(11);
        expect(h.state.canRedo.value).toBe(false);
        h.undo();
        h.undo();
        expect(state.value).toBe(0);
    });

    it('turns a transaction into one step, nested ones included', () => {
        const h = new History();
        const { state, add } = counter();

        h.begin('Drag');
        h.execute(add(1));
        h.begin();
        h.execute(add(2));
        h.end();
        h.execute(add(3));
        h.end();
        expect(h.past).toHaveLength(1);
        expect(h.state.undoLabel.value).toBe('Drag');
        h.undo();
        expect(state.value).toBe(0);
        h.redo();
        expect(state.value).toBe(6);
    });

    it('reverts a failed transaction and drops empty ones', () => {
        const h = new History();
        const { state, add } = counter();

        expect(() =>
            h.transaction('Broken', () => {
                h.execute(add(5));
                throw new Error('no');
            }),
        ).toThrow('no');
        expect(state.value).toBe(0);
        h.transaction('Empty', () => {});
        expect(h.past).toHaveLength(0);
    });

    it('merges commands that ask for it until something seals the step', () => {
        const h = new History();
        let text = '';
        const type = (ch: string): Command => {
            const cmd = {
                label: 'Typing',
                chars: ch,
                do: () => {
                    text += ch;
                },
                undo: () => {
                    text = text.slice(0, -cmd.chars.length);
                },
                merge: (next: Command) => {
                    cmd.chars += (next as typeof cmd).chars;

                    return true;
                },
            };

            return cmd;
        };

        h.execute(type('a')).execute(type('b'));
        h.seal();
        h.execute(type('c'));
        expect(h.past).toHaveLength(2);
        h.undo();
        expect(text).toBe('ab');
        h.undo();
        expect(text).toBe('');
    });

    it('keeps at most maxDepth steps', () => {
        const h = new History({ maxDepth: 3 });
        const { state, add } = counter();

        for (let i = 1; i <= 5; i++) h.execute(add(i));
        expect(h.past.map((s) => s.label)).toEqual(['+3', '+4', '+5']);
        while (h.undo());
        expect(state.value).toBe(3);
    });
});

describe('recordSignals', () => {
    it('makes signal changes undoable, one step per synchronous run', async () => {
        const h = new History();
        const doc = { x: signal(0), name: signal('a') };

        recordSignals(h, doc);
        doc.x.value = 10;
        doc.name.value = 'b';
        await flush();
        doc.x.value = 20;
        expect(h.past).toHaveLength(2);
        h.undo();
        expect(doc.x.value).toBe(10);
        h.undo();
        expect(doc.x.value).toBe(0);
        expect(doc.name.value).toBe('a');
        h.redo();
        expect(doc.x.value).toBe(10);
        expect(doc.name.value).toBe('b');
        // undo itself is never recorded
        expect(h.past).toHaveLength(1);
    });

    it('merges a whole drag inside a transaction', async () => {
        const h = new History();
        const x = signal(0);

        recordSignals(h, [x]);
        h.begin('Drag');
        for (let i = 1; i <= 5; i++) {
            x.value = i * 10;
            await flush();
        }
        h.end();
        expect(h.past).toHaveLength(1);
        expect(h.past[0].commands).toHaveLength(1);
        h.undo();
        expect(x.value).toBe(0);
        h.redo();
        expect(x.value).toBe(50);
    });

    it('stores every signal in snapshot mode and can stay quiet', async () => {
        const h = new History();
        const a = signal(1);
        const b = signal(2);
        const rec = recordSignals(h, [a, b], { mode: 'snapshot' });

        rec.silently(() => b.set(5));
        expect(h.past).toHaveLength(0);
        a.value = 3;
        await flush();
        b.set(9);
        rec.silently(() => b.set(0));
        h.undo();
        h.undo();
        expect([a.value, b.value]).toEqual([1, 5]);
        rec.stop();
        a.value = 100;
        expect(h.past).toHaveLength(0);
    });
});

describe('history helpers', () => {
    it('records one step per gizmo drag', () => {
        const root = new Container();
        const target = new Container();

        root.addChild(target);
        const gizmo = new TransformGizmo({ ticker: null, readout: false });
        const h = new History();

        root.addChild(gizmo);
        gizmo.attach(target);
        recordGizmo(gizmo, h);
        const state = gizmo.state as unknown as {
            dragging: { set(v: boolean): void };
            active: { set(v: string | null): void };
        };

        // what a drag does to the gizmo's signals, with many moves in between
        state.active.set('move-free');
        state.dragging.set(true);
        for (let i = 1; i <= 10; i++) target.position.set(i * 5, i * 2);
        state.active.set(null);
        state.dragging.set(false);
        expect(h.past).toHaveLength(1);
        expect(h.state.undoLabel.value).toBe('Move');
        h.undo();
        expect([target.x, target.y]).toEqual([0, 0]);
        h.redo();
        expect([target.x, target.y]).toEqual([50, 20]);
        // a click without movement records nothing
        state.dragging.set(true);
        state.dragging.set(false);
        expect(h.past).toHaveLength(1);
    });

    it('binds cmd + Z, shift + cmd + Z and ctrl + Y, and leaves text fields alone', () => {
        const target = new EventTarget();
        const calls: string[] = [];
        const off = bindHistoryKeys({ undo: () => calls.push('undo'), redo: () => calls.push('redo') }, { target });
        const key = (props: Record<string, unknown>) => {
            const e = new Event('keydown', { cancelable: true });

            for (const [k, v] of Object.entries({
                metaKey: false,
                ctrlKey: false,
                shiftKey: false,
                altKey: false,
                ...props,
            }))
                Object.defineProperty(e, k, { value: v });
            target.dispatchEvent(e);
        };

        key({ key: 'z', metaKey: true });
        key({ key: 'Z', metaKey: true, shiftKey: true });
        key({ key: 'y', ctrlKey: true });
        key({ key: 'z' });
        key({ key: 'z', ctrlKey: true, target: { tagName: 'input' } });
        expect(calls).toEqual(['undo', 'redo', 'redo']);
        off();
        key({ key: 'z', metaKey: true });
        expect(calls).toHaveLength(3);
    });
});
