import { Container, Text } from 'pixi.js';
import { linear, SilkGraphics } from 'pixi-silk';
import { bindHistoryKeys, History, recordGizmo } from 'pixi-silk/history';
import { bindGizmo, bindMeasure, bindOutline, Selection } from 'pixi-silk/selection';
import { watch } from 'pixi-silk/signal';
import { Camera, ZoomControl } from 'pixi-silk/ui/camera';
import { TransformGizmo } from 'pixi-silk/ui/gizmo';
import { altDown } from 'pixi-silk/ui/keys';
import { Measure } from 'pixi-silk/ui/measure';
import { SelectionOutline } from 'pixi-silk/ui/outline';
import { defineDemo } from './runtime';

// Scroll to pan, pinch or ctrl + scroll to zoom, right drag or Space + drag to pan.
// Click a layer to select it, Shift + click to add more. Hover another to measure the distance
// to it. Drag the arrows to move a layer, cmd or ctrl + Z undoes and Shift + cmd + Z redoes.
export default defineDemo({
    size: [760, 480],
    background: 0x151517,
    touchAction: 'none',
    ownsCamera: true,
    controls: {
        redlines: { type: 'select', label: 'redlines', options: ['on hover', 'with Alt'], value: 'on hover' },
    },
    setup({ silk, params }) {
        const app = silk.app;
        const world = new Container();
        const overlay = new Container();
        const camera = new Camera({ world, element: app.canvas });
        const hover = new SelectionOutline({ ticker: app.ticker });
        const outline = new SelectionOutline({ ticker: app.ticker });
        const gizmo = new TransformGizmo({ ticker: app.ticker });
        const measure = new Measure({ space: world, ticker: app.ticker });
        const zoom = new ZoomControl(camera);
        // one selection store drives the outlines, the gizmo and the redlines
        const selection = new Selection<Container>();
        const history = new History();

        gizmo.state.mode.set('move');
        overlay.addChild(hover, outline, gizmo, measure, zoom);
        app.stage.addChild(world, overlay);
        app.stage.eventMode = 'static';
        app.stage.hitArea = app.screen;
        app.stage.on('pointerdown', (e) => e.target === app.stage && !e.shiftKey && selection.clear());

        const redlines = () => params.redlines === 'on hover' || altDown();
        const measured = bindMeasure(selection, measure, { between: redlines });
        // while measuring, the hovered layer gets the red outline instead of the blue one
        const syncHover = () => {
            const over = selection.state.hovered.value;
            const quiet = !over || selection.has(over) || (redlines() && selection.primary);

            hover.hover(quiet ? null : over);
        };
        const stops = [
            bindOutline(selection, outline),
            watch(selection.state.hovered, syncHover),
            watch(selection.state.items, syncHover),
            bindGizmo(selection, gizmo),
            measured.stop,
            // every gizmo drag is one undo step, and the keys undo it
            recordGizmo(gizmo, history),
            bindHistoryKeys(history),
        ];

        // an artboard with a few layers on it
        const title = new Text({
            text: 'Home',
            style: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13, fill: 0x8e8e93 },
            resolution: 4,
        });

        title.position.set(0, -20);
        world.addChild(title);

        const layer = (x: number, y: number, draw: (g: SilkGraphics) => void) => {
            const item = new Container();
            const g = new SilkGraphics();

            draw(g);
            item.addChild(g);
            item.position.set(x, y);
            item.eventMode = 'static';
            item.cursor = 'pointer';
            item.on('pointerover', () => selection.state.hovered.set(item));
            item.on('pointerout', () => {
                if (selection.state.hovered.value === item) selection.state.hovered.set(null);
            });
            item.on('pointerdown', (e) => {
                e.stopPropagation();
                selection.pick(item, e.shiftKey ? 'toggle' : 'replace');
            });
            world.addChild(item);

            return item;
        };

        const board = layer(0, 0, (g) => g.rect(0, 0, 390, 620).fill(0xf4f4f6));

        layer(24, 24, (g) =>
            g.roundRect(0, 0, 342, 180, 24, 0.6).fill(linear([0x5e5ce6, 0xbf5af2], { from: [0, 0], to: [1, 1] })),
        );
        const card = layer(24, 228, (g) =>
            g
                .roundRect(0, 0, 160, 120, 18, 0.6)
                .fill({ color: 0xffffff, innerShadow: { color: 0x000000, alpha: 0.06, y: -1, blur: 1 } }),
        );

        layer(206, 228, (g) => g.roundRect(0, 0, 160, 120, 18, 0.6).fill(0xffffff));
        layer(24, 372, (g) => g.roundRect(0, 0, 342, 64, 16, 0.6).fill(0xffffff));
        layer(48, 388, (g) => g.circle(16, 16, 16).fill(0x30d158));
        layer(24, 532, (g) => g.pill(0, 0, 342, 52).fill(0x1c1c1e));

        const place = () =>
            zoom.position.set(app.screen.width - zoom.size[0] - 12, app.screen.height - zoom.size[1] - 12);

        app.renderer.on('resize', place);
        place();
        selection.pick(card);
        camera.fit(board, 40, false);

        // Alt shows the redlines without moving the pointer
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Alt') return;
            measured.sync();
            syncHover();
        };

        addEventListener('keydown', onKey);
        addEventListener('keyup', onKey);

        return () => {
            for (const stop of stops) stop();
            removeEventListener('keydown', onKey);
            removeEventListener('keyup', onKey);
            camera.destroy();
        };
    },
});
