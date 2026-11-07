import type { FederatedPointerEvent } from 'pixi.js';

/** Kind of pointer driving a widget. */
export type InputKind = 'mouse' | 'pen' | 'touch';

/**
 * How forgiving a widget is for one kind of pointer. Fingers are fat and shaky, mice are precise:
 * the same menu gets a bigger dead zone, a longer falloff and larger targets under a finger.
 * Distances are in screen pixels.
 */
export interface InputProfile {
    /** Radius around the centre where nothing is picked (the cancel zone). */
    deadzone: number;
    /** How far past the outer edge the pointer still steers the selection. `Infinity` never lets go. */
    falloff: number;
    /** Size multiplier for the widget's targets. */
    scale: number;
    /** A press shorter than this, that moved less than `slop`, is a tap. */
    tapMs: number;
    /** Movement allowed before a press stops being a tap, and the extra hit margin of buttons. */
    slop: number;
    /** Grace time before a pointer that left the falloff area closes a widget (when it closes on leave). */
    leaveDelayMs: number;
    /** Angle (radians) the pointer must pass a boundary by before the selection switches. Kills flicker. */
    hysteresis: number;
}

/** Defaults per pointer kind. */
export const INPUT_PROFILES: Readonly<Record<InputKind, Readonly<InputProfile>>> = {
    mouse: { deadzone: 14, falloff: 120, scale: 1, tapMs: 220, slop: 4, leaveDelayMs: 400, hysteresis: 0.03 },
    pen: { deadzone: 16, falloff: 140, scale: 1, tapMs: 240, slop: 6, leaveDelayMs: 500, hysteresis: 0.04 },
    touch: { deadzone: 24, falloff: 220, scale: 1.18, tapMs: 280, slop: 12, leaveDelayMs: 700, hysteresis: 0.07 },
};

/** Per-kind overrides of {@link INPUT_PROFILES}. */
export type InputProfiles = Partial<Record<InputKind, Partial<InputProfile>>>;

/** The kind of pointer behind an event (unknown kinds count as mouse). */
export function inputKind(e: Pick<FederatedPointerEvent, 'pointerType'>): InputKind {
    return e.pointerType === 'touch' || e.pointerType === 'pen' ? e.pointerType : 'mouse';
}

/** Default profile for `kind` with `overrides` applied. */
export function inputProfile(kind: InputKind, overrides?: InputProfiles): InputProfile {
    return { ...INPUT_PROFILES[kind], ...overrides?.[kind] };
}

/** Guess for the device before any pointer arrives: touch on coarse-pointer screens. */
export function preferredInputKind(): InputKind {
    if (typeof matchMedia !== 'function') return 'mouse';

    return matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse';
}
