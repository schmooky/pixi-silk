import { type LineJoin, SilkGraphics } from 'pixi-silk';
import { defineDemo, PALETTE } from './runtime';

export default defineDemo({
    title: 'Line joins',
    size: [720, 260],
    controls: {
        join: { type: 'select', label: 'join', options: ['miter', 'bevel', 'round'], value: 'miter' },
        width: { type: 'range', label: 'width', min: 1, max: 28, step: 1, value: 16, unit: 'px' },
        miterLimit: { type: 'range', label: 'miter limit', min: 1, max: 10, step: 0.5, value: 4 },
        alpha: { type: 'range', label: 'alpha', min: 0.1, max: 1, step: 0.05, value: 0.6 },
        dash: { type: 'select', label: 'dash', options: ['off', 'on'], value: 'off' },
    },
    setup({ stage, params, tick }) {
        const g = new SilkGraphics();

        stage.addChild(g);
        tick((t) => {
            const style = {
                width: params.width,
                join: params.join as LineJoin,
                miterLimit: params.miterLimit,
                color: PALETTE.blue,
                alpha: params.alpha,
                dash: params.dash === 'on' ? ([22, 10] as [number, number]) : undefined,
            };
            const zig: number[] = [];

            // five shapes in a row, one per 136 px column
            for (let i = 0; i <= 6; i++) zig.push(48 + i * 18, i % 2 ? 90 : 160 + Math.sin(t) * 10);
            g.clear();
            // translucent on purpose: each path is one distance field, so corners never double-blend
            g.polyline(zig).stroke(style);
            g.rect(200, 88, 84, 80).stroke({ ...style, color: PALETTE.green });
            g.regularPoly(372, 134, 50, 3, t * 0.3).stroke({ ...style, color: PALETTE.orange });
            g.star(504, 130, 5, 56, 24, 0).stroke({ ...style, color: PALETTE.pink });
            g.moveTo(580, 196)
                .bezierCurveTo(600, 110, 640, 190, 660, 120)
                .lineTo(690, 170)
                .lineTo(650, 70)
                .stroke({ ...style, color: PALETTE.purple, cap: 'round' });
        });
    },
});
