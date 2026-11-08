import { SilkGraphics } from 'pixi-silk';
import { defineDemo } from './runtime';

// A Siemens star is the hardest test for anti-aliasing: every wedge narrows below a pixel.
export default defineDemo({
    title: 'Resolution',
    size: [480, 240],
    controls: {
        resolution: { type: 'select', label: 'resolution', options: ['device', '1x', '2x', '3x'], value: 'device' },
    },
    setup({ silk, stage, params, tick }) {
        const g = new SilkGraphics();
        let applied = '';

        stage.addChild(g);
        for (let i = 0; i < 36; i++) {
            const a = (i / 36) * Math.PI * 2;

            g.sector(240, 120, 110, a, a + Math.PI / 36).fill(0xffffff);
        }
        g.circle(240, 120, 110).stroke({ width: 1, color: 0x636366 });
        tick(() => {
            if (params.resolution === applied) return;
            applied = params.resolution;
            // createSilkApp sizes the backing store in device pixels; force 1x/2x/3x to compare
            silk.setResolution(applied === 'device' ? null : Number(applied[0]));
        });
    },
});
