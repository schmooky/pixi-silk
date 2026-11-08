import { Graphics } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { defineDemo, INK, PALETTE, readout } from './runtime';

// Everything is rebuilt every frame: one SilkGraphics, one draw call, however many primitives.
export default defineDemo({
    title: 'Stress test',
    size: [720, 280],
    // phones: a taller strip with the stats on two lines, a narrower spiral
    phone: { size: [360, 300] },
    controls: {
        count: { type: 'range', label: 'primitives', min: 500, max: 30000, step: 500, value: 5000 },
    },
    setup({ stage, params, tick, width, phone }) {
        const g = new SilkGraphics();
        // the stats sit in a strip above the drawing
        const top = phone ? 58 : 40;
        const strip = new Graphics().rect(0, 0, width, top).fill(INK.surface).rect(0, top, width, 1).fill(INK.line);
        const stats = readout('', phone ? 16 : 24, 13, phone ? { fontSize: 13, lineHeight: 18 } : { fontSize: 13 });

        stage.addChild(g, strip, stats);
        let cpu = 0;

        tick((t) => {
            const start = performance.now();

            g.clear();
            for (let i = 0; i < params.count; i++) {
                const a = i * 2.399963 + t * 0.2;
                const r = Math.sqrt(i / params.count) * 100;
                const x = width / 2 + Math.cos(a) * r * (phone ? 1.6 : 2.6);
                const y = (phone ? 180 : 160) + Math.sin(a) * r;

                if (i % 3 === 0) g.circle(x, y, 2.2).fill(PALETTE.pink);
                else if (i % 3 === 1) g.roundRect(x - 2, y - 2, 4, 4, 1).fill(PALETTE.blue);
                else g.line(x, y, x + 5, y + 2).stroke({ width: 1, color: PALETTE.green });
            }
            cpu = cpu * 0.9 + (performance.now() - start) * 0.1;
            stats.text = `${params.count} primitives   1 draw call${phone ? '\n' : '   '}rebuilt in ${cpu.toFixed(1)} ms`;
        });
    },
});
