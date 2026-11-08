import { conic, SilkGraphics } from 'pixi-silk';
import { defineDemo } from './runtime';

const RINGS = [
    { r: 78, colors: [0xfa114f, 0xff5e8a] },
    { r: 58, colors: [0x92e82a, 0xd4ff5a] },
    { r: 38, colors: [0x1ee0ff, 0x7df9ff] },
].map((ring) => ({ ...ring, gradient: conic(ring.colors) }));

export default defineDemo({
    title: 'Arcs and rings',
    size: [260, 200],
    controls: {
        progress: { type: 'range', label: 'progress', min: 0, max: 1.6, step: 0.01, value: 0.8 },
        cap: { type: 'select', label: 'cap', options: ['round', 'butt', 'square'], value: 'round' },
    },
    setup({ stage, params, tick }) {
        const g = new SilkGraphics();

        stage.addChild(g);
        tick((t) => {
            g.clear();
            RINGS.forEach((ring, i) => {
                const p = Math.max(0.001, params.progress * (1 - i * 0.18) + Math.sin(t + i) * 0.02);

                g.circle(130, 100, ring.r).stroke({ width: 16, color: ring.colors[0], alpha: 0.18 });
                // the conic gradient spans whatever arc it is drawn on
                g.arcSweep(130, 100, ring.r, -Math.PI / 2, Math.PI * 2 * p).stroke({
                    width: 16,
                    cap: params.cap as 'round',
                    gradient: ring.gradient,
                });
            });
        });
    },
});
