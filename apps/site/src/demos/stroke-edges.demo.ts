import { type LineJoin, SilkGraphics } from 'pixi-silk';
import { defineDemo } from './runtime';

// Hard cases of stroked paths, translucent and seen up close. Each pixel is shaded once.
export default defineDemo({
    size: [480, 280],
    controls: {
        scene: {
            type: 'select',
            label: 'case',
            options: ['crossing', 'fold-back', 'square dashes'],
            value: 'crossing',
        },
        zoom: { type: 'range', label: 'zoom', min: 1, max: 12, step: 0.5, value: 4, unit: 'x' },
        join: { type: 'select', label: 'join', options: ['miter', 'bevel', 'round'], value: 'miter' },
    },
    setup({ stage, params, tick }) {
        const g = new SilkGraphics();

        stage.addChild(g);
        tick((t) => {
            g.clear();
            const join = params.join as LineJoin;
            // [x, y] of the spot the zoom centres on
            let focus: [number, number];

            if (params.scene === 'crossing') {
                // 400 segments: the second lobe crosses the first one far along the path
                const pts: number[] = [];

                for (let i = 0; i < 400; i++) {
                    const u = (i / 400) * Math.PI * 2;

                    pts.push(240 + 200 * Math.sin(3 * u + 0.3), 140 + 120 * Math.sin(2 * u));
                }
                g.polyline(pts, { closed: true }).stroke({ width: 14, join, color: 0x0a84ff, alpha: 0.5 });
                focus = [240, 140];
            } else if (params.scene === 'fold-back') {
                // turns of 179 to 180 degrees: the stroke goes back over itself
                const a = ((0.2 + 0.8 * (0.5 + 0.5 * Math.sin(t))) * Math.PI) / 180;

                g.moveTo(80, 140)
                    .lineTo(300, 140)
                    .lineTo(300 - 220 * Math.cos(a), 140 + 220 * Math.sin(a))
                    .stroke({ width: 40, join, miterLimit: 10, color: 0xff9f0a, alpha: 0.6 });
                focus = [300, 140];
            } else {
                // dashes whose square caps overlap their neighbours on a tight curve
                g.moveTo(330, 140);
                for (let k = 0; k < 4; k++) {
                    const a0 = (k * Math.PI) / 2;
                    const a1 = a0 + Math.PI / 2;
                    const c = (4 / 3) * Math.tan(Math.PI / 8) * 90;

                    g.bezierCurveTo(
                        240 + 90 * Math.cos(a0) - c * Math.sin(a0),
                        140 + 90 * Math.sin(a0) + c * Math.cos(a0),
                        240 + 90 * Math.cos(a1) + c * Math.sin(a1),
                        140 + 90 * Math.sin(a1) - c * Math.cos(a1),
                        240 + 90 * Math.cos(a1),
                        140 + 90 * Math.sin(a1),
                    );
                }
                g.stroke({ width: 22, join, cap: 'square', dash: [6, 5], color: 0x30d158, alpha: 0.5 });
                focus = [330, 140];
            }
            g.scale.set(params.zoom);
            g.position.set(240 - focus[0] * params.zoom, 140 - focus[1] * params.zoom);
        });

        return undefined;
    },
});
