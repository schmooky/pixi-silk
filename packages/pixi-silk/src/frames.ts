import { type Application, UPDATE_PRIORITY } from 'pixi.js';
import type { SilkApp } from './app';

/*
 * Frames on demand and the low-end preset. Nothing here runs at import: the gate replaces the
 * application's render listener only when you call renderOnDemand.
 */

/** @internal The gate that `requestFrame` reaches, and the quality blocks read. */
export const silkFrames: { request: (() => void) | null; lowEnd: boolean } = { request: null, lowEnd: false };

/**
 * Asks for one render on the next frame when {@link renderOnDemand} is on. Does nothing
 * otherwise. BlockSurface calls it whenever it paints or bakes, so blocks need no extra code.
 */
export function requestFrame(): void {
    silkFrames.request?.();
}

/** Options of {@link renderOnDemand}. */
export interface RenderOnDemandOptions {
    /**
     * Renders at least this many frames per second while nothing asks, for content that changes
     * without telling the gate. Default 0: no frame without a request.
     */
    idleFps?: number;
}

/** What {@link renderOnDemand} returns. */
export interface FrameGate {
    /** Renders the next frame. Call it after you change the scene outside a BlockSurface. */
    invalidate(): void;
    /**
     * Renders every frame until the returned function is called. Hold it while something animates
     * that the gate does not know about, such as spinning reels or a Spine animation.
     */
    hold(): () => void;
    /** Frames rendered and frames skipped since the gate was made. */
    readonly stats: { rendered: number; skipped: number };
    /** Puts the application's own render listener back. */
    destroy(): void;
}

/**
 * Renders a frame only when something asks for it. The ticker keeps running, so layout,
 * springs and game logic go on, but Pixi draws nothing on frames where nothing changed, and the
 * canvas keeps showing the last frame. A frame is drawn after `invalidate()`, after
 * `requestFrame()` (BlockSurface calls it), while a `hold()` is open, and after a resize.
 *
 * Content that changes on its own, such as reels, a Spine skeleton or a video, needs a `hold()`
 * while it plays. A gate per application: a second call returns a new gate and the first one
 * stops answering `requestFrame`.
 *
 * @example
 * ```ts
 * import { renderOnDemand } from 'pixi-silk';
 *
 * const gate = renderOnDemand(app);
 * // while the reels spin
 * const release = gate.hold();
 * // when they stop
 * release();
 * ```
 */
export function renderOnDemand(app: Application, options: RenderOnDemandOptions = {}): FrameGate {
    const stats = { rendered: 0, skipped: 0 };
    const idleMs = options.idleFps && options.idleFps > 0 ? 1000 / options.idleFps : Infinity;
    let wanted = true;
    let holds = 0;
    let last = 0;
    const invalidate = () => {
        wanted = true;
    };
    const frame = () => {
        const now = performance.now();

        if (wanted || holds > 0 || now - last >= idleMs) {
            wanted = false;
            last = now;
            stats.rendered++;
            app.render();
        } else stats.skipped++;
    };

    app.ticker.remove(app.render, app);
    app.ticker.add(frame, null, UPDATE_PRIORITY.LOW);
    app.renderer.on('resize', invalidate);
    silkFrames.request = invalidate;

    return {
        invalidate,
        hold() {
            holds++;
            wanted = true;
            let done = false;

            return () => {
                if (done) return;
                done = true;
                holds--;
                wanted = true;
            };
        },
        stats,
        destroy() {
            app.ticker.remove(frame, null);
            app.renderer.off('resize', invalidate);
            app.ticker.add(app.render, app, UPDATE_PRIORITY.LOW);
            if (silkFrames.request === invalidate) silkFrames.request = null;
        },
    };
}

/**
 * A guess at a weak device from what the browser tells: 4 or fewer cores, 4 GB or less of
 * memory, or a small screen with a high pixel ratio. Returns false where it cannot tell.
 */
export function isLowEndDevice(): boolean {
    if (typeof navigator === 'undefined') return false;
    const nav = navigator as Navigator & { deviceMemory?: number };
    const cores = nav.hardwareConcurrency ?? 8;
    const memory = nav.deviceMemory ?? 8;
    const small = typeof screen !== 'undefined' && Math.min(screen.width, screen.height) <= 420;
    const dense = typeof devicePixelRatio === 'number' && devicePixelRatio >= 3;

    return cores <= 4 || memory <= 4 || (small && dense);
}

/** Options of {@link enableLowEnd}. */
export interface LowEndOptions {
    /** `'auto'` turns the preset on only when {@link isLowEndDevice} says so. Default `true`: always. */
    when?: boolean | 'auto';
    /** Highest renderer resolution. Distance fields stay sharp at a lower one. Default 1.5. */
    maxResolution?: number;
    /** Render only frames that change, with {@link renderOnDemand}. Default true. */
    renderOnDemand?: boolean;
}

/** What {@link enableLowEnd} returns. */
export interface LowEnd {
    /** Whether the preset is on (false when `when: 'auto'` found a strong device). */
    readonly on: boolean;
    /** The frame gate, when `renderOnDemand` is on. Hold it while reels spin. */
    readonly gate: FrameGate | null;
    /** Turns the preset off: resolution, frame gate and block settings go back. */
    disable(): void;
}

/**
 * One switch for weak devices. It caps the renderer resolution and renders only frames that
 * change. Pass the {@link SilkApp} when you made the application with `createSilkApp`, so the
 * cap holds when the window resizes. With a plain Application the cap holds until something else
 * sets the resolution. Blocks made after it, in `pixi-silk/ui/blocks`, use their cheap look: flat buttons
 * (one shape and no blur), panels without corner smoothing, and repaints at 30 frames per second.
 * Call it once, after the application starts and before you build the UI.
 *
 * @example
 * ```ts
 * import { enableLowEnd } from 'pixi-silk';
 *
 * const lowEnd = enableLowEnd(app, { when: 'auto' });
 * ```
 */
export function enableLowEnd(target: Application | SilkApp, options: LowEndOptions = {}): LowEnd {
    const when = options.when ?? true;
    const on = when === 'auto' ? isLowEndDevice() : when;

    if (!on) return { on: false, gate: null, disable() {} };
    const silk = 'setResolution' in target ? target : null;
    const app = silk ? silk.app : (target as Application);
    const before = app.renderer.resolution;
    const cap = options.maxResolution ?? 1.5;
    const capped = before > cap;

    if (capped && silk) silk.setResolution(cap);
    else if (capped) app.renderer.resize(app.renderer.screen.width, app.renderer.screen.height, cap);
    const gate = options.renderOnDemand === false ? null : renderOnDemand(app);

    silkFrames.lowEnd = true;

    return {
        on: true,
        gate,
        disable() {
            silkFrames.lowEnd = false;
            gate?.destroy();
            if (capped && silk) silk.setResolution(null);
            else if (capped) app.renderer.resize(app.renderer.screen.width, app.renderer.screen.height, before);
        },
    };
}
