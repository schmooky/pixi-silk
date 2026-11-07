import type { Container, FederatedPointerEvent, Point, PointData } from 'pixi.js';
import { type InputKind, type InputProfiles, inputKind, inputProfile } from './input';

/** A point in the gesture's space plus the event behind it. */
export interface GesturePoint {
    x: number;
    y: number;
    /** Movement since the press. */
    dx: number;
    dy: number;
    kind: InputKind;
    /** Copied from the event, so a point stays valid after Pixi reuses the event object. */
    pointerId: number;
    pointerType: string;
    buttons: number;
    /** Position on the canvas (a copy). */
    global: Point;
    /** The live event. Pixi pools events: read it inside the callback only. */
    event: FederatedPointerEvent;
}

/** Callbacks of {@link trackGesture}. Every one is optional. */
export interface GestureHandlers {
    /** Pointer went down (before the gesture is known). */
    onDown?: (p: GesturePoint) => void;
    /** Short press that did not move. */
    onTap?: (p: GesturePoint) => void;
    /** Press held still for `holdMs`. A hold that then moves continues as a drag. */
    onHold?: (p: GesturePoint) => void;
    /** Fast release after a short move. `angle` points the way of the flick, `speed` in units per second. */
    onFlick?: (p: GesturePoint, angle: number, speed: number) => void;
    /** Movement passed the slop. */
    onDragStart?: (p: GesturePoint) => void;
    onDrag?: (p: GesturePoint) => void;
    /** Drag ended (release, or the pointer was lost). */
    onDragEnd?: (p: GesturePoint) => void;
    /** Pointer went up, whatever the gesture was. */
    onUp?: (p: GesturePoint) => void;
}

/** Options of {@link trackGesture}. */
export interface GestureOptions {
    /** Coordinates are reported in this container's space. Default: the target's parent, else the target. */
    space?: Container;
    /** Long-press time. Default 420 ms. `0` turns holds off. */
    holdMs?: number;
    /** Minimum speed of a flick, units per second. Default 700. `0` turns flicks off. */
    flickSpeed?: number;
    /** Mouse buttons that start a gesture (0 left, 1 middle, 2 right). Default [0]. */
    buttons?: number[];
    profiles?: InputProfiles;
}

/**
 * Reads tap, hold, flick and drag from one target, with the slop and timing of the pointer kind
 * (fingers get more room than mice). The drag keeps going when the pointer leaves the target.
 * Returns a function that stops tracking.
 */
export function trackGesture(target: Container, handlers: GestureHandlers, options: GestureOptions = {}): () => void {
    const { holdMs = 420, flickSpeed = 700, buttons = [0] } = options;
    let id = -1;
    let start = { x: 0, y: 0 };
    let t0 = 0;
    let dragging = false;
    let held = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let slop = 4;
    let tapMs = 220;
    // recent samples for the flick speed
    let trail: { x: number; y: number; t: number }[] = [];

    const space = () => options.space ?? target.parent ?? target;
    const point = (e: FederatedPointerEvent): GesturePoint => {
        const p: PointData = space().toLocal(e.global);

        return {
            x: p.x,
            y: p.y,
            dx: p.x - start.x,
            dy: p.y - start.y,
            kind: inputKind(e),
            pointerId: e.pointerId,
            pointerType: e.pointerType,
            buttons: e.buttons,
            global: e.global.clone(),
            event: e,
        };
    };
    const clearTimer = () => {
        if (timer) clearTimeout(timer);
        timer = null;
    };

    const onDown = (e: FederatedPointerEvent) => {
        if (id >= 0) return;
        if (inputKind(e) === 'mouse' && !buttons.includes(e.button)) return;
        const kind = inputKind(e);
        const profile = inputProfile(kind, options.profiles);

        id = e.pointerId;
        slop = profile.slop;
        tapMs = profile.tapMs;
        start = space().toLocal(e.global);
        t0 = performance.now();
        dragging = false;
        held = false;
        trail = [{ x: start.x, y: start.y, t: t0 }];
        const p = point(e);

        handlers.onDown?.(p);
        if (holdMs > 0 && handlers.onHold) {
            timer = setTimeout(() => {
                timer = null;
                held = true;
                handlers.onHold?.(p);
            }, holdMs);
        }
    };
    const onMove = (e: FederatedPointerEvent) => {
        if (e.pointerId !== id) return;
        const p = point(e);
        const now = performance.now();

        trail.push({ x: p.x, y: p.y, t: now });
        while (trail.length > 2 && now - trail[0].t > 80) trail.shift();
        if (!dragging && Math.hypot(p.dx, p.dy) > slop) {
            dragging = true;
            clearTimer();
            handlers.onDragStart?.(p);
        }
        if (dragging) handlers.onDrag?.(p);
    };
    const onUp = (e: FederatedPointerEvent) => {
        if (e.pointerId !== id) return;
        const p = point(e);
        const now = performance.now();

        id = -1;
        clearTimer();
        if (dragging) {
            const first = trail[0];
            const dt = Math.max(1, now - first.t) / 1000;
            const vx = (p.x - first.x) / dt;
            const vy = (p.y - first.y) / dt;
            const speed = Math.hypot(vx, vy);

            handlers.onDragEnd?.(p);
            if (flickSpeed > 0 && speed >= flickSpeed && now - t0 < 450) {
                handlers.onFlick?.(p, Math.atan2(vy, vx), speed);
            }
        } else if (!held && now - t0 < Math.max(tapMs, 260)) {
            handlers.onTap?.(p);
        }
        handlers.onUp?.(p);
    };

    if (target.eventMode === 'none' || target.eventMode === 'passive' || target.eventMode === 'auto') {
        target.eventMode = 'static';
    }
    target.on('pointerdown', onDown);
    target.on('globalpointermove', onMove);
    target.on('pointerup', onUp);
    target.on('pointerupoutside', onUp);

    return () => {
        clearTimer();
        target.off('pointerdown', onDown);
        target.off('globalpointermove', onMove);
        target.off('pointerup', onUp);
        target.off('pointerupoutside', onUp);
    };
}
