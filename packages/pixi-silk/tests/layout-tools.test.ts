import { type Application, Container, Graphics, Ticker } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { FlexContainer, layoutDebug, SmartContainer, simulateViewport } from '../src/ui/layout';

const block = (w: number, h: number): Graphics => new Graphics().rect(0, 0, w, h).fill(0xffffff);

describe('SmartContainer and FlexContainer together', () => {
    it('nests a FlexContainer inside a SmartContainer block', () => {
        const hud = new SmartContainer({
            ticker: null,
            layout: { padding: 20, gap: 10, alignItems: 'start' },
            landscapeData: { align: 'left', valign: 'top', width: 600, height: 200 },
            viewport: { width: 1920, height: 1080 },
        });
        const row = hud.add(new FlexContainer({ ticker: null, layout: { gap: 5 } }), { grow: 1 });
        const a = row.add(block(40, 40));
        const b = row.add(block(40, 40));

        hud.updateLayout();
        expect([row.x, row.y]).toEqual([20, 20]);
        expect([a.x, b.x]).toEqual([0, 45]);
    });

    it('leaves a SmartContainer inside a FlexContainer to place itself', () => {
        const page = new FlexContainer({ ticker: null, layout: { gap: 10 } }).resize(800, 600);
        const first = page.add(block(50, 50));
        const pinned = new SmartContainer({
            ticker: null,
            landscapeData: {
                align: 'right',
                valign: 'bottom',
                width: 100,
                height: 100,
                viewportWidth: 800,
                viewportHeight: 600,
            },
            viewport: { width: 800, height: 600 },
        });
        const second = page.add(block(50, 50));

        page.addChildAt(pinned, 1);
        page.updateLayout();
        expect([pinned.x, pinned.y]).toEqual([700, 500]);
        expect([first.x, second.x]).toEqual([0, 60]);
    });
});

describe('simulateViewport', () => {
    it('letterboxes a device in an area and drives SmartContainers inside it', () => {
        const sim = simulateViewport({
            area: { x: 0, y: 0, width: 920, height: 520 },
            device: 'phone portrait',
            margin: 20,
        });
        const c = new SmartContainer({ ticker: null, viewport: sim });

        sim.content.addChild(c);
        expect(sim.value).toMatchObject({ width: 390, height: 844 });
        expect(sim.deviceScale).toBeCloseTo(480 / 844);
        expect(c.breakpoint).toBe('portrait');
        sim.setDevice('phone landscape');
        expect(c.breakpoint).toBe('landscape');
        expect(sim.deviceScale).toBeCloseTo(Math.min(1, 880 / 844, 480 / 390));
        sim.setDevice([1920, 1080]);
        expect(c.scale.x).toBe(1);
        expect(() => sim.setDevice('toaster')).toThrow(/unknown device/);
    });
});

describe('layoutDebug', () => {
    it('toggles an overlay on top of the stage and draws without errors', () => {
        const stage = new Container();
        const ticker = new Ticker();
        const app = { stage, ticker, screen: { width: 800, height: 600 }, canvas: {} } as unknown as Application;
        const hud = new SmartContainer({
            ticker: null,
            layout: { padding: 10 },
            safeArea: { top: 20 },
            landscapeData: {
                valign: 'bottom',
                width: 800,
                height: 100,
                extendWidth: true,
                viewportWidth: 800,
                viewportHeight: 600,
            },
            viewport: { width: 800, height: 600 },
        });

        hud.add(block(200, 50));
        stage.addChild(hud);
        hud.updateLayout();
        const dbg = layoutDebug(app, { labels: false });

        expect(dbg.enabled).toBe(false);
        expect(dbg.toggle()).toBe(true);
        ticker.update(performance.now() + 16);
        const layer = stage.children[stage.children.length - 1];

        expect(layer.label).toBe('layoutDebug');
        expect(dbg.toggle()).toBe(false);
        expect(stage.children.includes(layer)).toBe(false);
        dbg.destroy();
    });
});
