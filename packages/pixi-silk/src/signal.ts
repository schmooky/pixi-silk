/**
 * A minimal reactive store: a value you can read, set and watch. It has no proxies, no automatic
 * dependency tracking and no scheduler. Listeners run synchronously, or once at the end of a
 * {@link batch}. UI widgets expose their state as signals
 * so an app can bind to them from anywhere (React, MobX, a plain callback) without a framework.
 */

/** Called with the new and the previous value. */
export type Listener<T> = (value: T, previous: T) => void;

/** A value you can read and watch. */
export interface ReadSignal<T> {
    /** Current value. */
    readonly value: T;
    /** Calls `fn` on every change, not with the current value. Returns the unsubscribe function. */
    subscribe(fn: Listener<T>): () => void;
}

/** A value you can read, watch and change. */
export interface Signal<T> extends ReadSignal<T> {
    /** Current value. Assigning an equal value does nothing, otherwise listeners run. */
    value: T;
    /** Same as assigning `value`. */
    set(value: T): void;
    /** Sets the value to `fn(current)`. */
    update(fn: (value: T) => T): void;
}

/** A derived signal. `dispose()` stops it following its sources. */
export interface Computed<T> extends ReadSignal<T> {
    /** Unsubscribes from the sources. The value then stays as it is. */
    dispose(): void;
}

let depth = 0;
const queued = new Set<() => void>();

/**
 * Runs `fn` and delivers the change notifications once, after it returns, even if it throws.
 * A signal set several times notifies once, with the value from before the batch as `previous`.
 * It notifies nothing if it ends equal to that value. Batches nest.
 */
export function batch<R>(fn: () => R): R {
    depth++;
    try {
        return fn();
    } finally {
        if (--depth === 0) {
            const jobs = [...queued];

            queued.clear();
            for (const job of jobs) job();
        }
    }
}

/**
 * Creates a signal. `equals` decides when a write is a change (default `Object.is`), so mutating
 * an object in place and setting it again notifies nobody. Set a new object instead.
 */
export function signal<T>(initial: T, equals: (a: T, b: T) => boolean = Object.is): Signal<T> {
    let current = initial;
    let notified = initial;
    const listeners = new Set<Listener<T>>();
    const flush = () => {
        const previous = notified;

        notified = current;
        if (equals(previous, current)) return;
        for (const fn of [...listeners]) fn(current, previous);
    };
    const set = (value: T) => {
        if (equals(current, value)) return;
        current = value;
        if (depth > 0) queued.add(flush);
        else flush();
    };

    return {
        get value() {
            return current;
        },
        set value(value: T) {
            set(value);
        },
        set,
        update: (fn) => set(fn(current)),
        subscribe(fn) {
            listeners.add(fn);

            return () => listeners.delete(fn);
        },
    };
}

/**
 * Derives a signal from others: `fn` runs now and again whenever one of the `sources` changes.
 * Only the listed sources are followed. Call `dispose()` when you no longer need it.
 */
export function computed<T>(sources: readonly ReadSignal<unknown>[], fn: () => T): Computed<T> {
    const out = signal(fn());
    const stops = sources.map((s) => s.subscribe(() => out.set(fn())));

    return {
        get value() {
            return out.value;
        },
        subscribe: out.subscribe,
        dispose: () => {
            for (const stop of stops) stop();
        },
    };
}

/** Calls `fn` now and on every change of `source`. Returns the unsubscribe function. */
export function watch<T>(source: ReadSignal<T>, fn: (value: T) => void): () => void {
    fn(source.value);

    return source.subscribe(fn);
}
