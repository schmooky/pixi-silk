import { mergeStyles, packStyle, propertyClass, STYLE_FLOATS, type ThemeData, type ThemeStyle } from './theme';

/** What a {@link StyleTable.set} changed. */
export interface StyleChange {
    /** Style rows that were rewritten. */
    rows: number[];
    /** Shape-relevant properties in the patch: baked text cannot follow them without a recompile. */
    shapeChanged: string[];
}

/**
 * The style rows of a theme: one row per unique stack of tags in use (the base style, then each tag
 * from the outermost in). Rows are packed by {@link packStyle} into one Float32Array, ready to upload
 * as a data texture. Changing a paint property rewrites only the rows that include that tag.
 */
export class StyleTable {
    /** Rows, `STYLE_FLOATS` floats each. Grows by doubling. */
    data: Float32Array = new Float32Array(STYLE_FLOATS * 16);
    /** Rows in use. */
    count = 0;
    /** Bumped on every change, so renderers know to upload. */
    version = 0;
    /** Lowest and highest row changed since the renderer last uploaded, or -1. */
    dirtyFrom = -1;
    /** Highest row changed since the last upload. */
    dirtyTo = -1;
    private readonly _rows = new Map<string, number>();
    private readonly _stacks: string[][] = [];
    private _theme: ThemeData;

    constructor(theme: ThemeData) {
        this._theme = { $silk: 2, base: { ...theme.base }, styles: { ...theme.styles } };
    }

    /** The theme as it is now, edits included. */
    get theme(): Readonly<ThemeData> {
        return this._theme;
    }

    /** The resolved style of a stack of tags, outer first. */
    resolve(tags: readonly string[]): ThemeStyle {
        return mergeStyles(this._theme.base, ...tags.map((t) => this._theme.styles?.[t]));
    }

    /** Row index of a stack of tags, outer first. Adds the row on first use. */
    rowFor(tags: readonly string[]): number {
        const key = tags.join('\u0000');
        let row = this._rows.get(key);

        if (row !== undefined) return row;
        row = this.count++;
        if (this.count * STYLE_FLOATS > this.data.length) {
            const grown = new Float32Array(this.data.length * 2);

            grown.set(this.data);
            this.data = grown;
        }
        this._rows.set(key, row);
        this._stacks[row] = [...tags];
        packStyle(this.resolve(tags), this.data, row * STYLE_FLOATS);
        this._markDirty(row);

        return row;
    }

    /** The tag stack of a row. */
    stackOf(row: number): readonly string[] {
        return this._stacks[row] ?? [];
    }

    /**
     * Changes a style (`base` for untagged text) and rewrites every row that uses it. Paint
     * properties take effect on the next upload. Shape-relevant ones are stored but reported in
     * `shapeChanged`, because baked text was shaped without them.
     */
    set(name: string, patch: ThemeStyle): StyleChange {
        const shapeChanged = Object.keys(patch).filter((k) => propertyClass(k) === 'shape');

        if (name === 'base') this._theme.base = { ...this._theme.base, ...patch };
        else this._theme.styles = { ...this._theme.styles, [name]: { ...this._theme.styles?.[name], ...patch } };
        const rows: number[] = [];

        this._stacks.forEach((stack, row) => {
            if (name !== 'base' && !stack.includes(name)) return;
            packStyle(this.resolve(stack), this.data, row * STYLE_FLOATS);
            this._markDirty(row);
            rows.push(row);
        });

        return { rows, shapeChanged };
    }

    /** Forgets the dirty range after a renderer uploaded it. */
    clean(): void {
        this.dirtyFrom = -1;
        this.dirtyTo = -1;
    }

    private _markDirty(row: number): void {
        this.dirtyFrom = this.dirtyFrom < 0 ? row : Math.min(this.dirtyFrom, row);
        this.dirtyTo = Math.max(this.dirtyTo, row);
        this.version++;
    }
}
