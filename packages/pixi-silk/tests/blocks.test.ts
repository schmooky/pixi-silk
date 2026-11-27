import { Container, EventEmitter, Ticker, UPDATE_PRIORITY } from 'pixi.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Prim, STRIDE } from '../src/constants';
import { enableLowEnd, renderOnDemand, requestFrame } from '../src/frames';
import { SilkGraphics } from '../src/SilkGraphics';
import { silkGlyphs } from '../src/shader-slot';
import { signal } from '../src/signal';
import { SdfAtlas } from '../src/text/atlas';
import { drawText, measureText } from '../src/text/draw';
import {
    Block,
    BlockSurface,
    ButtonBlock,
    CounterBlock,
    group,
    PanelBlock,
    read,
    stack,
    TextBlock,
} from '../src/ui/blocks';
import { paintContext } from './ink-context';

// drawText uses the shared atlas: give it a context that paints in node
const shared = SdfAtlas as unknown as { _shared: SdfAtlas | null };
let before: SdfAtlas | null = null;

beforeAll(() => {
    before = shared._shared;
    shared._shared = new SdfAtlas({ context: paintContext() });
});
afterAll(() => {
    shared._shared = before;
});

/** Instance `i` of `g`, as the shader reads it. */
const inst = (g: SilkGraphics, i: number) => {
    const f = (g as unknown as { _f: Float32Array })._f;

    return f.subarray(i * STRIDE, (i + 1) * STRIDE);
};

/** A ticker that never runs on its own: tests call `update`. */
const manual = () => {
    const t = new Ticker();

    t.autoStart = false;
    t.stop();

    return t;
};

/** Shapes in both layers of a surface. */
const prims = (bar: BlockSurface) => bar.painter.primitiveCount + bar.stillPainter.primitiveCount;

/** Runs a surface's loop for `n` frames of 1/60 s. */
let now = 1000;
const run = (t: Ticker, n = 120) => {
    for (let i = 0; i < n; i++) {
        now += 1000 / 60;
        t.update(now);
    }
};

/** A surface of 800 by 600 that steps on `ticker`. */
const surface = (ticker: Ticker) =>
    new BlockSurface({
        viewport: { width: 800, height: 600 },
        ticker,
        cache: false,
        layout: { direction: 'row', gap: 10, padding: 10 },
        landscapeData: { width: 800, height: 600, viewportWidth: 800, viewportHeight: 600 },
    });

describe('Prim.Glyph', () => {
    it('packs a glyph cell as one closed instance that fills and strokes like any shape', () => {
        const g = new SilkGraphics();

        g.glyph(10, 20, 30, 40, [100, 200, 130, 240], 16, 0.25).fill(0xffffff).stroke({ width: 2, color: 0x000000 });
        expect(g.primitiveCount).toBe(1);
        const f = inst(g, 0);

        expect(f[16]).toBe(Prim.Glyph);
        // centre and half size, the cell in texels, radius and cutoff
        expect([...f.subarray(4, 16)]).toEqual([25, 40, 15, 20, 100, 200, 130, 240, 16, 0.25, 0, 0]);
        // fill and stroke flags in one instance
        expect(f[17] & 3).toBe(3);
    });

    it('takes the drawing transform: scale and rotation', () => {
        const g = new SilkGraphics();

        g.translateTransform(100, 0).scaleTransform(2).rotateTransform(0.5);
        g.glyph(0, 0, 10, 10, [0, 0, 10, 10], 16, 0.25).fill(0xffffff);
        const f = inst(g, 0);

        expect(f[6]).toBeCloseTo(10);
        expect(f[7]).toBeCloseTo(10);
        expect(f[15]).toBeCloseTo(0.5);
    });

    it('hit tests the cell', () => {
        const g = new SilkGraphics();

        g.glyph(0, 0, 20, 30, [0, 0, 20, 30], 16, 0.25).fill(0xffffff);
        expect(g.containsPoint({ x: 10, y: 15 })).toBe(true);
        expect(g.containsPoint({ x: 25, y: 15 })).toBe(false);
    });
});

describe('drawText', () => {
    it('adds one glyph per inked character and points the shader at the atlas', () => {
        const g = new SilkGraphics();

        drawText(g, 'AB C', 0, 0, { fontSize: 24 }).fill(0xffffff);
        expect(g.primitiveCount).toBe(3);
        for (let i = 0; i < 3; i++) expect(inst(g, i)[16]).toBe(Prim.Glyph);
        expect(silkGlyphs.source).toBe(SdfAtlas.shared.source);
        expect(g.shader?.resources.uGlyphs).toBe(SdfAtlas.shared.source);
    });

    it('starts a path of its own, so an empty string paints nothing', () => {
        const g = new SilkGraphics();

        g.circle(0, 0, 10).fill(0xff0000);
        drawText(g, '', 0, 0).fill(0xffffff);
        expect(g.primitiveCount).toBe(1);
    });

    it('anchors the text box and measures the same box', () => {
        const m = measureText('ABCD', { fontSize: 20 });
        const g = new SilkGraphics();

        // half an em per character in the test font
        expect(m.width).toBeCloseTo(40);
        drawText(g, 'ABCD', 100, 50, { fontSize: 20, anchor: [1, 0] }).fill(0xffffff);
        const last = inst(g, 3);

        // the last glyph ends at the right edge of the box, within the atlas padding
        expect(last[4] + last[6]).toBeGreaterThan(95);
        expect(last[4] + last[6]).toBeLessThan(110);
    });
});

describe('blocks', () => {
    class Dot extends Block {
        paints = 0;
        readonly s = this.spring();

        paint(g: SilkGraphics, x: number, y: number): void {
            this.paints++;
            g.circle(x + this.w / 2, y + this.h / 2, 4).fill(0xffffff);
        }

        kick(): void {
            this.s.target = 1;
            this.wake();
        }
    }

    it('reads plain values and signals', () => {
        const s = signal(3);

        expect(read(5)).toBe(5);
        expect(read(s)).toBe(3);
    });

    it('lays blocks out in slots and paints them into the still layer', () => {
        const t = manual();
        const bar = surface(t);
        const a = new Dot({ width: 40, height: 40 });
        const b = new Dot({ width: 60, height: 40 });

        stack(bar, [a, b]);
        run(t, 3);
        expect(a.x).toBe(10);
        expect(b.x).toBe(60);
        expect(bar.stillPainter.primitiveCount).toBe(2);
        expect(bar.painter.primitiveCount).toBe(0);
        expect(a.paints).toBeGreaterThan(0);
    });

    it('sleeps when nothing moves and wakes for a spring until it settles', () => {
        const t = manual();
        const bar = surface(t);
        const a = new Dot({ width: 40, height: 40 });

        stack(bar, [a]);
        run(t, 10);
        expect(bar.stats.awake).toBe(false);
        const n = bar.stats.repaints;

        run(t, 10);
        expect(bar.stats.repaints).toBe(n);
        a.kick();
        expect(bar.stats.awake).toBe(true);
        run(t, 120);
        expect(bar.stats.awake).toBe(false);
        expect(bar.stats.repaints).toBeGreaterThan(n + 2);
        expect(a.s.value).toBeCloseTo(1, 3);
    });

    it('repaints when a watched signal changes', () => {
        const t = manual();
        const bar = surface(t);
        const text = signal('ONE');
        const label = new TextBlock({ text, width: 100, height: 30 });

        stack(bar, [label]);
        run(t, 5);
        const n = bar.stats.repaints;

        text.value = 'TWO';
        run(t, 2);
        expect(bar.stats.repaints).toBeGreaterThan(n);
        // the label changed: it moved to the live layer
        expect(bar.painter.primitiveCount).toBe(3);
        expect(prims(bar)).toBe(3);
    });

    it('counts a rise and jumps on a drop', () => {
        const t = manual();
        const bar = surface(t);
        const coins = signal(0);
        const c = new CounterBlock({ value: coins, seconds: 0.5, width: 100, height: 30 });

        stack(bar, [c]);
        run(t, 5);
        coins.value = 100;
        run(t, 6);
        expect(c.shown).toBeGreaterThan(0);
        expect(c.shown).toBeLessThan(100);
        run(t, 60);
        expect(c.shown).toBe(100);
        coins.value = 40;
        expect(c.shown).toBe(40);
    });

    it('presses a button on release inside, and not while disabled', () => {
        const t = manual();
        const bar = surface(t);
        const enabled = signal(true);
        const onPress = vi.fn();
        const btn = new ButtonBlock({ width: 80, height: 80, shape: 'circle', label: 'GO', enabled, onPress });

        stack(bar, [btn]);
        run(t, 3);
        btn.emit('pointerdown', {} as never);
        btn.emit('pointerup', {} as never);
        expect(onPress).toHaveBeenCalledTimes(1);
        enabled.value = false;
        btn.emit('pointerdown', {} as never);
        btn.emit('pointerup', {} as never);
        expect(onPress).toHaveBeenCalledTimes(1);
        // the slot's circle is the hit area
        expect(btn.hitArea?.contains(40, 40)).toBe(true);
        expect(btn.hitArea?.contains(2, 2)).toBe(false);
    });

    it('stretches an absolute panel between its edges and nests groups', () => {
        const t = manual();
        const bar = surface(t);
        const panel = new PanelBlock();
        const inner = new Dot({ width: 20, height: 20 });
        const box = group([[new PanelBlock(), { position: 'absolute', inset: 0 }], inner], {
            padding: 8,
            width: 100,
            height: 60,
        });

        bar.add(panel, panel.layout({ position: 'absolute', inset: 0 }));
        stack(bar, [box]);
        run(t, 3);
        expect(panel.w).toBe(800);
        expect(panel.h).toBe(600);
        expect(inner.x).toBe(8);
        expect(box).toBeInstanceOf(Container);
    });

    it('moves an animating block to the live layer and leaves the still layer alone while it moves', () => {
        const t = manual();
        const bar = surface(t);
        const plate = new PanelBlock();
        const a = new Dot({ width: 40, height: 40 });
        const keep = new Dot({ width: 40, height: 40, layer: 'still' });

        bar.add(plate, plate.layout({ position: 'absolute', inset: 0 }));
        stack(bar, [a, keep]);
        run(t, 5);
        expect(bar.stats.liveBlocks).toBe(0);
        const still = bar.stats.stillPaints;

        a.kick();
        run(t, 2);
        // one repaint of the still layer, to take the block out of it
        expect(bar.stats.stillPaints).toBe(still + 1);
        expect(bar.stats.liveBlocks).toBe(1);
        expect(bar.painter.primitiveCount).toBe(1);
        run(t, 30);
        expect(bar.stats.stillPaints).toBe(still + 1);
        // a 'still' block repaints its layer and stays in it
        keep.kick();
        run(t, 120);
        expect(bar.stats.liveBlocks).toBe(1);
        expect(bar.stats.stillPaints).toBeGreaterThan(still + 1);
        expect(bar.stats.awake).toBe(false);
    });

    it('takes the blocks drawn over a live block into the live layer, and leaves the others', () => {
        const t = manual();
        const bar = surface(t);
        const under = new Dot({ width: 100, height: 40 });
        const over = new Dot({ width: 40, height: 40 });
        const apart = new Dot({ width: 40, height: 40 });
        const box = group([[under, { position: 'absolute', left: 0, top: 0 }], over], { width: 100, height: 40 });

        stack(bar, [box, apart]);
        run(t, 3);
        under.kick();
        run(t, 2);
        expect(under._live).toBe(true);
        expect(over._live).toBe(true);
        expect(apart._live).toBe(false);
    });

    it('starts a live block in the live layer', () => {
        const t = manual();
        const bar = surface(t);

        stack(bar, [new Dot({ width: 40, height: 40, layer: 'live' })]);
        run(t, 3);
        expect(bar.painter.primitiveCount).toBe(1);
        expect(bar.stillPainter.primitiveCount).toBe(0);
    });

    it('draws a flat button as one face with its border', () => {
        const t = manual();
        const bar = surface(t);
        const full = new ButtonBlock({
            width: 80,
            height: 80,
            shape: 'circle',
            shadow: 10,
            active: true,
            colors: { fill: 0x333333, active: 0x0a84ff },
            onPress: () => {},
        });
        const flat = new ButtonBlock({
            ...{ width: 80, height: 80, shape: 'circle' as const },
            flat: true,
            active: true,
            onPress: () => {},
        });

        stack(bar, [full]);
        run(t, 3);
        const many = prims(bar);

        full.removeFromParent();
        stack(bar, [flat]);
        run(t, 3);
        expect(prims(bar)).toBe(1);
        expect(many).toBeGreaterThan(2);
    });

    it('repaints at most maxFps times a second', () => {
        const t = manual();
        const bar = surface(t);
        const a = new Dot({ width: 40, height: 40 });

        bar.maxFps = 20;
        stack(bar, [a]);
        run(t, 5);
        const n = bar.stats.repaints;

        a.kick();
        // 30 frames at 60 per second: half a second
        run(t, 30);
        expect(bar.stats.repaints - n).toBeLessThanOrEqual(11);
        expect(bar.stats.repaints - n).toBeGreaterThanOrEqual(8);
    });
});

describe('frames', () => {
    /** The parts of an Application the gate touches. */
    const fakeApp = () => {
        const ticker = manual();
        const renderer = new EventEmitter() as EventEmitter & {
            resolution: number;
            screen: { width: number; height: number };
            resize: (w: number, h: number, r: number) => void;
        };
        const app = {
            ticker,
            renderer,
            renders: 0,
            render() {
                app.renders++;
            },
        };

        renderer.resolution = 3;
        renderer.screen = { width: 400, height: 800 };
        renderer.resize = (_w, _h, r) => {
            renderer.resolution = r;
        };
        ticker.add(app.render, app, UPDATE_PRIORITY.LOW);

        return app;
    };

    it('renders only frames that something asked for', () => {
        const app = fakeApp();
        const gate = renderOnDemand(app as never);

        run(app.ticker, 10);
        // the first frame after the gate, then nothing
        expect(app.renders).toBe(1);
        requestFrame();
        run(app.ticker, 10);
        expect(app.renders).toBe(2);
        const release = gate.hold();

        run(app.ticker, 10);
        expect(app.renders).toBe(12);
        release();
        run(app.ticker, 10);
        expect(app.renders).toBe(13);
        app.renderer.emit('resize');
        run(app.ticker, 2);
        expect(app.renders).toBe(14);
        gate.destroy();
        run(app.ticker, 5);
        expect(app.renders).toBe(19);
    });

    it('turns the low-end preset on and off', () => {
        const app = fakeApp();
        const low = enableLowEnd(app as never);

        expect(low.on).toBe(true);
        expect(app.renderer.resolution).toBe(1.5);
        const bar = surface(manual());

        expect(bar.lowEnd).toBe(true);
        expect(bar.maxFps).toBe(30);
        low.disable();
        expect(app.renderer.resolution).toBe(3);
        expect(surface(manual()).lowEnd).toBe(false);
    });
});
