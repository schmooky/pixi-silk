import { conic, type ShapeOp, SilkGraphics } from 'pixi-silk';
import { defineDemo } from './runtime';

// Shape operations: one exact shape from many. Each result is one instance, painted once.
export default defineDemo({
    size: [520, 280],
    controls: {
        op: {
            type: 'select',
            label: 'op',
            options: ['union', 'subtract', 'intersect', 'exclude'],
            value: 'subtract',
        },
        stroke: { type: 'toggle', label: 'stroke', value: true },
        blur: { type: 'range', label: 'blur', min: 0, max: 12, step: 1, value: 0, unit: 'px' },
    },
    setup({ stage, params, tick }) {
        const g = new SilkGraphics();
        const ringPaint = conic([0x30d158, 0xffd60a, 0x30d158]);

        stage.addChild(g);
        tick((t) => {
            const op = params.op as ShapeOp;
            const outline = params.stroke ? { width: 3, color: 0xffffff, alpha: 0.9 } : null;
            const dx = Math.sin(t * 0.8) * 14;

            g.clear();
            // two circles combined by the picked op, translucent so double painting would show
            g.circle(76, 110, 52)
                .circle(124 + dx, 110, 52)
                .fill({ color: 0x0a84ff, alpha: 0.75, op, blur: params.blur });
            if (outline) g.stroke({ ...outline, op });

            // a ring with a notch: a circle minus a smaller circle and a bar
            g.boolean(
                'subtract',
                (g) => g.circle(250, 110, 56),
                (g) => g.circle(250, 110, 34).rect(244, 40, 12, 40),
            ).fill({ gradient: ringPaint, blur: params.blur });
            if (outline) g.stroke(outline);

            // an icon: a rounded card minus a cutout keyhole, plus a dot
            g.boolean(
                'union',
                (g) =>
                    g.boolean(
                        'subtract',
                        (g) => g.roundRect(340, 54, 112, 112, 30, 0.6),
                        (g) => g.circle(396, 98, 20).triangle(386, 104, 406, 104, 396, 140, 3),
                    ),
                (g) => g.circle(452, 54, 14),
            ).fill({
                color: 0xff375f,
                blur: params.blur,
                innerShadow: { y: 3, blur: 4, color: 0xffffff, alpha: 0.5 },
            });
            if (outline) g.stroke(outline);

            // an SVG path, a star cut out of it
            g.svgPath('M60 250 C 60 200 140 200 140 250 C 140 280 60 280 60 250 Z')
                .star(100, 240, 5, 18, 8)
                .fill({ color: 0xbf5af2, op: 'subtract', blur: params.blur });
            g.svgPath('M180 270 l30 -60 l30 60 z m30 -42 l-12 30 h24 z').fill({ color: 0xff9f0a, blur: params.blur });
            if (outline) g.stroke(outline);
        });

        return undefined;
    },
});
