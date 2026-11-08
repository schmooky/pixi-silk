import {
    type ColorSource,
    Container,
    type DestroyOptions,
    type FederatedPointerEvent,
    Graphics,
    Matrix,
    type PointData,
    Rectangle,
    type Ticker,
} from 'pixi.js';
import { type Command, History, type HistoryLike } from '../history';
import { damp, Spring } from '../motion';
import { SilkGraphics } from '../SilkGraphics';
import { type ReadSignal, type Signal, signal } from '../signal';
import { type CaretHit, caretAtPoint, lineOfIndex } from '../text/layout';
import { SilkText, type SilkTextOptions } from '../text/SilkText';
import { graphemeStops, isMac, nextWordStop, paragraphAt, previousWordStop, wordAt } from '../text/segment';
import { Driver } from './driver';

/** A selection: where it started (`anchor`) and where the caret is (`focus`). Equal for a plain caret. */
export interface TextSelection {
    /** Offset where the selection started. */
    readonly anchor: number;
    /** Offset of the caret, the end that moves. */
    readonly focus: number;
}

/** Colours of a {@link TextEditor}. */
export interface TextEditorTheme {
    /** Caret colour. */
    caret: ColorSource;
    /** Selection highlight while the editor has focus. */
    selection: ColorSource;
    /** Opacity of the highlight, 0 to 1. */
    selectionAlpha: number;
    /** Underline of text an input method is still composing. */
    composition: ColorSource;
    /** Opacity of the placeholder text, 0 to 1. */
    placeholderAlpha: number;
}

/** Default colours of a {@link TextEditor}: a blue caret and highlight. Override single values with the `theme` option. */
export const TEXT_EDITOR_THEME: Readonly<TextEditorTheme> = {
    caret: 0x0a84ff,
    selection: 0x0a84ff,
    selectionAlpha: 0.32,
    composition: 0x0a84ff,
    placeholderAlpha: 0.4,
};

/** Options of a {@link TextEditor}: the text style plus how it edits. */
export interface TextEditorOptions extends Omit<SilkTextOptions, 'wordWrap' | 'wordWrapWidth' | 'label'> {
    /** Starting text. Default empty. */
    text?: string;
    /** Several lines (a text area) or one (an input). Default true. */
    multiline?: boolean;
    /**
     * Fixed width in local units. A multi-line editor wraps at it. A single-line one clips its text and
     * scrolls it to keep the caret in view. Default none: the box grows with the text.
     */
    width?: number;
    /** Text shown while the editor is empty. */
    placeholder?: string;
    /** Longest text allowed, in UTF-16 code units like `maxlength`. Default no limit. */
    maxLength?: number;
    /** Clickable, selectable and copyable, but not editable. Default false. */
    readOnly?: boolean;
    /** False leaves pointer input alone: no caret, no selection. Default true. */
    selectable?: boolean;
    /**
     * What Enter does: insert a `newline`, `commit` (emits `submit` and `change`, keeps focus) or
     * `blur`. Default `newline` for multi-line editors, `commit` for single-line ones. Shift + Enter
     * always inserts a newline in multi-line editors, and cmd or ctrl + Enter commits and blurs.
     */
    enter?: 'newline' | 'commit' | 'blur';
    /** What Tab does: `insert` a tab character, or `next` (emits `tab` and blurs). Default `next`. */
    tab?: 'insert' | 'next';
    /**
     * Where edits go for undo. Default a built-in {@link History} for this editor. Pass the app's history
     * to put text edits in line with its other steps. When it has `undo()` and `redo()`, cmd or ctrl + Z
     * calls them while the editor has focus.
     */
    history?: HistoryLike & {
        /** Undoes the app's last step, text edits included. */
        undo?(): unknown;
        /** Redoes the app's last undone step. */
        redo?(): unknown;
    };
    /**
     * The element the scene is drawn on, usually `app.canvas`. Positions the hidden text field at the
     * caret, so input method popups open next to it. Default the element of the first press.
     */
    element?: HTMLElement;
    /** Name of the field for screen readers. Default the placeholder. */
    ariaLabel?: string;
    /** Draggable handles at the ends of a selection made by touch. Default true. */
    handles?: boolean;
    /** Values that replace parts of {@link TEXT_EDITOR_THEME}. */
    theme?: Partial<TextEditorTheme>;
    /** Caret width in screen pixels, whatever the zoom. Default 1.5. */
    caretWidth?: number;
    /** Ticker driving the caret blink. Default `Ticker.shared`. `null` for manual {@link TextEditor.tick}. */
    ticker?: Ticker | null;
}

/** The reactive state of a {@link TextEditor}. */
export interface TextEditorState {
    /** The text. Changes on every edit, like the DOM `input` event. Setting it replaces the text. */
    text: Signal<string>;
    /** The text as of the last commit (Enter or blur), like the DOM `change` event. */
    committed: ReadSignal<string>;
    /** True while the editor has keyboard focus. */
    focused: ReadSignal<boolean>;
    /** Caret and selection. */
    selection: ReadSignal<TextSelection>;
    /** True while an input method composes text (Japanese, Chinese, dead keys). */
    composing: ReadSignal<boolean>;
}

/** What a step of the built-in undo holds. */
interface Snapshot {
    text: string;
    anchor: number;
    focus: number;
}

/** What kind of edit a change is. Consecutive edits of the same kind merge into one undo step. */
export type TextEditKind = 'type' | 'delete' | 'forward' | 'paste' | 'cut' | 'newline' | 'other';

/** One undoable edit. Consecutive typing or deleting folds into one step. */
class TextEdit implements Command {
    label: string;
    after: Snapshot;
    readonly editor: TextEditor;
    readonly kind: TextEditKind;
    readonly session: number;
    readonly before: Snapshot;

    constructor(editor: TextEditor, kind: TextEditKind, session: number, before: Snapshot, after: Snapshot) {
        this.editor = editor;
        this.kind = kind;
        this.session = session;
        this.before = before;
        this.label = kind === 'type' ? 'Typing' : kind === 'paste' ? 'Paste' : kind === 'cut' ? 'Cut' : 'Edit Text';
        this.after = after;
    }

    do(): void {
        this.editor.restore(this.after);
    }

    undo(): void {
        this.editor.restore(this.before);
    }

    merge(next: Command): boolean {
        if (!(next instanceof TextEdit) || next.editor !== this.editor) return false;
        if (next.kind !== this.kind || next.session !== this.session) return false;
        if (this.kind !== 'type' && this.kind !== 'delete' && this.kind !== 'forward') return false;
        if (next.before.text !== this.after.text || next.before.focus !== this.after.focus) return false;
        this.after = next.after;

        return true;
    }
}

/** The minimum of a `<textarea>` the editor uses. */
type Field = HTMLTextAreaElement;

const CLICK_MS = 450;
const LONG_PRESS_MS = 450;
const SLOP = 6;
const scratch = new Matrix();

/**
 * Text you can click and edit on the canvas. It draws a {@link SilkText} plus a caret and a
 * selection drawn with silk.
 *
 * Typing goes through a hidden `<textarea>` that follows the caret on screen. Input methods (Japanese,
 * Chinese, dead keys), mobile keyboards, autocorrect, the emoji picker and the clipboard all work.
 *
 * - Click to place the caret, drag to select, Shift + click to extend. Double click selects a word,
 *   triple click a paragraph. On touch, tap places the caret and a long press selects a word.
 * - Editing keys follow the platform. Escape leaves the editor.
 * - Undo merges consecutive typing. Pass `history` to share the app's undo stack.
 *
 * Events: `focus`, `blur`, `input` (every edit), `change` (on commit, when the text changed), `submit`
 * (Enter in a single-line editor) and `tab`. The same values are on {@link TextEditor.state}.
 *
 * Rich text (mixed styles in one editor) and right-to-left text are not supported.
 *
 * Experimental: the API may change in a minor release.
 *
 * @example
 * ```ts
 * const name = new TextEditor({ text: 'Untitled', fontSize: 14, multiline: false, width: 200 });
 *
 * name.on('change', (text: string) => console.log('renamed to', text));
 * world.addChild(name);
 * ```
 *
 * @experimental
 */
export class TextEditor extends Container {
    /** The editor that has keyboard focus, or null. */
    static active: TextEditor | null = null;

    /**
     * Links editors in Tab order, like fields of a form: Tab moves to the next one, Shift + Tab back.
     * Returns the unlink function.
     */
    static chain(editors: readonly TextEditor[]): () => void {
        const offs = editors.map((editor, i) => {
            const go = (back: boolean) => {
                const next = editors[(i + (back ? -1 : 1) + editors.length) % editors.length];

                if (next !== editor) next.focus(true);
            };

            editor.on('tab', go);

            return () => editor.off('tab', go);
        });

        return () => {
            for (const off of offs) off();
        };
    }

    /** The text being edited. Style it as any SilkText. */
    readonly textObject: SilkText;
    /** The placeholder, shown while the text is empty. */
    readonly placeholderObject: SilkText;
    /** Signals of the text, focus and selection. */
    readonly state: TextEditorState;
    /** Colours. Call {@link TextEditor.redraw} after changing them. */
    readonly theme: TextEditorTheme;
    /** Holds the text, caret and selection. A single-line editor scrolls it. */
    readonly content: Container;
    /** Longest text allowed, in UTF-16 code units. */
    maxLength: number;
    /** What Enter does. See the `enter` option. */
    enter: 'newline' | 'commit' | 'blur';
    /** What Tab does. See the `tab` option. */
    tab: 'insert' | 'next';
    /** Caret width in screen pixels, whatever the zoom. Call {@link TextEditor.redraw} after changing it. */
    caretWidth: number;

    private readonly _multiline: boolean;
    private readonly _width: number | undefined;
    private _readOnly: boolean;
    private _selectable: boolean;
    private readonly _handles: boolean;
    private readonly _history: HistoryLike & { undo?(): unknown; redo?(): unknown };
    private _element: HTMLElement | null;
    private readonly _ariaLabel: string;
    private readonly _sig: {
        text: Signal<string>;
        committed: Signal<string>;
        focused: Signal<boolean>;
        selection: Signal<TextSelection>;
        composing: Signal<boolean>;
    };
    private _text: string;
    private _anchor = 0;
    private _focus = 0;
    private _upstream = false;
    private _prefX: number | null = null;
    private _stops: number[] = [0];
    private _stopSet = new Set<number>([0]);
    private _session = 0;
    private _field: Field | null = null;
    private readonly _off: (() => void)[] = [];
    private _compose: { start: number; tail: number; before: Snapshot } | null = null;
    private _inputKind: TextEditKind = 'type';
    private readonly _sel = new SilkGraphics();
    private readonly _marks = new SilkGraphics();
    private readonly _caret = new SilkGraphics();
    private readonly _knobs = new SilkGraphics();
    private _clip: Graphics | null = null;
    private _scroll = 0;
    private readonly _driver: Driver;
    private _idle = 0;
    private _fade = 0;
    private readonly _caretX = new Spring(0, 900, 52);
    private readonly _caretY = new Spring(0, 900, 52);
    private _caretPlaced = false;
    private _matrix = '';
    private _press: {
        id: number;
        kind: string;
        x: number;
        y: number;
        t: number;
        moved: boolean;
        long: boolean;
        unit: 'char' | 'word' | 'paragraph';
        origin: { start: number; end: number };
        handle: 'anchor' | 'focus' | null;
    } | null = null;
    private _longTimer: ReturnType<typeof setTimeout> | null = null;
    private _clicks = { n: 0, t: 0, x: 0, y: 0 };
    private _touchSelect = false;
    private _keepFocus = false;
    private _focusedAt = -Infinity;
    private readonly _mac = isMac();

    constructor(options: TextEditorOptions = {}) {
        super({ label: 'TextEditor' });
        const {
            text = '',
            multiline = true,
            width,
            placeholder = '',
            maxLength = Infinity,
            readOnly = false,
            selectable = true,
            enter,
            tab = 'next',
            history,
            element,
            ariaLabel,
            handles = true,
            theme,
            caretWidth = 1.5,
            ticker,
            ...style
        } = options;

        this._multiline = multiline;
        this._width = width;
        this._readOnly = readOnly;
        this._selectable = selectable;
        this._handles = handles;
        this._element = element ?? null;
        this._ariaLabel = ariaLabel ?? (placeholder || 'Text');
        this.maxLength = maxLength;
        this.enter = enter ?? (multiline ? 'newline' : 'commit');
        this.tab = tab;
        this.caretWidth = caretWidth;
        this.theme = { ...TEXT_EDITOR_THEME, ...theme };
        this._history = history ?? new History();
        this._text = this._clean(text);
        const wrap = multiline && width !== undefined;

        this.textObject = new SilkText({ ...style, text: this._text, wordWrap: wrap, wordWrapWidth: width ?? 100 });
        this.placeholderObject = new SilkText({ ...style, text: placeholder, wordWrap: wrap, wordWrapWidth: width });
        this.placeholderObject.alpha = this.theme.placeholderAlpha;
        this.textObject.eventMode = 'none';
        this.placeholderObject.eventMode = 'none';
        this._knobs.eventMode = 'none';
        this.content = new Container({ label: 'TextEditorContent' });
        this.content.addChild(
            this._sel,
            this.placeholderObject,
            this.textObject,
            this._marks,
            this._caret,
            this._knobs,
        );
        this.addChild(this.content);
        if (!multiline && width !== undefined) {
            this._clip = new Graphics();
            this.addChild(this._clip);
            this.content.mask = this._clip;
        }
        this._sig = {
            text: signal(this._text),
            committed: signal(this._text),
            focused: signal(false),
            selection: signal<TextSelection>(
                { anchor: 0, focus: 0 },
                (a, b) => a.anchor === b.anchor && a.focus === b.focus,
            ),
            composing: signal(false),
        };
        this.state = this._sig;
        this._off.push(
            this._sig.text.subscribe((value) => {
                if (value !== this._text) this.restore({ text: value, anchor: value.length, focus: value.length });
            }),
        );
        this._driver = new Driver((dt) => this._step(dt), ticker);
        this.eventMode = selectable ? 'static' : 'passive';
        this.cursor = selectable ? 'text' : 'default';
        this.on('pointerdown', this._onDown, this);
        this.on('globalpointermove', this._onMove, this);
        this.on('pointerup', this._onUp, this);
        this.on('pointerupoutside', this._onUp, this);
        this._stopsFor();
        this.redraw();
    }

    // ------------------------------------------------------------------------------ properties

    /** The text. Setting it replaces the text and puts the caret at the end, without an undo step. */
    get value(): string {
        return this._text;
    }

    /** Sets {@link TextEditor.value}. */
    set value(v: string) {
        this._sig.text.value = this._clean(String(v));
    }

    /** True while the editor has keyboard focus. */
    get focused(): boolean {
        return this._sig.focused.value;
    }

    /** True for a multi-line editor. */
    get multiline(): boolean {
        return this._multiline;
    }

    /** Selectable and copyable, but not editable. */
    get readOnly(): boolean {
        return this._readOnly;
    }

    /** Sets {@link TextEditor.readOnly}. */
    set readOnly(v: boolean) {
        this._readOnly = v;
        if (this._field) this._field.readOnly = v;
        this.redraw();
    }

    /** Whether pointer input places a caret and selects. */
    get selectable(): boolean {
        return this._selectable;
    }

    /** Sets {@link TextEditor.selectable}. */
    set selectable(v: boolean) {
        this._selectable = v;
        this.eventMode = v ? 'static' : 'passive';
        this.cursor = v ? 'text' : 'default';
        if (!v) this.blur();
    }

    /** Start of the selection (the smaller offset). */
    get selectionStart(): number {
        return Math.min(this._anchor, this._focus);
    }

    /** End of the selection (the larger offset). */
    get selectionEnd(): number {
        return Math.max(this._anchor, this._focus);
    }

    /** The selected text. */
    get selectedText(): string {
        return this._text.slice(this.selectionStart, this.selectionEnd);
    }

    /** Range of the text an input method is composing, or null. */
    get composition(): {
        /** Index of the first composed character. */
        start: number;
        /** Index after the last composed character. */
        end: number;
    } | null {
        const c = this._compose;

        return c ? { start: c.start, end: this._text.length - c.tail } : null;
    }

    /** The hidden text field while it exists (created on first focus). */
    get field(): HTMLTextAreaElement | null {
        return this._field;
    }

    // ------------------------------------------------------------------------------ focus

    /** Gives the editor keyboard focus. `selectAll` selects the whole text, as tabbing into a field does. */
    focus(selectAll = false): this {
        if (selectAll) this.select(0, this._text.length);
        if (this.focused) return this;
        if (TextEditor.active && TextEditor.active !== this) TextEditor.active.blur();
        TextEditor.active = this;
        const field = this._ensureField();

        this._sig.focused.value = true;
        this._focusedAt = performance.now();
        this._session++;
        this._idle = 0;
        this._sync();
        if (field) {
            this._keepFocus = true;
            (field.focus as (o?: FocusOptions) => void)({ preventScroll: true });
            this._keepFocus = false;
        }
        this.emit('focus', this);
        this._driver.wake();
        this.redraw();

        return this;
    }

    /** Takes keyboard focus away and commits the text. */
    blur(): this {
        if (!this.focused) return this;
        if (this._compose) this._endComposition();
        this._sig.focused.value = false;
        if (TextEditor.active === this) TextEditor.active = null;
        this._session++;
        this._touchSelect = false;
        this._commit();
        const field = this._field;

        if (field && globalThis.document?.activeElement === field) field.blur();
        this.emit('blur', this);
        this._driver.wake();
        this.redraw();

        return this;
    }

    // ------------------------------------------------------------------------------ selection

    /** Selects from `anchor` to `focus` (a caret when `focus` is left out). Offsets snap to grapheme boundaries. */
    select(anchor: number, focus: number = anchor): this {
        this._setSelection(this._snap(anchor), this._snap(focus));
        this._session++;

        return this;
    }

    /** Selects the whole text. */
    selectAll(): this {
        return this.select(0, this._text.length);
    }

    /** The caret position under a point in global (screen) coordinates. */
    hitTest(global: PointData): CaretHit {
        const local = this.textObject.toLocal(global);

        return this.textObject.caretAt(local, (i) => this._stopSet.has(i));
    }

    // ------------------------------------------------------------------------------ editing

    /** Replaces the selection with `text`, as typing does. Returns false when nothing changed. */
    insert(text: string, kind: TextEditKind = 'type'): boolean {
        return this._replace(this.selectionStart, this.selectionEnd, text, kind);
    }

    /** Deletes the selection, or the grapheme, word or line before the caret. */
    deleteBackward(unit: 'grapheme' | 'word' | 'line' = 'grapheme'): boolean {
        const a = this.selectionStart;
        const b = this.selectionEnd;

        if (a !== b) return this._replace(a, b, '', 'delete');
        const from =
            unit === 'word'
                ? previousWordStop(this._text, a)
                : unit === 'line'
                  ? this._lineEdge(a, -1)
                  : this._step1(a, -1);

        return from < a && this._replace(from, a, '', 'delete');
    }

    /** Deletes the selection, or the grapheme, word or line after the caret. */
    deleteForward(unit: 'grapheme' | 'word' | 'line' = 'grapheme'): boolean {
        const a = this.selectionStart;
        const b = this.selectionEnd;

        if (a !== b) return this._replace(a, b, '', 'forward');
        const to =
            unit === 'word'
                ? nextWordStop(this._text, a, true)
                : unit === 'line'
                  ? this._lineEdge(a, 1)
                  : this._step1(a, 1);

        return to > a && this._replace(a, to, '', 'forward');
    }

    /** Undoes the last text edit (in the app's history when it was given one with `undo()`). */
    undo(): void {
        this._session++;
        this._history.undo?.();
    }

    /** Redoes the last undone edit. */
    redo(): void {
        this._session++;
        this._history.redo?.();
    }

    /** @internal Puts the text and the selection back, for undo and redo. */
    restore(snap: { text: string; anchor: number; focus: number }): void {
        this._text = this._clean(snap.text);
        this._anchor = Math.min(snap.anchor, this._text.length);
        this._focus = Math.min(snap.focus, this._text.length);
        this._upstream = false;
        this._prefX = null;
        this._changed();
    }

    /**
     * Handles a key press the way the hidden field receives it. Returns true when the editor used the
     * key. You only need it to drive the editor from your own key handling.
     */
    handleKey(
        e: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey'> & {
            isComposing?: boolean;
            keyCode?: number;
        },
    ): boolean {
        if (e.isComposing || e.keyCode === 229 || this._compose) return false;
        const mac = this._mac;
        const mod = mac ? e.metaKey : e.ctrlKey;
        const byWord = mac ? e.altKey : e.ctrlKey;
        const extend = e.shiftKey;
        const text = this._text;
        const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

        switch (key) {
            case 'ArrowLeft':
            case 'ArrowRight': {
                const dir = key === 'ArrowLeft' ? -1 : 1;

                if (mac && e.metaKey) this._lineMove(dir, extend);
                else if (byWord) {
                    this._moveTo(
                        dir < 0 ? previousWordStop(text, this._focus) : nextWordStop(text, this._focus, mac),
                        extend,
                    );
                } else if (!extend && this._anchor !== this._focus) {
                    this._moveTo(dir < 0 ? this.selectionStart : this.selectionEnd, false);
                } else this._moveTo(this._step1(this._focus, dir), extend);

                return true;
            }
            case 'ArrowUp':
            case 'ArrowDown': {
                const dir = key === 'ArrowUp' ? -1 : 1;

                if (!this._multiline || (mac && e.metaKey)) this._moveTo(dir < 0 ? 0 : text.length, extend);
                else this._vertical(dir, extend);

                return true;
            }
            case 'Home':
            case 'End':
                if (e.ctrlKey || e.metaKey) this._moveTo(key === 'Home' ? 0 : text.length, extend);
                else this._lineMove(key === 'Home' ? -1 : 1, extend);

                return true;
            case 'PageUp':
            case 'PageDown':
                this._moveTo(key === 'PageUp' ? 0 : text.length, extend);

                return true;
            case 'Backspace':
                if (!this._readOnly) this.deleteBackward(mac && e.metaKey ? 'line' : byWord ? 'word' : 'grapheme');

                return true;
            case 'Delete':
                if (!this._readOnly) this.deleteForward(mac && e.metaKey ? 'line' : byWord ? 'word' : 'grapheme');

                return true;
            case 'Enter': {
                if (this._multiline && mod) {
                    this._commit(true);
                    this.blur();

                    return true;
                }
                const action = this._multiline && e.shiftKey ? 'newline' : this.enter;

                if (action === 'newline' && this._multiline) {
                    if (!this._readOnly) this.insert('\n', 'newline');
                } else {
                    this._commit(true);
                    if (action === 'blur') this.blur();
                }

                return true;
            }
            case 'Tab':
                if (mod || e.altKey) return false;
                if (this.tab === 'insert' && !this._readOnly) this.insert('\t');
                else {
                    this.blur();
                    this.emit('tab', e.shiftKey);
                }

                return true;
            case 'Escape':
                this.blur();

                return true;
            case 'a':
                if (!mod) return false;
                this.selectAll();

                return true;
            case 'z':
            case 'y':
                if (!(e.metaKey || e.ctrlKey)) return false;
                if (key === 'z' && !e.shiftKey) this.undo();
                else if (key === 'z' || e.ctrlKey) this.redo();
                else return false;

                return true;
            default:
                return false;
        }
    }

    /** Draws the caret, selection and placeholder again. Happens on its own after every change. */
    redraw(): void {
        const t = this.textObject;
        const empty = this._text.length === 0;
        const layout = t.layout;
        const box = this._width ?? 0;

        this.placeholderObject.visible = empty;
        // with a fixed width, alignment is inside the box
        if (this._width !== undefined && this._multiline) {
            const shift =
                t.align === 'center' ? (box - layout.width) / 2 : t.align === 'right' ? box - layout.width : 0;

            t.x = shift;
            this.placeholderObject.x = shift;
        }
        const k = this._screenScale();
        const off = t.layoutOffset;
        const w = Math.max(box, layout.width, empty ? this.placeholderObject.layout.width : 0, t.fontSize * 0.5);
        const h = Math.max(layout.height, t.fontSize);
        const pad = 4 / k;

        const x0 = this._clip ? off.x : t.x + off.x;

        this.hitArea = new Rectangle(x0 - pad, off.y - pad, (this._clip ? box : w) + pad * 2, h + pad * 2);
        if (this._clip)
            this._clip
                .clear()
                .rect(off.x, off.y - pad, box, h + pad * 2)
                .fill(0xffffff);
        this._scrollToCaret();
        this._drawSelection(k);
        this._drawCaret(k, true);
    }

    /** Blurs (which commits the text), removes the hidden text field and stops listening for input. */
    override destroy(options?: DestroyOptions): void {
        this.blur();
        this._driver.sleep();
        if (this._longTimer) clearTimeout(this._longTimer);
        for (const off of this._off) off();
        this._off.length = 0;
        this._field?.remove();
        this._field = null;
        super.destroy(options);
    }

    /** Advances the caret blink and animations by `dt` seconds. Returns true while it still moves. */
    tick(dt: number): boolean {
        return this._driver.tick(dt);
    }

    // ------------------------------------------------------------------------------ internals: model

    private _clean(text: string): string {
        const s = text.replace(/\r\n?/g, '\n');

        return this._multiline ? s : s.replace(/\n/g, ' ');
    }

    private _stopsFor(): void {
        this._stops = graphemeStops(this._text);
        this._stopSet = new Set(this._stops);
    }

    /** The nearest grapheme boundary at or before `i`. */
    private _snap(i: number): number {
        const n = Math.max(0, Math.min(this._text.length, Math.round(i)));

        if (this._stopSet.has(n)) return n;
        let best = 0;

        for (const s of this._stops) if (s <= n) best = s;

        return best;
    }

    /** One grapheme left (-1) or right (1) of `i`. */
    private _step1(i: number, dir: number): number {
        const stops = this._stops;

        if (dir < 0) {
            for (let k = stops.length - 1; k >= 0; k--) if (stops[k] < i) return stops[k];

            return 0;
        }
        for (const s of stops) if (s > i) return s;

        return this._text.length;
    }

    private _lineEdge(i: number, dir: number): number {
        const layout = this.textObject.layout;
        const line = layout.lines[lineOfIndex(layout, i, this._upstream)];

        return dir < 0 ? line.start : line.end;
    }

    private _replace(from: number, to: number, insert: string, kind: TextEditKind, record = true): boolean {
        if (this._readOnly) return false;
        let s = this._clean(insert);
        const room = this.maxLength - (this._text.length - (to - from));

        if (s.length > room && !this._compose) {
            // never split a grapheme: cut at the last boundary that fits
            let cut = 0;

            for (const b of graphemeStops(s)) if (b <= room) cut = b;
            s = s.slice(0, Math.max(0, cut));
        }
        if (!s && from === to) {
            this._sync();

            return false;
        }
        const before: Snapshot = { text: this._text, anchor: this._anchor, focus: this._focus };

        this._text = this._text.slice(0, from) + s + this._text.slice(to);
        this._anchor = this._focus = from + s.length;
        this._upstream = false;
        this._prefX = null;
        this._changed();
        if (record) {
            this._history.record(
                new TextEdit(this, kind, this._session, before, {
                    text: this._text,
                    anchor: this._anchor,
                    focus: this._focus,
                }),
            );
        }

        return true;
    }

    private _setSelection(anchor: number, focus: number, upstream = false, keepX = false): void {
        this._anchor = anchor;
        this._focus = focus;
        this._upstream = upstream;
        if (!keepX) this._prefX = null;
        this._idle = 0;
        this._sig.selection.value = { anchor, focus };
        this._sync();
        this.redraw();
        this._driver.wake();
    }

    private _moveTo(i: number, extend: boolean, upstream = false, keepX = false): void {
        const f = this._snap(i);

        this._session++;
        this._setSelection(extend ? this._anchor : f, f, upstream, keepX);
    }

    private _lineMove(dir: number, extend: boolean): void {
        const layout = this.textObject.layout;
        const li = lineOfIndex(layout, this._focus, this._upstream);
        const line = layout.lines[li];

        if (dir < 0) this._moveTo(line.start, extend);
        else this._moveTo(line.end, extend, line.wrapped);
    }

    private _vertical(dir: number, extend: boolean): void {
        const t = this.textObject;
        const layout = t.layout;
        const r = t.caretRect(this._focus, this._upstream);
        const x = this._prefX ?? r.x;
        const li = r.line + dir;

        if (li < 0 || li >= layout.lines.length) {
            this._moveTo(li < 0 ? 0 : this._text.length, extend);
            this._prefX = x;

            return;
        }
        const line = layout.lines[li];
        const hit = caretAtPoint(layout, x - t.layoutOffset.x, (line.top + line.bottom) / 2, (i) =>
            this._stopSet.has(i),
        );

        this._moveTo(hit.index, extend, hit.upstream, true);
        this._prefX = x;
    }

    private _commit(submit = false): void {
        if (submit) this.emit('submit', this._text);
        if (this._sig.committed.value === this._text) return;
        this._sig.committed.value = this._text;
        this.emit('change', this._text);
    }

    /** After the text changed: lay out, notify, and bring the field in line. */
    private _changed(): void {
        this.textObject.text = this._text;
        this._stopsFor();
        this._idle = 0;
        this._sig.selection.value = { anchor: this._anchor, focus: this._focus };
        this._sig.text.value = this._text;
        this._sig.composing.value = this._compose !== null;
        this.emit('input', this._text);
        this._sync();
        this.redraw();
        this._driver.wake();
    }

    // ------------------------------------------------------------------------------ internals: field

    private _ensureField(): Field | null {
        if (this._field) return this._field;
        const doc = globalThis.document;

        if (!doc?.createElement) return null;
        const f = doc.createElement('textarea');

        f.setAttribute('autocomplete', 'off');
        f.setAttribute('autocapitalize', this._multiline ? 'sentences' : 'off');
        f.setAttribute('aria-label', this._ariaLabel);
        f.setAttribute('aria-multiline', String(this._multiline));
        f.spellcheck = false;
        f.tabIndex = -1;
        f.readOnly = this._readOnly;
        f.wrap = 'off';
        Object.assign(f.style, {
            position: 'fixed',
            left: '0px',
            top: '0px',
            width: '2px',
            height: '16px',
            padding: '0',
            margin: '0',
            border: '0',
            outline: 'none',
            resize: 'none',
            overflow: 'hidden',
            whiteSpace: 'pre',
            opacity: '0',
            color: 'transparent',
            background: 'transparent',
            caretColor: 'transparent',
            fontSize: '16px',
            lineHeight: '16px',
            pointerEvents: 'none',
            zIndex: '-1',
        });
        doc.body?.appendChild(f);
        const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
            f.addEventListener(type, fn as EventListener);
            this._off.push(() => f.removeEventListener(type, fn as EventListener));
        };

        on('keydown', (e) => {
            if (this.handleKey(e)) e.preventDefault();
        });
        on('beforeinput', (e) => {
            const type = e.inputType ?? '';

            if (type === 'historyUndo' || type === 'historyRedo') {
                e.preventDefault();
                if (type === 'historyUndo') this.undo();
                else this.redo();

                return;
            }
            this._inputKind = type.startsWith('delete')
                ? type.includes('Forward')
                    ? 'forward'
                    : 'delete'
                : type === 'insertLineBreak' || type === 'insertParagraph'
                  ? 'newline'
                  : 'type';
        });
        on('input', () => this._onInput());
        on('compositionstart', () => this._startComposition());
        on('compositionupdate', () => this._onInput());
        on('compositionend', () => {
            this._onInput();
            this._endComposition();
        });
        on('copy', (e) => this._clipboard(e, false));
        on('cut', (e) => this._clipboard(e, true));
        on('paste', (e) => {
            e.preventDefault();
            const text = e.clipboardData?.getData('text/plain') ?? '';

            if (text) this.insert(text, 'paste');
        });
        on('focus', () => {
            if (!this.focused) this.focus();
        });
        on('blur', () => {
            if (this._keepFocus || this._press || performance.now() - this._focusedAt < 350) {
                // a press on this editor took focus from the field: give it back
                queueMicrotask(() => this.focused && f.focus({ preventScroll: true }));

                return;
            }
            this.blur();
        });
        const onSelect = () => {
            if (doc.activeElement !== f || this._compose) return;
            const a = f.selectionDirection === 'backward' ? f.selectionEnd : f.selectionStart;
            const b = f.selectionDirection === 'backward' ? f.selectionStart : f.selectionEnd;

            if (a !== this._anchor || b !== this._focus) this._setSelection(this._snap(a), this._snap(b));
        };

        doc.addEventListener?.('selectionchange', onSelect);
        this._off.push(() => doc.removeEventListener?.('selectionchange', onSelect));
        this._field = f;

        return f;
    }

    private _clipboard(e: ClipboardEvent, cut: boolean): void {
        const text = this.selectedText;

        e.preventDefault();
        if (!text) return;
        e.clipboardData?.setData('text/plain', text);
        if (cut && !this._readOnly) this._replace(this.selectionStart, this.selectionEnd, '', 'cut');
    }

    /** Reads what the field did (typing, autocorrect, an input method) and applies it as an edit. */
    private _onInput(): void {
        const f = this._field;

        if (!f) return;
        const next = f.value;
        const prev = this._text;

        if (next === prev) return;
        // the changed range, anchored at the old selection so repeated letters land in the right place
        const lo = Math.min(this._anchor, this._focus);
        const hi = Math.max(this._anchor, this._focus);
        const max = Math.min(prev.length, next.length);
        let a = 0;

        while (a < max && a < lo && prev[a] === next[a]) a++;
        let b = 0;

        while (b < max - a && b < prev.length - hi && prev[prev.length - 1 - b] === next[next.length - 1 - b]) b++;
        const inserted = next.slice(a, next.length - b);
        const kind = this._compose ? 'type' : this._inputKind;

        this._inputKind = 'type';
        this._replace(a, prev.length - b, inserted, kind, !this._compose);
        // the field knows where its caret went (an input method may put it inside the composition)
        if (this._field && this._field.value === this._text && !this._readOnly) {
            const end = f.selectionEnd ?? this._focus;

            if (end !== this._focus && end <= this._text.length) {
                this._anchor = this._focus = end;
                this._sig.selection.value = { anchor: end, focus: end };
                this.redraw();
            }
        }
    }

    private _startComposition(): void {
        if (this._readOnly) return;
        const lo = this.selectionStart;
        const hi = this.selectionEnd;

        this._compose = {
            start: lo,
            tail: this._text.length - hi,
            before: { text: this._text, anchor: this._anchor, focus: this._focus },
        };
        this._sig.composing.value = true;
        this.redraw();
    }

    private _endComposition(): void {
        const c = this._compose;

        if (!c) return;
        this._compose = null;
        this._sig.composing.value = false;
        // maxLength applies to the finished text
        if (this._text.length > this.maxLength) {
            const end = this._text.length - c.tail;
            const composed = this._text.slice(c.start, end);
            const room = this.maxLength - (this._text.length - composed.length);
            let cut = 0;

            for (const s of graphemeStops(composed)) if (s <= room) cut = s;
            this._text = this._text.slice(0, c.start) + composed.slice(0, cut) + this._text.slice(end);
            this._anchor = this._focus = c.start + cut;
            this._changed();
        }
        if (this._text !== c.before.text) {
            this._history.record(
                new TextEdit(this, 'type', this._session, c.before, {
                    text: this._text,
                    anchor: this._anchor,
                    focus: this._focus,
                }),
            );
        }
        this._sync();
        this.redraw();
    }

    /** Copies the text and selection to the field and moves it to the caret. */
    private _sync(): void {
        const f = this._field;

        if (!f || this._compose) return;
        if (f.value !== this._text) f.value = this._text;
        const back = this._focus < this._anchor;

        try {
            f.setSelectionRange(this.selectionStart, this.selectionEnd, back ? 'backward' : 'forward');
        } catch {
            // a detached field in some browsers: nothing to select
        }
        this._place();
    }

    /** Puts the field at the caret on screen, so input method popups open there. */
    private _place(): void {
        const f = this._field;
        const el = this._element;

        if (!f || !el?.getBoundingClientRect) return;
        const r = this.textObject.caretRect(this._focus, this._upstream);
        const top = this.textObject.toGlobal({ x: r.x, y: r.top });
        const bottom = this.textObject.toGlobal({ x: r.x, y: r.bottom });
        const box = el.getBoundingClientRect();
        const sx = el.clientWidth ? box.width / el.clientWidth : 1;
        const sy = el.clientHeight ? box.height / el.clientHeight : 1;
        const h = Math.max(1, Math.hypot(bottom.x - top.x, bottom.y - top.y) * sy);

        f.style.transform = `translate(${box.left + top.x * sx}px, ${box.top + top.y * sy}px)`;
        f.style.height = `${h}px`;
        f.style.lineHeight = `${h}px`;
    }

    // ------------------------------------------------------------------------------ internals: pointer

    private _onDown(e: FederatedPointerEvent): void {
        if (!this._selectable || (e.button !== undefined && e.button > 0)) return;
        const native = e.nativeEvent as (Event & { target?: unknown }) | undefined;

        if (!this._element && native?.target && (native.target as HTMLElement).getBoundingClientRect) {
            this._element = native.target as HTMLElement;
        }
        e.stopPropagation();
        // keep focus in the field: the press would otherwise move it to the canvas
        native?.preventDefault?.();
        const now = performance.now();
        const handle = this._handleAt(e.global);
        const hit = this.hitTest(e.global);
        const touch = e.pointerType === 'touch';

        this._press = {
            id: e.pointerId,
            kind: e.pointerType,
            x: e.global.x,
            y: e.global.y,
            t: now,
            moved: false,
            long: false,
            unit: 'char',
            origin: { start: hit.index, end: hit.index },
            handle,
        };
        if (handle) return;
        if (touch) {
            // a tap places the caret on release; a drag is left to the page or the camera
            if (this._longTimer) clearTimeout(this._longTimer);
            this._longTimer = setTimeout(() => this._longPress(hit), LONG_PRESS_MS);

            return;
        }
        const c = this._clicks;
        const near = Math.hypot(e.global.x - c.x, e.global.y - c.y) < SLOP;

        c.n = now - c.t < CLICK_MS && near ? (c.n % 3) + 1 : 1;
        c.t = now;
        c.x = e.global.x;
        c.y = e.global.y;
        this._touchSelect = false;
        this.focus();
        this._pick(hit, c.n === 3 ? 'paragraph' : c.n === 2 ? 'word' : 'char', e.shiftKey);
    }

    private _onMove(e: FederatedPointerEvent): void {
        const p = this._press;

        if (!p || p.id !== e.pointerId) return;
        if (!p.moved && Math.hypot(e.global.x - p.x, e.global.y - p.y) > SLOP) p.moved = true;
        if (p.kind === 'touch' && !p.long && !p.handle) {
            // the finger is scrolling or panning, not selecting
            if (p.moved && this._longTimer) {
                clearTimeout(this._longTimer);
                this._longTimer = null;
            }

            return;
        }
        if (!p.moved) return;
        const hit = this.hitTest(e.global);

        if (p.handle) {
            const other = p.handle === 'focus' ? this._anchor : this._focus;

            if (hit.index !== other) this._setSelection(other, hit.index, hit.upstream);

            return;
        }
        this._extend(hit, p.unit, p.origin);
    }

    private _onUp(e: FederatedPointerEvent): void {
        const p = this._press;

        if (!p || p.id !== e.pointerId) return;
        this._press = null;
        if (this._longTimer) clearTimeout(this._longTimer);
        this._longTimer = null;
        if (p.kind !== 'touch' || p.long || p.handle || p.moved) return;
        // a tap: place the caret, a second tap selects the word
        const now = performance.now();
        const c = this._clicks;
        const hit = this.hitTest(e.global);
        const double = now - c.t < CLICK_MS && Math.hypot(e.global.x - c.x, e.global.y - c.y) < SLOP * 3;

        c.n = double ? 2 : 1;
        c.t = now;
        c.x = e.global.x;
        c.y = e.global.y;
        this.focus();
        this._touchSelect = double;
        this._pick(hit, double ? 'word' : 'char', false);
    }

    private _longPress(hit: CaretHit): void {
        const p = this._press;

        this._longTimer = null;
        if (!p || p.moved) return;
        p.long = true;
        p.unit = 'word';
        this.focus();
        this._touchSelect = true;
        this._pick(hit, 'word', false);
        p.origin = { start: this.selectionStart, end: this.selectionEnd };
    }

    private _pick(hit: CaretHit, unit: 'char' | 'word' | 'paragraph', extend: boolean): void {
        const p = this._press;
        const i = hit.index;
        let range = { start: i, end: i };

        if (unit === 'word') range = wordAt(this._text, hit.before ? i - 1 : i);
        else if (unit === 'paragraph') range = paragraphAt(this._text, i);
        if (p) {
            p.unit = unit;
            p.origin = range;
        }
        this._session++;
        if (unit === 'char') this._setSelection(extend ? this._anchor : i, i, hit.upstream);
        else this._setSelection(this._snap(range.start), this._snap(range.end));
    }

    private _extend(hit: CaretHit, unit: 'char' | 'word' | 'paragraph', origin: { start: number; end: number }): void {
        if (unit === 'char') {
            this._setSelection(this._anchor, hit.index, hit.upstream);

            return;
        }
        const r =
            unit === 'word'
                ? wordAt(this._text, hit.before ? hit.index - 1 : hit.index)
                : paragraphAt(this._text, hit.index);

        if (r.start < origin.start) this._setSelection(origin.end, this._snap(r.start));
        else this._setSelection(origin.start, this._snap(Math.max(r.end, origin.end)));
    }

    /** Which selection handle is under a global point, if handles show. */
    private _handleAt(global: PointData): 'anchor' | 'focus' | null {
        if (!this._knobsShown()) return null;
        const t = this.textObject;
        // global units are screen pixels: a fingertip wide whatever the zoom
        const reach = 22;

        for (const end of ['anchor', 'focus'] as const) {
            const i = end === 'anchor' ? this._anchor : this._focus;
            const r = t.caretRect(i);
            const g = t.toGlobal({ x: r.x, y: i === this.selectionStart ? r.top : r.bottom });

            if (Math.hypot(global.x - g.x, global.y - g.y) < reach) return end;
        }

        return null;
    }

    private _knobsShown(): boolean {
        return this._handles && this._touchSelect && this.focused && this._anchor !== this._focus;
    }

    // ------------------------------------------------------------------------------ internals: drawing

    /** How many screen pixels one local unit covers. */
    private _screenScale(): number {
        const m = this.textObject.getGlobalTransform(scratch, false);

        return Math.hypot(m.a, m.b) || 1;
    }

    private _scrollToCaret(): void {
        if (!this._clip || this._width === undefined) return;
        const t = this.textObject;
        const x = t.caretRect(this._focus).x;
        const box = this._width;
        const margin = Math.min(box / 4, t.fontSize);
        const max = Math.max(0, t.layout.width - box + 2);

        if (x - this._scroll > box - margin) this._scroll = x - box + margin;
        if (x - this._scroll < margin) this._scroll = x - margin;
        this._scroll = Math.max(0, Math.min(max, this._scroll));
        this.content.x = -this._scroll;
    }

    private _drawSelection(k: number): void {
        const t = this.textObject;
        const g = this._sel;
        const marks = this._marks;

        g.clear();
        marks.clear();
        if (this._anchor !== this._focus) {
            const radius = Math.min(4 / k, t.fontSize * 0.2);

            for (const r of t.rangeRects(this.selectionStart, this.selectionEnd)) {
                g.roundRect(r.x, r.y, r.width, r.height, Math.min(radius, r.width / 2, r.height / 2), 0.6).fill({
                    color: this.theme.selection,
                    alpha: this.theme.selectionAlpha,
                });
            }
        }
        const c = this.composition;

        if (c && c.end > c.start) {
            const layout = t.layout;
            const off = t.layoutOffset;
            const thick = 1.5 / k;

            for (const r of t.rangeRects(c.start, c.end)) {
                const y = layout.lines[r.line].y + off.y + layout.descent * 0.45;

                marks.roundRect(r.x, y, r.width, thick, thick / 2).fill(this.theme.composition);
            }
        }
        this._sel.alpha = this._fade;
        this._drawKnobs(k);
    }

    private _drawKnobs(k: number): void {
        const g = this._knobs;

        g.clear();
        if (!this._knobsShown()) return;
        const t = this.textObject;
        const radius = 6 / k;

        for (const i of [this.selectionStart, this.selectionEnd]) {
            const r = t.caretRect(i);
            const start = i === this.selectionStart;
            const cy = start ? r.top - radius : r.bottom + radius;

            g.roundRect(r.x - 1 / k, r.top, 2 / k, r.bottom - r.top, 1 / k).fill(this.theme.caret);
            g.circle(r.x, cy, radius).fill(this.theme.caret);
        }
    }

    private _drawCaret(k: number, moved: boolean): void {
        const t = this.textObject;
        const g = this._caret;
        const show = this.focused && !this._readOnly && this._anchor === this._focus;
        const r = t.caretRect(this._focus, this._upstream);

        if (moved) {
            this._caretX.target = r.x;
            this._caretY.target = r.top;
            if (!this._caretPlaced || !show) {
                this._caretX.value = r.x;
                this._caretY.value = r.top;
                this._caretX.velocity = this._caretY.velocity = 0;
                this._caretPlaced = show;
            }
        }
        g.visible = show;
        if (!show) return;
        const w = this.caretWidth / k;
        const h = r.bottom - r.top;

        g.clear()
            .roundRect(this._caretX.value - w / 2, this._caretY.value, w, h, w / 2)
            .fill(this.theme.caret);
        g.alpha = this._fade * this._blink();
    }

    /** Caret opacity: solid while typing, then a soft pulse. */
    private _blink(): number {
        const t = this._idle - 0.5;

        if (t <= 0) return 1;

        return 0.5 + 0.5 * Math.cos(t * Math.PI * 2 * 0.9);
    }

    private _step(dt: number): boolean {
        this._idle += dt;
        const target = this.focused ? 1 : 0;

        this._fade = Math.abs(this._fade - target) < 0.005 ? target : damp(this._fade, target, 14, dt);
        const k = this._screenScale();
        const m = this.textObject.getGlobalTransform(scratch, false);
        const key = `${m.a},${m.b},${m.c},${m.d},${m.tx},${m.ty}`;
        const springing =
            Math.abs(this._caretX.value - this._caretX.target) > 1e-3 ||
            Math.abs(this._caretY.value - this._caretY.target) > 1e-3;

        if (springing) {
            this._caretX.step(dt);
            this._caretY.step(dt);
        }
        if (key !== this._matrix) {
            // the camera moved or zoomed: keep screen sizes and the field in place
            this._matrix = key;
            this._drawSelection(k);
            this._place();
        }
        this._sel.alpha = this._fade;
        this._marks.alpha = this._fade;
        this._drawCaret(k, false);

        return this.focused || this._fade !== target || springing;
    }
}
