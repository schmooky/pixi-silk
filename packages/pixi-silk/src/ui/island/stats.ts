import type { Renderer } from 'pixi.js';
import { type ReadSignal, type Signal, signal } from '../../signal';

/** Options of {@link createRenderStats}. */
export interface RenderStatsOptions {
    /** How often the signals update, ms. Default 500. */
    interval?: number;
    /** Count draw calls. Default true. */
    drawCalls?: boolean;
}

/** What {@link createRenderStats} returns. Every signal updates once per `interval`. */
export interface RenderStats {
    /** Frames rendered per second. Under `renderOnDemand` it counts only the frames drawn. */
    readonly fps: ReadSignal<number>;
    /** CPU time of one render on average, ms: from the start of `render()` to its end. */
    readonly frameMs: ReadSignal<number>;
    /** Draw calls per rendered frame on average, or null when they are not counted. */
    readonly drawCalls: ReadSignal<number | null>;
    /** Frames rendered since the stats were made. */
    readonly frames: number;
    /** Stops sampling and removes the hooks. */
    destroy(): void;
}

type Counter = { n: number };

const DRAWS_GL = ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced'] as const;
const DRAWS_GPU = ['draw', 'drawIndexed', 'drawIndirect', 'drawIndexedIndirect'] as const;
// one hook per target, shared by every RenderStats on it
const hooks = new Map<object, { counters: Set<Counter>; undo: () => void }>();

function hook(target: object, names: readonly string[], counter: Counter): () => void {
    let entry = hooks.get(target);

    if (!entry) {
        const counters = new Set<Counter>();
        const record = target as Record<string, unknown>;
        const saved = names.map((name) => [name, Object.hasOwn(record, name), record[name]] as const);

        for (const [name, , fn] of saved) {
            if (typeof fn !== 'function') continue;
            record[name] = function (this: unknown, ...args: unknown[]) {
                for (const c of counters) c.n++;

                return (fn as (...a: unknown[]) => unknown).apply(this, args);
            };
        }
        entry = {
            counters,
            undo: () => {
                for (const [name, own, fn] of saved) {
                    if (own) record[name] = fn;
                    else delete record[name];
                }
            },
        };
        hooks.set(target, entry);
    }
    const e = entry;

    e.counters.add(counter);

    return () => {
        e.counters.delete(counter);
        if (!e.counters.size) {
            e.undo();
            hooks.delete(target);
        }
    };
}

/**
 * Samples how the renderer is doing: frames per second, CPU time per render and draw calls per
 * frame. Feed the signals to an {@link IslandMeter}, or read them anywhere.
 *
 * Draw calls are counted by wrapping the draw functions: on WebGL those of the context, on WebGPU
 * those of `GPURenderPassEncoder.prototype`, which counts every WebGPU canvas on the page.
 * `destroy()` puts them back. The meters redraw when a value changes, so under `renderOnDemand`
 * they draw a frame each `interval` while the numbers move.
 *
 * @example
 * ```ts
 * import { createRenderStats, IslandMeter } from 'pixi-silk/ui/island';
 *
 * const stats = createRenderStats(app);
 * const fps = new IslandMeter({ title: 'FPS', value: stats.fps });
 * ```
 */
export function createRenderStats(app: { renderer: Renderer }, options: RenderStatsOptions = {}): RenderStats {
    const interval = options.interval ?? 500;
    const fps: Signal<number> = signal(0);
    const frameMs: Signal<number> = signal(0);
    const drawCalls: Signal<number | null> = signal<number | null>(null);
    const counter: Counter = { n: 0 };
    const renderer = app.renderer as Renderer & {
        gl?: WebGLRenderingContext;
        runners: Record<string, { add(item: unknown): void; remove(item: unknown): void }>;
    };
    let frames = 0;
    let total = 0;
    let busy = 0;
    let began = 0;
    let since = performance.now();
    const unhooks: (() => void)[] = [];

    if (options.drawCalls !== false) {
        const proto = (globalThis as { GPURenderPassEncoder?: { prototype: object } }).GPURenderPassEncoder?.prototype;

        if (renderer.gl) unhooks.push(hook(renderer.gl, DRAWS_GL, counter));
        else if (proto && 'gpu' in renderer) unhooks.push(hook(proto, DRAWS_GPU, counter));
    }
    const counting = unhooks.length > 0;
    const runner = {
        prerender: () => {
            began = performance.now();
        },
        postrender: () => {
            frames++;
            total++;
            busy += performance.now() - began;
        },
    };

    renderer.runners.prerender.add(runner);
    renderer.runners.postrender.add(runner);
    const timer = setInterval(() => {
        const now = performance.now();
        const secs = Math.max(1e-3, (now - since) / 1000);

        fps.value = Math.round(frames / secs);
        frameMs.value = frames ? Math.round((busy / frames) * 100) / 100 : 0;
        if (counting) drawCalls.value = frames ? Math.round(counter.n / frames) : 0;
        frames = 0;
        busy = 0;
        counter.n = 0;
        since = now;
    }, interval);

    return {
        fps,
        frameMs,
        drawCalls,
        get frames() {
            return total;
        },
        destroy() {
            clearInterval(timer);
            renderer.runners.prerender.remove(runner);
            renderer.runners.postrender.remove(runner);
            for (const u of unhooks) u();
            unhooks.length = 0;
        },
    };
}
