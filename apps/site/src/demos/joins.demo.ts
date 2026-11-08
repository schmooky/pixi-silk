import { type LineJoin, SilkGraphics } from 'pixi-silk';
import { defineDemo } from './runtime';

export default defineDemo({
    size: [480, 260],
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
                color: 0x0a84ff,
                alpha: params.alpha,
                dash: params.dash === 'on' ? ([22, 10] as [number, number]) : undefined,
            };
            const zig: number[] = [];

            for (let i = 0; i <= 6; i++) zig.push(30 + i * 30, i % 2 ? 50 : 110 + Math.sin(t) * 10);
            g.clear();
            // translucent on purpose: each path is one distance field, so corners never double-blend
            g.polyline(zig).stroke(style);
            g.rect(260, 40, 80, 70).stroke({ ...style, color: 0x30d158 });
            g.regularPoly(400, 78, 42, 3, t * 0.3).stroke({ ...style, color: 0xff9f0a });
            g.star(90, 190, 5, 52, 22, 0).stroke({ ...style, color: 0xff375f });
            g.moveTo(190, 230)
                .bezierCurveTo(230, 120, 300, 260, 340, 160)
                .lineTo(440, 220)
                .lineTo(380, 150)
                .stroke({ ...style, color: 0xbf5af2, cap: 'round' });
        });
    },
});
