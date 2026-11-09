import { Container, Text } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { Glass } from 'pixi-silk/glass';
import { trackGesture } from 'pixi-silk/ui/gesture';
import { defineDemo, FONT, PAD, SERIES } from './runtime';

const BLOBS = SERIES.slice(0, 5);

export default defineDemo({
    title: 'Glass playground',
    size: [720, 460],
    // phones: the words stack and the pane is narrower
    phone: { size: [360, 460] },
    touchAction: 'none',
    controls: {
        blur: { type: 'range', label: 'blur', min: 0, max: 48, step: 1, value: 18 },
        refraction: { type: 'range', label: 'refraction', min: -30, max: 40, step: 1, value: 16 },
        dispersion: { type: 'range', label: 'dispersion', min: 0, max: 1, step: 0.01, value: 0.4 },
        frost: { type: 'range', label: 'frost', min: 0, max: 0.6, step: 0.01, value: 0.06 },
        light: { type: 'range', label: 'light', min: -180, max: 180, step: 1, value: -135, unit: '°' },
        grain: { type: 'range', label: 'grain', min: 0, max: 0.15, step: 0.005, value: 0.035 },
    },
    setup({ stage, params, tick, width, height, phone }) {
        const back = new SilkGraphics();
        const blobs = new SilkGraphics();
        const lines = new SilkGraphics();
        const words = new Container();
        const glass = new Glass({ width: phone ? 260 : 300, height: 190, radius: 34 });
        const hint = new Text({
            text: 'drag me',
            style: { fontFamily: FONT, fontSize: 14, fill: 0xffffff, fontWeight: '600' },
            alpha: 0.85,
        });
        let grab: { x: number; y: number } | null = null;

        blobs.blendMode = 'add';
        back.rect(0, 0, width, height).fill({ color: 0x000000, alpha: 0.001 });
        for (let i = 0; i < 9; i++) lines.rect(0, 40 + i * 48, width, 1.5).fill({ color: 0xffffff, alpha: 0.18 });
        // three words spread across the width, inside the padding, or one under the other on phones
        const texts = ['PIXI', 'SILK', 'GLASS'].map(
            (w) => new Text({ text: w, style: { fontFamily: FONT, fontSize: 88, fontWeight: '800', fill: 0xffffff } }),
        );
        const gap = (720 - 2 * PAD - texts.reduce((sum, t) => sum + t.width, 0)) / 2;
        let x = PAD;

        texts.forEach((t, i) => {
            t.alpha = 0.9;
            if (phone) t.position.set(i === 1 ? width - PAD - t.width : PAD, 60 + i * 115);
            else t.position.set(x, 130 + (i % 2) * 90);
            x += t.width + gap;
            words.addChild(t);
        });
        hint.anchor.set(0.5);
        hint.position.set(phone ? 130 : 150, 95);
        glass.content.addChild(hint);
        if (phone) glass.position.set(50, 135);
        else glass.position.set(210, 135);
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
                    .circle(
                        width / 2 + Math.cos(a) * ((phone ? 110 : 220) - i * 18),
                        height / 2 + Math.sin(a * 1.3) * 130,
                        90 - i * 6,
                    )
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
