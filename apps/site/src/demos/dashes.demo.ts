import { SilkGraphics, type StrokeStyle } from 'pixi-silk';
import { defineDemo } from './runtime';

export default defineDemo({
    title: 'Dashes',
    size: [480, 220],
    controls: {
        dash: { type: 'range', label: 'dash', min: 0, max: 30, step: 1, value: 10 },
        gap: { type: 'range', label: 'gap', min: 2, max: 30, step: 1, value: 8 },
        cap: { type: 'select', label: 'cap', options: ['butt', 'round', 'square'], value: 'round' },
        march: { type: 'toggle', label: 'animate', value: true },
    },
    setup({ stage, params, tick }) {
        const g = new SilkGraphics();

        stage.addChild(g);
        tick((t) => {
            const style: StrokeStyle = {
                width: 6,
                cap: params.cap as StrokeStyle['cap'],
                dash: [params.dash, params.gap],
                dashOffset: params.march ? t * 24 : 0,
            };

            g.clear();
            g.circle(90, 110, 70).stroke({ ...style, color: 0x64d2ff }); // on closed outlines the pattern tiles without a seam
            g.line(200, 40, 440, 40).stroke({ ...style, color: 0xffd60a });
            g.polyline([200, 180, 260, 90, 320, 160, 380, 80, 440, 150], { smooth: 'catmull' }).stroke({
                ...style,
                color: 0xff375f,
            });
            g.line(200, 110, 440, 110).stroke({ width: 8, cap: 'round', dash: [0, 16], color: 0x30d158 }); // 0-length dashes = dots
        });
    },
});
