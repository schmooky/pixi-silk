import { layoutRoot, type Measured } from './flex';
import type { ComputedLayout, LayoutStyle, MeasureFunction } from './style';

/**
 * A box in a layout tree. Give it a style, children or a `measure` function, then call
 * {@link LayoutNode.calculate} on the root. Each node's {@link LayoutNode.layout} holds its box.
 *
 * Layout is incremental. Changing a style, a child or the measure marks the node and its
 * ancestors dirty. The next pass skips clean subtrees whose space did not change, and measured
 * leaves cache their size per available space.
 */
export class LayoutNode<T = unknown> {
    /** The box from the last pass, relative to the parent's top-left corner. */
    readonly layout: ComputedLayout = { x: 0, y: 0, width: 0, height: 0 };
    /** Anything you want to keep with the node, such as the display object it places. */
    data: T | undefined;
    /** @internal */
    _dirty = true;
    /** @internal sizes measured since the last change, by the space they were measured in */
    readonly _cache: Map<string, Measured> = new Map();
    /** @internal the inputs of the last full pass over this node */
    _laid = '';
    /** @internal baseline from the last full pass */
    _baseline = 0;
    private _style: LayoutStyle;
    private _measure: MeasureFunction | undefined;
    private _parent: LayoutNode<T> | null = null;
    private readonly _children: LayoutNode<T>[] = [];

    constructor(style: LayoutStyle = {}, measure?: MeasureFunction) {
        this._style = { ...style };
        this._measure = measure;
    }

    /** The current style. Change it with {@link LayoutNode.setStyle} or {@link LayoutNode.updateStyle}. */
    get style(): Readonly<LayoutStyle> {
        return this._style;
    }

    /** Replaces the style. */
    setStyle(style: LayoutStyle): this {
        this._style = { ...style };

        return this.markDirty();
    }

    /** Merges `patch` into the style. A key set to `undefined` goes back to its default. */
    updateStyle(patch: Partial<LayoutStyle>): this {
        this._style = { ...this._style, ...patch };

        return this.markDirty();
    }

    /** Measures leaf content. A node with in-flow children ignores it. */
    get measure(): MeasureFunction | undefined {
        return this._measure;
    }

    set measure(fn: MeasureFunction | undefined) {
        this._measure = fn;
        this.markDirty();
    }

    /** The parent node, or null for a root. */
    get parent(): LayoutNode<T> | null {
        return this._parent;
    }

    /** The child nodes in layout order. */
    get children(): readonly LayoutNode<T>[] {
        return this._children;
    }

    /** True when the node or something under it changed since the last pass. */
    get dirty(): boolean {
        return this._dirty;
    }

    /** Adds `child` at `index` (default the end). A child of another node moves here. */
    add(child: LayoutNode<T>, index: number = this._children.length): this {
        child._parent?.remove(child);
        child._parent = this;
        this._children.splice(Math.max(0, Math.min(index, this._children.length)), 0, child);

        return this.markDirty();
    }

    /** Removes `child`. Does nothing when it is not a child. */
    remove(child: LayoutNode<T>): this {
        const i = this._children.indexOf(child);

        if (i < 0) return this;
        this._children.splice(i, 1);
        child._parent = null;

        return this.markDirty();
    }

    /** Removes every child. */
    clear(): this {
        for (const child of this._children) child._parent = null;
        this._children.length = 0;

        return this.markDirty();
    }

    /**
     * Marks the node and its ancestors for the next pass. Call it when measured content changes
     * (new text, a new texture). Style and child changes call it for you.
     */
    markDirty(): this {
        for (let n: LayoutNode<T> | null = this; n; n = n._parent) {
            n._dirty = true;
            n._cache.clear();
            n._laid = '';
        }

        return this;
    }

    /**
     * Lays out the tree under this node. `width` and `height` are the space it fills, unless its
     * style sets a size. Leave one out to size that axis to the content. The node itself sits at 0, 0.
     */
    calculate(width?: number, height?: number): this {
        layoutRoot(this, width, height);

        return this;
    }
}
