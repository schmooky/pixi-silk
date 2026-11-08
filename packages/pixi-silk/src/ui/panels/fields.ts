import { Container, type FederatedPointerEvent, Rectangle, type Ticker } from 'pixi.js';
import { damp, Spring } from '../../motion';
import { SilkGraphics } from '../../SilkGraphics';
import type { SdfAtlas } from '../../text/atlas';
import type { SilkText } from '../../text/SilkText';
import { Driver } from '../driver';
import { altDown, shiftDown } from '../keys';
import { FlexContainer } from '../layout/flex-container';
import { mix } from '../paint';
import { TextEditor } from '../textedit';
import { fieldValue } from './binding';
import { drawLink } from './icons';
import { fitText, type PanelTheme, panelText } from './theme';

/** What every field needs from the inspector around it. */
export interface FieldContext {
    /** Resolved panel colours, radius and font. */
    theme: PanelTheme;
    /** Glyph atlas of the field text. Default the shared one. */
    atlas?: SdfAtlas;
    /** Ticker driving the motion. Default `Ticker.shared`. `null` for manual `tick` calls. */
    ticker?: Ticker | null;
    /** The element the scene is drawn on. Text editing positions its hidden input against it. */
    element?: HTMLElement;
    /** Opens `content` as a popover next to `anchor`. Returns the function that closes it. */
    popover(content: Container, anchor: Container, onClose: () => void): () => void;
}

/** The callbacks of a field's edit gesture: one `begin`, any number of `input`, one `end`. */
export interface FieldEdit<V> {
    /** A gesture starts. Capture the values to undo to. */
    begin(): void;
    /** New values, one per edited object, while the gesture runs. Write them through. */
    input(values: readonly V[]): void;
    /** The gesture ends. Record one undo step. */
    end(): void;
}

const decimals = (step: number): number =>
    !(step > 0) || step >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(step) - 1e-9));

/**
 * A field: a box of a given size that shows values and edits them. It holds no data. It shows what
 * {@link Field.show} gives it and reports edits through its options. The `Inspector` builds these.
 */
export abstract class Field extends Container {
    protected readonly _ctx: FieldContext;
    protected readonly _driver: Driver;
    protected readonly _g: SilkGraphics = new SilkGraphics();
    protected _w: number = 120;
    protected _h: number = 24;
    protected _hover: number = 0;
    protected _hovered: boolean = false;
    protected _enabled: boolean = true;

    constructor(ctx: FieldContext, label: string) {
        super({ label });
        this._ctx = ctx;
        this._driver = new Driver((dt) => this._step(dt), ctx.ticker);
        this.addChild(this._g);
        this.eventMode = 'static';
        this.hitArea = new Rectangle(0, 0, this._w, this._h);
        this.on('pointerover', () => {
            this._hovered = true;
            this._driver.wake();
        });
        this.on('pointerout', () => {
            this._hovered = false;
            this._driver.wake();
        });
    }

    /** Width of the field box. Default 120 until {@link Field.resize}. */
    get fieldWidth(): number {
        return this._w;
    }

    /** Sets the size of the field box and redraws. */
    resize(width: number, height: number): void {
        if (width === this._w && height === this._h) return;
        this._w = Math.max(0, width);
        this._h = Math.max(0, height);
        (this.hitArea as Rectangle).width = this._w;
        (this.hitArea as Rectangle).height = this._h;
        this._layout();
        this._draw();
    }

    /** False dims the field and ignores input, while nothing is edited. */
    setEnabled(on: boolean): void {
        if (on === this._enabled) return;
        this._enabled = on;
        this.eventMode = on ? 'static' : 'none';
        this.alpha = on ? 1 : 0.4;
    }

    /** Shows the values of the edited objects, one per object. Differing values show as mixed. An empty list disables the field. */
    abstract show(values: readonly unknown[]): void;

    /** Advances the motion by `dt` seconds (only needed with `ticker: null`). Returns true while moving. */
    tick(dt: number): boolean {
        return this._driver.tick(dt);
    }

    /** Stops the animation. Destroys children unless `options` says otherwise. */
    override destroy(options?: Parameters<Container['destroy']>[0]): void {
        this._driver.sleep();
        super.destroy(options ?? { children: true });
    }

    protected _layout(): void {}

    protected abstract _draw(): void;

    protected _step(dt: number): boolean {
        const t = this._hovered ? 1 : 0;

        this._hover = damp(this._hover, t, 18, dt);
        this._draw();

        return Math.abs(this._hover - t) > 0.01;
    }

    /** The field box. */
    protected _box(focus = 0): void {
        const t = this._ctx.theme;
        const r = Math.min(t.radius * 0.5, this._h / 2);

        this._g.clear();
        this._g.roundRect(0, 0, this._w, this._h, r, 0.6).fill(mix(t.field, t.fieldHover, this._hover));
        if (focus > 0.01) {
            this._g.roundRect(0, 0, this._w, this._h, r, 0.6).stroke({
                width: 1.25,
                color: t.accent,
                alpha: focus,
                alignment: 'inside',
            });
        }
    }
}

/** Options of {@link NumberField}. */
export interface NumberFieldOptions extends FieldEdit<number> {
    /** A short name inside the field, such as `X` or `W`. Drag it to scrub. */
    prefix?: string;
    /** Lowest value. Scrubs and typed values clamp to it. Default no limit. */
    min?: number;
    /** Highest value. Scrubs and typed values clamp to it. Default no limit. */
    max?: number;
    /** Snap step of scrubs. Default 1. */
    step?: number;
    /** Change per pixel of a scrub. Default `step`. */
    perPixel?: number;
    /** Shown after the value, such as `px` or `%`. */
    unit?: string;
    /** Decimals shown. Default from the step. */
    precision?: number;
}

/**
 * A number you drag or type. Drag sideways to scrub: Shift is ten times faster, Alt ten times
 * finer. Click without dragging to type a value. Mixed values scrub together, each from its own
 * start.
 */
export class NumberField extends Field {
    private readonly _o: NumberFieldOptions;
    private readonly _prefix: SilkText | null;
    private readonly _value: SilkText;
    private readonly _unit: SilkText | null;
    private _values: number[] = [];
    private _mixed = false;
    private _empty = true;
    private _press: { id: number; x: number; moved: boolean; base: number[]; acc: number; last: number } | null = null;
    private _focus = 0;
    private _editor: TextEditor | null = null;

    constructor(ctx: FieldContext, options: NumberFieldOptions) {
        super(ctx, 'NumberField');
        this._o = options;
        const t = ctx.theme;

        this._prefix = options.prefix
            ? panelText(t, { text: options.prefix, color: t.textDim, atlas: ctx.atlas })
            : null;
        this._value = panelText(t, { atlas: ctx.atlas });
        this._unit = options.unit ? panelText(t, { text: options.unit, color: t.textDim, atlas: ctx.atlas }) : null;
        for (const s of [this._prefix, this._value, this._unit]) {
            if (!s) continue;
            s.eventMode = 'none';
            this.addChild(s);
        }
        this.cursor = 'ew-resize';
        this.on('pointerdown', this._onDown, this);
        this.on('globalpointermove', this._onMove, this);
        this.on('pointerup', this._onUp, this);
        this.on('pointerupoutside', this._onUp, this);
        this._layout();
        this._draw();
    }

    /** The values shown, one per edited object. */
    get values(): readonly number[] {
        return this._values;
    }

    /** True while the values differ. */
    get mixed(): boolean {
        return this._mixed;
    }

    show(values: readonly unknown[]): void {
        const nums = values.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0));
        const f = fieldValue(nums);

        this._values = nums;
        this._mixed = f.mixed;
        this._empty = f.empty;
        this.setEnabled(!f.empty);
        this._text();
    }

    /** Starts a scrub, as a press does. */
    beginScrub(): void {
        this._o.begin();
        const p = this._press ?? { id: -1, x: 0, moved: true, base: [], acc: 0, last: 0 };

        p.moved = true;
        p.base = [...this._values];
        p.acc = 0;
        p.last = 0;
        this._press = p;
    }

    /** Scrubs to `dx` pixels from the start. `speed` multiplies the change, as Shift and Alt do. No-op outside a scrub. */
    scrubTo(dx: number, speed = 1): void {
        const p = this._press;

        if (!p) return;
        const step = this._o.step ?? 1;
        const per = this._o.perPixel ?? step;

        p.acc += (dx - p.last) * per * speed;
        p.last = dx;
        const out = p.base.map((b) => this._clamp(Math.round((b + p.acc) / step) * step));

        this._values = out;
        this._mixed = fieldValue(out).mixed;
        this._text();
        this._o.input(out);
    }

    /** Ends a scrub: one undo step. */
    endScrub(): void {
        this._press = null;
        this._o.end();
        this._driver.wake();
    }

    /**
     * Sets every value from typed text, as one undo step. A trailing unit and a decimal comma are
     * accepted. Returns false and changes nothing for text that is not a number.
     */
    commitText(text: string): boolean {
        const v = Number.parseFloat(text.replace(this._o.unit ?? '\u0000', '').replace(',', '.'));

        if (!Number.isFinite(v)) {
            this._text();

            return false;
        }
        const value = this._clamp(v);

        this._o.begin();
        this._values = this._values.map(() => value);
        this._mixed = false;
        this._o.input(this._values);
        this._o.end();
        this._text();

        return true;
    }

    private _clamp(v: number): number {
        const p = this._o.precision ?? decimals(this._o.step ?? 1);
        const k = 10 ** p;
        const r = Math.round(v * k) / k;

        return Math.max(this._o.min ?? -Infinity, Math.min(this._o.max ?? Infinity, r));
    }

    private _format(v: number): string {
        const p = this._o.precision ?? decimals(this._o.step ?? 1);

        return String(Number(v.toFixed(p)));
    }

    private _text(): void {
        const v = this._values[0];
        const label = this._empty ? '' : this._mixed ? 'Mixed' : this._format(v ?? 0);

        this._value.fill = this._mixed ? this._ctx.theme.textDim : this._ctx.theme.text;
        fitText(this._value, label, this._valueWidth());
    }

    private _valueWidth(): number {
        const left = this._prefix ? this._prefix.width + 14 : 8;
        const right = this._unit ? this._unit.width + 12 : 8;

        return Math.max(0, this._w - left - right);
    }

    protected override _layout(): void {
        const h = this._h;
        let x = 8;

        if (this._prefix) {
            this._prefix.position.set(x, Math.round((h - this._prefix.height) / 2));
            x += this._prefix.width + 6;
        }
        this._value.position.set(x, Math.round((h - this._value.height) / 2));
        if (this._unit)
            this._unit.position.set(this._w - this._unit.width - 8, Math.round((h - this._unit.height) / 2));
        this._text();
    }

    protected override _step(dt: number): boolean {
        const busy = super._step(dt);
        const t = this._press?.moved || this._editor ? 1 : 0;

        this._focus = damp(this._focus, t, 20, dt);
        this._draw();

        return busy || Math.abs(this._focus - t) > 0.01;
    }

    protected _draw(): void {
        this._box(this._focus);
    }

    private _onDown(e: FederatedPointerEvent): void {
        if (this._press || this._editor || e.button > 0) return;
        e.stopPropagation();
        this._press = { id: e.pointerId, x: this.toLocal(e.global).x, moved: false, base: [], acc: 0, last: 0 };
    }

    private _onMove(e: FederatedPointerEvent): void {
        const p = this._press;

        if (!p || e.pointerId !== p.id) return;
        const dx = this.toLocal(e.global).x - p.x;

        if (!p.moved) {
            if (Math.abs(dx) < 3) return;
            this.beginScrub();
            // start from here, so passing the slop does not jump the value
            p.last = dx;
            this._driver.wake();
        }
        this.scrubTo(dx, shiftDown() ? 10 : altDown() ? 0.1 : 1);
    }

    private _onUp(e: FederatedPointerEvent): void {
        const p = this._press;

        if (!p || e.pointerId !== p.id) return;
        if (p.moved) this.endScrub();
        else {
            this._press = null;
            this._edit();
        }
    }

    /** Opens the text editor over the value. */
    private _edit(): void {
        const t = this._ctx.theme;
        const editor = new TextEditor({
            text: this._mixed ? '' : this._format(this._values[0] ?? 0),
            placeholder: this._mixed ? 'Mixed' : undefined,
            multiline: false,
            width: Math.max(24, this._valueWidth()),
            fontFamily: t.fontFamily,
            fontSize: t.fontSize,
            fontWeight: 500,
            fill: t.text,
            atlas: this._ctx.atlas,
            element: this._ctx.element,
            ticker: this._ctx.ticker,
            theme: { caret: t.accent, selection: t.accent },
        });
        const done = () => {
            if (this._editor !== editor) return;
            this._editor = null;
            this._value.visible = true;
            this.commitText(editor.value);
            editor.destroy();
            this._driver.wake();
        };

        editor.position.copyFrom(this._value.position);
        editor.on('submit', () => editor.blur());
        editor.on('blur', done);
        this._editor = editor;
        this._value.visible = false;
        this.addChild(editor);
        editor.focus(true);
        this._driver.wake();
    }
}

/** Options of {@link TextField}. */
export interface TextFieldOptions {
    /** Text shown while the field is empty. */
    placeholder?: string;
    /** Called with the new text once per commit (Enter or blur). */
    onCommit(text: string): void;
}

/** A one-line text field, edited in place with a {@link TextEditor}. */
export class TextField extends Field {
    private readonly _o: TextFieldOptions;
    private _editor: TextEditor | null = null;
    private _editorW = -1;
    private _text = '';
    private _mixed = false;
    private _focus = 0;

    constructor(ctx: FieldContext, options: TextFieldOptions) {
        super(ctx, 'TextField');
        this._o = options;
        this.cursor = 'text';
        this.on('pointerdown', (e: FederatedPointerEvent) => {
            if (e.target === this) this._editor?.focus();
        });
        this._make();
    }

    /** The editor inside the field. A resize replaces it with a new one, so do not keep a reference. */
    get editor(): TextEditor | null {
        return this._editor;
    }

    show(values: readonly unknown[]): void {
        const f = fieldValue(values);

        this._mixed = f.mixed;
        this._text = f.empty || f.mixed ? '' : String(f.value ?? '');
        this.setEnabled(!f.empty);
        const e = this._editor;

        if (e && !e.focused) {
            e.value = this._text;
            e.placeholderObject.text = this._mixed ? 'Mixed' : (this._o.placeholder ?? '');
        }
    }

    protected override _layout(): void {
        if (this._editor && this._editorW !== this._w && !this._editor.focused) this._make();
        if (this._editor) this._editor.position.set(8, Math.round((this._h - this._editor.textObject.height) / 2));
    }

    private _make(): void {
        this._editor?.destroy();
        this._editorW = this._w;
        const t = this._ctx.theme;
        const editor = new TextEditor({
            text: this._text,
            placeholder: this._mixed ? 'Mixed' : this._o.placeholder,
            multiline: false,
            width: Math.max(24, this._w - 16),
            fontFamily: t.fontFamily,
            fontSize: t.fontSize,
            fontWeight: 500,
            fill: t.text,
            atlas: this._ctx.atlas,
            element: this._ctx.element,
            ticker: this._ctx.ticker,
            theme: { caret: t.accent, selection: t.accent },
        });

        editor.on('submit', () => editor.blur());
        editor.on('change', (text: string) => {
            if (text !== this._text) {
                this._text = text;
                this._o.onCommit(text);
            }
        });
        editor.state.focused.subscribe(() => this._driver.wake());
        this._editor = editor;
        this.addChild(editor);
        this._layout();
    }

    protected override _step(dt: number): boolean {
        const busy = super._step(dt);
        const t = this._editor?.focused ? 1 : 0;

        this._focus = damp(this._focus, t, 20, dt);
        this._draw();

        return busy || Math.abs(this._focus - t) > 0.01;
    }

    protected _draw(): void {
        this._box(this._focus);
    }
}

/** Options of {@link ToggleField}. */
export interface ToggleFieldOptions {
    /** Text after the switch. */
    text?: string;
    /** Called with the new state, which applies to every edited object. */
    onToggle(value: boolean): void;
}

/** An on and off switch with a springy knob. Mixed values park the knob in the middle. */
export class ToggleField extends Field {
    private readonly _o: ToggleFieldOptions;
    private readonly _label: SilkText | null;
    private readonly _knob = new Spring(0, 420, 28);
    private _on = false;
    private _mixed = false;

    constructor(ctx: FieldContext, options: ToggleFieldOptions) {
        super(ctx, 'ToggleField');
        this._o = options;
        this._label = options.text ? panelText(ctx.theme, { text: options.text, atlas: ctx.atlas }) : null;
        if (this._label) {
            this._label.eventMode = 'none';
            this.addChild(this._label);
        }
        this.cursor = 'pointer';
        this.on('pointertap', (e: FederatedPointerEvent) => {
            e.stopPropagation();
            this.toggle();
        });
    }

    /** True when on (and not mixed). */
    get value(): boolean {
        return this._on && !this._mixed;
    }

    show(values: readonly unknown[]): void {
        const f = fieldValue(values.map(Boolean));

        this._on = f.value === true;
        this._mixed = f.mixed;
        this.setEnabled(!f.empty);
        this._knob.target = this._mixed ? 0.5 : this._on ? 1 : 0;
        this._driver.wake();
    }

    /** Flips the switch: on for every edited object, unless all were on. */
    toggle(): void {
        const next = this._mixed ? true : !this._on;

        this._on = next;
        this._mixed = false;
        this._knob.target = next ? 1 : 0;
        this._o.onToggle(next);
        this._driver.wake();
    }

    protected override _layout(): void {
        this._label?.position.set(40, Math.round((this._h - this._label.height) / 2));
    }

    protected override _step(dt: number): boolean {
        const busy = super._step(dt);

        this._knob.step(dt);
        this._draw();

        return busy || !this._knob.settled;
    }

    protected _draw(): void {
        const t = this._ctx.theme;
        const g = this._g;
        const h = 18;
        const w = 32;
        const y = (this._h - h) / 2;
        const k = Math.max(-0.1, Math.min(1.1, this._knob.value));
        const on = Math.max(0, Math.min(1, k));

        g.clear();
        g.rect(0, 0, this._w, this._h).fill({ color: 0, alpha: 0 });
        g.pill(0, y, w, h).fill(mix(mix(t.track, t.fieldHover, this._hover * 0.5), t.accent, this._mixed ? 0.35 : on));
        const r = h / 2 - 2;
        const cx = 2 + r + (w - 4 - r * 2) * k;

        g.circle(cx, y + h / 2 + 0.5, r).fill({ color: 0x000000, alpha: 0.25, blur: 1.5 });
        g.circle(cx, y + h / 2, r).fill(0xffffff);
        if (this._mixed) g.rect(cx - 3, y + h / 2 - 0.75, 6, 1.5).fill(t.track);
    }
}

/** One choice of a {@link ChoiceField}. */
export interface ChoiceOption {
    /** Value written to the edited objects. Compared with `===`. */
    value: string | number | boolean;
    /** Text of the segment. */
    label: string;
}

/** Options of {@link ChoiceField}. */
export interface ChoiceFieldOptions {
    /** The choices, left to right, sharing the width equally. */
    options: readonly ChoiceOption[];
    /** Called with the chosen value. */
    onChoose(value: ChoiceOption['value']): void;
}

/**
 * Segmented choices: a thumb slides to the chosen one and stretches on the way, like
 * `SegmentedSwitch`, but it fills its row and shows no thumb for mixed values.
 */
export class ChoiceField extends Field {
    private readonly _o: ChoiceFieldOptions;
    private readonly _labels: SilkText[];
    private readonly _left = new Spring(0, 420, 32);
    private readonly _right = new Spring(0, 420, 32);
    private _index = -1;
    private _thumb = 0;

    constructor(ctx: FieldContext, options: ChoiceFieldOptions) {
        super(ctx, 'ChoiceField');
        this._o = options;
        this._labels = options.options.map((o) => {
            const s = panelText(ctx.theme, { text: o.label, anchor: 0.5, atlas: ctx.atlas });

            s.eventMode = 'none';
            this.addChild(s);

            return s;
        });
        this.cursor = 'pointer';
        this.on('pointertap', (e: FederatedPointerEvent) => {
            e.stopPropagation();
            const n = this._labels.length;
            const i = Math.max(0, Math.min(n - 1, Math.floor((this.toLocal(e.global).x / this._w) * n)));

            this.choose(i);
        });
    }

    /** The chosen index, or -1 when mixed or empty. */
    get index(): number {
        return this._index;
    }

    show(values: readonly unknown[]): void {
        const f = fieldValue(values);
        const i = f.mixed || f.empty ? -1 : this._o.options.findIndex((o) => o.value === f.value);

        this.setEnabled(!f.empty);
        this._aim(i, this._index < 0);
    }

    /** Chooses option `i` for every edited object. */
    choose(i: number): void {
        const o = this._o.options[i];

        if (!o) return;
        this._aim(i, this._index < 0);
        this._o.onChoose(o.value);
    }

    private _edges(i: number): [number, number] {
        const n = Math.max(1, this._labels.length);
        const sw = this._w / n;

        return [i * sw + 2, (i + 1) * sw - 2];
    }

    private _aim(i: number, jump: boolean): void {
        const was = this._index;

        this._index = i;
        if (i >= 0) {
            const [l, r] = this._edges(i);
            const right = was >= 0 && i > was;

            // the leading edge moves first, so the thumb stretches
            this._left.stiffness = right ? 260 : 520;
            this._right.stiffness = right ? 520 : 260;
            this._left.target = l;
            this._right.target = r;
            if (jump) {
                this._left.value = l;
                this._right.value = r;
            }
        }
        this._driver.wake();
    }

    protected override _layout(): void {
        const n = Math.max(1, this._labels.length);
        const sw = this._w / n;

        this._labels.forEach((s, i) => {
            s.position.set(Math.round(sw * i + sw / 2), Math.round(this._h / 2));
        });
        if (this._index >= 0) this._aim(this._index, true);
    }

    protected override _step(dt: number): boolean {
        const busy = super._step(dt);
        const t = this._index >= 0 ? 1 : 0;

        this._left.step(dt);
        this._right.step(dt);
        this._thumb = damp(this._thumb, t, 18, dt);
        this._draw();

        return busy || !this._left.settled || !this._right.settled || Math.abs(this._thumb - t) > 0.01;
    }

    protected _draw(): void {
        const t = this._ctx.theme;
        const g = this._g;
        const r = Math.min(t.radius * 0.5, this._h / 2);

        g.clear();
        g.roundRect(0, 0, this._w, this._h, r, 0.6).fill(mix(t.field, t.fieldHover, this._hover));
        if (this._thumb > 0.01) {
            const l = Math.min(this._left.value, this._right.value - 8);

            g.roundRect(l, 2, this._right.value - l, this._h - 4, r - 2, 0.6).fill({
                color: t.track,
                alpha: this._thumb,
            });
        }
        const n = Math.max(1, this._labels.length);
        const sw = this._w / n;
        const mid = (this._left.value + this._right.value) / 2;

        this._labels.forEach((s, i) => {
            const c = sw * i + sw / 2;
            const near = this._thumb * Math.max(0, 1 - Math.abs(c - mid) / sw);

            s.fill = mix(t.textDim, t.text, near);
        });
    }
}

/** Options of {@link ColorField}. */
export interface ColorFieldOptions {
    /** Opens the colour picker for the swatch. */
    onOpen(field: ColorField): void;
}

/** A colour swatch and its hex code. A press opens the colour picker. */
export class ColorField extends Field {
    private readonly _o: ColorFieldOptions;
    private readonly _hex: SilkText;
    private _colors: number[] = [];
    private _mixed = false;
    private _open = 0;
    /** True while the picker is open. Set it with {@link ColorField.setOpen}. */
    opened = false;

    constructor(ctx: FieldContext, options: ColorFieldOptions) {
        super(ctx, 'ColorField');
        this._o = options;
        this._hex = panelText(ctx.theme, { atlas: ctx.atlas, color: ctx.theme.text });
        this._hex.eventMode = 'none';
        this.addChild(this._hex);
        this.cursor = 'pointer';
        this.on('pointertap', (e: FederatedPointerEvent) => {
            e.stopPropagation();
            if (!this.opened) this._o.onOpen(this);
        });
    }

    /** Marks the picker open or closed, which lights the field's outline. */
    setOpen(open: boolean): void {
        this.opened = open;
        this._driver.wake();
    }

    /** The colours shown, as 0xRRGGBB. */
    get colors(): readonly number[] {
        return this._colors;
    }

    /** The swatch, for placing the picker next to it. */
    get swatch(): Container {
        return this._g;
    }

    show(values: readonly unknown[]): void {
        const nums = values.map((v) => (typeof v === 'number' ? v : 0));
        const f = fieldValue(nums);

        this._colors = nums;
        this._mixed = f.mixed;
        this.setEnabled(!f.empty);
        this._hex.text = f.empty ? '' : f.mixed ? 'Mixed' : (nums[0] ?? 0).toString(16).padStart(6, '0').toUpperCase();
        this._hex.fill = f.mixed ? this._ctx.theme.textDim : this._ctx.theme.text;
        this._draw();
    }

    protected override _layout(): void {
        this._hex.position.set(this._h + 8, Math.round((this._h - this._hex.height) / 2));
    }

    protected override _step(dt: number): boolean {
        const busy = super._step(dt);
        const t = this.opened ? 1 : 0;

        this._open = damp(this._open, t, 20, dt);
        this._draw();

        return busy || Math.abs(this._open - t) > 0.01;
    }

    protected _draw(): void {
        this._box(this._open);
        const t = this._ctx.theme;
        const g = this._g;
        const s = this._h - 8;
        const r = Math.min(4, s / 2);
        const [a = 0, b = a] = this._colors;

        if (this._mixed) {
            g.roundRect(4, 4, s, s, r).fill(a);
            g.poly([4 + s, 4, 4 + s, 4 + s, 4, 4 + s]).fill(b);
        } else g.roundRect(4, 4, s, s, r).fill(a);
        g.roundRect(4, 4, s, s, r).stroke({ width: 1, color: t.border, alignment: 'inside' });
    }
}

/** Options of {@link VectorField}. */
export interface VectorFieldOptions {
    /** One number field per axis. */
    axes: readonly [NumberFieldOptions, NumberFieldOptions];
    /** Shows a link button that keeps the ratio of the two values. Default false. */
    lockable?: boolean;
    /** Start linked. Default false. */
    locked?: boolean;
    /** Called when the link button flips. */
    onLock?(locked: boolean): void;
}

/** Two number fields in a row, such as X and Y or W and H, with an optional aspect lock. */
export class VectorField extends Field {
    /** The field of each axis. */
    readonly axes: readonly [NumberField, NumberField];
    private readonly _row: FlexContainer;
    private readonly _link = new SilkGraphics();
    private readonly _o: VectorFieldOptions;
    private _locked: boolean;

    constructor(ctx: FieldContext, options: VectorFieldOptions) {
        super(ctx, 'VectorField');
        this._o = options;
        this._locked = options.locked ?? false;
        this.axes = [new NumberField(ctx, options.axes[0]), new NumberField(ctx, options.axes[1])];
        this._row = new FlexContainer({ layout: { direction: 'row', gap: 6, alignItems: 'stretch' }, ticker: null });
        for (const f of this.axes) this._row.add(f, { grow: 1, basis: 0, onSize: (w, h) => f.resize(w, h) });
        if (options.lockable) {
            this._link.eventMode = 'static';
            this._link.cursor = 'pointer';
            this._link.hitArea = new Rectangle(0, 0, 20, 24);
            // a fixed box, so the flex row places it the same before and after it is drawn
            this._link.boundsArea = new Rectangle(0, 0, 20, 24);
            this._link.on('pointertap', (e: FederatedPointerEvent) => {
                e.stopPropagation();
                this.setLocked(!this._locked);
                this._o.onLock?.(this._locked);
            });
            this._row.add(this._link, { width: 20, height: 24, alignSelf: 'center' });
        }
        this.addChild(this._row);
        this.eventMode = 'passive';
    }

    /** True while the two values keep their ratio. */
    get locked(): boolean {
        return this._locked;
    }

    /** Links or unlinks the two values. */
    setLocked(locked: boolean): void {
        this._locked = locked;
        this._draw();
    }

    show(values: readonly unknown[]): void {
        const [a = [], b = []] = values as readonly (readonly unknown[])[];

        this.axes[0].show(a);
        this.axes[1].show(b);
    }

    override tick(dt: number): boolean {
        const a = super.tick(dt);
        const b = this.axes[0].tick(dt);
        const c = this.axes[1].tick(dt);

        return a || b || c;
    }

    protected override _layout(): void {
        this._row.resize(this._w, this._h).updateLayout();
    }

    protected _draw(): void {
        const t = this._ctx.theme;

        this._g.clear();
        this._link.clear();
        if (!this._o.lockable) return;
        this._link.rect(0, 0, 20, 24).fill({ color: 0, alpha: 0 });
        drawLink(this._link, 10, 12, 20, this._locked ? t.accent : t.textDim, 1, this._locked);
    }
}
