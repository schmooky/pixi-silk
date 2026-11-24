import { INSTANCE_FLOATS, type MessageLayout } from './layout';

/**
 * A least-recently-used cache of laid out messages with a memory budget (brief sec. 8). Messages
 * that show the same variant, values, size and width share one layout. Entries are immutable: a
 * message that updates a slot in place clones its layout first ({@link cloneLayout}).
 */
export class LayoutCache {
    /** Largest total size in bytes, estimated from the instance data. */
    budget: number;
    /** Lookups that found a layout. */
    hits = 0;
    /** Lookups that did not. */
    misses = 0;
    private readonly _entries = new Map<string, { layout: MessageLayout; bytes: number }>();
    private _bytes = 0;

    constructor(budget: number = 4 * 1024 * 1024) {
        this.budget = budget;
    }

    /** Entries in the cache. */
    get size(): number {
        return this._entries.size;
    }

    /** Estimated bytes in use. */
    get bytes(): number {
        return this._bytes;
    }

    /** The layout for a key, marked as recently used, or undefined. */
    get(key: string): MessageLayout | undefined {
        const entry = this._entries.get(key);

        if (!entry) {
            this.misses++;
            return undefined;
        }
        this.hits++;
        this._entries.delete(key);
        this._entries.set(key, entry);

        return entry.layout;
    }

    /** Stores a layout and evicts the least recently used ones past the budget. */
    set(key: string, layout: MessageLayout): void {
        const old = this._entries.get(key);

        if (old) this._bytes -= old.bytes;
        const bytes = layout.instances.byteLength + 256 + layout.slots.length * 64;

        this._entries.delete(key);
        this._entries.set(key, { layout, bytes });
        this._bytes += bytes;
        for (const [k, e] of this._entries) {
            if (this._bytes <= this.budget || this._entries.size <= 1) break;
            this._entries.delete(k);
            this._bytes -= e.bytes;
        }
    }

    /** Empties the cache. */
    clear(): void {
        this._entries.clear();
        this._bytes = 0;
    }
}

/** A copy of a layout whose instances and number slots can change without touching the original. */
export function cloneLayout(layout: MessageLayout): MessageLayout {
    return {
        ...layout,
        instances: layout.instances.slice(0, layout.count * INSTANCE_FLOATS),
        slots: layout.slots.map((s) => ({ ...s })),
    };
}
