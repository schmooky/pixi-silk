import { Text } from 'pixi.js';
import { horizontal, SilkGraphics } from 'pixi-silk';
import { SilkText } from 'pixi-silk/text';
import { defineDemo, FONT, INK, label, PALETTE } from './runtime';

// Outline, glow, shadow, weight and a gradient all read the same distance field: no filters,
// still one draw call per text. Bottom left: small sizes at 1x, PixiJS Text next to SilkText.
export default defineDemo({
    title: 'SilkText styles',
    size: [720, 380],
    // phones: the styles, the small sizes and the numbers in one column
    phone: { size: [360, 640] },
    controls: {
        outline: { type: 'range', label: 'outline', min: 0, max: 6, step: 0.5, value: 3, unit: 'px' },
        glow: { type: 'range', label: 'glow', min: 0, max: 12, step: 0.5, value: 8, unit: 'px' },
        dilate: { type: 'range', label: 'weight', min: -1.5, max: 1.5, step: 0.1, value: 0, unit: 'px' },
    },
    setup({ stage, params, tick, phone }) {
        const card = phone
            ? new SilkGraphics()
                  .roundRect(16, 216, 328, 224, 20, 0.6)
                  .fill(INK.surface)
                  .roundRect(16, 456, 328, 168, 20, 0.6)
                  .fill(INK.surface)
            : new SilkGraphics()
                  .roundRect(24, 196, 440, 160, 20, 0.6)
                  .fill(INK.surface)
                  .roundRect(484, 196, 212, 160, 20, 0.6)
                  .fill(INK.surface);
        const outlined = new SilkText({
            text: 'OUTLINE',
            fontFamily: FONT,
            fontSize: 44,
            fontWeight: 900,
            fill: PALETTE.yellow,
            outline: { width: 3, color: 0x3a1c00 },
            shadow: { color: 0x000000, alpha: 0.6, blur: 6, offsetY: 4 },
        });
        const neon = new SilkText({
            text: 'Neon glow',
            fontFamily: FONT,
            fontSize: 40,
            fontWeight: 700,
            fill: 0xffe3f1,
            shadow: { color: 0xff2d92, blur: 8 },
            anchor: { x: 1, y: 0 },
        });
        const gradient = new SilkText({
            text: 'Gradient fill',
            fontFamily: FONT,
            fontSize: 34,
            fontWeight: 800,
            fill: horizontal(['#64d2ff', '#bf5af2', '#ff375f']),
        });
        const value = new SilkText({
            fontFamily: FONT,
            fontSize: 44,
            fontWeight: 600,
            fill: INK.text,
            tabularNumbers: true,
            anchor: { x: 1, y: 0 },
        });
        const unit = new SilkText({
            text: 'BPM, live',
            fontFamily: FONT,
            fontSize: 13,
            fontWeight: 600,
            fill: PALETTE.pink,
        });

        if (phone) {
            outlined.position.set(24, 20);
            neon.position.set(336, 90);
            gradient.position.set(24, 156);
            value.position.set(320, 500);
            unit.position.set(36, 584);
        } else {
            outlined.position.set(36, 28);
            neon.position.set(684, 32);
            gradient.position.set(36, 116);
            value.position.set(672, 240);
            unit.position.set(508, 316);
        }
        stage.addChild(card, outlined, neon, gradient, value, unit);
        stage.addChild(phone ? label('Tabular numbers', 36, 474) : label('Tabular numbers', 508, 214));

        // small sizes at 1x: PixiJS Text in the left column, SilkText in the right one.
        // Phones put the SilkText rows under the Text rows.
        const sample = 'Hamburgefonstiv 0123';
        const column = (i: number) => (phone ? { x: 80, y: 232 + i * 104 } : { x: [92, 280][i], y: 212 });

        stage.addChild(label('Text', column(0).x, column(0).y), label('SilkText', column(1).x, column(1).y));
        [11, 12, 13].forEach((size, i) => {
            const row = (c: number) => column(c).y + (phone ? 28 + i * 24 : 36 + i * 34);
            const pixi = new Text({ text: sample, style: { fontFamily: FONT, fontSize: size, fill: INK.text } });
            const silk = new SilkText({ text: sample, fontFamily: FONT, fontSize: size, fill: INK.text });

            pixi.position.set(column(0).x, row(0));
            silk.position.set(column(1).x, row(1));
            stage.addChild(pixi, silk);
            for (let c = 0; c < (phone ? 2 : 1); c++) {
                stage.addChild(label(`${size}px`, phone ? 32 : 44, row(c) + 1, { fontSize: 11, fill: INK.faint }));
            }
        });

        tick((t) => {
            outlined.outline = params.outline > 0 ? { width: params.outline, color: 0x3a1c00 } : null;
            neon.shadow =
                params.glow > 0 ? { color: 0xff2d92, blur: params.glow * (0.85 + 0.15 * Math.sin(t * 3)) } : null;
            for (const text of [outlined, neon, gradient]) text.dilate = params.dilate;
            value.text = (72 + 6 * Math.sin(t * 1.3) + 2 * Math.sin(t * 4.1)).toFixed(1);
        });
    },
});
