import { Text } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { Glass } from 'pixi-silk/glass';
import { fan, ray, spectrum } from 'pixi-silk/glow';
import { trackGesture } from 'pixi-silk/ui/gesture';
import { defineDemo } from './runtime';

const mono = (text: string, size = 12, alpha = 0.75) =>
    new Text({
        text,
        style: { fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: size, fill: 0xffffff },
        alpha,
    });
const COLORS = spectrum(8);

export default defineDemo({
    title: 'Glass prism',
    size: [720, 440],
    // phones: the prism in the middle of a narrow frame, the light from the lower left
    phone: { size: [360, 440] },
    background: 0x000000,
    touchAction: 'none',
    controls: {
        spread: { type: 'range', label: 'spread', min: 0.2, max: 1.2, step: 0.01, value: 0.62 },
        frost: { type: 'range', label: 'frost', min: 0, max: 40, step: 1, value: 14 },
    },
    setup({ stage, params, tick, width, height }) {
        const beam = new SilkGraphics();
        const rainbow = new SilkGraphics();
        const glass = new Glass({
            width: 230,
            height: 200,
            radius: 30,
            refraction: 18,
            dispersion: 0.6,
            grain: 0.06,
            frost: 0.04,
            light: 1,
        });
        const hit = new SilkGraphics();
        const centre = { x: width / 2, y: height / 2 };
        let source = { x: width / 8, y: height - 20 };

        beam.blendMode = 'add';
        rainbow.blendMode = 'add';
        glass.position.set(centre.x - 115, centre.y - 100);
        const edition = mono('2025 Edition');
        const motto = mono('Reflect wealth');

        edition.position.set(18, 16);
        motto.anchor.set(1, 0);
        motto.position.set(212, 16);
        glass.content.addChild(edition, motto);
        const brand = mono('F1', 54, 0.55);

        brand.position.set(150, 120);
        glass.content.addChild(brand);
        hit.rect(0, 0, width, height).fill({ color: 0x000000, alpha: 0.001 });
        stage.addChild(hit, beam, rainbow, glass);

        trackGesture(hit, {
            onDown: (p) => (source = { x: p.x, y: p.y }),
            onDrag: (p) => (source = { x: p.x, y: p.y }),
        });

        tick((t) => {
            const dx = centre.x - source.x;
            const dy = centre.y - source.y;
            const angle = Math.atan2(dy, dx);
            const shimmer = 1 + Math.sin(t * 2.1) * 0.04;

            glass.set({ blur: params.frost });
            beam.clear();
            ray(beam, { x0: source.x, y0: source.y, x1: centre.x, y1: centre.y, w0: 2, w1: 26 }).fill({
                color: 0xffffff,
                alpha: 0.35,
                blur: 14,
            });
            ray(beam, { x0: source.x, y0: source.y, x1: centre.x, y1: centre.y, w0: 1, w1: 8 }).fill({
                color: 0xffffff,
                alpha: 0.9,
                blur: 3,
            });
            beam.circle(centre.x, centre.y, 40).fill({ color: 0xffffff, alpha: 0.35, blur: 26 });

            rainbow.clear();
            fan(centre.x, centre.y, angle + 0.08, params.spread * shimmer, 620, COLORS.length, 18).forEach((r, i) => {
                ray(rainbow, r).fill({ color: COLORS[i], alpha: 0.5, blur: 24 });
                ray(rainbow, { ...r, w1: r.w1 * 0.45 }).fill({ color: COLORS[i], alpha: 0.6, blur: 4 });
            });
        });

        return undefined;
    },
});
