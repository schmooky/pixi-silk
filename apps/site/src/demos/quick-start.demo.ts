import { Text } from 'pixi.js';
import { conic, SilkGraphics, vertical } from 'pixi-silk';
import { defineDemo, FONT, INK, label, PALETTE } from './runtime';

const GAUGE = conic([PALETTE.green, PALETTE.yellow, PALETTE.pink]);
const FILL = vertical(
    [
        [0, PALETTE.accent, 0.55],
        [1, PALETTE.accent, 0],
    ],
    { easing: 'smooth' },
);

// A small dashboard card: a squircle, a gauge with a gradient along its arc and an area chart.
export default defineDemo({
    title: 'Quick start card',
    size: [720, 220],
    controls: {
        progress: { type: 'range', label: 'progress', min: 0, max: 1, step: 0.01, value: 0.72 },
    },
    setup({ stage, params, tick }) {
        const g = new SilkGraphics();
        const percent = new Text({
            text: '',
            style: { fontFamily: FONT, fontSize: 22, fontWeight: '700', fill: INK.text },
        });
        const visits = new Text({
            text: '8,420',
            style: { fontFamily: FONT, fontSize: 22, fontWeight: '700', fill: INK.text },
        });

        percent.anchor.set(0.5);
        percent.position.set(112, 110);
        visits.position.set(224, 60);
        stage.addChild(g, percent, label('Weekly visits', 224, 42), visits);
        tick((t) => {
            // nine points from x 224 to 672, between y 100 and 150
            const wave: number[] = [];

            for (let i = 0; i < 9; i++) wave.push(224 + i * 56, 128 - Math.sin(i * 0.9 + t * 0.8) * 18 - i * 2.5);
            g.clear();
            g.roundRect(24, 24, 672, 172, 28, 0.6).fill(INK.surface); // squircle card
            g.arcSweep(112, 110, 52, -Math.PI / 2, Math.PI * 2).stroke({ width: 14, color: INK.raised });
            g.arcSweep(112, 110, 52, -Math.PI / 2, Math.PI * 2 * params.progress).stroke({
                width: 14,
                cap: 'round',
                gradient: GAUGE,
            }); // the gradient follows the arc
            g.area(wave, 172, { smooth: 'monotone' })
                .fill(FILL) // chart fill down to y 172 ...
                .stroke({ width: 2.5, color: PALETTE.accent, cap: 'round' }); // ... and its top line
            percent.text = `${Math.round(params.progress * 100)}%`;
        });
    },
});
