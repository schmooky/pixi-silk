import { Text } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { defineDemo } from './runtime';

// Blur versus blur with spread, the white-square glow from the design tutorials.
// Spread grows the shape before the blur, so the glow keeps a bright core.
const STEPS = [
    { label: 'shape', glows: [] },
    { label: 'blur 8', glows: [{ blur: 8, spread: 0 }] },
    {
        label: 'blur 32, spread 8',
        glows: [
            { blur: 8, spread: 0 },
            { blur: 32, spread: 8 },
        ],
    },
    {
        label: 'blur 128, spread 32',
        glows: [
            { blur: 8, spread: 0 },
            { blur: 32, spread: 8 },
            { blur: 128, spread: 32 },
        ],
    },
];

export default defineDemo({
    size: [640, 300],
    background: 0x111111,
    controls: {
        scale: { type: 'range', label: 'glow', min: 0, max: 1.5, step: 0.01, value: 1 },
    },
    setup({ stage, params, tick }) {
        const g = new SilkGraphics();
        let last = -1;

        stage.addChild(g);
        STEPS.forEach((step, i) => {
            const t = new Text({
                text: step.label,
                style: { fill: 0x8e8e93, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11 },
            });

            t.anchor.set(0.5, 0);
            t.position.set(95 + i * 150, 222);
            stage.addChild(t);
        });
        tick(() => {
            if (params.scale === last) return;
            last = params.scale;
            g.clear();
            STEPS.forEach((step, i) => {
                const x = 60 + i * 150;
                const k = params.scale;

                for (const glow of step.glows) {
                    // each glow layer is 1/4 of the blur in sigma (Figma blur is a diameter-ish radius)
                    g.roundRect(x, 105, 70, 70, 8).fill({
                        color: 0xffffff,
                        alpha: 0.9,
                        blur: (glow.blur / 4) * k,
                        spread: glow.spread * k * 0.7,
                        blend: 'add',
                    });
                }
                g.roundRect(x, 105, 70, 70, 8).fill(0xffffff);
            });
        });

        return undefined;
    },
});
