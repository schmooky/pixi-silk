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
    // phones: the gauge above the chart, so the text keeps its size
    phone: { size: [360, 330] },
    controls: {
        progress: { type: 'range', label: 'progress', min: 0, max: 1, step: 0.01, value: 0.72 },
    },
    setup({ stage, params, tick, phone }) {
        // card, gauge centre, title and chart: one row on wide frames, two on phones
        const card = phone ? [16, 16, 328, 298] : [24, 24, 672, 172];
        const gauge = phone ? [96, 100] : [112, 110];
        const title = phone ? [184, 70] : [224, 42];
        const chart = phone ? { x: 40, step: 35, y: 250, base: 290 } : { x: 224, step: 56, y: 128, base: 172 };

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
        percent.position.set(gauge[0], gauge[1]);
        visits.position.set(title[0], title[1] + 18);
        stage.addChild(g, percent, label('Weekly visits', title[0], title[1]), visits);
        tick((t) => {
            // nine points across the chart area, swinging 18 px around its middle
            const wave: number[] = [];

            for (let i = 0; i < 9; i++) {
                wave.push(chart.x + i * chart.step, chart.y - Math.sin(i * 0.9 + t * 0.8) * 18 - i * 2.5);
            }
            g.clear();
            g.roundRect(card[0], card[1], card[2], card[3], 28, 0.6).fill(INK.surface); // squircle card
            g.arcSweep(gauge[0], gauge[1], 52, -Math.PI / 2, Math.PI * 2).stroke({ width: 14, color: INK.raised });
            g.arcSweep(gauge[0], gauge[1], 52, -Math.PI / 2, Math.PI * 2 * params.progress).stroke({
                width: 14,
                cap: 'round',
                gradient: GAUGE,
            }); // the gradient follows the arc
            g.area(wave, chart.base, { smooth: 'monotone' })
                .fill(FILL) // chart fill down to the base ...
                .stroke({ width: 2.5, color: PALETTE.accent, cap: 'round' }); // ... and its top line
            percent.text = `${Math.round(params.progress * 100)}%`;
        });
    },
});
