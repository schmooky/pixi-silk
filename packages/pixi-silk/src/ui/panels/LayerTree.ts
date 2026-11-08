import { Container, type FederatedPointerEvent, Rectangle, type Ticker } from 'pixi.js';
import type { HistoryLike } from '../../history';
import { damp, Spring } from '../../motion';
import { SilkGraphics } from '../../SilkGraphics';
import { Selection } from '../../selection';
import { type ReadSignal, type Signal, signal } from '../../signal';
import type { SdfAtlas } from '../../text/atlas';
import type { SilkText } from '../../text/SilkText';
import { Driver } from '../driver';
import { isTypingTarget } from '../keys';
import { FlexContainer } from '../layout/flex-container';
import { TextEditor } from '../textedit';
import { drawChevron, drawEye, drawLayerIcon, drawLock } from './icons';
import { ScrollView } from './ScrollView';
import { fitText, type PanelTheme, panelText, resolvePanelTheme } from './theme';
import {
    applyDrop,
    type DropTarget,
    dropTarget,
    type FlatRow,
    findParent,
    flattenTree,
    type LayerIcon,
    type MoveStep,
    redoMoves,
    type TreeAdapter,
    topLevelNodes,
    undoMoves,
    visibleRange,
} from './tree';

/** Options of {@link LayerTree}. */
export interface LayerTreeOptions<T> {
    /** How the tree reads and changes your data. */
    adapter: TreeAdapter<T>;
    /** The node whose children are the top rows. */
    root: T;
    /** Show `root` itself as the first row. Default false. */
    showRoot?: boolean;
    /** The selection the rows show and change. Default a new one. */
    selection?: Selection<T>;
    /** Where renames, toggles and moves go for undo. Each gesture is one step. */
    history?: HistoryLike;
    /** Default 240. */
    width?: number;
    /** Default 320. */
    height?: number;
    /** Row height. Default 28. */
    rowHeight?: number;
    /** Indent per depth. Default 14. */
    indent?: number;
    /** Nodes that start expanded. Default the top rows. */
    expanded?: Iterable<T>;
    /** Drag rows to reorder and reparent them (needs `adapter.move`). Default true. */
    dragDrop?: boolean;
    /** Arrow keys, Home, End, Enter and F2 work while the tree has focus. Default true. */
    keyboard?: boolean;
    /** Hovering a row sets `selection.state.hovered`, so the canvas can outline it. Default true. */
    hoverSync?: boolean;
    /** The element the scene is drawn on, usually `app.canvas`, for the rename field. */
    element?: HTMLElement;
    /** Colours, radius and font. Default the dark theme. */
    theme?: Partial<PanelTheme>;
    /** Glyph atlas of the row names. Default the shared one. */
    atlas?: SdfAtlas;
    ticker?: Ticker | null;
}

/** The reactive state of a {@link LayerTree}. */
export interface LayerTreeState<T> {
    /** The visible rows, top to bottom. */
    rows: ReadSignal<readonly FlatRow<T>[]>;
    /** True while the tree takes the arrow keys. A press on it focuses it, a press elsewhere blurs it. */
    focused: Signal<boolean>;
    /** The row under the pointer. */
    hovered: ReadSignal<T | null>;
    /** True while rows are dragged. */
    dragging: ReadSignal<boolean>;
    /** The node being renamed, or null. */
    renaming: ReadSignal<T | null>;
}

/** Where a press landed in a row. */
type Part = 'chevron' | 'eye' | 'lock' | 'name' | 'row';

const HOLD_MS = 380;
const DOUBLE_MS = 380;

/** One pooled row: a flex row of indent, chevron, icon, name and the two toggles. */
class RowView extends FlexContainer {
    readonly spacer = new Container();
    readonly chevron = new SilkGraphics();
    readonly icon = new SilkGraphics();
    readonly nameText: SilkText;
    readonly eye = new SilkGraphics();
    readonly lock = new SilkGraphics();
    key = '';
    index = -1;

    constructor(theme: PanelTheme, atlas: SdfAtlas | undefined, height: number) {
        super({
            layout: { direction: 'row', alignItems: 'center', height, paddingLeft: 6, paddingRight: 12 },
            ticker: null,
        });
        this.nameText = panelText(theme, { atlas });
        this.eventMode = 'none';
        // fixed boxes: the icons are drawn after the row is laid out
        this.chevron.boundsArea = new Rectangle(0, 0, 16, 16);
        this.icon.boundsArea = new Rectangle(0, 0, 16, 16);
        this.eye.boundsArea = new Rectangle(0, 0, 22, 20);
        this.lock.boundsArea = new Rectangle(0, 0, 22, 20);
        this.add(this.spacer, { width: 0, height: 1 });
        this.add(this.chevron, { width: 16, height: 16 });
        this.add(this.icon, { width: 16, height: 16, marginRight: 6 });
        this.add(this.nameText, { grow: 1, shrink: 1, basis: 0, minWidth: 0, fitAlign: [0, 0.5] });
        this.add(this.eye, { width: 22, height: 20 });
        this.add(this.lock, { width: 22, height: 20 });
    }
}

/**
 * A layer list for editors: rows with expand arrows, icons, names, and eye and lock toggles. It
 * shows any tree through a {@link TreeAdapter}, and only draws the rows in view, so it stays fast
 * with thousands of nodes.
 *
 * - Click selects, Shift + click selects a range, cmd or ctrl + click toggles. The rows follow a
 *   {@link Selection} store, so the canvas and the list stay in sync both ways.
 * - Drag rows to reorder them, or onto a group to move them inside. The pointer's x picks the
 *   depth below the last row of a group. On touch, hold a row to drag it.
 * - Double click a name, or press Enter or F2, to rename it in place.
 * - Arrow keys move the selection, Left and Right fold and unfold.
 *
 * Call {@link LayerTree.refresh} when the data changes outside the tree.
 *
 * @example
 * ```ts
 * const tree = new LayerTree({ adapter: pixiTreeAdapter(), root: world, selection, history });
 *
 * panel.content.add(tree, { grow: 1, onSize: (w, h) => tree.resize(w, h) });
 * ```
 */
export class LayerTree<T> extends Container {
    /** Rows, focus, hover, drag and rename state, as signals. */
    readonly state: LayerTreeState<T>;
    /** The selection the rows show. */
    readonly selection: Selection<T>;
    /** How the tree reads and changes the data. */
    readonly adapter: TreeAdapter<T>;
    /** The node whose children are the top rows. */
    readonly root: T;
    /** The scroller the rows sit in. */
    readonly scroll: ScrollView;
    /** Colours, radius and font. */
    readonly theme: PanelTheme;
    /** Row height. */
    readonly rowHeight: number;
    /** Indent per depth. */
    readonly indent: number;

    private readonly _opts: LayerTreeOptions<T>;
    private readonly _driver: Driver;
    private readonly _expanded = new Set<T>();
    private readonly _rows: Signal<readonly FlatRow<T>[]>;
    private readonly _index = new Map<T, number>();
    private readonly _focused: Signal<boolean>;
    private readonly _hovered = signal<T | null>(null);
    private readonly _dragging = signal(false);
    private readonly _renaming = signal<T | null>(null);
    private readonly _pool: RowView[] = [];
    private readonly _under = new SilkGraphics();
    private readonly _over = new SilkGraphics();
    private readonly _ghost = new Container();
    private readonly _ghostBg = new SilkGraphics();
    private readonly _ghostText: SilkText;
    private readonly _stops: (() => void)[] = [];
    private _w: number;
    private _h: number;
    private _anchor: T | null = null;
    private _press: {
        id: number;
        row: number;
        node: T | null;
        part: Part;
        x: number;
        y: number;
        t: number;
        touch: boolean;
        deferred: boolean;
        moved: boolean;
    } | null = null;
    private _drag: { nodes: T[]; target: DropTarget<T> | null; x: number; y: number } | null = null;
    private _hoverRow = -1;
    private _hoverY: Spring;
    private _hoverA = 0;
    private _dropY: Spring;
    private _dropA = 0;
    private _lastDown: { row: number; t: number } | null = null;
    private _editor: TextEditor | null = null;
    private _picking = false;

    constructor(options: LayerTreeOptions<T>) {
        super({ label: 'LayerTree' });
        this._opts = options;
        this.adapter = options.adapter;
        this.root = options.root;
        this.theme = resolvePanelTheme(options.theme);
        this.selection = options.selection ?? new Selection<T>();
        this.rowHeight = options.rowHeight ?? 28;
        this.indent = options.indent ?? 14;
        this._w = options.width ?? 240;
        this._h = options.height ?? 320;
        this._rows = signal<readonly FlatRow<T>[]>([]);
        this._focused = signal(false);
        this.state = {
            rows: this._rows,
            focused: this._focused,
            hovered: this._hovered,
            dragging: this._dragging,
            renaming: this._renaming,
        };
        for (const node of options.expanded ?? this.adapter.getChildren(this.root)) this._expanded.add(node);
        if (options.showRoot) this._expanded.add(this.root);
        this._hoverY = new Spring(0, 520, 40);
        this._dropY = new Spring(0, 700, 46);

        this.scroll = new ScrollView({ width: this._w, height: this._h, theme: options.theme, ticker: options.ticker });
        this.scroll.content.addChild(this._under);
        this.scroll.content.addChild(this._over);
        this._ghostText = panelText(this.theme, { atlas: options.atlas, weight: 600, color: this.theme.accentText });
        this._ghost.addChild(this._ghostBg, this._ghostText);
        this._ghost.visible = false;
        this._ghost.eventMode = 'none';
        this.addChild(this.scroll, this._ghost);
        this._driver = new Driver((dt) => this._step(dt), options.ticker);

        this.eventMode = 'static';
        this.hitArea = new Rectangle(0, 0, this._w, this._h);
        this.on('pointerdown', this._onDown, this);
        this.on('pointermove', this._onHover, this);
        this.on('pointerleave', () => this._setHover(-1));
        this.on('globalpointermove', this._onMove, this);
        this.on('pointerup', this._onUp, this);
        this.on('pointerupoutside', this._onUp, this);
        this.scroll.on('scroll', () => this._render());

        this._stops.push(
            this.selection.state.items.subscribe(() => this._render()),
            this.selection.state.primary.subscribe((p) => {
                // picked on the canvas: open its groups and bring its row into view
                if (!this._picking && p !== null) this.reveal(p);
            }),
        );
        if (options.keyboard ?? true) this._listenKeys();
        this.refresh();
    }

    /** The visible rows. */
    get rows(): readonly FlatRow<T>[] {
        return this._rows.value;
    }

    /** Width of the list. */
    get listWidth(): number {
        return this._w;
    }

    /** Height of the list. */
    get listHeight(): number {
        return this._h;
    }

    /** Changes the size of the list. */
    resize(width: number, height: number): this {
        if (width === this._w && height === this._h) return this;
        const widthChanged = width !== this._w;

        this._w = Math.max(0, width);
        this._h = Math.max(0, height);
        (this.hitArea as Rectangle).width = this._w;
        (this.hitArea as Rectangle).height = this._h;
        this.scroll.resize(this._w, this._h);
        if (widthChanged) for (const v of this._pool) v.key = '';
        this._render();

        return this;
    }

    /** Lists the rows again from the adapter. Call it when the data changed outside the tree. */
    refresh(): this {
        const rows = flattenTree(this.adapter, this.root, (n) => this._expanded.has(n), this._opts.showRoot);

        this._index.clear();
        rows.forEach((r, i) => this._index.set(r.node, i));
        this._rows.set(rows);
        this.scroll.contentHeight = rows.length * this.rowHeight + 4;
        for (const v of this._pool) v.key = '';
        this._render();

        return this;
    }

    /** True when the children of `node` are listed. */
    isExpanded(node: T): boolean {
        return this._expanded.has(node);
    }

    /** Lists the children of `node`. With `deep`, of everything under it too. */
    expand(node: T, deep = false): this {
        this._expanded.add(node);
        if (deep) {
            const stack = [...this.adapter.getChildren(node)];

            while (stack.length) {
                const n = stack.pop() as T;
                const kids = this.adapter.getChildren(n);

                if (kids.length) {
                    this._expanded.add(n);
                    stack.push(...kids);
                }
            }
        }

        return this.refresh();
    }

    /** Folds the children of `node` away. */
    collapse(node: T): this {
        this._expanded.delete(node);

        return this.refresh();
    }

    /** Folds or unfolds `node`. */
    toggle(node: T, deep = false): this {
        return this._expanded.has(node) ? this.collapse(node) : this.expand(node, deep);
    }

    /** Opens the groups above `node` and scrolls its row into view. */
    reveal(node: T, animate = true): this {
        let changed = false;

        for (let p = this._parentOf(node); p !== null; p = this._parentOf(p)) {
            if (p === this.root && !this._opts.showRoot) break;
            if (!this._expanded.has(p)) {
                this._expanded.add(p);
                changed = true;
            }
        }
        if (changed) this.refresh();
        const i = this._index.get(node);

        if (i !== undefined) this.scroll.scrollIntoView(i * this.rowHeight, (i + 1) * this.rowHeight + 4, animate);

        return this;
    }

    /** Starts renaming `node` in place. Does nothing without `adapter.setName`. */
    rename(node: T): this {
        if (!this.adapter.setName) return this;
        this.reveal(node, false);
        const i = this._index.get(node);

        if (i === undefined) return this;
        this._renaming.set(node);
        this._render();
        const view = this._pool.find((v) => v.index === i);
        const slot = view?.slotOf(view.nameText);

        if (!view || !slot) return this;
        this._editor?.destroy();
        const t = this.theme;
        const editor = new TextEditor({
            text: this.adapter.getName(node),
            multiline: false,
            width: Math.max(40, slot.width),
            fontFamily: t.fontFamily,
            fontSize: t.fontSize,
            fontWeight: 500,
            fill: t.text,
            atlas: this._opts.atlas,
            element: this._opts.element,
            ticker: this._opts.ticker,
            theme: { caret: t.accent, selection: t.accent },
        });
        const finish = () => {
            if (this._editor !== editor) return;
            this._editor = null;
            const before = this.adapter.getName(node);
            const after = editor.value.trim();

            this._renaming.set(null);
            editor.destroy();
            if (after && after !== before) this._rename(node, before, after);
            else this._render();
        };

        editor.position.set(slot.x, i * this.rowHeight + (this.rowHeight - editor.height) / 2);
        editor.on('submit', () => editor.blur());
        editor.on('blur', finish);
        this._editor = editor;
        this.scroll.content.addChild(editor);
        this._render();
        editor.focus(true);

        return this;
    }

    /**
     * Handles a key the way the tree does while focused: arrows, Home, End, Enter and F2. Returns
     * true when it used the key. The tree calls it from `keydown`. Call it yourself for tests or
     * your own key routing.
     */
    handleKey(code: string, shift = false): boolean {
        const rows = this._rows.value;

        if (!rows.length) return false;
        const primary = this.selection.primary;
        const at = primary === null ? -1 : (this._index.get(primary) ?? -1);
        const go = (i: number) => {
            const r = rows[Math.max(0, Math.min(rows.length - 1, i))];

            if (shift && this._anchor !== null) this._selectRange(this._anchor, r.node);
            else {
                this._anchor = r.node;
                this._pick(() => this.selection.replace([r.node]));
            }
            this.reveal(r.node);
        };

        switch (code) {
            case 'ArrowDown':
                go(at + 1);
                return true;
            case 'ArrowUp':
                go(at < 0 ? rows.length - 1 : at - 1);
                return true;
            case 'Home':
                go(0);
                return true;
            case 'End':
                go(rows.length - 1);
                return true;
            case 'ArrowRight': {
                const r = rows[at];

                if (!r) return false;
                if (r.hasChildren && !r.expanded) this.expand(r.node);
                else if (r.expanded) go(at + 1);
                return true;
            }
            case 'ArrowLeft': {
                const r = rows[at];

                if (!r) return false;
                if (r.expanded) this.collapse(r.node);
                else if (r.parent !== null && this._index.has(r.parent)) go(this._index.get(r.parent) as number);
                return true;
            }
            case 'Enter':
            case 'F2':
                if (primary === null) return false;
                this.rename(primary);
                return true;
            default:
                return false;
        }
    }

    /** Advances the motion by `dt` seconds (only needed with `ticker: null`). Returns true while moving. */
    tick(dt: number): boolean {
        const a = this._driver.tick(dt);
        const b = this.scroll.tick(dt);

        return a || b;
    }

    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        for (const stop of this._stops) stop();
        this._stops.length = 0;
        this._editor?.destroy();
        this._driver.sleep();
        super.destroy(options ?? { children: true });
    }

    // ------------------------------------------------------------------------------- data

    private _parentOf(node: T): T | null {
        if (this.adapter.getParent) return this.adapter.getParent(node);
        const i = this._index.get(node);

        if (i !== undefined) return this._rows.value[i].parent;

        return findParent(this.adapter, this.root, node);
    }

    private _canNest(node: T): boolean {
        return this.adapter.canHaveChildren?.(node) ?? this.adapter.getChildren(node).length > 0;
    }

    private _record(label: string, apply: () => void, revert: () => void): void {
        this._opts.history?.record({
            label,
            do: () => {
                apply();
                this.refresh();
            },
            undo: () => {
                revert();
                this.refresh();
            },
        });
    }

    private _rename(node: T, before: string, after: string): void {
        const set = this.adapter.setName;

        if (!set) return;
        set(node, after);
        this._record(
            'Rename',
            () => set(node, after),
            () => set(node, before),
        );
        this.refresh();
        this.emit('rename', node, after, before);
    }

    private _toggleFlag(node: T, part: 'eye' | 'lock'): void {
        const a = this.adapter;
        const get = part === 'eye' ? a.isVisible : a.isLocked;
        const set = part === 'eye' ? a.setVisible : a.setLocked;

        if (!get || !set) return;
        const before = get(node);

        set(node, !before);
        this._record(
            part === 'eye' ? (before ? 'Hide' : 'Show') : before ? 'Release Lock' : 'Lock',
            () => set(node, !before),
            () => set(node, before),
        );
        this.refresh();
    }

    private _move(nodes: T[], target: DropTarget<T>): void {
        const move = this.adapter.move;

        if (!move) return;
        const adapter = { getChildren: (n: T) => this.adapter.getChildren(n), move };
        const steps: MoveStep<T>[] = applyDrop(adapter, nodes, target, (n) => this._parentOf(n));

        if (!steps.length) return;
        this._expanded.add(target.parent);
        this._record(
            nodes.length > 1 ? 'Move Layers' : 'Move Layer',
            () => redoMoves(adapter, steps),
            () => undoMoves(adapter, steps),
        );
        this.refresh();
        this.emit('move', nodes, target);
    }

    // ------------------------------------------------------------------------------- selection

    private _pick(fn: () => void): void {
        this._picking = true;
        try {
            fn();
        } finally {
            this._picking = false;
        }
    }

    private _selectRange(from: T, to: T): void {
        const a = this._index.get(from);
        const b = this._index.get(to);

        if (a === undefined || b === undefined) {
            this._pick(() => this.selection.replace([to]));

            return;
        }
        const rows = this._rows.value;
        const range = rows.slice(Math.min(a, b), Math.max(a, b) + 1).map((r) => r.node);

        // the clicked row is primary
        this._pick(() => this.selection.replace([...range.filter((n) => n !== to), to]));
    }

    // ------------------------------------------------------------------------------- input

    private _listenKeys(): void {
        if (typeof window === 'undefined') return;
        const down = (e: KeyboardEvent) => {
            if (!this._focused.value || !this.parent || this.destroyed) return;
            if (isTypingTarget(e.target) || TextEditor.active) return;
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            if (this.handleKey(e.code === 'NumpadEnter' ? 'Enter' : e.code, e.shiftKey)) e.preventDefault();
        };
        // a press anywhere blurs the tree. A press on the tree focuses it again right after
        const press = () => this._focused.set(false);

        window.addEventListener('keydown', down);
        window.addEventListener('pointerdown', press, { capture: true });
        this._stops.push(() => {
            window.removeEventListener('keydown', down);
            window.removeEventListener('pointerdown', press, { capture: true });
        });
    }

    /** The row and the part of it under a point in the tree's space. */
    private _hit(x: number, y: number): { row: number; part: Part } {
        const cy = y + this.scroll.scrollY;
        const row = Math.floor(cy / this.rowHeight);

        if (row < 0 || row >= this._rows.value.length) return { row: -1, part: 'row' };
        const view = this._pool.find((v) => v.index === row);
        const inside = (c: Container, pad = 2) => {
            const s = view?.slotOf(c);

            return !!s && s.width > 0 && x >= s.x - pad && x <= s.x + s.width + pad;
        };
        const r = this._rows.value[row];
        let part: Part = 'row';

        if (view) {
            if (r.hasChildren && inside(view.chevron, 4)) part = 'chevron';
            else if (this.adapter.isVisible && inside(view.eye)) part = 'eye';
            else if (this.adapter.isLocked && inside(view.lock)) part = 'lock';
            else if (inside(view.nameText)) part = 'name';
        }

        return { row, part };
    }

    private _setHover(row: number): void {
        if (row === this._hoverRow) return;
        const first = this._hoverRow < 0;

        this._hoverRow = row;
        const node = row >= 0 ? (this._rows.value[row]?.node ?? null) : null;

        this._hovered.set(node);
        if (this._opts.hoverSync ?? true) this.selection.state.hovered.set(node);
        if (row >= 0) {
            this._hoverY.target = row * this.rowHeight;
            if (first || this._hoverA < 0.05) {
                this._hoverY.value = this._hoverY.target;
                this._hoverY.velocity = 0;
            }
        }
        this._render();
        this._driver.wake();
    }

    private _onHover(e: FederatedPointerEvent): void {
        if (this._press) return;
        const p = this.toLocal(e.global);

        this._setHover(this._hit(p.x, p.y).row);
    }

    private _onDown(e: FederatedPointerEvent): void {
        if (this._press || e.button > 0) return;
        const p = this.toLocal(e.global);
        const { row, part } = this._hit(p.x, p.y);
        const rows = this._rows.value;
        const node = row >= 0 ? rows[row].node : null;
        const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
        const now = performance.now();

        this._focused.set(true);
        if (this._editor) this._editor.blur();
        this._press = {
            id: e.pointerId,
            row,
            node,
            part,
            x: p.x,
            y: p.y,
            t: now,
            touch,
            deferred: false,
            moved: false,
        };
        if (node === null) {
            if (!e.shiftKey && !e.metaKey && !e.ctrlKey) this._pick(() => this.selection.clear());

            return;
        }
        if (touch) {
            // fingers scroll: select on release, drag after a hold
            this._driver.wake();

            return;
        }
        if (part === 'chevron') {
            this.toggle(node, e.altKey);
            this._press = null;

            return;
        }
        if (part === 'eye' || part === 'lock') {
            this._toggleFlag(node, part);
            this._press = null;

            return;
        }
        const double = this._lastDown && this._lastDown.row === row && now - this._lastDown.t < DOUBLE_MS;

        this._lastDown = { row, t: now };
        if (double && part === 'name') {
            this._press = null;
            this.rename(node);

            return;
        }
        this._select(node, e.shiftKey, e.metaKey || e.ctrlKey);
    }

    private _select(node: T, shift: boolean, toggle: boolean): void {
        const press = this._press;

        if (shift && this._anchor !== null) this._selectRange(this._anchor, node);
        else if (toggle) {
            this._anchor = node;
            this._pick(() => this.selection.toggle(node));
        } else if (this.selection.has(node)) {
            // a press on a selected row may start dragging all of them: replace on release
            if (press) press.deferred = true;
            this._anchor = node;
            this._pick(() => this.selection.focus(node));
        } else {
            this._anchor = node;
            this._pick(() => this.selection.replace([node]));
        }
    }

    private _onMove(e: FederatedPointerEvent): void {
        const press = this._press;

        if (!press || e.pointerId !== press.id) return;
        const p = this.toLocal(e.global);

        this.dragTo(p.x, p.y);
    }

    /** Moves a press to a point in the tree's space, as the pointer does: past a few pixels it drags the rows. */
    dragTo(x: number, y: number): void {
        const press = this._press;

        if (!press) return;
        if (this._drag) {
            this._drag.x = x;
            this._drag.y = y;
            this._aimDrop();

            return;
        }
        const far = Math.hypot(x - press.x, y - press.y) > (press.touch ? 10 : 4);

        if (!far) return;
        press.moved = true;
        // a finger that moves before the hold scrolls instead
        if (press.touch || press.node === null) return;
        this._startDrag(x, y);
    }

    private _startDrag(x: number, y: number): void {
        const press = this._press;

        if (!press?.node || !(this._opts.dragDrop ?? true) || !this.adapter.move) return;
        const picked = this.selection.has(press.node) ? this.selection.items : [press.node];
        const nodes = topLevelNodes(this._rows.value, picked, (n) => this._parentOf(n)).filter(
            (n) => this._parentOf(n) !== null,
        );

        if (!nodes.length) return;
        press.deferred = false;
        this._drag = { nodes, target: null, x, y };
        this._dragging.set(true);
        this._ghostText.text = nodes.length > 1 ? `${nodes.length} layers` : this.adapter.getName(nodes[0]);
        const w = Math.ceil(this._ghostText.width) + 20;
        const h = this.rowHeight - 4;

        this._ghostBg
            .clear()
            .roundRect(0, 3, w, h, h / 2)
            .fill({ color: this.theme.shadow, alpha: 0.35, blur: 6 })
            .roundRect(0, 0, w, h, h / 2)
            .fill(this.theme.accent);
        this._ghostText.position.set(10, (h - this._ghostText.height) / 2);
        this._ghost.visible = true;
        this._ghost.position.set(x + 12, y - h / 2);
        this._setHover(-1);
        this._aimDrop();
    }

    private _aimDrop(): void {
        const d = this._drag;

        if (!d) return;
        const rows = this._rows.value;
        const target = dropTarget(rows, d.y + this.scroll.scrollY, this.rowHeight, {
            x: d.x,
            indent: this.indent,
            offset: 6 + 16 + this.indent / 2,
            canNest: (n) => this._canNest(n),
            dragged: d.nodes,
            root: this.root,
        });
        const was = d.target;

        d.target = target;
        if (target) {
            const y = target.position === 'before' ? target.row * this.rowHeight : (target.row + 1) * this.rowHeight;

            this._dropY.target = target.position === 'inside' ? target.row * this.rowHeight : y;
            if (!was || was.position === 'inside' || target.position === 'inside') {
                this._dropY.value = this._dropY.target;
                this._dropY.velocity = 0;
            }
        }
        this._driver.wake();
    }

    private _onUp(e: FederatedPointerEvent): void {
        const press = this._press;

        if (!press || e.pointerId !== press.id) return;
        this.release();
    }

    /** Ends a press: drops dragged rows, or finishes a click. */
    release(): void {
        const press = this._press;
        const drag = this._drag;

        this._press = null;
        this._drag = null;
        this._ghost.visible = false;
        if (drag) {
            this._dragging.set(false);
            if (drag.target) this._move(drag.nodes, drag.target);
            this._render();
            this._driver.wake();

            return;
        }
        if (!press?.node) return;
        if (press.touch && !press.moved) {
            const part = press.part;

            if (part === 'chevron') this.toggle(press.node);
            else if (part === 'eye' || part === 'lock') this._toggleFlag(press.node, part);
            else {
                this._anchor = press.node;
                this._pick(() => this.selection.replace([press.node as T]));
            }
        } else if (press.deferred && !press.moved) {
            const node = press.node;

            this._pick(() => this.selection.replace([node]));
        }
    }

    // ------------------------------------------------------------------------------- frame

    private _step(dt: number): boolean {
        let busy = false;
        const press = this._press;

        // a finger held still on a row picks it up
        if (press?.touch && !press.moved && press.node !== null && !this._drag) {
            if (performance.now() - press.t >= HOLD_MS) {
                this.scroll.cancelDrag();
                this._startDrag(press.x, press.y);
            } else busy = true;
        }
        // near the top or bottom while dragging: scroll, faster the nearer
        const d = this._drag;

        if (d) {
            const edge = 28;
            const speed = d.y < edge ? -(edge - d.y) * 14 : d.y > this._h - edge ? (d.y - (this._h - edge)) * 14 : 0;

            if (speed !== 0) {
                this.scroll.scrollBy(speed * dt, false);
                this._aimDrop();
            }
            this._ghost.position.set(
                damp(this._ghost.x, d.x + 12, 30, dt),
                damp(this._ghost.y, d.y - (this.rowHeight - 4) / 2, 30, dt),
            );
            busy = true;
        }
        const hoverT = this._hoverRow >= 0 && !this._drag ? 1 : 0;
        const dropT = d?.target ? 1 : 0;

        this._hoverY.step(dt);
        this._dropY.step(dt);
        this._hoverA = damp(this._hoverA, hoverT, 22, dt);
        this._dropA = damp(this._dropA, dropT, 26, dt);
        if (!this._hoverY.settled || !this._dropY.settled) busy = true;
        if (Math.abs(this._hoverA - hoverT) > 0.01 || Math.abs(this._dropA - dropT) > 0.01) busy = true;
        this._drawMarks();

        return busy;
    }

    /** Binds the pooled rows to the rows in view and draws the highlights. */
    private _render(): void {
        const rows = this._rows.value;
        const rh = this.rowHeight;
        const { start, end } = visibleRange(this.scroll.scrollY, this._h, rh, rows.length, 2);
        const count = end - start;
        const content = this.scroll.content;

        while (this._pool.length < count) {
            const view = new RowView(this.theme, this._opts.atlas, rh);

            this._pool.push(view);
            content.addChildAt(view, content.getChildIndex(this._over));
        }
        const t = this.theme;
        const a = this.adapter;
        const dragged = new Set(this._drag?.nodes ?? []);

        for (let k = 0; k < this._pool.length; k++) {
            const view = this._pool[k];
            const i = start + k;

            if (k >= count) {
                view.visible = false;
                view.index = -1;
                continue;
            }
            const r = rows[i];
            const name = a.getName(r.node);
            const visible = a.isVisible?.(r.node) ?? true;
            const locked = a.isLocked?.(r.node) ?? false;
            const hovered = i === this._hoverRow;
            const selected = this.selection.has(r.node);
            const renaming = this._renaming.value === r.node;
            const key = [
                i,
                name,
                r.depth,
                r.hasChildren,
                r.expanded,
                visible,
                locked,
                hovered,
                selected,
                renaming,
                dragged.has(r.node),
            ].join('|');

            view.visible = true;
            view.index = i;
            view.y = i * rh;
            if (view.key === key) continue;
            view.key = key;
            if (view.layoutStyle.width !== this._w) view.setStyle({ ...view.layoutStyle, width: this._w });
            view.setLayout(view.spacer, { width: r.depth * this.indent, height: 1 });
            view.updateLayout();
            const dim = visible ? 1 : 0.45;

            view.alpha = dragged.has(r.node) ? 0.4 : 1;
            view.chevron.clear();
            if (r.hasChildren) drawChevron(view.chevron, 8, 8, 16, t.textDim, dim, r.expanded ? 1 : 0);
            view.icon.clear();
            const icon: LayerIcon | null = a.getIcon?.(r.node) ?? null;

            if (typeof icon === 'function') {
                view.icon.translateTransform(8, 8);
                icon(view.icon, 16, selected ? t.text : t.textDim);
                view.icon.resetTransform();
            } else if (icon) drawLayerIcon(view.icon, icon, 8, 8, 16, selected ? t.text : t.textDim, dim);
            view.nameText.visible = !renaming;
            view.nameText.fill = t.text;
            view.nameText.alpha = dim;
            view.nameText.fontWeight = r.depth === 0 && r.hasChildren ? 600 : 500;
            const slot = view.slotOf(view.nameText);

            fitText(view.nameText, name, slot ? slot.width : this._w);
            // toggles show on hover, and always when they are off the default
            view.eye.clear();
            if (a.isVisible && (hovered || selected || !visible))
                drawEye(view.eye, 11, 10, 18, t.textDim, hovered || !visible ? 1 : 0.55, visible);
            view.lock.clear();
            if (a.isLocked && (hovered || locked)) drawLock(view.lock, 11, 10, 18, t.textDim, locked ? 1 : 0.8, locked);
        }
        this._drawMarks();
        this._driver.wake();
    }

    private _drawMarks(): void {
        const t = this.theme;
        const rows = this._rows.value;
        const rh = this.rowHeight;
        const w = this._w;
        const { start, end } = visibleRange(this.scroll.scrollY, this._h, rh, rows.length, 2);
        const g = this._under;

        g.clear();
        if (this._hoverA > 0.01)
            g.roundRect(4, this._hoverY.value, w - 8, rh, 6).fill({ color: t.hover, alpha: this._hoverA });
        // runs of selected rows join into one rounded block
        let run = -1;

        for (let i = start; i <= end; i++) {
            const on = i < end && this.selection.has(rows[i].node);

            if (on && run < 0) run = i;
            if (!on && run >= 0) {
                g.roundRect(4, run * rh, w - 8, (i - run) * rh, 6).fill({ color: t.selected, alpha: t.selectedAlpha });
                run = -1;
            }
        }
        const o = this._over;
        const target = this._drag?.target;

        o.clear();
        if (target && this._dropA > 0.01) {
            const a = this._dropA;

            if (target.position === 'inside') {
                o.roundRect(4, target.row * rh + 1, w - 8, rh - 2, 6).stroke({ width: 1.5, color: t.accent, alpha: a });
            } else {
                const x = 6 + 16 + target.depth * this.indent;
                const y = this._dropY.value;

                o.rect(x, y - 1, Math.max(0, w - 10 - x), 2).fill({ color: t.accent, alpha: a });
                o.circle(x, y, 3.5).stroke({ width: 1.5, color: t.accent, alpha: a });
            }
        }
        const editing = this._renaming.value;
        const ei = editing === null ? undefined : this._index.get(editing);

        if (ei !== undefined && this._editor) {
            const e = this._editor;

            o.roundRect(e.x - 4, ei * rh + 3, Math.max(48, e.width + 8, w - e.x - 52), rh - 6, 4).stroke({
                width: 1.5,
                color: t.accent,
            });
        }
    }
}
