import { SilkGraphics } from 'pixi-silk';
import { defineDemo } from './runtime';

// containsPoint() evaluates the real distance field: the ring is hollow, the line is only its stroke.
export default defineDemo({
    title: 'Hit testing',
    size: [480, 220],
    setup({ stage, tick }) {
        const items = [
            { draw: (g: SilkGraphics, c: number) => g.circle(100, 110, 60).stroke({ width: 18, color: c }) },
            { draw: (g: SilkGraphics, c: number) => g.roundRect(200, 50, 120, 120, 36, 0.6).fill(c) },
            {
                draw: (g: SilkGraphics, c: number) =>
                    g.polyline([350, 170, 390, 60, 450, 150]).stroke({ width: 10, cap: 'round', color: c }),
            },
        ].map((item) => {
            const g = new SilkGraphics();

            g.eventMode = 'static';
            g.cursor = 'pointer';
            stage.addChild(g);

            return { ...item, g, hover: false };
        });

        for (const item of items) {
            item.g.on('pointerover', () => (item.hover = true));
            item.g.on('pointerout', () => (item.hover = false));
        }
        tick(() => {
            for (const item of items) item.draw(item.g.clear(), item.hover ? 0x30d158 : 0x48484a);
        });
    },
});
