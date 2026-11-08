import { Container, type FederatedPointerEvent } from 'pixi.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { History } from '../src/history';
import { type GlyphContext, SdfAtlas } from '../src/text/atlas';
import { caretAtPoint, caretRect, layoutText, rangeRects, type TextMeasurer } from '../src/text/layout';
import { graphemeStops, nextWordStop, paragraphAt, previousWordStop, wordAt } from '../src/text/segment';
import { TextEditor, type TextEditorOptions } from '../src/ui/textedit';

// ------------------------------------------------------------------------------------ helpers

/** Every character 10 wide, `AV` kerned by -2. Ascent 8, descent 2, so lines are 10 tall. */
const mono: TextMeasurer = { advance: () => 10, kerning: (a, b) => (a === 'A' && b === 'V' ? -2 : 0) };
const metrics = { ascent: 8, descent: 2 };

/**
 * A glyph context with no ink: every character is half an em wide, and the font's ascent and descent
 * are 0.8 and 0.2 em. At font size 20 a character is 10 wide and a line 20 tall.
 */
function blankContext(): GlyphContext {
    let size = 48;
    let font = '';

    return {
        get font() {
            return font;
        },
        set font(v: string) {
            font = v;
            size = Number(/(\d+(?:\.\d+)?)px/.exec(v)?.[1] ?? 48);
        },
        fillStyle: '#000',
        textBaseline: 'alphabetic',
        textAlign: 'left',
        canvas: { width: 64, height: 64 },
        measureText(s: string) {
            const metricsString = s.length > 2 && s.startsWith('|');

            return {
                width: Array.from(s).length * 0.5 * size,
                actualBoundingBoxLeft: 0,
                actualBoundingBoxRight: 0,
                actualBoundingBoxAscent: metricsString ? 0.8 * size : 0,
                actualBoundingBoxDescent: metricsString ? 0.2 * size : 0,
            };
        },
        clearRect() {},
        fillText() {},
        getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    };
}

// the keys tested are the Windows and Linux ones: Ctrl moves by word
beforeAll(() => {
    Object.defineProperty(globalThis, 'navigator', { value: { platform: 'Win32' }, configurable: true });
});

const atlas = new SdfAtlas({ context: blankContext() });
const make = (options: TextEditorOptions = {}) =>
    new TextEditor({ fontFamily: 'Test', fontSize: 20, atlas, ticker: null, ...options });

/** Enough of a `<textarea>` and `document` for the editor: value, selection, focus and events. */
interface FakeField extends EventTarget {
    value: string;
    selectionStart: number;
    selectionEnd: number;
    selectionDirection: string;
    style: Record<string, string>;
    readOnly: boolean;
}

function fakeDocument() {
    const fields: FakeField[] = [];
    const doc = Object.assign(new EventTarget(), {
        activeElement: null as unknown,
        body: { appendChild() {} },
        createElement() {
            const f = Object.assign(new EventTarget(), {
                value: '',
                selectionStart: 0,
                selectionEnd: 0,
                selectionDirection: 'forward',
                style: {} as Record<string, string>,
                readOnly: false,
                spellcheck: true,
                tabIndex: 0,
                wrap: '',
                setAttribute() {},
                remove() {},
                setSelectionRange(a: number, b: number, dir = 'forward') {
                    f.selectionStart = a;
                    f.selectionEnd = b;
                    f.selectionDirection = dir;
                },
                focus() {
                    if (doc.activeElement === f) return;
                    doc.activeElement = f;
                    f.dispatchEvent(new Event('focus'));
                },
                blur() {
                    if (doc.activeElement !== f) return;
                    doc.activeElement = null;
                    f.dispatchEvent(new Event('blur'));
                },
            });

            fields.push(f);

            return f;
        },
    });

    return { doc, fields };
}

const event = (type: string, props: Record<string, unknown> = {}) => {
    const e = new Event(type, { cancelable: true });

    for (const [k, v] of Object.entries(props)) Object.defineProperty(e, k, { value: v });

    return e;
};

/** What the browser does when the user types into the field: change the value and caret, then fire input. */
function typeInto(f: FakeField, text: string, inputType = 'insertText') {
    const a = f.selectionStart;
    const b = f.selectionEnd;

    f.dispatchEvent(event('beforeinput', { inputType }));
    f.value = f.value.slice(0, a) + text + f.value.slice(b);
    f.selectionStart = f.selectionEnd = a + text.length;
    f.dispatchEvent(event('input'));
}

const key = (k: string, mods: Partial<Record<'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey', boolean>> = {}) => ({
    key: k,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    ...mods,
});

/** The fields of a Pixi pointer event the editor reads. */
const pointer = (x: number, y: number, extra: Record<string, unknown> = {}) =>
    ({
        global: { x, y },
        pointerId: 1,
        pointerType: 'mouse',
        button: 0,
        shiftKey: false,
        nativeEvent: { preventDefault() {} },
        stopPropagation() {},
        ...extra,
    }) as unknown as FederatedPointerEvent;

// ----------------------------------------------------------------------------------- layout

describe('caret hit testing', () => {
    it('maps points to offsets and back on one line', () => {
        const l = layoutText('abc', metrics, mono);

        expect(l.lines[0].offsets).toEqual([0, 1, 2, 3]);
        expect(l.lines[0].carets).toEqual([0, 10, 20, 30]);
        expect(caretAtPoint(l, 14, 5).index).toBe(1);
        expect(caretAtPoint(l, 16, 5)).toMatchObject({ index: 2, before: true });
        expect(caretAtPoint(l, -50, 5).index).toBe(0);
        expect(caretAtPoint(l, 500, 5).index).toBe(3);
        expect(caretRect(l, 2)).toEqual({ x: 20, top: 0, bottom: 10, line: 0 });
    });

    it('puts the caret in the middle of kerning and letter spacing', () => {
        const l = layoutText('AVA', { ...metrics, letterSpacing: 4 }, mono);

        // A ends at 10, V starts at 10 - 2 + 4 = 12: the caret sits at 11. V ends at 22, A starts at 26
        expect(l.lines[0].carets).toEqual([0, 11, 24, 36]);
        expect(caretAtPoint(l, 11.5, 5).index).toBe(1);
    });

    it('follows wrapped lines, with the spaces at a wrap hanging off the line', () => {
        const l = layoutText('one two three', { ...metrics, wordWrap: true, wordWrapWidth: 75 }, mono);

        expect(l.lines.map((x) => [x.start, x.end, x.wrapped])).toEqual([
            [0, 8, true],
            [8, 13, false],
        ]);
        // the space after "two" sits past the line's width
        expect(l.lines[0].width).toBe(70);
        expect(l.lines[0].carets.at(-1)).toBe(80);
        // clicking past the end of the first line keeps the caret there, not at the start of the next
        const hit = caretAtPoint(l, 200, 5);

        expect(hit).toMatchObject({ index: 8, line: 0, upstream: true });
        expect(caretRect(l, 8, true)).toMatchObject({ x: 80, line: 0 });
        expect(caretRect(l, 8)).toMatchObject({ x: 0, line: 1 });
        expect(caretAtPoint(l, 22, 15)).toMatchObject({ index: 10, line: 1 });
    });

    it('aligns caret stops with the line and handles empty lines and line height', () => {
        const l = layoutText('abcd\n\nab', { ...metrics, align: 'center', lineHeight: 20 }, mono);

        expect(l.lines.map((x) => [x.start, x.end])).toEqual([
            [0, 4],
            [5, 5],
            [6, 8],
        ]);
        expect(l.lines[1].carets).toEqual([20]);
        expect(l.lines[2].carets).toEqual([10, 20, 30]);
        // y 25 is the second line box (20 to 40)
        expect(caretAtPoint(l, 0, 25).index).toBe(5);
        expect(caretAtPoint(l, 0, 45).index).toBe(6);
        expect(caretRect(l, 7)).toEqual({ x: 20, top: 45, bottom: 55, line: 2 });
    });

    it('lets the caret move past trailing spaces', () => {
        const l = layoutText('hi  ', { ...metrics, wordWrap: true, wordWrapWidth: 100 }, mono);

        expect(l.lines[0].width).toBe(20);
        expect(l.lines[0].carets).toEqual([0, 10, 20, 30, 40]);
        expect(caretRect(l, 4).x).toBe(40);
    });

    it('draws one highlight box per line, with a sliver for selected newlines', () => {
        const l = layoutText('ab\ncd', metrics, mono);
        const rects = rangeRects(l, 1, 4);

        expect(rects).toEqual([
            { x: 10, y: 0, width: 12.5, height: 10, line: 0 },
            { x: 0, y: 10, width: 10, height: 10, line: 1 },
        ]);
        expect(rangeRects(l, 2, 2)).toEqual([]);
    });

    it('skips offsets inside a grapheme cluster', () => {
        const flag = '\u{1F1EB}\u{1F1F7}';
        const text = `a${flag}b`;
        const l = layoutText(text, metrics, mono);
        const stops = new Set(graphemeStops(text));

        expect([...stops]).toEqual([0, 1, 5, 6]);
        // the flag is two code points, 20 wide: its middle is not a stop
        expect(caretAtPoint(l, 19, 5, (i) => stops.has(i)).index).toBe(1);
        expect(caretAtPoint(l, 26, 5, (i) => stops.has(i)).index).toBe(5);
    });
});

describe('words and paragraphs', () => {
    const text = 'Hello, big world\nnext line';

    it('finds the word or run under an offset', () => {
        expect(wordAt(text, 2)).toEqual({ start: 0, end: 5 });
        expect(wordAt(text, 5)).toEqual({ start: 5, end: 6 });
        expect(wordAt(text, 9)).toEqual({ start: 7, end: 10 });
    });

    it('jumps by word the Mac way and the Windows way', () => {
        expect(nextWordStop(text, 0, true)).toBe(5);
        expect(nextWordStop(text, 5, true)).toBe(10);
        expect(nextWordStop(text, 0, false)).toBe(7);
        expect(previousWordStop(text, 9)).toBe(7);
        expect(previousWordStop(text, 7)).toBe(0);
        expect(previousWordStop(text, 0)).toBe(0);
    });

    it('finds the paragraph around an offset', () => {
        expect(paragraphAt(text, 3)).toEqual({ start: 0, end: 16 });
        expect(paragraphAt(text, 20)).toEqual({ start: 17, end: 26 });
    });
});

// ----------------------------------------------------------------------------------- editing

describe('TextEditor', () => {
    it('edits with the keyboard and moves by grapheme, word and line', () => {
        const ed = make({ text: 'hello world' });

        ed.select(5);
        // Ctrl + Right stops at the start of the next word off the Mac
        ed.handleKey(key('ArrowRight', { ctrlKey: true }));
        expect(ed.selectionStart).toBe(6);
        ed.handleKey(key('ArrowRight', { ctrlKey: true }));
        expect(ed.selectionStart).toBe(11);
        ed.handleKey(key('ArrowLeft', { ctrlKey: true, shiftKey: true }));
        expect([ed.state.selection.value.anchor, ed.state.selection.value.focus]).toEqual([11, 6]);
        expect(ed.selectedText).toBe('world');
        ed.handleKey(key('Backspace'));
        expect(ed.value).toBe('hello ');
        ed.handleKey(key('Backspace', { ctrlKey: true }));
        expect(ed.value).toBe('');
        ed.insert('abc');
        ed.handleKey(key('Home'));
        ed.handleKey(key('Delete'));
        expect(ed.value).toBe('bc');
        ed.handleKey(key('a', { ctrlKey: true }));
        expect(ed.selectedText).toBe('bc');
        ed.handleKey(key('ArrowLeft'));
        expect(ed.selectionEnd).toBe(0);
    });

    it('keeps the preferred x when moving up and down', () => {
        // 10 wide characters on three lines: "abcdef", "ab", "abcdef"
        const ed = make({ text: 'abcdef\nab\nabcdef' });

        ed.select(5);
        ed.handleKey(key('ArrowDown'));
        expect(ed.selectionStart).toBe(9);
        ed.handleKey(key('ArrowDown'));
        expect(ed.selectionStart).toBe(15);
        ed.handleKey(key('ArrowUp'));
        ed.handleKey(key('ArrowUp'));
        expect(ed.selectionStart).toBe(5);
        ed.handleKey(key('ArrowUp'));
        expect(ed.selectionStart).toBe(0);
    });

    it('goes to the end of a wrapped line with End', () => {
        const ed = make({ text: 'one two three', width: 75 });

        ed.select(1);
        ed.handleKey(key('End'));
        expect(ed.selectionStart).toBe(8);
        // drawn at the end of the first line, not the start of the second
        expect(ed.textObject.caretRect(8, true).line).toBe(0);
        ed.handleKey(key('Home'));
        expect(ed.selectionStart).toBe(0);
    });

    it('selects a word on double click and a paragraph on triple click, and drags', () => {
        const ed = make({ text: 'hello big world\nsecond' });

        // "big" spans x 60 to 90
        ed.emit('pointerdown', pointer(72, 10));
        ed.emit('pointerup', pointer(72, 10));
        expect(ed.focused).toBe(true);
        expect(ed.selectionStart).toBe(7);
        ed.emit('pointerdown', pointer(72, 10));
        ed.emit('pointerup', pointer(72, 10));
        expect(ed.selectedText).toBe('big');
        ed.emit('pointerdown', pointer(72, 10));
        ed.emit('pointerup', pointer(72, 10));
        expect(ed.selectedText).toBe('hello big world');
        // a fresh press far away, then a drag
        ed.emit('pointerdown', pointer(5, 30, { pointerId: 2 }));
        ed.emit('globalpointermove', pointer(31, 30, { pointerId: 2 }));
        ed.emit('pointerup', pointer(31, 30, { pointerId: 2 }));
        expect(ed.selectedText).toBe('sec');
        ed.emit('pointerdown', pointer(55, 30, { pointerId: 3, shiftKey: true }));
        expect(ed.selectedText).toBe('secon');
    });

    it('places the caret on a touch tap, selects a word on a long press, and leaves drags alone', () => {
        vi.useFakeTimers();
        const ed = make({ text: 'hello big world' });
        const touch = (x: number, id: number) => pointer(x, 10, { pointerType: 'touch', pointerId: id });

        // a drag scrolls the page or pans the camera: no caret
        ed.emit('pointerdown', touch(20, 1));
        ed.emit('globalpointermove', touch(80, 1));
        ed.emit('pointerup', touch(80, 1));
        expect(ed.focused).toBe(false);
        ed.emit('pointerdown', touch(31, 2));
        ed.emit('pointerup', touch(31, 2));
        expect(ed.focused).toBe(true);
        expect(ed.selectionStart).toBe(3);
        vi.advanceTimersByTime(1000);
        ed.emit('pointerdown', touch(72, 3));
        vi.advanceTimersByTime(500);
        expect(ed.selectedText).toBe('big');
        ed.emit('globalpointermove', touch(125, 3));
        ed.emit('pointerup', touch(125, 3));
        expect(ed.selectedText).toBe('big world');
        vi.useRealTimers();
    });

    it('merges typing into one undo step and keeps deletes apart', () => {
        const ed = make();

        for (const c of 'abc') ed.insert(c);
        ed.deleteBackward();
        expect(ed.value).toBe('ab');
        ed.undo();
        expect(ed.value).toBe('abc');
        ed.undo();
        expect(ed.value).toBe('');
        ed.redo();
        expect(ed.value).toBe('abc');
        // a caret move starts a new step
        ed.select(0);
        ed.insert('x');
        ed.undo();
        expect(ed.value).toBe('abc');
    });

    it('records into the app history', () => {
        const history = new History();
        const ed = make({ history });

        ed.insert('a');
        ed.insert('b');
        expect(history.past).toHaveLength(1);
        history.undo();
        expect(ed.value).toBe('');
        ed.handleKey(key('z', { ctrlKey: true, shiftKey: true }));
        expect(ed.value).toBe('ab');
    });

    it('commits on Enter in a single-line field and strips newlines', () => {
        const ed = make({ multiline: false, text: 'a\nb' });
        const seen: string[] = [];

        expect(ed.value).toBe('a b');
        ed.on('submit', (v: string) => seen.push(`submit ${v}`));
        ed.on('change', (v: string) => seen.push(`change ${v}`));
        ed.focus();
        ed.select(3);
        ed.insert('c\nd');
        expect(ed.value).toBe('a bc d');
        ed.handleKey(key('Enter'));
        expect(seen).toEqual(['submit a bc d', 'change a bc d']);
        expect(ed.focused).toBe(true);
        ed.handleKey(key('Escape'));
        expect(ed.focused).toBe(false);

        const area = make({ text: 'x' });

        area.select(1);
        area.handleKey(key('Enter'));
        expect(area.value).toBe('x\n');
    });

    it('respects maxLength without splitting a grapheme', () => {
        const ed = make({ maxLength: 5 });

        ed.insert('abc');
        ed.insert('\u{1F44D}\u{1F3FD}');
        expect(ed.value).toBe('abc');
        ed.insert('de');
        ed.insert('f');
        expect(ed.value).toBe('abcde');
        ed.select(0, 5);
        ed.insert('0123456789');
        expect(ed.value).toBe('01234');
    });

    it('selects and copies but does not edit when read-only', () => {
        const ed = make({ text: 'fixed', readOnly: true });

        ed.selectAll();
        expect(ed.insert('x')).toBe(false);
        ed.handleKey(key('Backspace'));
        expect(ed.value).toBe('fixed');
        expect(ed.selectedText).toBe('fixed');
    });

    it('shows the placeholder only while empty and follows the text signal', () => {
        const ed = make({ placeholder: 'Name' });

        expect(ed.placeholderObject.visible).toBe(true);
        ed.state.text.value = 'Ada';
        expect(ed.value).toBe('Ada');
        expect(ed.textObject.text).toBe('Ada');
        expect(ed.placeholderObject.visible).toBe(false);
    });
});

// ------------------------------------------------------------------------------- the field

describe('TextEditor text field', () => {
    let dom: ReturnType<typeof fakeDocument>;

    beforeEach(() => {
        dom = fakeDocument();
        (globalThis as Record<string, unknown>).document = dom.doc;
    });
    afterEach(() => {
        delete (globalThis as Record<string, unknown>).document;
        TextEditor.active = null;
    });

    it('mirrors the text and selection into a focused field and applies typing from it', () => {
        const ed = make({ text: 'hllo' });
        const seen: string[] = [];

        ed.on('input', (v: string) => seen.push(v));
        ed.focus();
        const f = dom.fields[0];

        expect(dom.doc.activeElement).toBe(f);
        ed.select(1);
        expect([f.value, f.selectionStart]).toEqual(['hllo', 1]);
        typeInto(f, 'e');
        expect(ed.value).toBe('hello');
        expect(ed.selectionStart).toBe(2);
        // a repeated letter lands where the caret was
        ed.select(3);
        typeInto(f, 'l');
        expect(ed.value).toBe('helllo');
        expect(ed.selectionStart).toBe(4);
        expect(seen).toEqual(['hello', 'helllo']);
        // keys go through the field
        f.dispatchEvent(
            event('keydown', { key: 'Home', shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }),
        );
        expect(ed.selectionStart).toBe(0);
    });

    it('shows composition text underlined and records one undo step when it ends', () => {
        const ed = make({ text: 'ab' });

        ed.focus();
        ed.select(2);
        const f = dom.fields[0];

        f.dispatchEvent(event('compositionstart'));
        expect(ed.state.composing.value).toBe(true);
        typeInto(f, 'k', 'insertCompositionText');
        expect(ed.value).toBe('abk');
        // the input method replaces what it composed so far
        f.selectionStart = 2;
        typeInto(f, 'か', 'insertCompositionText');
        expect(ed.value).toBe('abか');
        expect(ed.composition).toEqual({ start: 2, end: 3 });
        // keys belong to the input method meanwhile
        expect(ed.handleKey({ ...key('ArrowLeft'), isComposing: true })).toBe(false);
        f.selectionStart = 2;
        typeInto(f, '漢字', 'insertCompositionText');
        f.dispatchEvent(event('compositionend'));
        expect(ed.value).toBe('ab漢字');
        expect(ed.composition).toBeNull();
        expect(ed.state.composing.value).toBe(false);
        ed.undo();
        expect(ed.value).toBe('ab');
    });

    it('pastes and cuts through the clipboard events', () => {
        const ed = make({ text: 'one two', multiline: false });

        ed.focus();
        const f = dom.fields[0];
        const store: Record<string, string> = {};
        const clipboardData = {
            setData: (t: string, v: string) => {
                store[t] = v;
            },
            getData: (t: string) => store[t] ?? '',
        };

        ed.select(4, 7);
        f.dispatchEvent(event('cut', { clipboardData }));
        expect(store['text/plain']).toBe('two');
        expect(ed.value).toBe('one ');
        store['text/plain'] = 'a\r\nb';
        f.dispatchEvent(event('paste', { clipboardData }));
        expect(ed.value).toBe('one a b');
    });

    it('blurs on Escape and when focus moves to another editor', () => {
        const a = make({ text: 'a' });
        const b = make({ text: 'b' });
        const events: string[] = [];

        a.on('blur', () => events.push('blur a'));
        a.focus();
        b.focus();
        expect(a.focused).toBe(false);
        expect(TextEditor.active).toBe(b);
        expect(events).toEqual(['blur a']);
        TextEditor.chain([a, b]);
        b.handleKey(key('Tab'));
        expect(a.focused).toBe(true);
        expect(a.selectedText).toBe('a');
    });

    it('hit tests and places the field through the camera transform', () => {
        const world = new Container();
        const ed = make({ text: 'abcdef', multiline: false });
        const element = {
            clientWidth: 400,
            clientHeight: 300,
            getBoundingClientRect: () => ({ left: 10, top: 20, width: 400, height: 300 }),
        } as unknown as HTMLElement;

        world.addChild(ed);
        world.scale.set(2);
        world.position.set(100, 50);
        ed.position.set(10, 0);
        // world x 10 + 30 = 40, on screen 100 + 40 * 2 = 180
        expect(ed.hitTest({ x: 181, y: 60 }).index).toBe(3);
        ed.emit('pointerdown', pointer(181, 60, { nativeEvent: { preventDefault() {}, target: element } }));
        ed.emit('pointerup', pointer(181, 60));
        const f = dom.fields[0];

        expect(f.style.transform).toBe('translate(190px, 70px)');
        // a caret 20 units tall is 40 pixels on screen
        expect(f.style.height).toBe('40px');
        world.scale.set(4);
        ed.tick(1 / 60);
        expect(f.style.height).toBe('80px');
    });
});
