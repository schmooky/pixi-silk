import { along, SilkGraphics } from 'pixi-silk';
import { defineDemo } from './runtime';

const INK = along([0xff9f0a, 0xff375f, 0xbf5af2]);

export default defineDemo({
    title: 'Tapered strokes',
    size: [480, 220],
    controls: {
        start: { type: 'range', label: 'start width', min: 0, max: 30, step: 0.5, value: 2 },
        end: { type: 'range', label: 'end width', min: 0, max: 30, step: 0.5, value: 22 },
    },
    setup({ stage, params, tick }) {
        const g = new SilkGraphics();

        stage.addChild(g);
        tick((t) => {
            const pts: number[] = [];

            for (let i = 0; i <= 40; i++) {
                const u = i / 40;

                pts.push(40 + u * 400, 110 + Math.sin(u * 7 + t) * 50 * (1 - u * 0.5));
            }
            g.clear();
            // `width: [start, end]` tapers along the path; an array per point also works
            g.polyline(pts).stroke({ width: [params.start, params.end], cap: 'round', gradient: INK });
        });
    },
});
