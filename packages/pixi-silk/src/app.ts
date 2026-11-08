import { Application, type ApplicationOptions, Filter } from 'pixi.js';

/** Options of {@link createSilkApp}: Pixi application options plus the element to fill, DPR limits and touch behaviour. */
export interface SilkAppOptions extends Partial<ApplicationOptions> {
    /** Element the canvas fills (it must have a size). */
    parent: HTMLElement;
    /** Upper bound for the resolution (DPR). Default 3. */
    maxResolution?: number;
    /** Force a resolution instead of following devicePixelRatio. */
    fixedResolution?: number;
    /** Called after every size / resolution change with the size in CSS pixels. */
    onResize?: (width: number, height: number, resolution: number) => void;
    /**
     * Pixi filters render at resolution 1 by default, which blurs everything behind a filter
     * on retina screens. When true (default) new filters inherit the renderer resolution.
     */
    inheritFilterResolution?: boolean;
    /**
     * CSS touch-action for the canvas. Pixi sets `none`, which blocks page scrolling on touch
     * screens. The default `pan-y pinch-zoom` lets pages scroll while taps and hovers still reach
     * Pixi. Use `none` for canvases that handle drags themselves.
     */
    touchAction?: string;
    /**
     * Which renderer Pixi tries first. Default `'webgl'` (WebGL2). Pass `'webgpu'` to use WebGPU
     * where the browser has it. Pixi falls back to WebGL2 when it does not. On WebGPU the app loads
     * the WGSL shader from `pixi-silk/webgpu` before it resolves, so SilkGraphics render on either.
     */
    preference?: ApplicationOptions['preference'];
}

/** What {@link createSilkApp} returns: the Pixi application, its CSS size and resolution, and helpers to change or destroy it. */
export interface SilkApp {
    /** The Pixi application. */
    app: Application;
    /** Current width in CSS pixels. */
    readonly width: number;
    /** Current height in CSS pixels. */
    readonly height: number;
    /** Current renderer resolution (device pixels per CSS pixel). */
    readonly resolution: number;
    /** Forces a resolution, for example to compare 1x and 2x. `null` returns to devicePixelRatio. */
    setResolution(resolution: number | null): void;
    /** Stops observers, destroys the stage and renderer and removes the canvas. Safe with several apps on a page. */
    destroy(): void;
}

/**
 * Creates a Pixi application tuned for smooth vector output:
 *
 * - WebGL2 by default, WebGPU with `preference: 'webgpu'` (the WGSL shader then loads on demand),
 * - no MSAA (analytic AA does the job, MSAA would only cost bandwidth),
 * - backing store sized from `devicePixelContentBoxSize`, so every canvas pixel maps to
 *   exactly one device pixel even at fractional DPRs (1.25, 1.5, 2.625 ...) - no resampling blur,
 * - follows DPR changes (moving the window between displays, browser zoom),
 * - unrounded coordinates for sub-pixel smooth motion,
 * - filters that render at the screen resolution instead of 1x.
 */
export async function createSilkApp(options: SilkAppOptions): Promise<SilkApp> {
    const {
        parent,
        maxResolution = 3,
        fixedResolution,
        onResize,
        inheritFilterResolution = true,
        touchAction = 'pan-y pinch-zoom',
        ...rest
    } = options;

    if (inheritFilterResolution) Filter.defaultOptions.resolution = 'inherit';
    const app = new Application();
    let forced: number | null = fixedResolution ?? null;
    const dpr = () => Math.min(forced ?? window.devicePixelRatio ?? 1, forced ? 16 : maxResolution);

    await app.init({
        preference: 'webgl',
        antialias: false,
        autoDensity: false,
        roundPixels: false,
        resolution: dpr(),
        width: Math.max(1, parent.clientWidth),
        height: Math.max(1, parent.clientHeight),
        powerPreference: 'high-performance',
        ...rest,
    });

    // the WGSL program is a separate chunk: WebGL2 apps never download it
    if (app.renderer.name === 'webgpu') (await import('./webgpu')).enableWebGPU();

    const canvas = app.canvas;

    // after init: Pixi's event system has set touch-action: none
    canvas.style.touchAction = touchAction;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    parent.appendChild(canvas);

    let devW = 0;
    let devH = 0;
    let lastDpr = 0;

    const apply = () => {
        const res = dpr();
        const nativeDpr = window.devicePixelRatio || 1;

        if (!devW || !devH) return;
        // devW/devH are device pixels; at a forced/capped resolution scale them down
        const scale = res / nativeDpr;
        const pw = Math.max(1, Math.round(devW * scale));
        const ph = Math.max(1, Math.round(devH * scale));

        app.renderer.resize(pw / res, ph / res, res);
        lastDpr = res;
        onResize?.(pw / res, ph / res, res);
    };

    const ro = new ResizeObserver((entries) => {
        const entry = entries[entries.length - 1];
        const ratio = window.devicePixelRatio || 1;
        const cb = entry.contentBoxSize[0];
        const box = entry.devicePixelContentBoxSize?.[0];
        // Exact device pixels when the browser reports them and they agree with devicePixelRatio
        // (they differ by pixel snapping only). Safari has no device-pixel box, and Chrome under DPR
        // emulation (DevTools, Playwright's deviceScaleFactor) reports it at the real scale: round instead.
        const exact =
            box &&
            Math.abs(box.inlineSize - cb.inlineSize * ratio) <= 2 &&
            Math.abs(box.blockSize - cb.blockSize * ratio) <= 2;

        devW = exact ? box.inlineSize : Math.round(cb.inlineSize * ratio);
        devH = exact ? box.blockSize : Math.round(cb.blockSize * ratio);
        apply();
    });

    try {
        ro.observe(canvas, { box: 'device-pixel-content-box' });
    } catch {
        ro.observe(canvas);
    }

    // Safari has no device-pixel-content-box: listen for DPR changes explicitly.
    let mq: MediaQueryList | null = null;
    const watchDpr = () => {
        mq?.removeEventListener('change', onDprChange);
        mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
        mq.addEventListener('change', onDprChange);
    };
    const onDprChange = () => {
        const rect = canvas.getBoundingClientRect();

        devW = Math.round(rect.width * window.devicePixelRatio);
        devH = Math.round(rect.height * window.devicePixelRatio);
        watchDpr();
        apply();
    };

    watchDpr();

    return {
        app,
        get width() {
            return app.screen.width;
        },
        get height() {
            return app.screen.height;
        },
        get resolution() {
            return lastDpr || dpr();
        },
        setResolution(resolution: number | null) {
            forced = resolution;
            apply();
        },
        destroy() {
            ro.disconnect();
            mq?.removeEventListener('change', onDprChange);
            // `{ removeView: true }`, not `true`: `true` also releases Pixi's process-global pools
            // (batchers, hashes), which breaks every other live application on the page
            app.destroy({ removeView: true }, { children: true });
        },
    };
}
