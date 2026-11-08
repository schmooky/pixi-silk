import { Container } from 'pixi.js';
import { createSilkApp, type SilkApp } from 'pixi-silk';
import { BG } from './_theme';

// the shared look (background, palette, label helpers): demos import it from here, so Studio resolves it
export * from './_theme';

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
    /** Starting value while the demo runs its phone layout. Default `value`. */
    phoneValue?: number;
    unit?: string;
}

export interface ToggleControl {
    type: 'toggle';
    label?: string;
    value: boolean;
    /** Starting value while the demo runs its phone layout. Default `value`. */
    phoneValue?: boolean;
}

export interface SelectControl {
    type: 'select';
    label?: string;
    options: readonly string[];
    value: string;
    /** Starting value while the demo runs its phone layout. Default `value`. */
    phoneValue?: string;
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
    /** Design size of the scene: `size`, or `phone.size` while the phone layout runs. */
    width: number;
    height: number;
    /** True while the frame is narrower than `phone.below` and the scene runs at `phone.size`. */
    phone: boolean;
    /** Live control values (updated in place when a control changes). */
    params: Values<C>;
    /** Runs `fn` every frame with the elapsed and the frame time in seconds. */
    tick(fn: (t: number, dt: number) => void): void;
}

/** The phone layout of a demo. */
export interface PhoneLayout {
    /** Design size in CSS pixels. Keep it near the frame width (about 360) so text keeps its size. */
    size: [number, number];
    /** Frame width in CSS px under which the phone layout runs. Default 560. */
    below?: number;
}

export interface Demo<C extends Controls = Controls> {
    /** Readable name of the demo, for Studio and page lists. Sentence case, no period. */
    title?: string;
    /** Design size in CSS pixels; the scene is scaled to fit the frame. */
    size: [number, number];
    /**
     * A second layout for narrow frames. Below `below` CSS px of frame width the scene is built
     * again at `phone.size`, with `phone: true` in the context, so it can stack what sits side by side
     * instead of shrinking it. In a docs frame the frame height follows the phone aspect ratio.
     */
    phone?: PhoneLayout;
    /** Canvas colour. Default `BG`, the docs card colour. Showcase scenes may pick their own. */
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

/** Starting control values. `phone` picks each control's `phoneValue` where it has one. */
export const initialValues = (controls: Controls = {}, phone = false): Record<string, unknown> =>
    Object.fromEntries(Object.entries(controls).map(([key, c]) => [key, phone ? (c.phoneValue ?? c.value) : c.value]));

/** True when a frame this wide runs the demo's phone layout. */
export const runsPhone = (demo: Pick<Demo, 'phone'>, frameWidth: number): boolean =>
    demo.phone !== undefined && frameWidth > 0 && frameWidth < (demo.phone.below ?? 560);

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
        silk: parts[0].silk,
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
        background: demo.background ?? BG,
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
    const params = { ...values } as Values<Controls>;
    const ticks: ((t: number, dt: number) => void)[] = [];
    const frameHeight = host.style.height;
    let stage = new Container();
    let [width, height] = demo.size;
    let phone = false;
    let cleanup: (() => void) | undefined;
    let t = 0;

    const isPhone = () =>
        demo.phone !== undefined && host.clientWidth > 0 && host.clientWidth < (demo.phone.below ?? 560);
    const fit = () => {
        const s = Math.min(silk.width / width, silk.height / height);

        stage.scale.set(s);
        stage.position.set((silk.width - width * s) / 2, (silk.height - height * s) / 2);
    };
    const build = () => {
        cleanup?.();
        ticks.length = 0;
        stage.destroy({ children: true });
        stage = new Container();
        phone = isPhone();
        [width, height] = phone && demo.phone ? demo.phone.size : demo.size;
        // a docs frame sets its height inline: the phone layout gives it the phone aspect ratio
        if (frameHeight) {
            // the canvas follows on its next resize, and fit runs again then
            host.style.height = phone ? `${Math.round((host.clientWidth * height) / width)}px` : frameHeight;
        }
        silk.app.stage.addChild(stage);
        fit();
        cleanup = demo.setup({
            silk,
            renderer,
            stage,
            width,
            height,
            phone,
            params,
            tick: (fn) => ticks.push(fn),
        });
    };
    const onResize = () => {
        if (isPhone() !== phone) build();
        else fit();
    };

    silk.app.renderer.on('resize', onResize);
    silk.app.ticker.add((ticker) => {
        const dt = Math.min(0.1, ticker.deltaMS / 1000);

        t += dt;
        for (const fn of ticks) fn(t, dt);
    });
    build();

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
            if (frameHeight) host.style.height = frameHeight;
        },
    };
}
