import { SilkGraphics } from 'pixi-silk';
import { defineDemo, INK, PALETTE as P } from './runtime';

// Every shape is centred on (0, 0) and moved into its cell with the transform stack.
const SHAPES: { draw: (g: SilkGraphics) => SilkGraphics; color: number; open?: boolean }[] = [
    { draw: (g) => g.rect(-30, -22, 60, 44), color: P.blue },
    { draw: (g) => g.roundRect(-30, -22, 60, 44, 14, 0.6), color: P.accent },
    { draw: (g) => g.pill(-34, -14, 68, 28), color: P.purple },
    { draw: (g) => g.circle(0, 0, 26), color: P.pink },
    { draw: (g) => g.ellipse(0, 0, 34, 20), color: P.orange },
    { draw: (g) => g.arc(0, 0, 26, -2.5, 0.8), color: P.yellow, open: true },
    { draw: (g) => g.sector(0, 0, 30, -2.2, 1.6, 14, 4), color: P.green },
    { draw: (g) => g.heart(0, 2, 56, 0.12), color: P.pink },
    { draw: (g) => g.star(0, 0, 5, 30, undefined, 0, 3), color: P.yellow },
    { draw: (g) => g.regularPoly(0, 0, 28, 6, 0, 5), color: P.teal },
    { draw: (g) => g.triangle(-30, 22, 30, 22, 0, -28, 6), color: P.orange },
    { draw: (g) => g.polyline([-34, 14, -12, -16, 10, 10, 34, -18]), color: INK.text, open: true },
];

export default defineDemo({
    title: 'Shapes',
    size: [720, 270],
    controls: {
        outline: { type: 'toggle', label: 'outline', value: false },
        spin: { type: 'toggle', label: 'rotate', value: false },
    },
    setup({ stage, params, tick }) {
        const g = new SilkGraphics();

        stage.addChild(g);
        tick((t) => {
            g.clear();
            SHAPES.forEach((shape, i) => {
                g.save()
                    .translateTransform(120 + (i % 6) * 96, 75 + Math.floor(i / 6) * 120)
                    .rotateTransform(params.spin ? t * 0.6 : 0);
                const path = shape.draw(g);

                if (shape.open) path.stroke({ width: 5, cap: 'round', color: shape.color });
                else if (params.outline) path.stroke({ width: 2, color: shape.color });
                else path.fill(shape.color);
                g.restore();
            });
        });
    },
});
