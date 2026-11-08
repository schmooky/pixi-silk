import { type LineJoin, SilkGraphics } from 'pixi-silk';
import { defineDemo, label, PALETTE } from './runtime';

const NOTES: Record<string, string> = {
    crossing: 'A translucent loop crosses itself: the overlap is not darker.',
    'fold-back': 'The path turns back by 179 to 180 degrees over itself.',
    'square dashes': 'Square caps of neighbouring dashes overlap on a tight curve.',
};

// Hard cases of stroked paths, translucent and seen up close. Each pixel is shaded once.
export default defineDemo({
    title: 'Stroke edge cases',
    size: [720, 280],
    controls: {
        scene: {
            type: 'select',
            label: 'case',
            options: ['crossing', 'fold-back', 'square dashes'],
            value: 'crossing',
        },
        zoom: { type: 'range', label: 'zoom', min: 1, max: 12, step: 0.5, value: 1, unit: 'x' },
        join: { type: 'select', label: 'join', options: ['miter', 'bevel', 'round'], value: 'miter' },
    },
    setup({ stage, params, tick }) {
        const g = new SilkGraphics();
        const note = label('', 24, 18);

        stage.addChild(g, note);
        tick((t) => {
            g.clear();
            const join = params.join as LineJoin;
            // [x, y] of the spot the zoom centres on
            let focus: [number, number];

            note.text = NOTES[params.scene] ?? '';
            if (params.scene === 'crossing') {
                // 400 segments: the second lobe crosses the first one far along the path
                const pts: number[] = [];

                for (let i = 0; i < 400; i++) {
                    const u = (i / 400) * Math.PI * 2;

                    pts.push(360 + 240 * Math.sin(3 * u + 0.3), 156 + 92 * Math.sin(2 * u));
                }
                g.polyline(pts, { closed: true }).stroke({ width: 14, join, color: PALETTE.blue, alpha: 0.5 });
                focus = [360, 156];
            } else if (params.scene === 'fold-back') {
                // turns of 179 to 180 degrees: the stroke goes back over itself
                const a = ((0.2 + 0.8 * (0.5 + 0.5 * Math.sin(t))) * Math.PI) / 180;

                g.moveTo(160, 156)
                    .lineTo(440, 156)
                    .lineTo(440 - 280 * Math.cos(a), 156 + 280 * Math.sin(a))
                    .stroke({ width: 40, join, miterLimit: 10, color: PALETTE.orange, alpha: 0.6 });
                focus = [440, 156];
            } else {
                // dashes whose square caps overlap their neighbours on a tight curve
                g.moveTo(450, 156);
                for (let k = 0; k < 4; k++) {
                    const a0 = (k * Math.PI) / 2;
                    const a1 = a0 + Math.PI / 2;
                    const c = (4 / 3) * Math.tan(Math.PI / 8) * 90;

                    g.bezierCurveTo(
                        360 + 90 * Math.cos(a0) - c * Math.sin(a0),
                        156 + 90 * Math.sin(a0) + c * Math.cos(a0),
                        360 + 90 * Math.cos(a1) + c * Math.sin(a1),
                        156 + 90 * Math.sin(a1) - c * Math.cos(a1),
                        360 + 90 * Math.cos(a1),
                        156 + 90 * Math.sin(a1),
                    );
                }
                g.stroke({ width: 22, join, cap: 'square', dash: [6, 5], color: PALETTE.green, alpha: 0.5 });
                focus = [450, 156];
            }
            // zoom around the focus, which moves to the middle as the zoom grows
            const k = params.zoom;
            const cx = focus[0] + (360 - focus[0]) * Math.min(1, (k - 1) / 2);

            g.scale.set(k);
            g.position.set(cx - focus[0] * k, 156 - focus[1] * k);
        });

        return undefined;
    },
});
