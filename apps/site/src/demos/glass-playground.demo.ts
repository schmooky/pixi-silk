import { Container, Text } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { Glass } from 'pixi-silk/glass';
import { trackGesture } from 'pixi-silk/ui/gesture';
import { defineDemo } from './runtime';

const BLOBS = [0xff2d55, 0xff9f0a, 0x30d158, 0x0a84ff, 0xbf5af2];

export default defineDemo({
    size: [720, 460],
    background: 0x0a0a0c,
    touchAction: 'none',
    controls: {
        blur: { type: 'range', label: 'blur', min: 0, max: 48, step: 1, value: 18 },
        refraction: { type: 'range', label: 'refraction', min: -30, max: 40, step: 1, value: 16 },
        dispersion: { type: 'range', label: 'dispersion', min: 0, max: 1, step: 0.01, value: 0.4 },
        frost: { type: 'range', label: 'frost', min: 0, max: 0.6, step: 0.01, value: 0.06 },
        light: { type: 'range', label: 'light', min: -180, max: 180, step: 1, value: -135, unit: '°' },
        grain: { type: 'range', label: 'grain', min: 0, max: 0.15, step: 0.005, value: 0.035 },
    },
    setup({ stage, params, tick }) {
        const back = new SilkGraphics();
        const blobs = new SilkGraphics();
        const lines = new SilkGraphics();
        const words = new Container();
        const glass = new Glass({ width: 300, height: 190, radius: 34 });
        const hint = new Text({
            text: 'drag me',
            style: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 14, fill: 0xffffff, fontWeight: '600' },
            alpha: 0.85,
        });
        let grab: { x: number; y: number } | null = null;

        blobs.blendMode = 'add';
        back.rect(0, 0, 720, 460).fill({ color: 0x000000, alpha: 0.001 });
        for (let i = 0; i < 9; i++) lines.rect(0, 40 + i * 48, 720, 1.5).fill({ color: 0xffffff, alpha: 0.18 });
        ['PIXI', 'SILK', 'GLASS'].forEach((w, i) => {
            const t = new Text({
                text: w,
                style: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 96, fontWeight: '800', fill: 0xffffff },
            });

            t.alpha = 0.9;
            t.position.set(40 + i * 230, 150 + (i % 2) * 70);
            words.addChild(t);
        });
        hint.anchor.set(0.5);
        hint.position.set(150, 95);
        glass.content.addChild(hint);
        glass.position.set(210, 135);
        glass.eventMode = 'static';
        glass.cursor = 'grab';
        stage.addChild(back, blobs, lines, words, glass);

        trackGesture(
            glass,
            {
                onDown: (p) => (grab = { x: p.x - glass.x, y: p.y - glass.y }),
                onDrag: (p) => grab && glass.position.set(p.x - grab.x, p.y - grab.y),
                onUp: () => (grab = null),
            },
            { space: stage },
        );

        tick((t) => {
            blobs.clear();
            BLOBS.forEach((c, i) => {
                const a = t * (0.25 + i * 0.05) + i * 1.3;

                blobs
                    .circle(360 + Math.cos(a) * (220 - i * 18), 230 + Math.sin(a * 1.3) * 130, 90 - i * 6)
                    .fill({ color: c, alpha: 0.9, blur: 40 });
            });
            glass.set({
                blur: params.blur,
                refraction: params.refraction,
                dispersion: params.dispersion,
                frost: params.frost,
                lightAngle: (params.light * Math.PI) / 180,
                grain: params.grain,
            });
        });

        return undefined;
    },
});
