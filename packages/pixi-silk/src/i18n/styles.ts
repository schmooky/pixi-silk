import { mergeStyles, packStyle, propertyClass, STYLE_FLOATS, type ThemeData, type ThemeStyle } from './theme';

/** What a {@link StyleTable.set} changed. */
export interface StyleChange {
    /** Style rows that were rewritten. */
    rows: number[];
    /** Shape-relevant properties in the patch. */
    shapeChanged: string[];
    /**
     * The shape-relevant properties layout can follow without shaping: `size` (baked advances do not
     * depend on size), `letterSpacing` (added to the advances) and `weight` (approximated with the
     * shader's weight bias). Messages that use the style lay out again.
     */
    approximated: string[];
    /** The ones only a recompile (or a runtime shaper) can follow: `family` and `features`. */
    needsCompile: string[];
}

/** How a style row changes layout compared with what was baked. */
export interface RowLayout {
    /** Factor on the message size. */
    size: number;
    /** Letter spacing to add to each glyph, in em. */
    spacing: number;
}

/** Weight bias, in em, per unit of CSS weight a style moves away from its baked weight. */
const BIAS_PER_WEIGHT = 0.0001;

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
    /** Bumped when a change moves glyphs (size, spacing): layouts made before it are stale. */
    layoutVersion = 0;
    private readonly _rows = new Map<string, number>();
    private readonly _stacks: string[][] = [];
    private _theme: ThemeData;
    /** The theme the text was compiled with. */
    private readonly _baked: ThemeData;

    constructor(theme: ThemeData) {
        this._theme = { $silk: 2, base: { ...theme.base }, styles: { ...theme.styles } };
        this._baked = { $silk: 2, base: { ...theme.base }, styles: { ...theme.styles } };
    }

    /** Size factor and extra letter spacing of a row against the baked theme. */
    layoutOf(row: number): RowLayout {
        const stack = this.stackOf(row);
        const now = this.resolve(stack);
        const baked = mergeStyles(this._baked.base, ...stack.map((t) => this._baked.styles?.[t]));

        return {
            size: (now.size ?? 1) / (baked.size ?? 1),
            spacing: (now.letterSpacing ?? 0) - (baked.letterSpacing ?? 0),
        };
    }

    private _pack(row: number): void {
        const stack = this._stacks[row];
        const now = this.resolve(stack);
        const baked = mergeStyles(this._baked.base, ...stack.map((t) => this._baked.styles?.[t]));
        const weight = ((now.weight ?? 400) - (baked.weight ?? 400)) * BIAS_PER_WEIGHT;

        packStyle(weight ? { ...now, weightBias: (now.weightBias ?? 0) + weight } : now, this.data, row * STYLE_FLOATS);
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
        this._pack(row);
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
        const approximated: string[] = shapeChanged.filter(
            (k) => k === 'size' || k === 'letterSpacing' || k === 'weight',
        );
        const needsCompile = shapeChanged.filter((k) => !approximated.includes(k));

        if (name === 'base') this._theme.base = { ...this._theme.base, ...patch };
        else this._theme.styles = { ...this._theme.styles, [name]: { ...this._theme.styles?.[name], ...patch } };
        const rows: number[] = [];

        this._stacks.forEach((stack, row) => {
            if (name !== 'base' && !stack.includes(name)) return;
            this._pack(row);
            this._markDirty(row);
            rows.push(row);
        });
        if (approximated.some((k) => k !== 'weight')) this.layoutVersion++;

        return { rows, shapeChanged, approximated, needsCompile };
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
