import { Text } from 'pixi.js';
import { radial, SilkGraphics } from 'pixi-silk';
import { Glow, neon } from 'pixi-silk/glow';
import { defineDemo } from './runtime';

const bolt = (s: number) => (g: SilkGraphics) =>
    g
        .triangle(s * 0.12, -s * 0.5, -s * 0.32, s * 0.08, s * 0.06, s * 0.02, s * 0.03)
        .triangle(-s * 0.12, s * 0.5, s * 0.32, -s * 0.08, -s * 0.06, -s * 0.02, s * 0.03);

const core = radial([0xfff3a0, 0xffc400, 0xff8a00], { center: [0.5, 0.42], radius: 0.7 });

export default defineDemo({
    size: [720, 400],
    background: 0x050505,
    controls: {
        intensity: { type: 'range', label: 'glow', min: 0, max: 2, step: 0.05, value: 1 },
    },
    setup({ stage, params, tick }) {
        const left = new Glow({ draw: bolt(170), layers: neon(0xffb800, { size: 170, core }) });
        const ticket = new SilkGraphics();
        const ring = new SilkGraphics();
        const right = new Glow({ draw: bolt(110), layers: neon(0xff9500, { size: 110, core, surface: 'light' }) });
        const title = new Text({
            text: 'Charged',
            style: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 20, fontWeight: '700', fill: 0x1c1c1e },
        });
        let last = -1;

        left.position.set(190, 200);
        ticket
            .roundRect(410, 40, 250, 320, 34, 0.6)
            .fill({ color: 0x000000, alpha: 0.5, blur: 24 })
            .roundRect(410, 40, 250, 320, 34, 0.6)
            .fill(0xf5f5f7)
            .roundRect(430, 60, 210, 230, 24, 0.6)
            .fill({ color: 0xffd60a, alpha: 0.28 })
            .stroke({ width: 1, color: 0xffb800, alpha: 0.35, alignment: 'inside' });
        right.position.set(535, 175);
        title.anchor.set(0.5);
        title.position.set(535, 322);
        stage.addChild(left, ticket, ring, right, title);

        tick((t) => {
            const pulse = 0.85 + Math.sin(t * 2.2) * 0.15;

            if (params.intensity !== last) {
                last = params.intensity;
                left.setLayers(neon(0xffb800, { size: 170, core, intensity: params.intensity }));
                right.setLayers(neon(0xff9500, { size: 110, core, intensity: params.intensity, surface: 'light' }));
            }
            ring.clear()
                .circle(535, 175, 82)
                .stroke({ width: 14, color: 0xffb800, alpha: 0.3 * pulse, blur: 12 })
                .circle(535, 175, 82)
                .stroke({ width: 2, color: 0xffffff, alpha: 0.95 });
        });

        return undefined;
    },
});
