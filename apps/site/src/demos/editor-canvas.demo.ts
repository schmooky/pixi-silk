import { Container, Text } from 'pixi.js';
import { linear, SilkGraphics } from 'pixi-silk';
import { Camera, ZoomControl } from 'pixi-silk/ui/camera';
import { TransformGizmo } from 'pixi-silk/ui/gizmo';
import { altDown } from 'pixi-silk/ui/keys';
import { Measure } from 'pixi-silk/ui/measure';
import { SelectionOutline } from 'pixi-silk/ui/outline';
import { defineDemo } from './runtime';

// Scroll to pan, pinch or ctrl + scroll to zoom, right drag or Space + drag to pan.
// Click a layer to select it. Hover another to measure the distance to it.
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
        const selection = new SelectionOutline({ ticker: app.ticker });
        const gizmo = new TransformGizmo({ ticker: app.ticker });
        const measure = new Measure({ space: world, ticker: app.ticker });
        const zoom = new ZoomControl(camera);
        let selected: Container | null = null;
        let hovered: Container | null = null;

        gizmo.state.mode.set('move');
        overlay.addChild(hover, selection, gizmo, measure, zoom);
        app.stage.addChild(world, overlay);
        app.stage.eventMode = 'static';
        app.stage.hitArea = app.screen;
        app.stage.on('pointerdown', () => select(null));

        const select = (item: Container | null) => {
            selected = item;
            selection.select(item);
            gizmo.attach(item);
            measure.size(item);
        };
        const sync = () => {
            const show = params.redlines === 'on hover' || altDown();
            const pair = show && selected && hovered && hovered !== selected;

            // while measuring the hovered layer gets the red outline instead of the blue one
            measure.between(pair ? selected : null, pair ? hovered : null);
            hover.hover(pair || hovered === selected ? null : hovered);
        };

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
            item.on('pointerover', () => {
                hovered = item;
                sync();
            });
            item.on('pointerout', () => {
                if (hovered === item) hovered = null;
                sync();
            });
            item.on('pointerdown', (e) => {
                e.stopPropagation();
                select(item);
                sync();
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
        select(card);
        camera.fit(board, 40, false);

        // Alt shows the redlines without moving the pointer
        const onKey = (e: KeyboardEvent) => e.key === 'Alt' && sync();

        addEventListener('keydown', onKey);
        addEventListener('keyup', onKey);
        app.ticker.add(sync);

        return () => {
            removeEventListener('keydown', onKey);
            removeEventListener('keyup', onKey);
            camera.destroy();
        };
    },
});
