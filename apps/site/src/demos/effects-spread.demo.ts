import { Text } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { defineDemo, INK, MONO } from './runtime';

// Blur versus blur with spread, the white-square glow from the design tutorials.
// Spread grows the shape before the blur, so the glow keeps a bright core.
const STEPS = [
    { label: 'shape', glows: [] },
    { label: 'blur 8', glows: [{ blur: 8, spread: 0 }] },
    {
        label: 'blur 32\nspread 8',
        glows: [
            { blur: 8, spread: 0 },
            { blur: 32, spread: 8 },
        ],
    },
    {
        label: 'blur 128\nspread 32',
        glows: [
            { blur: 8, spread: 0 },
            { blur: 32, spread: 8 },
            { blur: 128, spread: 32 },
        ],
    },
];

export default defineDemo({
    title: 'Blur and spread',
    size: [720, 300],
    // phones: two rows of two squares
    phone: { size: [360, 420] },
    controls: {
        scale: { type: 'range', label: 'glow', min: 0, max: 1.5, step: 0.01, value: 1 },
    },
    setup({ stage, params, tick, phone }) {
        const g = new SilkGraphics();
        // top left corner of each 70x70 square: one row of four, or a 2x2 grid on phones
        const at = (i: number): [number, number] =>
            phone ? [70 + (i % 2) * 150, 50 + Math.floor(i / 2) * 200] : [100 + i * 150, 105];
        let last = -1;

        stage.addChild(g);
        STEPS.forEach((step, i) => {
            const t = new Text({
                text: step.label,
                style: { fill: INK.muted, fontFamily: MONO, fontSize: 13, align: 'center', lineHeight: 18 },
            });

            t.anchor.set(0.5, 0);
            const [x, y] = at(i);

            t.position.set(x + 35, y + 117);
            stage.addChild(t);
        });
        tick(() => {
            if (params.scale === last) return;
            last = params.scale;
            g.clear();
            STEPS.forEach((step, i) => {
                const [x, y] = at(i);
                const k = params.scale;

                for (const glow of step.glows) {
                    // each glow layer is 1/4 of the blur in sigma (Figma blur is a diameter-ish radius)
                    g.roundRect(x, y, 70, 70, 8).fill({
                        color: 0xffffff,
                        alpha: 0.9,
                        blur: (glow.blur / 4) * k,
                        spread: glow.spread * k * 0.7,
                        blend: 'add',
                    });
                }
                g.roundRect(x, y, 70, 70, 8).fill(0xffffff);
            });
        });

        return undefined;
    },
});
