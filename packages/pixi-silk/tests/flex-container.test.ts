import { Container, Graphics } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { FlexContainer, type FlexContainerOptions, fitScale } from '../src/ui/layout';

const block = (w: number, h: number): Graphics => new Graphics().rect(0, 0, w, h).fill(0xffffff);
const at = (c: Container): number[] => [c.x, c.y].map((v) => +v.toFixed(2));
const flex = (options: FlexContainerOptions = {}): FlexContainer => new FlexContainer({ ticker: null, ...options });

describe('FlexContainer', () => {
    it('places children by their bounds', () => {
        const root = flex({ layout: { gap: 10, padding: 20, alignItems: 'start' } }).resize(400, 200);
        const a = root.add(block(100, 40));
        const b = root.add(block(60, 30));

        root.updateLayout();
        expect([at(a), at(b)]).toEqual([
            [20, 20],
            [130, 20],
        ]);
        expect(root.slotOf(b)).toEqual({ x: 130, y: 20, width: 60, height: 30 });
    });

    it('lays out on the next tick after a change, and is idle afterwards', () => {
        const root = flex({ layout: { direction: 'column' } }).resize(100, 300);
        const a = root.add(block(50, 50));

        expect(root.tick(1 / 60)).toBe(false);
        root.addChildAt(block(50, 20), 0);
        root.tick(1 / 60);
        expect(at(a)).toEqual([25, 20]);
    });

    it('keeps a pivoted child box on its slot', () => {
        const root = flex({ layout: { alignItems: 'start' } }).resize(400, 200);
        const a = block(100, 40);

        a.pivot.set(50, 20);
        root.add(a, { marginLeft: 30 });
        root.updateLayout();
        expect(at(a)).toEqual([80, 20]);
    });

    it('scales a child into its slot with each fit mode', () => {
        const fitted = (mode: 'contain' | 'cover' | 'scale-down' | 'fill') => {
            const root = flex().resize(200, 200);
            const c = root.add(block(100, 50), { width: 200, height: 200, fit: mode });

            root.updateLayout();
            return [c.scale.x, c.scale.y, ...at(c)];
        };

        expect(fitted('contain')).toEqual([2, 2, 0, 50]);
        expect(fitted('cover')).toEqual([4, 4, -100, 0]);
        expect(fitted('scale-down')).toEqual([1, 1, 50, 75]);
        expect(fitted('fill')).toEqual([2, 4, 0, 0]);
        expect(fitScale('none', 10, 10, 50, 50)).toEqual([1, 1]);
    });

    it('aligns a fitted child with fitAlign', () => {
        const root = flex().resize(200, 200);
        const c = root.add(block(100, 50), { width: 200, height: 200, fit: 'contain', fitAlign: [0, 1] });

        root.updateLayout();
        expect(at(c)).toEqual([0, 100]);
    });

    it('shrinks text to fit down to a minimum scale', () => {
        const root = flex({ layout: { alignItems: 'start' } }).resize(400, 100);
        const fits = root.add(block(300, 20), { width: 200, fit: 'scale-down', minScale: 0.5, fitAlign: [0, 0] });
        const floor = root.add(block(300, 20), { width: 100, fit: 'scale-down', minScale: 0.5, fitAlign: [0, 0] });

        root.updateLayout();
        expect(+fits.scale.x.toFixed(3)).toBe(0.667);
        expect(floor.scale.x).toBe(0.5);
    });

    it('switches styles between portrait and landscape and under a width', () => {
        const root = flex({
            layout: {
                landscape: { direction: 'row' },
                portrait: { direction: 'column' },
                media: [{ maxWidth: 300, style: { gap: 5 } }],
                alignItems: 'start',
                gap: 10,
            },
        });
        const a = root.add(block(50, 50));
        const b = root.add(block(50, 50), { portrait: { display: 'none' } });
        const c = root.add(block(50, 50));

        root.resize(800, 400).updateLayout();
        expect(root.orientation).toBe('landscape');
        expect([at(a), at(b), at(c)]).toEqual([
            [0, 0],
            [60, 0],
            [120, 0],
        ]);
        root.resize(250, 800).updateLayout();
        expect(b.visible).toBe(false);
        expect(at(c)).toEqual([0, 55]);
        root.resize(800, 400).updateLayout();
        expect(b.visible).toBe(true);
    });

    it('glides children to new slots on springs, then sleeps', () => {
        const root = flex({ transition: true, layout: { alignItems: 'start' } }).resize(400, 100);
        const a = root.add(block(50, 50));
        const b = root.add(block(50, 50));

        root.updateLayout();
        expect(at(b)).toEqual([50, 0]);
        root.setLayout(a, { width: 150 });
        root.updateLayout();
        expect(at(b)).toEqual([50, 0]);
        root.tick(1 / 60);
        expect(b.x).toBeGreaterThan(50);
        expect(b.x).toBeLessThan(150);
        let frames = 0;

        while (root.tick(1 / 60) && frames < 600) frames++;
        expect(at(b)).toEqual([150, 0]);
        expect(frames).toBeLessThan(600);
        expect(root.tick(1 / 60)).toBe(false);
    });

    it('nests a SmartContainer as a flex container of its parent', () => {
        const root = flex({ layout: { direction: 'column', padding: 10, gap: 10 } }).resize(300, 300);
        const header = root.add(block(50, 40), { alignSelf: 'start' });
        const row = root.add(new FlexContainer({ ticker: null, layout: { gap: 10, alignItems: 'start' } }), {
            grow: 1,
        });
        const x = row.add(block(40, 40));
        const y = row.add(block(40, 40), { grow: 1, fit: 'fill' });

        root.updateLayout();
        expect(at(header)).toEqual([10, 10]);
        expect(at(row)).toEqual([10, 60]);
        expect(at(x)).toEqual([0, 0]);
        expect(at(y)).toEqual([50, 0]);
        expect(y.scale.x).toBe(230 / 40);
        // a change inside the nested container lays out the whole tree
        row.setLayout(x, { width: 100 });
        root.tick(1 / 60);
        expect(at(y)).toEqual([110, 0]);
    });

    it('measures again after invalidate, or every frame with watch', () => {
        const root = flex({ layout: { alignItems: 'start' } }).resize(400, 100);
        const a = root.add(block(50, 50));
        const b = root.add(block(50, 50));

        root.updateLayout();
        a.clear().rect(0, 0, 80, 50).fill(0xffffff);
        root.invalidate(a).updateLayout();
        expect(at(b)).toEqual([80, 0]);

        const watched = flex({ watch: true, layout: { alignItems: 'start' } }).resize(400, 100);
        const c = watched.add(block(50, 50));
        const d = watched.add(block(50, 50));

        watched.tick(1 / 60);
        c.clear().rect(0, 0, 70, 50).fill(0xffffff);
        watched.tick(1 / 60);
        expect(at(d)).toEqual([70, 0]);
    });

    it('calls onSize with the slot size and lays out removals', () => {
        const onSize = vi.fn();
        const root = flex({ layout: { padding: 10 } }).resize(300, 200);
        const panel = root.add(new Container(), { position: 'absolute', inset: 0, onSize });
        const a = root.add(block(50, 50));
        const b = root.add(block(50, 50));

        root.updateLayout();
        expect(onSize).toHaveBeenCalledWith(300, 200, panel);
        root.removeChild(a);
        root.updateLayout();
        expect(at(b)).toEqual([10, 75]);
        expect(onSize).toHaveBeenCalledTimes(1);
    });
});
