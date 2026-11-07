/**
 * Keyboard state shared by widgets: modifiers for snapping and fine control, held keys for
 * hold-to-show tools. Listens on `window` from the first call on, once per page.
 */

const held = new Set<string>();
const listeners = new Set<(code: string, down: boolean, e: KeyboardEvent) => void>();
let installed = false;

function install(): void {
    if (installed || typeof window === 'undefined') return;
    installed = true;
    window.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        held.add(e.code);
        for (const fn of [...listeners]) fn(e.code, true, e);
    });
    window.addEventListener('keyup', (e) => {
        held.delete(e.code);
        for (const fn of [...listeners]) fn(e.code, false, e);
    });
    // a key released while the window had no focus never sends keyup
    window.addEventListener('blur', () => {
        for (const code of [...held]) {
            held.delete(code);
            for (const fn of [...listeners]) fn(code, false, new KeyboardEvent('keyup', { code }));
        }
    });
}

/** True while the key with this `KeyboardEvent.code` is down (e.g. `ShiftLeft`, `KeyR`, `Space`). */
export function isKeyDown(code: string): boolean {
    install();

    return held.has(code);
}

/** True while either Shift is down. */
export function shiftDown(): boolean {
    return isKeyDown('ShiftLeft') || isKeyDown('ShiftRight');
}

/** True while either Alt / Option is down. */
export function altDown(): boolean {
    return isKeyDown('AltLeft') || isKeyDown('AltRight');
}

/** True while either Control or Meta (Command) is down. */
export function modDown(): boolean {
    return isKeyDown('ControlLeft') || isKeyDown('ControlRight') || isKeyDown('MetaLeft') || isKeyDown('MetaRight');
}

/** Calls `fn` on every key press and release. Returns the unsubscribe function. */
export function onKey(fn: (code: string, down: boolean, e: KeyboardEvent) => void): () => void {
    install();
    listeners.add(fn);

    return () => listeners.delete(fn);
}
