import { SilkGraphics } from 'pixi-silk';
import { defineDemo } from './runtime';

// A squircle keeps curvature continuous where the side meets the corner (iOS icons, cards).
export default defineDemo({
    title: 'Squircle corners',
    size: [420, 220],
    controls: {
        radius: { type: 'range', label: 'radius', min: 0, max: 80, step: 1, value: 48, unit: 'px' },
        smoothing: { type: 'range', label: 'smoothing', min: 0, max: 1, step: 0.01, value: 0.6 },
        compare: { type: 'toggle', label: 'circular overlay', value: true },
    },
    setup({ stage, params, tick }) {
        const g = new SilkGraphics();

        stage.addChild(g);
        tick(() => {
            g.clear();
            g.roundRect(110, 20, 200, 180, params.radius, params.smoothing)
                .fill(0x2c2c2e)
                .stroke({ width: 2, color: 0x64d2ff });
            if (params.compare)
                g.roundRect(110, 20, 200, 180, params.radius).stroke({ width: 1, color: 0xff375f, alpha: 0.8 });
        });
    },
});
