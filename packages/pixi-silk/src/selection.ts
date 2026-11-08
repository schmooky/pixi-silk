/**
 * A small selection store for editors: what is selected (in order), what is hovered and which
 * item is primary. It is built on the library's signals, has no visuals and works for any item
 * type. Adapters make an outline, a transform gizmo or a measure follow it with one call each.
 */
import { type ReadSignal, type Signal, signal } from './signal';

/** How a pick changes the selection. */
export type SelectMode = 'replace' | 'add' | 'remove' | 'toggle';

/** What one change did, as {@link Selection.onChange} reports it. */
export interface SelectionChange<T> {
    /** The selection after the change, in order. */
    items: readonly T[];
    /** Items that joined. */
    added: readonly T[];
    /** Items that left. */
    removed: readonly T[];
    /** The primary item after the change. */
    primary: T | null;
}

/** Options of {@link Selection}. */
export interface SelectionOptions<T> {
    /** Items selected at the start. */
    items?: readonly T[];
    /** Allow more than one item. Default true. With false, every add replaces. */
    multiple?: boolean;
    /** Which items may be selected at all, such as unlocked layers. Default all. */
    filter?: (item: T) => boolean;
}

/** The signals of a {@link Selection}. */
export interface SelectionState<T> {
    /** Selected items, in the order they were picked. */
    items: ReadSignal<readonly T[]>;
    /** The item the gizmo and the inspector work on: the last one picked, or the one passed to `focus()`. */
    primary: ReadSignal<T | null>;
    /** The item under the pointer. Set it from your pointer handlers. */
    hovered: Signal<T | null>;
}

const sameList = <T>(a: readonly T[], b: readonly T[]): boolean =>
    a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * The selected set of an editor, ordered by when each item was picked.
 *
 * ```ts
 * const selection = new Selection<Container>();
 *
 * item.on('pointerdown', (e) => selection.pick(item, e.shiftKey ? 'toggle' : 'replace'));
 * selection.onChange(({ added, removed }) => console.log(added, removed));
 * ```
 */
export class Selection<T = unknown> {
    /** Selected items, primary item and hovered item, as signals. */
    readonly state: SelectionState<T>;
    /** Allow more than one item. Change it at any time. */
    multiple: boolean;
    private readonly _items: Signal<readonly T[]>;
    private readonly _primary: Signal<T | null>;
    private readonly _filter: (item: T) => boolean;
    private readonly _listeners = new Set<(change: SelectionChange<T>) => void>();

    constructor(options: SelectionOptions<T> = {}) {
        this.multiple = options.multiple ?? true;
        this._filter = options.filter ?? (() => true);
        const start = (options.items ?? []).filter(this._filter);

        this._items = signal<readonly T[]>(this.multiple ? start : start.slice(-1), sameList);
        this._primary = signal<T | null>(this._items.value.at(-1) ?? null);
        this.state = { items: this._items, primary: this._primary, hovered: signal<T | null>(null) };
    }

    /** Selected items, in order. */
    get items(): readonly T[] {
        return this._items.value;
    }

    /** The primary item, or null when nothing is selected. */
    get primary(): T | null {
        return this._primary.value;
    }

    /** How many items are selected. */
    get size(): number {
        return this._items.value.length;
    }

    /** True when `item` is selected. */
    has(item: T): boolean {
        return this._items.value.includes(item);
    }

    /** Adds items at the end. The last one becomes primary. */
    add(...items: T[]): this {
        return this._apply(items, 'add');
    }

    /** Removes items. */
    remove(...items: T[]): this {
        return this._apply(items, 'remove');
    }

    /** Selects `item` if it is not selected and deselects it if it is. */
    toggle(item: T): this {
        return this._apply([item], 'toggle');
    }

    /** Makes `items` the whole selection. */
    replace(items: readonly T[]): this {
        return this._apply(items, 'replace');
    }

    /** Deselects everything. */
    clear(): this {
        return this._apply([], 'replace');
    }

    /** Applies one pick, the way a click does: replace, or add, remove or toggle with Shift. */
    pick(item: T | null, mode: SelectMode = 'replace'): this {
        return this._apply(item === null ? [] : [item], mode);
    }

    /** Selects the items of `pool` that pass `test`, such as everything inside a marquee. */
    selectWhere(pool: Iterable<T>, test: (item: T) => boolean, mode: SelectMode = 'replace'): this {
        return this._apply([...pool].filter(test), mode);
    }

    /** Makes a selected item primary without changing the set. Selects it first when it is not. */
    focus(item: T): this {
        if (!this.has(item)) this.add(item);
        if (!this.has(item) || this._primary.value === item) return this;
        this._primary.set(item);
        this._emit([], []);

        return this;
    }

    /** Calls `fn` after every change, with what joined and what left. Returns the unsubscribe function. */
    onChange(fn: (change: SelectionChange<T>) => void): () => void {
        this._listeners.add(fn);

        return () => this._listeners.delete(fn);
    }

    private _apply(input: readonly T[], mode: SelectMode): this {
        const picked = input.filter(this._filter);
        const before = this._items.value;
        let next: T[];

        if (mode === 'replace') next = [...new Set(picked)];
        else if (mode === 'add') next = [...before.filter((v) => !picked.includes(v)), ...picked];
        else if (mode === 'remove') next = before.filter((v) => !picked.includes(v));
        else {
            next = [...before];
            for (const item of picked) {
                const i = next.indexOf(item);

                if (i >= 0) next.splice(i, 1);
                else next.push(item);
            }
        }
        if (!this.multiple && next.length > 1) next = next.slice(-1);
        const added = next.filter((v) => !before.includes(v));
        const removed = before.filter((v) => !next.includes(v));
        const keep = this._primary.value;
        // the last item picked becomes primary. Otherwise the primary item stays while it is selected
        const chosen = mode === 'remove' ? undefined : picked.filter((v) => next.includes(v)).at(-1);
        const primary =
            chosen !== undefined ? chosen : keep !== null && next.includes(keep) ? keep : (next.at(-1) ?? null);

        if (sameList(before, next) && primary === keep) return this;
        this._items.set(next);
        this._primary.set(primary);
        this._emit(added, removed);

        return this;
    }

    private _emit(added: readonly T[], removed: readonly T[]): void {
        const change = { items: this._items.value, added, removed, primary: this._primary.value };

        for (const fn of [...this._listeners]) fn(change);
    }
}

// ------------------------------------------------------------------------------------- adapters

/** What {@link bindOutline} needs from an outline, such as `SelectionOutline`. */
export interface OutlineLike<T> {
    select(targets: readonly T[] | null): void;
    hover(target: T | null): void;
}

/** What {@link bindGizmo} needs from a gizmo, such as `TransformGizmo`. */
export interface GizmoLike<T> {
    attach(target: T | null): void;
}

/** What {@link bindMeasure} needs from a measure, such as `Measure`. */
export interface MeasureLike<T> {
    size(target: T | null): unknown;
    between(a: T | null, b: T | null): unknown;
}

/**
 * Frames the selection with `outline`. Pass a second outline to show the hovered item too, while
 * it is not selected. Returns the function that stops following.
 */
export function bindOutline<T>(selection: Selection<T>, outline: OutlineLike<T>, hover?: OutlineLike<T>): () => void {
    const sync = () => {
        const items = selection.items;
        const over = selection.state.hovered.value;

        outline.select(items.length ? items : null);
        hover?.hover(over !== null && !selection.has(over) ? over : null);
    };
    const stops = [selection.state.items.subscribe(sync), selection.state.hovered.subscribe(sync)];

    sync();

    return () => {
        for (const stop of stops) stop();
    };
}

/** Options of {@link bindGizmo}. */
export interface BindGizmoOptions {
    /** What a selection of several items attaches: the primary item (default) or nothing. */
    multiple?: 'primary' | 'none';
}

/** Attaches `gizmo` to the primary item. Returns the function that stops following. */
export function bindGizmo<T>(selection: Selection<T>, gizmo: GizmoLike<T>, options: BindGizmoOptions = {}): () => void {
    const sync = () => {
        const several = selection.size > 1 && options.multiple === 'none';

        gizmo.attach(several ? null : selection.primary);
    };
    const stops = [selection.state.items.subscribe(sync), selection.state.primary.subscribe(sync)];

    sync();

    return () => {
        for (const stop of stops) stop();
    };
}

/** Options of {@link bindMeasure}. */
export interface BindMeasureOptions {
    /** Show the primary item's size badge. Default true. */
    size?: boolean;
    /** Measure from the primary item to the hovered one. Default true. Return false from a function to hide them, such as until Alt is held. */
    between?: boolean | (() => boolean);
}

/**
 * Shows the primary item's size and the distances to the hovered item with `measure`. Call the
 * returned `sync` again when a condition of `between` changes (a modifier key). The returned
 * `stop` stops following.
 */
export function bindMeasure<T>(
    selection: Selection<T>,
    measure: MeasureLike<T>,
    options: BindMeasureOptions = {},
): { sync: () => void; stop: () => void } {
    const sync = () => {
        const primary = selection.primary;
        const over = selection.state.hovered.value;
        const rule = options.between ?? true;
        const show = typeof rule === 'function' ? rule() : rule;
        const pair = show && primary !== null && over !== null && over !== primary;

        if (options.size !== false) measure.size(primary);
        measure.between(pair ? primary : null, pair ? over : null);
    };
    const stops = [
        selection.state.items.subscribe(sync),
        selection.state.primary.subscribe(sync),
        selection.state.hovered.subscribe(sync),
    ];

    sync();

    return {
        sync,
        stop: () => {
            for (const stop of stops) stop();
        },
    };
}
