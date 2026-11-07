/** Angle and value maths shared by the dials, rings and gizmos. Angles are radians. */

export const TAU: number = Math.PI * 2;

/** Signed shortest difference between two angles, in -PI..PI. */
export function angleDelta(a: number, b: number): number {
    let d = (a - b) % TAU;

    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;

    return d;
}

/** Angle in 0..TAU. */
export function wrapAngle(a: number): number {
    return ((a % TAU) + TAU) % TAU;
}

/** Rounds `value` to the nearest multiple of `step` (no-op for step 0). */
export function snapTo(value: number, step: number, origin = 0): number {
    return step > 0 ? origin + Math.round((value - origin) / step) * step : value;
}

/** Clamps `v` to `min..max`. */
export function clamp(v: number, min: number, max: number): number {
    return v < min ? min : v > max ? max : v;
}

/**
 * Follows a pointer around a centre and counts full turns, so dragging past the seam keeps
 * adding up instead of jumping back by a turn. `total` is the angle travelled since `reset`.
 */
export class AngleAccumulator {
    /** Angle travelled since the last reset, any size, signed (positive is clockwise on screen). */
    total = 0;
    private _last = 0;

    /** Starts counting from the direction of (x, y). */
    reset(x: number, y: number): void {
        this._last = Math.atan2(y, x);
        this.total = 0;
    }

    /** Adds the turn towards (x, y) and returns the step taken. */
    push(x: number, y: number): number {
        const a = Math.atan2(y, x);
        const step = angleDelta(a, this._last);

        this._last = a;
        this.total += step;

        return step;
    }
}

/**
 * Soft limit: inside `min..max` the value passes through, past a limit it keeps moving but slows
 * down and never goes further than `limit` beyond it (the rubber band of scroll views).
 */
export function rubberBand(value: number, min: number, max: number, limit: number): number {
    if (limit <= 0) return clamp(value, min, max);
    if (value > max) return max + limit * (1 - Math.exp(-(value - max) / limit));
    if (value < min) return min - limit * (1 - Math.exp(-(min - value) / limit));

    return value;
}
