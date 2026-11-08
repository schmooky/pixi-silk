import { Text } from 'pixi.js';
import { horizontal, SilkGraphics } from 'pixi-silk';
import { SilkText } from 'pixi-silk/text';
import { defineDemo } from './runtime';

// Outline, glow, shadow, weight and a gradient all read the same distance field: no filters,
// still one draw call per text. Bottom left: small sizes at 1x, Text above SilkText.
export default defineDemo({
    size: [520, 320],
    background: 0x101014,
    controls: {
        outline: { type: 'range', label: 'outline', min: 0, max: 6, step: 0.5, value: 3, unit: 'px' },
        glow: { type: 'range', label: 'glow', min: 0, max: 12, step: 0.5, value: 8, unit: 'px' },
        dilate: { type: 'range', label: 'weight', min: -1.5, max: 1.5, step: 0.1, value: 0, unit: 'px' },
    },
    setup({ stage, params, tick }) {
        const font = 'Inter, system-ui, sans-serif';
        const card = new SilkGraphics()
            .roundRect(300, 176, 200, 124, 22, 0.6)
            .fill(0x1c1c1e)
            .roundRect(20, 176, 260, 124, 22, 0.6)
            .fill(0x1c1c1e);
        const outlined = new SilkText({
            text: 'OUTLINE',
            fontFamily: font,
            fontSize: 44,
            fontWeight: 900,
            fill: 0xffd60a,
            outline: { width: 3, color: 0x3a1c00 },
            shadow: { color: 0x000000, alpha: 0.6, blur: 6, offsetY: 4 },
        });
        const neon = new SilkText({
            text: 'Neon glow',
            fontFamily: font,
            fontSize: 40,
            fontWeight: 700,
            fill: 0xffe3f1,
            shadow: { color: 0xff2d92, blur: 8 },
        });
        const gradient = new SilkText({
            text: 'Gradient fill',
            fontFamily: font,
            fontSize: 30,
            fontWeight: 800,
            fill: horizontal(['#64d2ff', '#bf5af2', '#ff375f']),
        });
        const readout = new SilkText({
            fontFamily: font,
            fontSize: 40,
            fontWeight: 600,
            fill: 0xffffff,
            tabularNumbers: true,
            anchor: { x: 1, y: 0 },
        });
        const unit = new SilkText({
            text: 'BPM  live',
            fontFamily: font,
            fontSize: 12,
            fontWeight: 600,
            fill: 0xff375f,
        });

        outlined.position.set(20, 20);
        neon.position.set(300, 26);
        gradient.position.set(20, 100);
        readout.position.set(480, 196);
        unit.position.set(320, 270);
        stage.addChild(card, outlined, neon, gradient, readout, unit);

        // small sizes at 1x: PixiJS Text above, SilkText below
        const sample = 'Hamburgefonstiv 0123';

        [11, 12, 13].forEach((size, i) => {
            const y = 190 + i * 34;
            const pixi = new Text({ text: sample, style: { fontFamily: font, fontSize: size, fill: 0xe5e5ea } });
            const silk = new SilkText({ text: sample, fontFamily: font, fontSize: size, fill: 0xe5e5ea });
            const tag = new SilkText({ text: `${size}px`, fontFamily: font, fontSize: 9, fill: 0x8e8e93 });

            pixi.position.set(64, y);
            silk.position.set(64, y + 15);
            tag.position.set(34, y + 9);
            stage.addChild(pixi, silk, tag);
        });

        tick((t) => {
            outlined.outline = params.outline > 0 ? { width: params.outline, color: 0x3a1c00 } : null;
            neon.shadow =
                params.glow > 0 ? { color: 0xff2d92, blur: params.glow * (0.85 + 0.15 * Math.sin(t * 3)) } : null;
            for (const text of [outlined, neon, gradient]) text.dilate = params.dilate;
            readout.text = (72 + 6 * Math.sin(t * 1.3) + 2 * Math.sin(t * 4.1)).toFixed(1);
        });
    },
});
