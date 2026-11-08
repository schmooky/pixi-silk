import { Container } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { Camera, ZoomControl } from 'pixi-silk/ui/camera';
import { CanvasGrid } from 'pixi-silk/ui/grid';
import { Ruler } from 'pixi-silk/ui/ruler';
import { defineDemo } from './runtime';

// Pinch or ctrl + scroll to zoom: grid levels fade in and out, ruler labels step in 1, 2, 5.
export default defineDemo({
    size: [760, 420],
    background: 0x151517,
    touchAction: 'none',
    ownsCamera: true,
    controls: {
        style: { type: 'select', label: 'grid', options: ['lines', 'dots'], value: 'lines' },
        axes: { type: 'toggle', label: 'axes', value: true },
    },
    setup({ silk, params }) {
        const app = silk.app;
        const world = new Container();
        const overlay = new Container();
        const camera = new Camera({ world, element: app.canvas, zoomRange: [0.05, 64] });
        const grid = new CanvasGrid({ camera, ticker: app.ticker });
        const ruler = new Ruler({ camera, ticker: app.ticker });
        const zoom = new ZoomControl(camera);
        const card = new SilkGraphics().roundRect(0, 0, 200, 120, 20, 0.6).fill(0x0a84ff);

        card.position.set(40, 40);
        world.addChild(card);
        // the ruler bands the card's extent
        ruler.highlight(card);
        overlay.addChild(ruler, zoom);
        app.stage.addChild(grid, world, overlay);

        const place = () =>
            zoom.position.set(app.screen.width - zoom.size[0] - 12, app.screen.height - zoom.size[1] - 12);

        app.renderer.on('resize', place);
        place();
        camera.fit({ x: -40, y: -40, width: 320, height: 240 }, 24, false);
        app.ticker.add(() => {
            grid.state.style.set(params.style as 'lines' | 'dots');
            grid.state.axes.set(params.axes);
        });

        return () => {
            camera.destroy();
            ruler.destroy();
            grid.destroy();
        };
    },
});
