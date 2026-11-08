import { Container } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { watch } from 'pixi-silk/signal';
import { SilkText } from 'pixi-silk/text';
import { TextEditor } from 'pixi-silk/ui/textedit';
import { defineDemo } from './runtime';

// Single-line fields drawn on the canvas. Tab moves to the next field, Enter in the last one sends
// the form. Japanese or Chinese input, dead keys and the emoji picker type into them as usual.
export default defineDemo({
    size: [520, 330],
    background: 0x0f0f11,
    setup({ silk, stage }) {
        const font = 'Inter, system-ui, sans-serif';
        const fields: TextEditor[] = [];
        const stops: (() => void)[] = [];
        const field = (label: string, y: number, options: ConstructorParameters<typeof TextEditor>[0]) => {
            const row = new Container();
            const name = new SilkText({ text: label, fontFamily: font, fontSize: 12, fontWeight: 600, fill: 0x8e8e93 });
            const box = new SilkGraphics();
            const editor = new TextEditor({
                fontFamily: font,
                fontSize: 15,
                fill: 0xf2f2f7,
                multiline: false,
                width: 276,
                element: silk.app.canvas,
                ...options,
            });

            editor.position.set(12, 31);
            // a press anywhere on the box focuses the field
            box.eventMode = 'static';
            box.cursor = 'text';
            box.on('pointerdown', (e) => {
                (e.nativeEvent as Event).preventDefault();
                editor.focus();
            });
            row.addChild(name, box, editor);
            row.position.set(40, y);
            // the box lights up while its field has focus
            stops.push(
                watch(editor.state.focused, (on) => {
                    box.clear()
                        .roundRect(0, 20, 300, 40, 10, 0.6)
                        .fill(on ? 0x1c1c22 : 0x18181b)
                        .roundRect(0, 20, 300, 40, 10, 0.6)
                        .stroke({ color: on ? 0x0a84ff : 0x3a3a3c, width: on ? 1.5 : 1, alignment: 'inside' });
                }),
            );
            stage.addChild(row);
            fields.push(editor);

            return editor;
        };

        const name = field('Name', 24, { placeholder: 'Ada Lovelace' });
        const email = field('Email', 104, { placeholder: 'ada@example.com' });
        const code = field('Promo code, 8 characters at most', 184, { placeholder: 'SILK2026', maxLength: 8 });
        const result = new SilkText({
            fontFamily: font,
            fontSize: 12,
            fill: 0x30d158,
            wordWrap: true,
            wordWrapWidth: 150,
        });
        const button = new Container();
        const pill = new SilkGraphics().pill(0, 0, 140, 40).fill(0x0a84ff);
        const label = new SilkText({ text: 'Send', fontFamily: font, fontSize: 14, fontWeight: 600, anchor: 0.5 });

        label.position.set(70, 20);
        button.addChild(pill, label);
        button.position.set(360, 228);
        button.eventMode = 'static';
        button.cursor = 'pointer';
        result.position.set(360, 52);
        stage.addChild(button, result);
        const send = () => {
            const values = [name.value || 'no name', email.value || 'no email', code.value || 'no code'];

            result.text = `Sent\n${values.join('\n')}`;
            TextEditor.active?.blur();
        };

        button.on('pointertap', send);
        code.on('submit', send);
        // Enter in the first fields moves on, like a sign-up form
        name.on('submit', () => email.focus(true));
        email.on('submit', () => code.focus(true));
        stops.push(TextEditor.chain(fields));

        return () => {
            for (const stop of stops) stop();
            for (const f of fields) f.destroy();
        };
    },
});
