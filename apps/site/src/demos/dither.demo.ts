import { ColorMatrixFilter, Container } from 'pixi.js';
import { SilkGraphics, vertical } from 'pixi-silk';
import { defineDemo } from './runtime';

// A dark, wide gradient has only a few 8-bit steps. Half-float ramps + ±½ LSB dither hide them.
const NIGHT = vertical([0x0b1026, 0x1d1a3a, 0x10141f]);

export default defineDemo({
    title: 'Gradient dither',
    size: [720, 220],
    background: 0x000000,
    controls: {
        dither: { type: 'toggle', label: 'dither', value: true },
        reveal: { type: 'toggle', label: 'reveal x8', value: true },
    },
    setup({ silk, stage, params, tick }) {
        const view = new Container();
        const g = new SilkGraphics();
        // multiply the contrast by 8 around black so every banding step shows
        const reveal = new ColorMatrixFilter();

        reveal.brightness(8, false);
        view.addChild(g);
        stage.addChild(view);
        // the gradient covers the whole canvas, not only the design area, so it fills any frame
        let area = '';
        const draw = () => {
            const k = stage.scale.x;
            const x = -stage.x / k;
            const y = -stage.y / k;
            const w = silk.width / k;
            const h = silk.height / k;

            g.clear()
                .rect(x, y, w, h)
                .fill(NIGHT)
                .circle(x + w * 0.75, y + h * 0.32, 60)
                .fill({ color: 0xffd9a0, alpha: 0.12, blur: 40 });
        };

        tick(() => {
            const now = `${silk.width}x${silk.height}`;

            if (now !== area) {
                area = now;
                draw();
            }
            g.dither = params.dither ? 1 : 0;
            view.filters = params.reveal ? [reveal] : [];
        });
    },
});
