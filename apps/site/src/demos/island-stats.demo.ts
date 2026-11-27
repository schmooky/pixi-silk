import { linear, SilkGraphics } from 'pixi-silk';
import { createRenderStats, fpsTone, Island, IslandMeter } from 'pixi-silk/ui/island';
import { defineDemo } from './runtime';

const W = 640;
const H = 400;

// Live render stats in a notch. Add shapes and watch the frame time and the draw calls follow.
// Hover the notch for the meters.
export default defineDemo({
    title: 'Island render stats',
    size: [W, H],
    touchAction: 'none',
    controls: {
        shapes: { type: 'range', label: 'shapes', min: 1, max: 400, step: 1, value: 60 },
        objects: { type: 'range', label: 'objects', min: 1, max: 40, step: 1, value: 4 },
    },
    setup({ silk, stage, params, tick }) {
        const ticker = silk.app.ticker;
        const sky = new SilkGraphics()
            .rect(0, 0, W, H)
            .fill({ gradient: linear([0x1d3557, 0x0b0c10], { from: [0, 0], to: [0.3, 1] }) });
        const stats = createRenderStats(silk.app);
        const notch = new Island({
            viewport: { width: W, height: H },
            edge: 'top',
            peek: 26,
            peekLength: 140,
            hover: 'open',
            radius: 24,
            flare: 16,
            items: [
                new IslandMeter({ title: 'fps', value: stats.fps, tone: fpsTone }),
                new IslandMeter({ title: 'cpu ms', value: stats.frameMs, format: (v) => v.toFixed(2) }),
                new IslandMeter({ title: 'draws', value: stats.drawCalls }),
            ],
            gap: 22,
            ticker,
        });
        // the load: shapes spread over several objects, so each object is one more draw call
        const layers: SilkGraphics[] = [];

        stage.addChild(sky);
        tick((t) => {
            while (layers.length < params.objects) {
                const g = new SilkGraphics();

                layers.push(g);
                stage.addChildAt(g, 1);
            }
            while (layers.length > params.objects) layers.pop()?.destroy();
            layers.forEach((g, k) => {
                g.clear();
                for (let i = k; i < params.shapes; i += layers.length) {
                    const a = i * 2.399 + t * 0.4;
                    const r = 30 + ((i * 37) % 150);

                    g.circle(W / 2 + Math.cos(a) * r * 1.6, H / 2 + 20 + Math.sin(a) * r * 0.8, 6 + (i % 5) * 2).fill({
                        color: [0xff5a1f, 0x30d158, 0xffd60a, 0x0a84ff, 0xbf5af2][i % 5],
                        alpha: 0.8,
                    });
                }
            });
        });
        stage.addChild(notch);

        return () => stats.destroy();
    },
});
