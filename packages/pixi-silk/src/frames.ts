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
 * otherwise. A SilkGraphics calls it when it is redrawn, a widget while it animates, and a
 * BlockSurface when it paints, so they need no extra code.
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
    /** Renders after pointer and wheel events on the canvas and key presses, so hover and focus show. Default true. */
    input?: boolean;
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
 * canvas keeps showing the last frame.
 *
 * A frame is drawn after `invalidate()` or `requestFrame()`, and while a `hold()` is open. A
 * resize and input on the canvas draw one too.
 *
 * pixi-silk asks on its own: a SilkGraphics when it is redrawn, the `pixi-silk/ui` widgets while
 * they animate, and a BlockSurface when it paints.
 *
 * Anything else that changes needs a call. Moving or fading a display object (`x`, `alpha`), a
 * Pixi `Text` or `Graphics`, reels, a Spine skeleton or a video: call `invalidate()` after the
 * change, or `hold()` while it plays. One gate per page: a second call makes a new gate, and the
 * first one stops answering `requestFrame`.
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

    const input = options.input !== false;
    const canvas = app.canvas as HTMLCanvasElement | undefined;
    const events = ['pointerdown', 'pointermove', 'pointerup', 'pointerleave', 'wheel'] as const;
    const keys = typeof window === 'undefined' ? null : window;

    app.ticker.remove(app.render, app);
    app.ticker.add(frame, null, UPDATE_PRIORITY.LOW);
    app.renderer.on('resize', invalidate);
    if (input) {
        for (const e of events) canvas?.addEventListener?.(e, invalidate, { passive: true });
        keys?.addEventListener('keydown', invalidate);
    }
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
            if (input) {
                for (const e of events) canvas?.removeEventListener?.(e, invalidate);
                keys?.removeEventListener('keydown', invalidate);
            }
            app.ticker.add(app.render, app, UPDATE_PRIORITY.LOW);
            if (silkFrames.request === invalidate) silkFrames.request = null;
        },
    };
}

/** Options of {@link enableLowEnd}. */
export interface LowEndOptions {
    /** Highest renderer resolution. Distance fields stay sharp at a lower one. Default 1.5. */
    maxResolution?: number;
    /** Render only frames that change, with {@link renderOnDemand}. Default true. */
    renderOnDemand?: boolean;
}

/** What {@link enableLowEnd} returns. */
export interface LowEnd {
    /** The frame gate, when `renderOnDemand` is on. Hold it while reels spin. */
    readonly gate: FrameGate | null;
    /** Turns the preset off: resolution, frame gate and block settings go back. */
    disable(): void;
}

/**
 * One switch for weak devices, turned on by hand: it does not guess the device. Call it when
 * your game decides it runs on a weak device, from a setting or a list of devices you trust. It
 * caps the renderer resolution and renders only frames that change. Pass the {@link SilkApp} when you made the application with `createSilkApp`, so the
 * cap holds when the window resizes. With a plain Application the cap holds until something else
 * sets the resolution. Blocks made after it, in `pixi-silk/ui/blocks`, use their cheap look: flat buttons
 * (one shape and no blur), panels without corner smoothing, and repaints at 30 frames per second.
 * Call it once, after the application starts and before you build the UI.
 *
 * @example
 * ```ts
 * import { enableLowEnd } from 'pixi-silk';
 *
 * // from a quality setting the player or your device list chose
 * const lowEnd = enableLowEnd(app);
 * ```
 */
export function enableLowEnd(target: Application | SilkApp, options: LowEndOptions = {}): LowEnd {
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
        gate,
        disable() {
            silkFrames.lowEnd = false;
            gate?.destroy();
            if (capped && silk) silk.setResolution(null);
            else if (capped) app.renderer.resize(app.renderer.screen.width, app.renderer.screen.height, before);
        },
    };
}
