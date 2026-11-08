import { SilkGraphics, vertical } from 'pixi-silk';
import { defineDemo } from './runtime';

const FILL = vertical(
    [
        [0, 0x0a84ff, 0.55],
        [1, 0x0a84ff, 0],
    ],
    { easing: 'smooth' },
);

export default defineDemo({
    title: 'Area chart',
    size: [480, 220],
    controls: {
        smooth: { type: 'toggle', label: 'monotone smoothing', value: true },
        dots: { type: 'toggle', label: 'dots', value: true },
    },
    setup({ stage, params, tick }) {
        const g = new SilkGraphics();
        const data = Array.from({ length: 13 }, (_, i) => 90 + Math.sin(i * 0.9) * 40);

        stage.addChild(g);
        tick((t) => {
            const pts = data.flatMap((v, i) => [30 + i * 35, v + Math.sin(t * 1.5 + i) * 12]);
            const smooth = params.smooth ? ('monotone' as const) : undefined;

            g.clear();
            for (const y of [40, 90, 140]) g.line(20, y, 460, y).stroke({ width: 1, color: 0x3a3a3c, dash: [2, 4] });
            g.line(20, 190, 460, 190).stroke({ width: 1, color: 0x636366 });
            // area between the series and a baseline; stroke() right after draws its top line
            g.area(pts, 190, { smooth }).fill(FILL).stroke({ width: 2.5, color: 0x0a84ff, cap: 'round' });
            if (params.dots)
                for (let i = 0; i < pts.length; i += 2)
                    g.circle(pts[i], pts[i + 1], 3.5)
                        .fill(0xffffff)
                        .stroke({ width: 2, color: 0x0a84ff });
        });
    },
});
