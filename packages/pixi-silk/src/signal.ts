/**
 * The smallest reactive store that does the job: a value you can read, set and watch.
 * No proxies, no dependency tracking, no scheduler. UI widgets expose their state as signals
 * so an app can bind to them from anywhere (React, MobX, a plain callback) without a framework.
 */

/** Called with the new and the previous value. */
export type Listener<T> = (value: T, previous: T) => void;

/** A value you can read and watch. */
export interface ReadSignal<T> {
    /** Current value. */
    readonly value: T;
    /** Calls `fn` on every change. Returns the unsubscribe function. */
    subscribe(fn: Listener<T>): () => void;
}

/** A value you can read, watch and change. */
export interface Signal<T> extends ReadSignal<T> {
    value: T;
    /** Same as assigning `value`. */
    set(value: T): void;
    /** Sets the value from the current one. */
    update(fn: (value: T) => T): void;
}

/** A derived signal. `dispose()` stops it following its sources. */
export interface Computed<T> extends ReadSignal<T> {
    dispose(): void;
}

let depth = 0;
const queued = new Set<() => void>();

/** Runs `fn` and delivers the change notifications once, after it returns. */
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

/** Creates a signal. `equals` decides when a write is a change (default `Object.is`). */
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

/** Derives a signal from others: `fn` runs again whenever one of the `sources` changes. */
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
