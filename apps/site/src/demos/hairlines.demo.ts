import { SilkGraphics } from 'pixi-silk';
import { defineDemo, INK, label } from './runtime';

// Lines thinner than a device pixel keep one pixel of width and fade instead of breaking up.
// Widths grow from left to right.
export default defineDemo({
    title: 'Hairlines',
    size: [720, 240],
    phone: { size: [360, 230] },
    controls: {
        scale: { type: 'range', label: 'width scale', min: 0.05, max: 2, step: 0.01, value: 0.5 },
    },
    setup({ stage, params, tick, width, phone }) {
        const g = new SilkGraphics();
        const cx = width / 2;
        const cy = phone ? 180 : 210;
        const r = phone ? 150 : 180;
        // the width readouts sit beside the fan, or under its ends on phones
        const thinnest = phone ? label('', cx - r, cy + 12) : label('', cx - r - 12, cy - 8, {}, 1);
        const widest = phone ? label('', cx + r, cy + 12) : label('', cx + r + 12, cy - 8);

        if (phone) widest.anchor.set(1, 0);

        stage.addChild(g, thinnest, widest);
        tick((t) => {
            g.clear();
            const width = (i: number) => (0.1 + i * 0.12) * params.scale;

            for (let i = 0; i < 24; i++) {
                const a = -Math.PI + (i / 23) * Math.PI + Math.sin(t * 0.3) * 0.02;

                g.line(cx, cy, cx + Math.cos(a) * r, cy + Math.sin(a) * r).stroke({ width: width(i), color: INK.text });
            }
            g.circle(cx, cy, 3).fill(INK.muted);
            thinnest.text = `${width(0).toFixed(3)} px`;
            widest.text = `${width(23).toFixed(2)} px`;
        });
    },
});
