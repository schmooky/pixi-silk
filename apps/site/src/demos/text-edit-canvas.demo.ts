import { Container } from 'pixi.js';
import { linear, SilkGraphics } from 'pixi-silk';
import { bindHistoryKeys, History } from 'pixi-silk/history';
import { SilkText, silkLabel } from 'pixi-silk/text';
import { Camera, ZoomControl } from 'pixi-silk/ui/camera';
import { TextEditor } from 'pixi-silk/ui/textedit';
import { defineDemo } from './runtime';

// Click a text to edit it, drag to select, double click a word. Pinch or ctrl + scroll to zoom in
// and keep typing: the caret, the selection and the glyphs stay sharp. Scroll pans.
export default defineDemo({
    size: [760, 440],
    background: 0x151517,
    touchAction: 'none',
    ownsCamera: true,
    setup({ silk }) {
        const app = silk.app;
        const world = new Container();
        const camera = new Camera({ world, element: app.canvas });
        const zoom = new ZoomControl(camera, { label: silkLabel() });
        // one undo stack for the whole canvas: text edits sit in it with everything else
        const history = new History();
        const font = 'Inter, system-ui, sans-serif';

        app.stage.addChild(world, zoom);

        const card = new SilkGraphics()
            .roundRect(0, 0, 420, 260, 28, 0.6)
            .fill(linear([0x2c2c30, 0x1c1c1f], { from: [0, 0], to: [0, 1] }))
            .roundRect(0.5, 0.5, 419, 259, 28, 0.6)
            .stroke({ color: 0xffffff, alpha: 0.08, width: 1 });
        const caption = new SilkText({ text: 'Frame 1', fontFamily: font, fontSize: 11, fill: 0x8e8e93 });

        caption.position.set(2, -18);
        world.addChild(card, caption);

        const title = new TextEditor({
            text: 'Edit me',
            fontFamily: font,
            fontSize: 30,
            fontWeight: 700,
            fill: 0xffffff,
            multiline: false,
            history,
            element: app.canvas,
        });
        const body = new TextEditor({
            text: 'Text on an infinite canvas. Zoom to 800% and the caret is still one crisp pixel and a half wide.\n\nDouble click a word, triple click a paragraph.',
            fontFamily: font,
            fontSize: 15,
            lineHeight: 22,
            fill: 0xc7c7cc,
            width: 356,
            placeholder: 'Write something',
            history,
            element: app.canvas,
        });

        title.position.set(32, 30);
        body.position.set(32, 86);
        world.addChild(title, body);

        // a tiny caption follows the title as you type
        const count = new SilkText({ fontFamily: font, fontSize: 11, fill: 0x636366, tabularNumbers: true });

        count.position.set(32, 230);
        world.addChild(count);
        const update = () => {
            const words = body.value.split(/\s+/).filter(Boolean).length;

            count.text = `${title.value.length} characters in the title, ${words} words below`;
        };
        const stops = [title.state.text.subscribe(update), body.state.text.subscribe(update), bindHistoryKeys(history)];

        update();
        const place = () =>
            zoom.position.set(app.screen.width - zoom.size[0] - 12, app.screen.height - zoom.size[1] - 12);

        app.renderer.on('resize', place);
        place();
        camera.fit({ x: -20, y: -40, width: 460, height: 320 }, 24, false);

        return () => {
            for (const stop of stops) stop();
            app.renderer.off('resize', place);
            title.destroy();
            body.destroy();
            camera.destroy();
        };
    },
});
