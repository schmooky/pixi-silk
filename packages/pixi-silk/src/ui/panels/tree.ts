import type { SilkGraphics } from '../../SilkGraphics';
import type { LayerKind } from './icons';

/** The icon of a layer row: a built-in kind, or a function that draws one centred on (0, 0). */
export type LayerIcon = LayerKind | ((g: SilkGraphics, size: number, color: number) => void);

/**
 * How a {@link LayerTree} reads and changes your data. Only `getChildren` and `getName` are
 * required. The tree never holds its own copy of the data, so it can show a Pixi scene graph, a
 * document model or a state store.
 *
 * Children come in display order: the first child is the top row, the way design tools list
 * the front-most layer first.
 */
export interface TreeAdapter<T> {
    /** The children of `node`, in display order. */
    getChildren(node: T): readonly T[];
    /** The name shown in the row. */
    getName(node: T): string;
    /** The parent of `node`, or null for the root. Without it the tree searches from the root. */
    getParent?(node: T): T | null;
    /** Renames. Without it, double click does nothing. */
    setName?(node: T, name: string): void;
    /** The icon of the row. Default none. */
    getIcon?(node: T): LayerIcon | null;
    /** True when the node shows. Without it, the row has no eye toggle. */
    isVisible?(node: T): boolean;
    /** Shows or hides. */
    setVisible?(node: T, visible: boolean): void;
    /** True when the node is locked. Without it, the row has no lock toggle. */
    isLocked?(node: T): boolean;
    /** Sets the lock. */
    setLocked?(node: T, locked: boolean): void;
    /** True when other nodes can be dropped inside. Default: when it has children. */
    canHaveChildren?(node: T): boolean;
    /**
     * Moves `node` under `parent` at `index` in display order, counted without `node` itself.
     * Without it, rows cannot be dragged.
     */
    move?(node: T, parent: T, index: number): void;
}

/** One visible row of a flattened tree. */
export interface FlatRow<T> {
    /** The node the row shows. */
    readonly node: T;
    /** Nesting depth. Top rows are 0. */
    readonly depth: number;
    /** The parent node. The hidden root for top rows. Null for the root row with `showRoot`. */
    readonly parent: T | null;
    /** Index among the parent's children, in display order. */
    readonly index: number;
    /** True when the node has children. */
    readonly hasChildren: boolean;
    /** True when its children are listed under it. */
    readonly expanded: boolean;
}

/**
 * Lists the visible rows of a tree, depth first: the children of `root` (or `root` itself with
 * `showRoot`), and the children of every expanded node under them.
 */
export function flattenTree<T>(
    adapter: Pick<TreeAdapter<T>, 'getChildren'>,
    root: T,
    isExpanded: (node: T) => boolean,
    showRoot = false,
): FlatRow<T>[] {
    const out: FlatRow<T>[] = [];
    const walk = (parent: T, depth: number) => {
        const kids = adapter.getChildren(parent);

        for (let i = 0; i < kids.length; i++) {
            const node = kids[i];
            const hasChildren = adapter.getChildren(node).length > 0;
            const expanded = hasChildren && isExpanded(node);

            out.push({ node, depth, parent, index: i, hasChildren, expanded });
            if (expanded) walk(node, depth + 1);
        }
    };

    if (showRoot) {
        const hasChildren = adapter.getChildren(root).length > 0;
        const expanded = hasChildren && isExpanded(root);

        out.push({ node: root, depth: 0, parent: null, index: 0, hasChildren, expanded });
        if (expanded) walk(root, 1);
    } else walk(root, 0);

    return out;
}

/** The rows a list of `count` rows of `rowHeight` shows when scrolled to `scrollY`, plus `overscan` either side. */
export function visibleRange(
    scrollY: number,
    viewHeight: number,
    rowHeight: number,
    count: number,
    overscan = 2,
): { start: number; end: number } {
    if (count <= 0 || rowHeight <= 0) return { start: 0, end: 0 };
    const start = Math.min(count, Math.max(0, Math.floor(scrollY / rowHeight) - overscan));
    const end = Math.min(count, Math.ceil((scrollY + viewHeight) / rowHeight) + overscan);

    return { start, end: Math.max(start, end) };
}

/** Where a drop lands. */
export interface DropTarget<T> {
    /** The new parent. */
    parent: T;
    /** Index among the parent's children, in display order, before anything is moved. */
    index: number;
    /** Between rows (`before` or `after` the row) or `inside` it. */
    position: 'before' | 'after' | 'inside';
    /** The row the indicator is drawn at. */
    row: number;
    /** Depth of the dropped rows, where the indicator line starts. */
    depth: number;
}

/** Options of {@link dropTarget}. */
export interface DropTargetOptions<T> {
    /** Pointer x in row space, from the left of the rows. Picks the depth after the last row of a subtree. */
    x?: number;
    /** Indent per depth, for `x`. Default 14. */
    indent?: number;
    /** Left of depth 0, for `x`. Default 0. */
    offset?: number;
    /** True when a row takes drops inside it. Default: rows with children. */
    canNest?: (node: T) => boolean;
    /** The nodes being dragged. A drop inside one of them, or inside their children, is refused. */
    dragged?: readonly T[];
    /** The hidden root, the parent of top rows. Needed for drops below the last row. */
    root?: T;
}

/**
 * Where a drag over the rows drops, for a pointer at `y` (in row space, 0 at the top of the first
 * row). The middle of a row that takes children drops inside it. The top and bottom halves drop
 * between rows. Below the last row of a subtree, `x` picks how far out the drop goes. Returns null
 * for a drop the tree must refuse, such as a node into itself.
 */
export function dropTarget<T>(
    rows: readonly FlatRow<T>[],
    y: number,
    rowHeight: number,
    options: DropTargetOptions<T> = {},
): DropTarget<T> | null {
    const n = rows.length;
    const canNest = options.canNest ?? ((node: T) => rows.some((r) => r.node === node && r.hasChildren));
    const dragged = options.dragged ?? [];
    const indent = options.indent ?? 14;

    if (n === 0)
        return options.root === undefined
            ? null
            : { parent: options.root, index: 0, position: 'inside', row: -1, depth: 0 };
    const fy = y / rowHeight;
    const i = Math.max(0, Math.min(n - 1, Math.floor(fy)));
    const f = fy >= n ? 1 : Math.max(0, Math.min(1, fy - i));
    const row = rows[i];
    let out: DropTarget<T> | null;

    if (fy < n && f > 0.28 && f < 0.72 && canNest(row.node) && !dragged.includes(row.node)) {
        out = { parent: row.node, index: 0, position: 'inside', row: i, depth: row.depth + 1 };
    } else if (fy < n && f < 0.5) {
        if (row.parent === null) return null;
        out = { parent: row.parent, index: row.index, position: 'before', row: i, depth: row.depth };
    } else if (row.expanded && fy < n) {
        // right below an open group: the first child slot
        out = { parent: row.node, index: 0, position: 'after', row: i, depth: row.depth + 1 };
    } else {
        // after a row: the pointer's x picks the depth, from the next row's depth to this one's
        const next = rows[i + 1];
        const lowest = next ? next.depth : rows[0].depth;
        const x = options.x;
        const depth =
            x === undefined
                ? row.depth
                : Math.max(lowest, Math.min(row.depth, Math.round((x - (options.offset ?? 0)) / indent)));
        let j = i;

        // the row at that depth this one sits under (or is)
        while (j > 0 && rows[j].depth > depth) j--;
        const anchor = rows[j];

        if (anchor.parent === null) return null;
        out = { parent: anchor.parent, index: anchor.index + 1, position: 'after', row: i, depth: anchor.depth };
    }
    // a node cannot go inside itself or anything under it
    if (dragged.length && insideAny(rows, out.parent, dragged)) return null;

    return out;
}

/** True when `node` is one of `nodes` or under one of them, as far as the rows show. */
function insideAny<T>(rows: readonly FlatRow<T>[], node: T, nodes: readonly T[]): boolean {
    const parents = new Map<T, T | null>();

    for (const r of rows) parents.set(r.node, r.parent);
    for (let n: T | null | undefined = node; n !== null && n !== undefined; n = parents.get(n)) {
        if (nodes.includes(n)) return true;
    }

    return false;
}

/** The nodes of `nodes` that have no ancestor in `nodes`, in row order. Dragging a group moves its children with it. */
export function topLevelNodes<T>(
    rows: readonly FlatRow<T>[],
    nodes: readonly T[],
    getParent?: (node: T) => T | null,
): T[] {
    const parents = new Map<T, T | null>();
    const order = new Map<T, number>();

    rows.forEach((r, i) => {
        parents.set(r.node, r.parent);
        order.set(r.node, i);
    });
    const parentOf = (n: T): T | null => (parents.has(n) ? (parents.get(n) ?? null) : (getParent?.(n) ?? null));
    const top = nodes.filter((node) => {
        for (let p = parentOf(node); p !== null; p = parentOf(p)) if (nodes.includes(p)) return false;

        return true;
    });

    return [...new Set(top)].sort(
        (a, b) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER),
    );
}

/** One move of {@link applyDrop}: where a node was and where it went, as `move()` indices. */
export interface MoveStep<T> {
    node: T;
    from: { parent: T; index: number };
    to: { parent: T; index: number };
}

/**
 * Moves `nodes` to a drop target through `adapter.move`, keeping their order, and returns the
 * moves. Undo them with {@link undoMoves}. Nodes already in place are moved too, so the list
 * replays the same way.
 */
export function applyDrop<T>(
    adapter: Required<Pick<TreeAdapter<T>, 'getChildren' | 'move'>>,
    nodes: readonly T[],
    target: Pick<DropTarget<T>, 'parent' | 'index'>,
    parentOf: (node: T) => T | null,
): MoveStep<T>[] {
    const siblings = adapter.getChildren(target.parent);
    // the first sibling at or after the target that stays put: the dropped nodes go before it
    let anchor: T | null = null;

    for (let i = target.index; i < siblings.length; i++) {
        if (!nodes.includes(siblings[i])) {
            anchor = siblings[i];
            break;
        }
    }
    const steps: MoveStep<T>[] = [];

    for (const node of nodes) {
        const parent = parentOf(node);

        if (parent === null) continue;
        const from = { parent, index: adapter.getChildren(parent).indexOf(node) };
        const rest = adapter.getChildren(target.parent).filter((n) => n !== node);
        const index = anchor === null ? rest.length : rest.indexOf(anchor);

        adapter.move(node, target.parent, index);
        steps.push({ node, from, to: { parent: target.parent, index } });
    }

    return steps;
}

/** Puts back what {@link applyDrop} moved. */
export function undoMoves<T>(adapter: Required<Pick<TreeAdapter<T>, 'move'>>, steps: readonly MoveStep<T>[]): void {
    for (let i = steps.length - 1; i >= 0; i--) {
        const s = steps[i];

        adapter.move(s.node, s.from.parent, s.from.index);
    }
}

/** Applies the moves of {@link applyDrop} again, after {@link undoMoves}. */
export function redoMoves<T>(adapter: Required<Pick<TreeAdapter<T>, 'move'>>, steps: readonly MoveStep<T>[]): void {
    for (const s of steps) adapter.move(s.node, s.to.parent, s.to.index);
}

/** The parent of `node`, searched from `root`. For adapters without `getParent`. */
export function findParent<T>(adapter: Pick<TreeAdapter<T>, 'getChildren'>, root: T, node: T): T | null {
    const stack: T[] = [root];

    while (stack.length) {
        const p = stack.pop() as T;

        for (const c of adapter.getChildren(p)) {
            if (c === node) return p;
            stack.push(c);
        }
    }

    return null;
}
