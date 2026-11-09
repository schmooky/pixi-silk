import { Text } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { defineDemo } from './runtime';

const MODES = ['inside', 'center', 'outside'] as const;

export default defineDemo({
    title: 'Stroke alignment',
    size: [480, 200],
    // phones: smaller squares, so the three fit at full size text
    phone: { size: [360, 180] },
    controls: {
        width: { type: 'range', label: 'stroke width', min: 1, max: 24, step: 1, value: 12, unit: 'px' },
    },
    setup({ stage, params, tick, phone }) {
        // left edge, step and size of the squares
        const [left, step, side] = phone ? [24, 120, 72] : [40, 150, 100];
        const g = new SilkGraphics();

        stage.addChild(g);
        MODES.forEach((mode, i) => {
            const label = new Text({ text: mode, style: { fill: 0x8e8e93, fontSize: 13, fontFamily: 'system-ui' } });

            label.anchor.set(0.5, 0);
            label.position.set(left + side / 2 + i * step, 40 + side + 28);
            stage.addChild(label);
        });
        tick(() => {
            g.clear();
            MODES.forEach((alignment, i) => {
                const x = left + i * step;

                // fill + stroke on the same shape share one instance and never leave a seam
                g.roundRect(x, 40, side, side, side * 0.22, 0.6)
                    .fill(0x2c2c2e)
                    .stroke({ width: params.width, color: 0x30d158, alpha: 0.85, alignment });
                g.roundRect(x, 40, side, side, side * 0.22, 0.6).stroke({ width: 1, color: 0xffffff, alpha: 0.6 }); // the geometric edge
            });
        });
    },
});
