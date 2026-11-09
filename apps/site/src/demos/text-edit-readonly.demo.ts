import { SilkText } from 'pixi-silk/text';
import { TextEditor } from 'pixi-silk/ui/textedit';
import { defineDemo } from './runtime';

// A read-only paragraph: select with the mouse or a long press, cmd or ctrl + C copies.
// There is no caret and typing does nothing.
export default defineDemo({
    title: 'Read-only text selection',
    size: [520, 260],
    // phones: a narrower column, so the paragraph keeps its 15 px
    phone: { size: [360, 300] },
    setup({ silk, stage, phone }) {
        const font = 'Inter, system-ui, sans-serif';
        const paragraph = new TextEditor({
            text: 'Release notes. Text layers now edit on the canvas. Selection, the clipboard and input methods go through a hidden text field, so they behave the way the platform does. Double click a word to select it.',
            fontFamily: font,
            fontSize: 15,
            lineHeight: 23,
            fill: 0xd1d1d6,
            width: phone ? 300 : 440,
            readOnly: true,
            element: silk.app.canvas,
            theme: { selection: 0xffd60a, selectionAlpha: 0.28 },
        });
        const readout = new SilkText({ fontFamily: font, fontSize: 12, fill: 0x8e8e93 });

        paragraph.position.set(phone ? 30 : 40, phone ? 24 : 36);
        readout.position.set(phone ? 30 : 40, phone ? 254 : 214);
        stage.addChild(paragraph, readout);
        const stop = paragraph.state.selection.subscribe(() => {
            const n = paragraph.selectedText.length;

            readout.text = n ? `${n} characters selected. Cmd or ctrl + C copies them.` : '';
        });

        return () => {
            stop();
            paragraph.destroy();
        };
    },
});
