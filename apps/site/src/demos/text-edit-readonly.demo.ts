import { SilkText } from 'pixi-silk/text';
import { TextEditor } from 'pixi-silk/ui/textedit';
import { defineDemo } from './runtime';

// A read-only paragraph: select with the mouse or a long press, cmd or ctrl + C copies.
// There is no caret and typing does nothing.
export default defineDemo({
    size: [520, 260],
    background: 0x0b0b0d,
    setup({ silk, stage }) {
        const font = 'Inter, system-ui, sans-serif';
        const paragraph = new TextEditor({
            text: 'Release notes. Text layers now edit on the canvas. Selection, the clipboard and input methods go through a hidden text field, so they behave the way the platform does. Double click a word to select it.',
            fontFamily: font,
            fontSize: 15,
            lineHeight: 23,
            fill: 0xd1d1d6,
            width: 440,
            readOnly: true,
            element: silk.app.canvas,
            theme: { selection: 0xffd60a, selectionAlpha: 0.28 },
        });
        const readout = new SilkText({ fontFamily: font, fontSize: 12, fill: 0x8e8e93 });

        paragraph.position.set(40, 36);
        readout.position.set(40, 214);
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
