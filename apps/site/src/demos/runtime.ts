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

/** Pixi renderer a demo asks for. Pixi falls back to WebGL2 where WebGPU is missing. */
export type RendererPreference = 'webgl' | 'webgpu';

export interface DemoContext<C extends Controls> {
    silk: SilkApp;
    /** The renderer Pixi picked, `'webgl'` or `'webgpu'`. It can differ from the one asked for. */
    renderer: string;
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
    /**
     * Renderers to run the scene on. Default `['webgl']`. Two entries mount the scene twice,
     * side by side, each half with its own canvas and a label naming the renderer it got.
     * `?renderer=webgpu` in the page URL runs every single-renderer demo on WebGPU.
     */
    renderers?: readonly RendererPreference[];
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

/** `?renderer=webgpu` (or `webgl`) in the page URL: a switch to check every demo on one renderer. */
function urlRenderer(): RendererPreference | null {
    const value = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('renderer');

    return value === 'webgpu' || value === 'webgl' ? value : null;
}

const RENDERER_LABEL: Record<string, string> = { webgl: 'WebGL2', webgpu: 'WebGPU' };

export async function mountDemo(demo: Demo, host: HTMLElement, values: Record<string, unknown>): Promise<MountedDemo> {
    const renderers = demo.renderers ?? [urlRenderer() ?? 'webgl'];

    if (renderers.length < 2) return mountOne(demo, host, values, renderers[0] ?? 'webgl');

    // side by side: one canvas per renderer, the same scene in each
    const row = document.createElement('div');

    row.style.cssText = 'position:absolute;inset:0;display:flex;gap:1px;background:#26262b';
    host.appendChild(row);
    const parts = await Promise.all(
        renderers.map((preference) => {
            const cell = document.createElement('div');

            cell.style.cssText = 'position:relative;flex:1;min-width:0';
            row.appendChild(cell);

            return mountOne(demo, cell, values, preference, true);
        }),
    );

    return {
        setParam: (key, value) => {
            for (const p of parts) p.setParam(key, value);
        },
        pause: (paused) => {
            for (const p of parts) p.pause(paused);
        },
        destroy: () => {
            for (const p of parts) p.destroy();
            row.remove();
        },
    };
}

async function mountOne(
    demo: Demo,
    host: HTMLElement,
    values: Record<string, unknown>,
    preference: RendererPreference,
    labelled = false,
): Promise<MountedDemo> {
    const silk = await createSilkApp({
        parent: host,
        background: demo.background ?? 0x0b0b0d,
        touchAction: demo.touchAction,
        preference,
    });
    const renderer = silk.app.renderer.name;
    let label: HTMLElement | null = null;

    // page checks read which renderer each canvas got
    silk.app.canvas.dataset.renderer = renderer;

    if (labelled) {
        // name what Pixi picked, not what was asked for: WebGPU falls back to WebGL2 when it is missing
        label = document.createElement('span');
        label.textContent =
            renderer === preference
                ? RENDERER_LABEL[renderer]
                : `${RENDERER_LABEL[preference]} unavailable, ${RENDERER_LABEL[renderer] ?? renderer}`;
        label.style.cssText =
            'position:absolute;left:10px;top:8px;font:500 11px/1.4 ui-monospace,monospace;letter-spacing:.04em;color:rgba(255,255,255,.62);pointer-events:none';
        host.appendChild(label);
    }
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
    const cleanup = demo.setup({ silk, renderer, stage, width, height, params, tick: (fn) => ticks.push(fn) });

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
            label?.remove();
        },
    };
}
