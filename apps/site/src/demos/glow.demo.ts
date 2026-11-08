import { SilkGraphics } from 'pixi-silk';
import { defineDemo } from './runtime';

// `blur` is a gaussian applied to the distance field: no filters, no extra passes.
export default defineDemo({
    title: 'Glow',
    size: [480, 220],
    background: 0x050507,
    controls: {
        blur: { type: 'range', label: 'blur (σ)', min: 0, max: 30, step: 0.5, value: 12, unit: 'px' },
    },
    setup({ stage, params, tick }) {
        const g = new SilkGraphics();

        stage.addChild(g);
        tick((t) => {
            const pulse = 0.8 + Math.sin(t * 2) * 0.2;

            g.clear();
            // neon: a blurred copy under a crisp stroke
            g.circle(110, 110, 60).stroke({ width: 8, color: 0xff375f, blur: params.blur * pulse, alpha: 0.9 });
            g.circle(110, 110, 60).stroke({ width: 3, color: 0xffd1dc });
            // soft shadow: offset, blurred, translucent
            g.roundRect(260, 60 + 18, 180, 100, 24, 0.6).fill({ color: 0x000000, alpha: 0.9, blur: params.blur });
            g.roundRect(260, 60, 180, 100, 24, 0.6).fill(0x2c2c2e);
            g.circle(300, 110, 16).fill({ color: 0x30d158, blur: params.blur * 0.4 });
            g.circle(300, 110, 7).fill(0xe8ffe8);
        });
    },
});
