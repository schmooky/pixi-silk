import { CanvasTextMetrics, Container } from 'pixi.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Camera } from '../src/ui/camera';
import { Measure, redlines } from '../src/ui/measure';

/** Enough of a DOM element and window for the camera: events, size and hover. */
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

const event = (type: string, props: Record<string, unknown>) => {
    const e = new Event(type, { cancelable: true });

    for (const [k, v] of Object.entries(props)) Object.defineProperty(e, k, { value: v });

    return e;
};

beforeAll(() => {
    (globalThis as Record<string, unknown>).window ??= new EventTarget();
});

describe('camera', () => {
    const make = () => {
        const world = new Container();
        const element = fakeElement();
        const camera = new Camera({ world, element, ticker: null });

        return { world, element, camera };
    };
    const settle = (camera: Camera) => {
        for (let i = 0; i < 400 && camera.tick(1 / 60); i++);
    };

    it('keeps the point under the cursor still while it zooms', () => {
        const { camera } = make();
        const at = { x: 300, y: 200 };
        const before = camera.screenToWorld(at);

        camera.zoomBy(3, at);
        for (let i = 0; i < 5; i++) {
            camera.tick(1 / 60);
            const now = camera.screenToWorld(at);

            expect(now.x).toBeCloseTo(before.x, 6);
            expect(now.y).toBeCloseTo(before.y, 6);
        }
        settle(camera);
        expect(camera.zoom).toBeCloseTo(3, 6);
    });

    it('zooms with ctrl + wheel and pans with a plain wheel', () => {
        const { camera, element, world } = make();

        element.dispatchEvent(event('wheel', { deltaX: 0, deltaY: 30, deltaMode: 0, clientX: 0, clientY: 0 }));
        expect(world.position.y).toBe(-30);
        element.dispatchEvent(
            event('wheel', { deltaX: 0, deltaY: -10, deltaMode: 0, ctrlKey: true, clientX: 0, clientY: 0 }),
        );
        expect(camera.zoom).toBeGreaterThan(1);
    });

    it('leaves plain scrolls to the page until the canvas is clicked', () => {
        const world = new Container();
        const element = fakeElement();
        const camera = new Camera({ world, element, ticker: null, pageScroll: true });
        const wheel = (props: Record<string, unknown>) => {
            const e = event('wheel', { deltaX: 0, deltaY: 30, deltaMode: 0, clientX: 0, clientY: 0, ...props });

            element.dispatchEvent(e);

            return e.defaultPrevented;
        };

        expect(wheel({})).toBe(false);
        expect(world.position.y).toBe(0);
        // pinch and ctrl + wheel zoom at once
        expect(wheel({ ctrlKey: true, deltaY: -10 })).toBe(true);
        window.dispatchEvent(
            event('pointerdown', {
                pointerId: 1,
                pointerType: 'mouse',
                button: 0,
                clientX: 5,
                clientY: 5,
                target: element,
            }),
        );
        expect(wheel({})).toBe(true);
        element.dispatchEvent(event('pointerleave', {}));
        expect(wheel({})).toBe(false);
        camera.destroy();
    });

    it('fits a rectangle into the space panels leave free', () => {
        const { camera } = make();

        camera.fit({ x: 0, y: 0, width: 100, height: 100 }, { left: 200, right: 0, top: 0, bottom: 0 }, false);
        // 600 x 600 free on the right of the panel: the box is centred there
        expect(camera.zoom).toBeCloseTo(6, 6);
        expect(camera.worldToScreen({ x: 50, y: 50 })).toEqual({ x: 500, y: 300 });
    });

    it('fits a rectangle with padding and clamps to the zoom range', () => {
        const { camera } = make();

        camera.fit({ x: 0, y: 0, width: 376, height: 100 }, 24, false);
        expect(camera.zoom).toBeCloseTo(2, 6);
        expect(camera.worldToScreen({ x: 188, y: 50 })).toEqual({ x: 400, y: 300 });
        camera.zoomTo(1e9, undefined, false);
        expect(camera.zoom).toBe(camera.zoomRange[1]);
    });

    it('pans with a middle drag, and the scene never sees it', () => {
        const { camera, element } = make();
        let reached = 0;

        element.addEventListener('pointerdown', () => reached++);
        const ptr = (type: string, x: number) =>
            event(type, { pointerId: 1, pointerType: 'mouse', button: 1, clientX: x, clientY: 0, target: element });

        window.dispatchEvent(ptr('pointerdown', 10));
        window.dispatchEvent(ptr('pointermove', 70));
        window.dispatchEvent(ptr('pointerup', 70));
        expect(camera.state.x.value).toBe(60);
        expect(camera.state.panning.value).toBe(false);
        camera.destroy();
        expect(reached).toBe(0);
    });
});

describe('redlines', () => {
    const box = (x0: number, y0: number, x1: number, y1: number) => ({ x0, y0, x1, y1 });

    it('measures the gap between neighbours along their shared band', () => {
        const [line] = redlines(box(0, 0, 100, 100), box(140, 20, 200, 60));

        expect(line).toMatchObject({ x0: 100, x1: 140, y0: 40, value: 40 });
        expect(line.guides).toHaveLength(0);
    });

    it('adds a dashed guide when neighbours do not line up', () => {
        const lines = redlines(box(0, 0, 100, 100), box(150, 200, 250, 260));

        expect(lines).toHaveLength(2);
        expect(lines[0].value).toBe(50);
        expect(lines[0].guides).toHaveLength(1);
        expect(lines[1].value).toBe(100);
    });

    it('measures the margins of a box inside another', () => {
        const lines = redlines(box(20, 30, 80, 90), box(0, 0, 100, 100));

        expect(lines.map((l) => l.value).sort((a, b) => a - b)).toEqual([10, 20, 20, 30]);
    });
});

describe('measure', () => {
    it('reads distances in the measured space, whatever the zoom', () => {
        // node has no canvas to measure label text with
        vi.spyOn(CanvasTextMetrics, 'measureText').mockReturnValue({
            width: 20,
            height: 12,
            lines: ['30'],
            lineWidths: [20],
            lineHeight: 12,
            maxLineWidth: 20,
            fontProperties: { ascent: 10, descent: 2, fontSize: 12 },
        } as never);
        const world = new Container();
        const a = new Container();
        const b = new Container();
        const overlay = new Container();
        const root = new Container();

        a.boundsArea = { x: 0, y: 0, width: 100, height: 100 } as never;
        b.boundsArea = { x: 0, y: 0, width: 50, height: 100 } as never;
        b.x = 130;
        world.addChild(a, b);
        world.scale.set(4);
        const m = new Measure({ space: world, ticker: null });

        overlay.addChild(m);
        root.addChild(world, overlay);
        m.between(a, b);
        m.tick(1 / 60);
        expect(m.lines.map((l) => l.value)).toEqual([30]);
    });
});
