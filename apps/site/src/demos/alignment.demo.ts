import { Text } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { defineDemo } from './runtime';

const MODES = ['inside', 'center', 'outside'] as const;

export default defineDemo({
    title: 'Stroke alignment',
    size: [480, 200],
    controls: {
        width: { type: 'range', label: 'stroke width', min: 1, max: 24, step: 1, value: 12, unit: 'px' },
    },
    setup({ stage, params, tick }) {
        const g = new SilkGraphics();

        stage.addChild(g);
        MODES.forEach((mode, i) => {
            const label = new Text({ text: mode, style: { fill: 0x8e8e93, fontSize: 13, fontFamily: 'system-ui' } });

            label.anchor.set(0.5, 0);
            label.position.set(90 + i * 150, 168);
            stage.addChild(label);
        });
        tick(() => {
            g.clear();
            MODES.forEach((alignment, i) => {
                const x = 40 + i * 150;

                // fill + stroke on the same shape share one instance and never leave a seam
                g.roundRect(x, 40, 100, 100, 22, 0.6)
                    .fill(0x2c2c2e)
                    .stroke({ width: params.width, color: 0x30d158, alpha: 0.85, alignment });
                g.roundRect(x, 40, 100, 100, 22, 0.6).stroke({ width: 1, color: 0xffffff, alpha: 0.6 }); // the geometric edge
            });
        });
    },
});
