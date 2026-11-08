/**
 * Undo and redo for editors. Widgets talk to a {@link HistoryLike}, three methods any undo system
 * can provide. An app can keep its own store, such as a state library or a patch log.
 * The default is {@link History}, an in-memory command stack. And {@link recordSignals}
 * makes signal changes undoable without writing commands.
 */
import { batch, type ReadSignal, type Signal, signal } from './signal';
import { isTypingTarget } from './ui/keys';

/** One undoable change. */
export interface Command {
    /** Shown in menus and buttons: "Undo Move". */
    label?: string;
    /** Applies the change (redo calls it again). */
    do(): void;
    /** Reverts it. */
    undo(): void;
    /**
     * Folds `next` into this command and returns true, or returns false to keep them apart.
     * `grouped` is true inside a transaction. Lets typing or nudges become one step.
     */
    merge?(next: Command, grouped: boolean): boolean;
}

/**
 * What undoable widgets need from a history. Implement it to plug in your own store: `record`
 * gets changes that are already applied, `begin` and `end` bracket a gesture such as a drag.
 */
export interface HistoryLike {
    /** Records a change that is already applied. */
    record(command: Command): void;
    /** Opens a transaction: what is recorded until `end()` becomes one step. Nests. */
    begin(label?: string): void;
    /** Closes the transaction opened last. */
    end(): void;
}

/** One entry of the stack: a label and the commands it undoes together. */
export interface HistoryStep {
    readonly label: string;
    readonly commands: readonly Command[];
}

/** Options of {@link History}. */
export interface HistoryOptions {
    /** Steps kept. The oldest fall off. Default 200. */
    maxDepth?: number;
}

/** The signals of a {@link History}. */
export interface HistoryState {
    canUndo: ReadSignal<boolean>;
    canRedo: ReadSignal<boolean>;
    /** Label of the step `undo()` reverts, or null. */
    undoLabel: ReadSignal<string | null>;
    /** Label of the step `redo()` applies again, or null. */
    redoLabel: ReadSignal<string | null>;
}

interface Group {
    label: string;
    commands: Command[];
    depth: number;
}

/**
 * The default undo stack: steps in memory, transactions, merging and a depth limit.
 *
 * ```ts
 * const history = new History();
 *
 * history.execute({ label: 'Rename', do: () => (layer.name = 'B'), undo: () => (layer.name = 'A') });
 * history.undo();
 * ```
 */
export class History implements HistoryLike {
    /** `canUndo`, `canRedo` and the labels, as signals for buttons and menus. */
    readonly state: HistoryState;
    /** Steps kept. The oldest fall off. Change it at any time. */
    maxDepth: number;
    private _done: HistoryStep[] = [];
    private _undone: HistoryStep[] = [];
    private _group: Group | null = null;
    /** The last step may still take merges until something seals it. */
    private _open = false;
    private _applying = false;
    private readonly _sig: {
        canUndo: Signal<boolean>;
        canRedo: Signal<boolean>;
        undoLabel: Signal<string | null>;
        redoLabel: Signal<string | null>;
    };
    private readonly _listeners = new Set<() => void>();

    constructor(options: HistoryOptions = {}) {
        this.maxDepth = options.maxDepth ?? 200;
        this._sig = {
            canUndo: signal(false),
            canRedo: signal(false),
            undoLabel: signal<string | null>(null),
            redoLabel: signal<string | null>(null),
        };
        this.state = this._sig;
    }

    /** True while `undo()` or `redo()` runs. Changes recorded meanwhile are dropped. */
    get applying(): boolean {
        return this._applying;
    }

    /** True while a transaction is open. */
    get grouping(): boolean {
        return this._group !== null;
    }

    /** Steps that `undo()` can revert, oldest first. */
    get past(): readonly HistoryStep[] {
        return this._done;
    }

    /** Steps that `redo()` can apply again, next first. */
    get future(): readonly HistoryStep[] {
        return [...this._undone].reverse();
    }

    /** Runs `command.do()` and records it. */
    execute(command: Command): this {
        command.do();
        this.record(command);

        return this;
    }

    /** Records a change that is already applied. Clears the redo steps. */
    record(command: Command): void {
        if (this._applying) return;
        const group = this._group;

        if (group) {
            const last = group.commands.at(-1);

            if (!last?.merge?.(command, true)) group.commands.push(command);
            if (!group.label && command.label) group.label = command.label;

            return;
        }
        const step = this._done.at(-1);
        const last = step?.commands.at(-1);

        this._undone = [];
        if (this._open && last?.merge?.(command, false)) {
            this._sync();

            return;
        }
        this._push({ label: command.label ?? '', commands: [command] });
        this._open = true;
    }

    /** Opens a transaction. Everything recorded until the matching `end()` becomes one step. */
    begin(label = ''): void {
        if (this._group) {
            this._group.depth++;
            if (!this._group.label) this._group.label = label;

            return;
        }
        this._group = { label, commands: [], depth: 1 };
    }

    /** Closes a transaction. The outermost `end()` pushes the step (an empty one is dropped). */
    end(): void {
        const group = this._group;

        if (!group || --group.depth > 0) return;
        this._group = null;
        if (!group.commands.length) return;
        this._undone = [];
        this._push({ label: group.label, commands: group.commands });
        this._open = false;
    }

    /** Reverts what the open transaction recorded and closes it. */
    cancel(): void {
        const group = this._group;

        if (!group) return;
        this._group = null;
        this._run(() => {
            for (const c of [...group.commands].reverse()) c.undo();
        });
    }

    /** Runs `fn` as one step. If it throws, its changes are reverted and the error rethrown. */
    transaction<R>(label: string, fn: () => R): R {
        this.begin(label);
        let ok = false;

        try {
            const out = fn();

            ok = true;

            return out;
        } finally {
            if (ok) this.end();
            else this.cancel();
        }
    }

    /** Stops the last step from taking merges: the next change starts a new step. */
    seal(): void {
        this._open = false;
    }

    /** Reverts the last step. Returns false when there is none. */
    undo(): boolean {
        if (this._group) this.end();
        const step = this._done.pop();

        if (!step) return false;
        this._run(() => {
            for (const c of [...step.commands].reverse()) c.undo();
        });
        this._undone.push(step);
        this._open = false;
        this._sync();

        return true;
    }

    /** Applies the last undone step again. Returns false when there is none. */
    redo(): boolean {
        if (this._group) this.end();
        const step = this._undone.pop();

        if (!step) return false;
        this._run(() => {
            for (const c of step.commands) c.do();
        });
        this._done.push(step);
        this._open = false;
        this._sync();

        return true;
    }

    /** Forgets every step. */
    clear(): void {
        this._done = [];
        this._undone = [];
        this._group = null;
        this._open = false;
        this._sync();
    }

    /** Calls `fn` after every change of the stack. Returns the unsubscribe function. */
    onChange(fn: () => void): () => void {
        this._listeners.add(fn);

        return () => this._listeners.delete(fn);
    }

    private _push(step: HistoryStep): void {
        this._done.push(step);
        const over = this._done.length - Math.max(1, this.maxDepth);

        if (over > 0) this._done.splice(0, over);
        this._sync();
    }

    private _run(fn: () => void): void {
        this._applying = true;
        try {
            batch(fn);
        } finally {
            this._applying = false;
        }
    }

    private _sync(): void {
        batch(() => {
            this._sig.canUndo.set(this._done.length > 0);
            this._sig.canRedo.set(this._undone.length > 0);
            this._sig.undoLabel.set(this._done.at(-1)?.label ?? null);
            this._sig.redoLabel.set(this._undone.at(-1)?.label ?? null);
        });
        for (const fn of [...this._listeners]) fn();
    }
}

// ------------------------------------------------------------------------------ signal recording

/** Options of {@link recordSignals}. */
export interface RecordSignalsOptions {
    /** Label of the recorded steps. Default "Edit". */
    label?: string;
    /**
     * `patch` (default) stores the signals that changed. `snapshot` stores every tracked signal,
     * for values that depend on each other.
     */
    mode?: 'patch' | 'snapshot';
    /** Copies a value before it is stored, for mutable objects. Default none (values are kept as they are). */
    clone?: (value: unknown) => unknown;
}

/** What {@link recordSignals} returns. */
export interface SignalRecorder {
    /** Runs `fn` without recording what it changes, such as loading a document. */
    silently<R>(fn: () => R): R;
    /** Stops recording. */
    stop(): void;
}

/**
 * Records every change of `signals` into `history`, so undo works without writing commands.
 * Changes made in the same synchronous run (one handler, one `batch`) become one step. Inside
 * a transaction everything merges into the transaction's step.
 *
 * ```ts
 * const doc = { name: signal('Layer'), x: signal(0) };
 *
 * recordSignals(history, doc);
 * doc.x.value = 40; // history.undo() sets it back to 0
 * ```
 */
export function recordSignals(
    history: HistoryLike,
    signals: Readonly<Record<string, Signal<unknown>>> | readonly Signal<unknown>[],
    options: RecordSignalsOptions = {},
): SignalRecorder {
    const list: Signal<unknown>[] = Array.isArray(signals)
        ? [...(signals as Signal<unknown>[])]
        : Object.values(signals as Record<string, Signal<unknown>>);
    const copy = options.clone ?? ((v: unknown) => v);
    const label = options.label ?? 'Edit';
    let quiet = 0;
    let epoch = 0;
    let scheduled = false;

    /** The last time anything recorded: changes of one synchronous run share it. */
    const tickEpoch = () => {
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(() => {
            scheduled = false;
            epoch++;
        });
    };
    const write = (values: Map<Signal<unknown>, unknown>) => {
        quiet++;
        try {
            batch(() => {
                for (const [s, v] of values) s.set(copy(v));
            });
        } finally {
            quiet--;
        }
    };

    class Patch implements Command {
        readonly label = label;
        readonly epoch = epoch;
        readonly before = new Map<Signal<unknown>, unknown>();
        readonly after = new Map<Signal<unknown>, unknown>();

        do(): void {
            write(this.after);
        }

        undo(): void {
            write(this.before);
        }

        merge(next: Command, grouped: boolean): boolean {
            if (!(next instanceof Patch) || (!grouped && next.epoch !== this.epoch)) return false;
            for (const [s, v] of next.before) if (!this.before.has(s)) this.before.set(s, v);
            for (const [s, v] of next.after) this.after.set(s, v);

            return true;
        }
    }

    const stops = list.map((s) =>
        s.subscribe((value, previous) => {
            if (quiet > 0 || (history instanceof History && history.applying)) return;
            tickEpoch();
            const patch = new Patch();

            if (options.mode === 'snapshot') {
                for (const other of list) {
                    patch.before.set(other, copy(other === s ? previous : other.value));
                    patch.after.set(other, copy(other.value));
                }
            } else {
                patch.before.set(s, copy(previous));
                patch.after.set(s, copy(value));
            }
            history.record(patch);
        }),
    );

    return {
        silently<R>(fn: () => R): R {
            quiet++;
            try {
                return batch(fn);
            } finally {
                quiet--;
            }
        },
        stop() {
            for (const stop of stops) stop();
        },
    };
}

// ------------------------------------------------------------------------------------- keyboard

/** Options of {@link bindHistoryKeys}. */
export interface HistoryKeysOptions {
    /** Where to listen. Default `window`. */
    target?: EventTarget;
}

/**
 * Binds cmd or ctrl + Z to undo, and shift + cmd or ctrl + Z and ctrl + Y to redo. Keys typed into
 * inputs, text areas and editable elements are left alone. Returns the unbind function.
 */
export function bindHistoryKeys(
    history: { undo(): unknown; redo(): unknown },
    options: HistoryKeysOptions = {},
): () => void {
    const target = options.target ?? (typeof window === 'undefined' ? null : window);

    if (!target) return () => {};
    const onKey = (event: Event) => {
        const e = event as KeyboardEvent;

        if (e.defaultPrevented || isTypingTarget(e.target) || e.altKey) return;
        if (!(e.metaKey || e.ctrlKey)) return;
        const key = e.key?.toLowerCase();
        const redo = (key === 'z' && e.shiftKey) || (key === 'y' && e.ctrlKey && !e.metaKey);
        const undo = key === 'z' && !e.shiftKey;

        if (!undo && !redo) return;
        e.preventDefault();
        if (redo) history.redo();
        else history.undo();
    };

    target.addEventListener('keydown', onKey);

    return () => target.removeEventListener('keydown', onKey);
}

// ---------------------------------------------------------------------------------------- gizmo

/** Position, rotation and scale, the way a transform gizmo reads them. */
export interface TransformSnapshot {
    x: number;
    y: number;
    rotation: number;
    scaleX: number;
    scaleY: number;
}

/** Something with a position, rotation and scale, such as a Pixi `Container`. */
export interface TransformTarget {
    position: { set(x: number, y: number): unknown };
    rotation: number;
    scale: { set(x: number, y: number): unknown };
}

/** What {@link recordGizmo} needs from a gizmo, such as `TransformGizmo`. */
export interface RecordableGizmo<T extends TransformTarget> {
    readonly target: T | null;
    read(): TransformSnapshot;
    readonly state: { dragging: ReadSignal<boolean>; active?: ReadSignal<string | null> };
}

/** Options of {@link recordGizmo}. */
export interface RecordGizmoOptions<T extends TransformTarget> {
    /** Label of a step. Default from the handle: "Move", "Rotate", "Scale" or "Resize". */
    label?: string | ((handle: string | null) => string);
    /** Writes a transform back on undo and redo. Default sets position, rotation and scale. */
    apply?: (target: T, transform: TransformSnapshot) => void;
}

const handleLabel = (handle: string | null): string => {
    if (!handle) return 'Transform';
    if (handle === 'box-move' || handle.startsWith('move')) return 'Move';
    if (handle.includes('rotate')) return 'Rotate';
    if (handle.startsWith('scale')) return 'Scale';

    return 'Resize';
};

const applyTransform = (t: TransformTarget, s: TransformSnapshot) => {
    t.position.set(s.x, s.y);
    t.rotation = s.rotation;
    t.scale.set(s.scaleX, s.scaleY);
};

/**
 * Records every drag of a transform gizmo as one undoable step. The gizmo knows nothing about
 * history: this watches its `dragging` signal. Returns the function that stops recording.
 */
export function recordGizmo<T extends TransformTarget>(
    gizmo: RecordableGizmo<T>,
    history: HistoryLike,
    options: RecordGizmoOptions<T> = {},
): () => void {
    let start: { target: T; from: TransformSnapshot; handle: string | null } | null = null;
    const apply = options.apply ?? applyTransform;

    return gizmo.state.dragging.subscribe((dragging) => {
        const target = gizmo.target;

        if (dragging) {
            start = target ? { target, from: gizmo.read(), handle: gizmo.state.active?.value ?? null } : null;

            return;
        }
        const began = start;

        start = null;
        if (!began || began.target !== target) return;
        const from = began.from;
        const to = gizmo.read();

        if ((Object.keys(to) as (keyof TransformSnapshot)[]).every((k) => from[k] === to[k])) return;
        const label = typeof options.label === 'function' ? options.label(began.handle) : options.label;

        history.record({
            label: label ?? handleLabel(began.handle),
            do: () => apply(began.target, to),
            undo: () => apply(began.target, from),
        });
    });
}
