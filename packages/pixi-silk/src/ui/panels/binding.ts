import type { ReadSignal } from '../../signal';

/**
 * Where an inspector reads and writes values. `read` returns one value per edited object, so a
 * multi-selection shows mixed values. Write your own to edit a store, or use {@link bindObjects}
 * and {@link bindSignals}.
 */
export interface InspectorBinding {
    /** The values of `key`, one per edited object. Empty when nothing is edited. */
    read(key: string): readonly unknown[];
    /** Writes one value per edited object, in the order `read` returned them. */
    write(key: string, values: readonly unknown[]): void;
    /** Calls `fn` when values change outside the inspector. Returns the unsubscribe function. */
    subscribe?(fn: () => void): () => void;
}

/** The value at a dot path such as `position.x`. Undefined when a step on the way is missing. */
export function getPath(target: unknown, path: string): unknown {
    let v: unknown = target;

    for (const part of path.split('.')) {
        if (v === null || v === undefined) return undefined;
        v = (v as Record<string, unknown>)[part];
    }

    return v;
}

/** Sets the value at a dot path such as `position.x`. Missing objects on the way are not created, and the write is skipped. */
export function setPath(target: unknown, path: string, value: unknown): void {
    const parts = path.split('.');
    const last = parts.pop() as string;
    const owner = parts.length ? getPath(target, parts.join('.')) : target;

    if (owner !== null && typeof owner === 'object') (owner as Record<string, unknown>)[last] = value;
}

/**
 * Edits plain objects or display objects. Keys are dot paths, such as `position.x`, `alpha` or
 * `style.fill`. Pass the selection's items to edit several objects at once. The list is copied.
 * The binding does not watch the objects: call `Inspector.refresh` after changing them elsewhere.
 *
 * @example
 * ```ts
 * inspector.bind(bindObjects(selection.items));
 * ```
 */
export function bindObjects(targets: readonly object[]): InspectorBinding {
    const list = [...targets];

    return {
        read: (key) => list.map((t) => getPath(t, key)),
        write: (key, values) => {
            list.forEach((t, i) => {
                setPath(t, key, values[Math.min(i, values.length - 1)]);
            });
        },
    };
}

/** A signal the inspector can write. */
export interface WritableSignal<T = unknown> extends ReadSignal<T> {
    /** Replaces the value and notifies subscribers. */
    set(value: T): void;
}

/**
 * Edits signals, one per key: a settings panel for app state. Changes made elsewhere show in
 * the inspector at once.
 *
 * @example
 * ```ts
 * const settings = { grid: signal(8), snap: signal(true) };
 *
 * inspector.bind(bindSignals(settings));
 * ```
 */
export function bindSignals(
    signals: Readonly<Record<string, WritableSignal<never> | WritableSignal>>,
): InspectorBinding {
    const of = (key: string) => signals[key] as WritableSignal | undefined;

    return {
        read: (key) => {
            const s = of(key);

            return s ? [s.value] : [];
        },
        write: (key, values) => {
            const s = of(key);

            if (s && values.length) s.set(values[0]);
        },
        subscribe: (fn) => {
            const stops = Object.values(signals).map((s) => (s as WritableSignal).subscribe(fn));

            return () => {
                for (const stop of stops) stop();
            };
        },
    };
}

/** What a field shows for a list of values: the shared value, or `mixed` when they differ. */
export interface FieldValue<T = unknown> {
    /** The shared value, or the first one when mixed. Undefined when there are none. */
    value: T | undefined;
    /** True when the values differ. */
    mixed: boolean;
    /** True when there are no values: nothing is edited. */
    empty: boolean;
}

/** Folds the values of a multi-selection into what one field shows. Numbers within `epsilon` count as equal. */
export function fieldValue<T = unknown>(values: readonly unknown[], epsilon = 1e-9): FieldValue<T> {
    if (!values.length) return { value: undefined, mixed: false, empty: true };
    const first = values[0];
    const mixed = values.some((v) =>
        typeof v === 'number' && typeof first === 'number' ? Math.abs(v - first) > epsilon : v !== first,
    );

    return { value: first as T, mixed, empty: false };
}
