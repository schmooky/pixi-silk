import { Text } from 'pixi.js';
import { conic, linear, radial, SilkGraphics } from 'pixi-silk';
import { defineDemo } from './runtime';

export default defineDemo({
    title: 'Gradients',
    size: [480, 240],
    controls: {
        space: { type: 'select', label: 'space', options: ['oklab', 'linear', 'srgb'], value: 'oklab' },
        easing: { type: 'select', label: 'easing', options: ['linear', 'smooth'], value: 'linear' },
    },
    setup({ stage, params, tick }) {
        const g = new SilkGraphics();
        const label = new Text({ text: '', style: { fill: 0x8e8e93, fontSize: 12, fontFamily: 'system-ui' } });

        label.position.set(20, 214);
        stage.addChild(g, label);
        tick(() => {
            const options = { space: params.space as 'oklab', easing: params.easing as 'linear' };

            g.clear();
            // gradient objects are cheap: ramps with the same stops share one atlas row
            g.roundRect(20, 20, 440, 50, 14).fill(linear([0x0a84ff, 0xffd60a], options));
            g.roundRect(20, 84, 440, 50, 14).fill(linear([0xff375f, 0x30d158, 0x5e5ce6], options));
            g.circle(80, 180, 26).fill(radial([0xffffff, 0xff9f0a, [1, 0xff375f, 0]], options));
            g.circle(160, 180, 26).fill(conic([0xff375f, 0xffd60a, 0x30d158, 0x64d2ff, 0xbf5af2, 0xff375f], options));
            g.arcSweep(240, 180, 22, 0, Math.PI * 1.6).stroke({
                width: 10,
                cap: 'round',
                gradient: conic([0x30d158, 0xff453a], options),
            });
            label.text = `interpolated in ${params.space}, ${params.easing} easing`;
        });
    },
});
