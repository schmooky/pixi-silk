import { SilkGraphics } from 'pixi-silk';
import { defineDemo } from './runtime';

// save / translateTransform / rotateTransform / scaleTransform / restore, like Pixi's GraphicsContext.
export default defineDemo({
    title: 'Transform stack',
    size: [420, 220],
    controls: {
        speed: { type: 'range', label: 'speed', min: 0, max: 3, step: 0.05, value: 1 },
    },
    setup({ stage, params, tick }) {
        const g = new SilkGraphics();
        let a = 0;

        stage.addChild(g);
        tick((_t, dt) => {
            a += dt * params.speed;
            g.clear();
            g.save().translateTransform(210, 110);
            for (let i = 0; i < 12; i++) {
                g.save()
                    .rotateTransform((i / 12) * Math.PI * 2 + a)
                    .translateTransform(70, 0)
                    .scaleTransform(0.6 + 0.4 * Math.sin(a * 2 + i));
                // rotated rects stay exact: rotation is part of the primitive, not a tessellation
                g.roundRect(-14, -8, 28, 16, 8).fill(i % 2 ? 0xff9f0a : 0x5e5ce6);
                g.restore();
            }
            g.star(0, 0, 6, 34, 16, -a, 4).fill(0xffd60a);
            g.restore();
        });
    },
});
