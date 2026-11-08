import { Container } from 'pixi.js';
import { createSilkApp, type SilkApp } from 'pixi-silk';

/*
 * Tiny runtime for the live demos embedded in the docs. A demo is a plain module:
 *
 *   export default defineDemo({ size, controls, setup({ stage, params, tick }) { ... } });
 *
 * The docs page shows the module's source next to the canvas, so the code you read is
 * exactly the code that runs.
 */

export interface RangeControl {
    type: 'range';
    label?: string;
    min: number;
    max: number;
    step?: number;
    value: number;
    unit?: string;
}

export interface ToggleControl {
    type: 'toggle';
    label?: string;
    value: boolean;
}

export interface SelectControl {
    type: 'select';
    label?: string;
    options: readonly string[];
    value: string;
}

export type Control = RangeControl | ToggleControl | SelectControl;
export type Controls = Record<string, Control>;
export type Values<C extends Controls> = { -readonly [K in keyof C]: C[K]['value'] };

export interface DemoContext<C extends Controls> {
    silk: SilkApp;
    /** Root container in design units: fitted to the canvas and centred. */
    stage: Container;
    /** Design size of the scene. */
    width: number;
    height: number;
    /** Live control values (updated in place when a control changes). */
    params: Values<C>;
    /** Runs `fn` every frame with the elapsed and the frame time in seconds. */
    tick(fn: (t: number, dt: number) => void): void;
}

export interface Demo<C extends Controls = Controls> {
    /** Design size in CSS pixels; the scene is scaled to fit the frame. */
    size: [number, number];
    background?: number;
    controls?: C;
    /** The demo pans and zooms itself, so Studio leaves its own camera off. */
    ownsCamera?: boolean;
    /** CSS touch-action of the canvas: `none` for demos that handle drags themselves. */
    touchAction?: string;
    /** Builds the scene; may return a cleanup function. */
    setup(ctx: DemoContext<C>): (() => void) | undefined;
}

export const defineDemo = <C extends Controls = Record<string, never>>(demo: Demo<C>): Demo<C> => demo;

export interface MountedDemo {
    /** The app the demo runs in. */
    silk: SilkApp;
    setParam(key: string, value: unknown): void;
    pause(paused: boolean): void;
    destroy(): void;
}

export const initialValues = (controls: Controls = {}): Record<string, unknown> =>
    Object.fromEntries(Object.entries(controls).map(([key, c]) => [key, c.value]));

export async function mountDemo(demo: Demo, host: HTMLElement, values: Record<string, unknown>): Promise<MountedDemo> {
    const silk = await createSilkApp({
        parent: host,
        background: demo.background ?? 0x0b0b0d,
        touchAction: demo.touchAction,
    });
    const stage = new Container();
    const [width, height] = demo.size;
    const params = { ...values } as Values<Controls>;
    const ticks: ((t: number, dt: number) => void)[] = [];
    let t = 0;

    silk.app.stage.addChild(stage);
    const fit = () => {
        const s = Math.min(silk.width / width, silk.height / height);

        stage.scale.set(s);
        stage.position.set((silk.width - width * s) / 2, (silk.height - height * s) / 2);
    };

    silk.app.renderer.on('resize', fit);
    fit();
    silk.app.ticker.add((ticker) => {
        const dt = Math.min(0.1, ticker.deltaMS / 1000);

        t += dt;
        for (const fn of ticks) fn(t, dt);
    });
    const cleanup = demo.setup({ silk, stage, width, height, params, tick: (fn) => ticks.push(fn) });

    return {
        silk,
        setParam(key, value) {
            (params as Record<string, unknown>)[key] = value;
        },
        pause(paused) {
            if (paused) silk.app.ticker.stop();
            else silk.app.ticker.start();
        },
        destroy() {
            cleanup?.();
            silk.destroy();
        },
    };
}
