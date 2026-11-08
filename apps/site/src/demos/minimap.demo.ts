import { Container } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { Camera } from 'pixi-silk/ui/camera';
import { Minimap } from 'pixi-silk/ui/minimap';
import { panelHitTest } from 'pixi-silk/ui/panel';
import { defineDemo } from './runtime';

// Scroll to pan and pinch or ctrl + scroll to zoom. The minimap follows the view. Drag its frame
// to pan, click anywhere on it to jump there, and scroll over it to zoom.
export default defineDemo({
    size: [760, 460],
    background: 0x101012,
    touchAction: 'none',
    ownsCamera: true,
    controls: {
        mode: { type: 'select', label: 'thumbnail', options: ['bounds', 'texture'], value: 'bounds' },
    },
    setup({ silk, params, tick }) {
        const app = silk.app;
        const world = new Container();
        const maps: Container[] = [];
        const camera = new Camera({ world, element: app.canvas, ignore: panelHitTest(() => maps) });

        app.stage.addChild(world);
        // a board of cards in rows, some wide, some tall
        const colours = [0x0a84ff, 0x5e5ce6, 0xbf5af2, 0xff375f, 0xff9f0a, 0x30d158, 0x64d2ff];

        for (let i = 0; i < 60; i++) {
            const w = 120 + ((i * 53) % 140);
            const h = 80 + ((i * 31) % 120);
            const g = new SilkGraphics().roundRect(0, 0, w, h, 16, 0.6).fill(colours[i % colours.length]);

            g.position.set((i % 10) * 300 + ((i * 17) % 40), Math.floor(i / 10) * 260 + ((i * 29) % 50));
            world.addChild(g);
        }
        let map: Minimap | null = null;
        const place = () =>
            map?.position.set(app.screen.width - map.mapWidth - 16, app.screen.height - map.mapHeight - 16);
        const build = (mode: 'bounds' | 'texture') => {
            map?.destroy();
            map = new Minimap({ camera, width: 230, height: 150, mode, renderer: app.renderer });
            maps[0] = map;
            app.stage.addChild(map);
            place();
        };
        let mode = params.mode;

        build(mode as 'bounds' | 'texture');
        app.renderer.on('resize', place);
        tick(() => {
            if (params.mode === mode) return;
            mode = params.mode;
            build(mode as 'bounds' | 'texture');
        });
        camera.fit({ x: 0, y: 0, width: 1200, height: 700 }, 40, false);

        return () => {
            app.renderer.off('resize', place);
            camera.destroy();
        };
    },
});
