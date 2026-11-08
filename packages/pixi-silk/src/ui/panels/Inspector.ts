import { Container, type FederatedPointerEvent, Rectangle, type Ticker } from 'pixi.js';
import type { HistoryLike } from '../../history';
import { Spring } from '../../motion';
import { SilkGraphics } from '../../SilkGraphics';
import { type ReadSignal, type Signal, signal } from '../../signal';
import type { SdfAtlas } from '../../text/atlas';
import type { SilkText } from '../../text/SilkText';
import { ColorModel } from '../color/model';
import { HueSquarePicker } from '../color/rings';
import { Driver } from '../driver';
import { FlexContainer } from '../layout/flex-container';
import { bindObjects, type InspectorBinding } from './binding';
import {
    ChoiceField,
    type ChoiceOption,
    ColorField,
    type Field,
    type FieldContext,
    NumberField,
    type NumberFieldOptions,
    TextField,
    ToggleField,
    VectorField,
} from './fields';
import { drawChevron } from './icons';
import { fitText, type PanelTheme, panelText, resolvePanelTheme } from './theme';

/** A number you scrub or type. */
export interface NumberFieldSpec {
    type: 'number';
    /** Dot path of the value, such as `alpha` or `position.x`. */
    key: string;
    /** Row label. Also names the undo step. */
    label?: string;
    min?: number;
    max?: number;
    /** Snap step. Default 1. */
    step?: number;
    /** Change per pixel of a scrub. Default `step`. */
    perPixel?: number;
    /** Shown after the value, such as `px`, `%` or `deg`. */
    unit?: string;
    /** Decimals shown. Default from the step. */
    precision?: number;
}

/** A one-line text field. */
export interface TextFieldSpec {
    type: 'text';
    key: string;
    label?: string;
    placeholder?: string;
}

/** An on and off switch. */
export interface ToggleFieldSpec {
    type: 'toggle';
    key: string;
    label?: string;
    /** Text after the switch. */
    text?: string;
}

/** Segmented choices. */
export interface ChoiceFieldSpec {
    type: 'choice';
    key: string;
    label?: string;
    options: readonly ChoiceOption[];
}

/** A colour swatch that opens a colour picker. Values are 0xRRGGBB numbers. */
export interface ColorFieldSpec {
    type: 'color';
    key: string;
    label?: string;
}

/** Two numbers in one row, such as X and Y, or W and H with an aspect lock. */
export interface VectorFieldSpec {
    type: 'vector';
    /** Dot paths of the two values. */
    keys: readonly [string, string];
    label?: string;
    /** Short names inside the two fields. Default `X` and `Y`. */
    labels?: readonly [string, string];
    min?: number;
    max?: number;
    step?: number;
    perPixel?: number;
    unit?: string;
    precision?: number;
    /** Shows a link button that keeps the ratio of the two values. Default false. */
    lockAspect?: boolean;
}

/** A titled group of fields that folds. */
export interface SectionSpec {
    type: 'section';
    label: string;
    /** Start folded. Default false. */
    collapsed?: boolean;
    fields: readonly InspectorField[];
}

/** One entry of an inspector schema. */
export type InspectorField =
    | NumberFieldSpec
    | TextFieldSpec
    | ToggleFieldSpec
    | ChoiceFieldSpec
    | ColorFieldSpec
    | VectorFieldSpec
    | SectionSpec;

/** Something a colour picker popover shows: a Pixi container that edits a {@link ColorModel}. */
export type ColorPickerFactory = (model: ColorModel, ticker: Ticker | null | undefined) => Container;

/** Options of {@link Inspector}. */
export interface InspectorOptions {
    /** The rows, top to bottom. */
    schema: readonly InspectorField[];
    /** What the rows edit. Default nothing: the rows show dimmed until {@link Inspector.bind}. */
    binding?: InspectorBinding | readonly object[] | null;
    /** Where edits go for undo. Every drag, toggle or commit is one step. */
    history?: HistoryLike;
    /** Width of the label column. Default 72. */
    labelWidth?: number;
    /** Row height. Default 30. */
    rowHeight?: number;
    /** Builds the colour picker of colour fields. Default a 176 pixel `HueSquarePicker`. */
    colorPicker?: ColorPickerFactory;
    /** Where colour pickers open. Default the top container of the scene at the time. */
    popoverLayer?: Container;
    /** The element the scene is drawn on, usually `app.canvas`, for text fields. */
    element?: HTMLElement;
    /** Colours, radius and font. Default the dark theme. */
    theme?: Partial<PanelTheme>;
    /** Glyph atlas of the labels. Default the shared one. */
    atlas?: SdfAtlas;
    ticker?: Ticker | null;
}

/** The reactive state of an {@link Inspector}. */
export interface InspectorState {
    /** What the rows edit. */
    binding: ReadSignal<InspectorBinding | null>;
    /** The key of the field being dragged or edited, or null. */
    editing: ReadSignal<string | null>;
}

interface Entry {
    keys: readonly string[];
    field: Field;
}

/** A section title: a chevron that turns as the section folds, and the label. */
class SectionHeader extends Container {
    private readonly _g = new SilkGraphics();
    private readonly _turn: Spring;
    private readonly _driver: Driver;
    private readonly _theme: PanelTheme;
    private _w = 100;

    constructor(theme: PanelTheme, label: SilkText, open: boolean, ticker: Ticker | null | undefined) {
        super({ label: 'SectionHeader' });
        this._theme = theme;
        this._turn = new Spring(open ? 1 : 0, 360, 30);
        this._driver = new Driver((dt) => this._step(dt), ticker);
        label.eventMode = 'none';
        label.position.set(18, 0);
        this.addChild(this._g, label);
        this.eventMode = 'static';
        this.cursor = 'pointer';
        this.hitArea = new Rectangle(0, 0, this._w, 28);
        this._draw();
    }

    set open(v: boolean) {
        this._turn.target = v ? 1 : 0;
        this._driver.wake();
    }

    resize(w: number, h: number): void {
        this._w = w;
        this.hitArea = new Rectangle(0, 0, w, h);
        const label = this.children[1] as SilkText;

        label.position.set(18, Math.round((h - label.height) / 2));
        this._draw(h);
    }

    tick(dt: number): boolean {
        return this._driver.tick(dt);
    }

    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        this._driver.sleep();
        super.destroy(options ?? { children: true });
    }

    private _step(dt: number): boolean {
        this._turn.step(dt);
        this._draw();

        return !this._turn.settled;
    }

    private _draw(h = 28): void {
        this._g.clear();
        drawChevron(this._g, 7, h / 2, 16, this._theme.textDim, 1, Math.max(0, Math.min(1, this._turn.value)));
    }
}

/**
 * A property inspector built from a schema. Rows hold number fields you scrub or type, text
 * fields, switches, segmented choices, colour swatches with a picker and vector rows with an
 * aspect lock. Sections fold. It edits whatever its {@link InspectorBinding} points at: one object,
 * a multi-selection (differing values show as Mixed) or a set of signals.
 *
 * Every drag, toggle or commit goes through `history` as one undo step. Rows are laid out with
 * the flex engine, and labels are SilkText, so the inspector stays crisp at any scale.
 *
 * @example
 * ```ts
 * const inspector = new Inspector({
 *     schema: [
 *         { type: 'vector', keys: ['position.x', 'position.y'], label: 'Position', unit: 'px' },
 *         { type: 'number', key: 'alpha', label: 'Opacity', min: 0, max: 1, step: 0.01 },
 *         { type: 'color', key: 'tint', label: 'Tint' },
 *     ],
 *     history,
 * });
 *
 * selection.state.items.subscribe((items) => inspector.bind(items));
 * panel.content.add(inspector);
 * ```
 */
export class Inspector extends FlexContainer {
    /** What it edits and which field is busy, as signals. */
    readonly state: InspectorState;
    /** Colours, radius and font. */
    readonly theme: PanelTheme;

    private readonly _o: InspectorOptions;
    private readonly _ctx: FieldContext;
    private readonly _binding: Signal<InspectorBinding | null>;
    private readonly _editing = signal<string | null>(null);
    private readonly _fields: Entry[] = [];
    private readonly _headers: SectionHeader[] = [];
    private _schema: readonly InspectorField[];
    private _unsubscribe: (() => void) | null = null;
    private _closePopover: (() => void) | null = null;
    private _writing = false;

    constructor(options: InspectorOptions) {
        super({ layout: { direction: 'column', gap: 2 }, transition: true, ticker: options.ticker });
        this.label = 'Inspector';
        this._o = options;
        this.theme = resolvePanelTheme(options.theme);
        this._binding = signal<InspectorBinding | null>(null);
        this.state = { binding: this._binding, editing: this._editing };
        this._ctx = {
            theme: this.theme,
            atlas: options.atlas,
            ticker: options.ticker,
            element: options.element,
            popover: (content, anchor, onClose) => this._popover(content, anchor, onClose),
        };
        this._schema = options.schema;
        this._build();
        this.bind(options.binding ?? null);
    }

    /** What the rows edit, or null. */
    get binding(): InspectorBinding | null {
        return this._binding.value;
    }

    /** The schema. */
    get schema(): readonly InspectorField[] {
        return this._schema;
    }

    /**
     * Points the rows at something to edit: a binding, a list of objects (edited together, with
     * {@link bindObjects}), or null for nothing.
     */
    bind(target: InspectorBinding | readonly object[] | null): this {
        this._closePopover?.();
        this._unsubscribe?.();
        this._unsubscribe = null;
        const binding =
            target === null ? null : Array.isArray(target) ? bindObjects(target) : (target as InspectorBinding);

        this._binding.set(binding);
        if (binding?.subscribe)
            this._unsubscribe = binding.subscribe(() => {
                if (!this._writing) this.refresh();
            });

        return this.refresh();
    }

    /** Replaces the rows. */
    setSchema(schema: readonly InspectorField[]): this {
        this._schema = schema;
        this._build();

        return this.refresh();
    }

    /** Reads every value again. Call it when the edited objects changed outside the inspector, such as during a gizmo drag. */
    refresh(): this {
        const b = this._binding.value;

        for (const e of this._fields) {
            // a key none of the objects has shows as empty, like no selection
            const values = e.keys.map((k) => {
                const v = b?.read(k) ?? [];

                return v.every((x) => x === undefined) ? [] : v;
            });

            e.field.show(e.keys.length > 1 ? values : values[0]);
        }

        return this;
    }

    /** The field of a key (the first key of a vector row). */
    field(key: string): Field | undefined {
        return this._fields.find((e) => e.keys.includes(key))?.field;
    }

    /** Closes an open colour picker. */
    closePopover(): void {
        this._closePopover?.();
    }

    override tick(dt: number): boolean {
        let busy = super.tick(dt);

        for (const e of this._fields) busy = e.field.tick(dt) || busy;
        for (const h of this._headers) busy = h.tick(dt) || busy;

        return busy;
    }

    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        this._closePopover?.();
        this._unsubscribe?.();
        super.destroy(options ?? { children: true });
    }

    // ------------------------------------------------------------------------------- edits

    /**
     * Starts one undoable edit of `keys`. Writes go straight to the binding. `end` records one
     * history step, with the values from before the edit and after it.
     */
    private _gesture(
        keys: readonly string[],
        label: string,
    ): {
        before: unknown[][];
        write(i: number, values: readonly unknown[]): void;
        end(): void;
    } | null {
        const binding = this._binding.value;

        if (!binding) return null;
        const before = keys.map((k) => [...binding.read(k)]);

        this._editing.set(keys[0] ?? null);

        return {
            before,
            write: (i, values) => {
                this._writing = true;
                try {
                    binding.write(keys[i], values);
                } finally {
                    this._writing = false;
                }
            },
            end: () => {
                this._editing.set(null);
                const after = keys.map((k) => [...binding.read(k)]);

                if (JSON.stringify(after) === JSON.stringify(before)) return;
                const apply = (values: unknown[][]) => {
                    this._writing = true;
                    try {
                        keys.forEach((k, i) => {
                            binding.write(k, values[i]);
                        });
                    } finally {
                        this._writing = false;
                    }
                    if (this._binding.value === binding) this.refresh();
                };

                this._o.history?.record({
                    label: `Change ${label}`,
                    do: () => apply(after),
                    undo: () => apply(before),
                });
                this.emit('change', keys, after);
            },
        };
    }

    /** Fields that write one key: begin, input and end. */
    private _numberEdit(key: string, label: string): Pick<NumberFieldOptions, 'begin' | 'input' | 'end'> {
        let g: ReturnType<Inspector['_gesture']> = null;

        return {
            begin: () => {
                g = this._gesture([key], label);
            },
            input: (values) => g?.write(0, values),
            end: () => {
                g?.end();
                g = null;
            },
        };
    }

    /** One step that sets `key` to `value` on every edited object. */
    private _set(key: string, label: string, value: unknown): void {
        const g = this._gesture([key], label);

        if (!g) return;
        g.write(
            0,
            g.before[0].map(() => value),
        );
        g.end();
        this.refresh();
    }

    // ------------------------------------------------------------------------------- rows

    private _build(): void {
        this._closePopover?.();
        for (const child of [...this.children]) child.destroy({ children: true });
        this._fields.length = 0;
        this._headers.length = 0;
        this._add(this, this._schema);
    }

    private _add(parent: FlexContainer, fields: readonly InspectorField[]): void {
        for (const spec of fields) {
            if (spec.type === 'section') this._section(parent, spec);
            else this._row(parent, spec);
        }
    }

    private _section(parent: FlexContainer, spec: SectionSpec): void {
        const ticker = this._o.ticker;
        const section = new FlexContainer({ layout: { direction: 'column', gap: 2 }, transition: true, ticker });
        const body = new FlexContainer({
            layout: { direction: 'column', gap: 2, paddingBottom: 6 },
            transition: true,
            ticker,
        });
        const title = panelText(this.theme, { text: spec.label, weight: 600, atlas: this._o.atlas });
        let open = !(spec.collapsed ?? false);
        const header = new SectionHeader(this.theme, title, open, ticker);

        header.on('pointertap', (e: FederatedPointerEvent) => {
            e.stopPropagation();
            open = !open;
            header.open = open;
            section.setLayout(body, { display: open ? 'flex' : 'none' });
            this.emit('section', spec.label, open);
        });
        this._headers.push(header);
        section.add(header, { height: 28, onSize: (w, h) => header.resize(w, h) });
        section.add(body, { display: open ? 'flex' : 'none' });
        this._add(body, spec.fields);
        parent.add(section, {});
    }

    private _row(parent: FlexContainer, spec: Exclude<InspectorField, SectionSpec>): void {
        const ctx = this._ctx;
        const rowH = this._o.rowHeight ?? 30;
        const lw = this._o.labelWidth ?? 72;
        const row = new FlexContainer({
            layout: { direction: 'row', alignItems: 'center', gap: 8, height: rowH },
            ticker: this._o.ticker,
        });
        const label = spec.label ?? '';

        if (label) {
            const text = panelText(this.theme, { color: this.theme.textDim, atlas: this._o.atlas });

            fitText(text, label, lw);
            row.add(text, { width: lw, fitAlign: [0, 0.5] });
        }
        let field: Field;
        let keys: readonly string[];

        switch (spec.type) {
            case 'number':
                keys = [spec.key];
                field = new NumberField(ctx, { ...spec, ...this._numberEdit(spec.key, label || spec.key) });
                break;
            case 'text':
                keys = [spec.key];
                field = new TextField(ctx, {
                    placeholder: spec.placeholder,
                    onCommit: (text) => this._set(spec.key, label || spec.key, text),
                });
                break;
            case 'toggle':
                keys = [spec.key];
                field = new ToggleField(ctx, {
                    text: spec.text,
                    onToggle: (v) => this._set(spec.key, label || spec.key, v),
                });
                break;
            case 'choice':
                keys = [spec.key];
                field = new ChoiceField(ctx, {
                    options: spec.options,
                    onChoose: (v) => this._set(spec.key, label || spec.key, v),
                });
                break;
            case 'color':
                keys = [spec.key];
                field = new ColorField(ctx, { onOpen: (f) => this._openColor(spec.key, label || spec.key, f) });
                break;
            default:
                keys = spec.keys;
                field = this._vector(spec, label);
        }
        row.add(field, { grow: 1, basis: 0, height: rowH - 4, onSize: (w, h) => field.resize(w, h) });
        this._fields.push({ keys, field });
        parent.add(row, {});
    }

    private _vector(spec: VectorFieldSpec, label: string): VectorField {
        const [ka, kb] = spec.keys;
        const [la, lb] = spec.labels ?? ['X', 'Y'];
        const name = label || `${ka}, ${kb}`;
        let g: ReturnType<Inspector['_gesture']> = null;
        let vector: VectorField | null = null;
        const axis = (i: 0 | 1, prefix: string): NumberFieldOptions => ({
            prefix,
            min: spec.min,
            max: spec.max,
            step: spec.step,
            perPixel: spec.perPixel,
            unit: spec.unit,
            precision: spec.precision,
            begin: () => {
                g = this._gesture(spec.keys, name);
            },
            input: (values) => {
                if (!g) return;
                g.write(i, values);
                if (!vector?.locked) return;
                // the aspect lock scales the other value by the same ratio
                const j = i === 0 ? 1 : 0;
                const mine = g.before[i] as number[];
                const other = (g.before[j] as number[]).map((v, k) => (mine[k] ? (v * values[k]) / mine[k] : v));

                g.write(j, other);
                vector.axes[j].show(other);
            },
            end: () => {
                g?.end();
                g = null;
            },
        });

        vector = new VectorField(this._ctx, {
            axes: [axis(0, la), axis(1, lb)],
            lockable: spec.lockAspect,
        });

        return vector;
    }

    // ------------------------------------------------------------------------------- colour

    private _openColor(key: string, label: string, field: ColorField): void {
        this._closePopover?.();
        const model = new ColorModel({ color: field.colors[0] ?? 0xffffff });
        const make = this._o.colorPicker ?? ((m, ticker) => new HueSquarePicker({ model: m, size: 176, ticker }));
        const picker = make(model, this._o.ticker);
        let g = this._gesture([key], label);
        const stops = [
            model.value.subscribe(() => {
                g ??= this._gesture([key], label);
                g?.write(
                    0,
                    (g?.before[0] ?? []).map(() => model.hex),
                );
                field.show((g?.before[0] ?? []).map(() => model.hex));
            }),
            // a picker commits when a drag ends: that is one undo step
            model.committed.subscribe(() => {
                g?.end();
                g = null;
            }),
        ];

        field.setOpen(true);
        this._closePopover = this._ctx.popover(picker, field.swatch, () => {
            for (const stop of stops) stop();
            g?.end();
            g = null;
            field.setOpen(false);
            this._closePopover = null;
            this.refresh();
        });
    }

    private _popover(content: Container, anchor: Container, onClose: () => void): () => void {
        let layer: Container = this._o.popoverLayer ?? this;

        if (!this._o.popoverLayer) while (layer.parent) layer = layer.parent;
        const t = this.theme;
        const catcher = new Container({ label: 'PopoverCatcher' });
        const card = new Container({ label: 'Popover' });
        const bg = new SilkGraphics();
        const pad = 12;

        // pickers draw on their first frame: draw now, so they can be measured
        (content as Container & { tick?: (dt: number) => unknown }).tick?.(0);
        const b = content.getLocalBounds();
        const w = b.width + pad * 2;
        const h = b.height + pad * 2;

        bg.roundRect(0, 8, w, h, t.radius, 0.6).fill({ color: t.shadow, alpha: t.shadowAlpha * 0.7, blur: 16 });
        bg.roundRect(0, 0, w, h, t.radius, 0.6).fill(t.background);
        bg.roundRect(0, 0, w, h, t.radius, 0.6).stroke({ width: 1, color: t.border, alignment: 'inside' });
        content.position.set(pad - b.x, pad - b.y);
        card.addChild(bg, content);
        card.eventMode = 'static';
        card.on('pointerdown', (e: FederatedPointerEvent) => e.stopPropagation());
        // a press anywhere else closes it
        catcher.eventMode = 'static';
        catcher.hitArea = new Rectangle(-1e6, -1e6, 2e6, 2e6);
        layer.addChild(catcher, card);
        // left of the inspector when there is room, else under the anchor
        const box = this.getBounds();
        const at = anchor.getBounds();
        const topLeft = layer.toLocal({ x: box.minX - 10, y: at.minY - 8 });
        const k = Math.abs(layer.worldTransform.a) || 1;
        const local =
            topLeft.x - w >= 0 ? { x: topLeft.x - w, y: topLeft.y } : layer.toLocal({ x: at.minX, y: at.maxY + 8 });

        card.position.set(Math.round(local.x), Math.round(Math.max(4 / k, local.y)));
        let open = true;
        const close = () => {
            if (!open) return;
            open = false;
            catcher.destroy();
            card.destroy({ children: true });
            onClose();
        };

        catcher.on('pointerdown', (e: FederatedPointerEvent) => {
            e.stopPropagation();
            close();
        });

        return close;
    }
}
