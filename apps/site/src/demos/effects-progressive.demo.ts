import { SilkGraphics, vertical } from 'pixi-silk';
import { defineDemo } from './runtime';

// Progressive blur: the violet hill is sharp at its bottom edge and melts at the top. The white
// bloom under it is painted plus-lighter, so where they overlap the violet lifts towards white.
export default defineDemo({
    size: [560, 380],
    background: 0x111111,
    controls: {
        top: { type: 'range', label: 'blur at top', min: 0, max: 80, step: 1, value: 48 },
        bottom: { type: 'range', label: 'blur at bottom', min: 0, max: 20, step: 1, value: 1 },
        bloom: { type: 'toggle', label: 'plus-lighter bloom', value: true },
    },
    setup({ stage, params, tick }) {
        const g = new SilkGraphics();
        const violet = vertical([0x6a3cf0, 0x4b22c9]);
        let drawn = '';

        stage.addChild(g);
        tick((t) => {
            const sway = Math.sin(t * 0.6) * 0.04;
            const key = `${params.top}|${params.bottom}|${params.bloom}|${sway.toFixed(3)}`;

            if (key === drawn) return;
            drawn = key;
            g.clear();
            g.roundRect(80, 30, 400, 320, 18).fill(0x1c1c1e);
            g.save()
                .translateTransform(290, 245)
                .rotateTransform(-0.22 + sway)
                .ellipse(0, 0, 240, 112)
                .fill({ gradient: violet, blur: { from: params.top, to: params.bottom } })
                .restore();
            if (params.bloom) {
                g.ellipse(300, 318, 150, 30).fill({ color: 0xffffff, alpha: 0.5, blur: 18, blend: 'add' });
                g.ellipse(300, 318, 80, 12).fill({ color: 0xf6efff, alpha: 0.55, blur: 8, blend: 'add' });
            }
        });

        return undefined;
    },
});
