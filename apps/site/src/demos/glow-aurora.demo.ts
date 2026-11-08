import { Color, Container, Text } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { Aurora, hexLabel } from 'pixi-silk/glow';
import { defineDemo } from './runtime';

/** The palette colour itself, lifted towards white when it is too dark to read on the chip. */
const readable = (c: number) => {
    const [r, g, b] = new Color(c).toArray();
    const lift = Math.max(0, 0.45 - (0.2126 * r + 0.7152 * g + 0.0722 * b)) * 1.6;

    return new Color([r + (1 - r) * lift, g + (1 - g) * lift, b + (1 - b) * lift]).toNumber();
};

const PALETTES: [number, number, number][] = [
    [0x6f1bff, 0xee36ff, 0xffffff],
    [0x1e06bb, 0x00c8ff, 0xffffff],
    [0x0ecd00, 0xaeff00, 0xffffff],
];

export default defineDemo({
    size: [760, 470],
    background: 0x1c1d22,
    controls: {
        rise: { type: 'range', label: 'rise', min: 0.3, max: 0.9, step: 0.01, value: 0.62 },
        speed: { type: 'range', label: 'speed', min: 0, max: 3, step: 0.1, value: 1 },
    },
    setup({ silk, stage, params, tick }) {
        const auroras = PALETTES.map((colors, i) => {
            const x = 40 + i * 240;
            const phone = new Container();
            const frame = new SilkGraphics();
            const aurora = new Aurora({ width: 200, height: 330, radius: 30, colors, ticker: silk.app.ticker });

            frame
                .roundRect(-10, -10, 220, 350, 38, 0.6)
                .fill({ color: 0x000000, alpha: 0.45, blur: 18 })
                .roundRect(-10, -10, 220, 350, 38, 0.6)
                .fill(0x2a2b31)
                .stroke({ width: 1, color: 0xffffff, alpha: 0.08, alignment: 'inside' });
            phone.position.set(x, 30);
            phone.addChild(frame, aurora);
            stage.addChild(phone);

            colors.forEach((c, j) => {
                const chip = new Container();
                const bg = new SilkGraphics();
                const label = new Text({
                    text: hexLabel(c),
                    style: { fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: 11, fill: readable(c) },
                });

                label.anchor.set(0.5);
                bg.roundRect(-33, -12, 66, 24, 7).fill({ color: c, alpha: 0.12 });
                chip.addChild(bg, label);
                chip.position.set(x + 34 + j * 70, 422);
                stage.addChild(chip);
            });

            return aurora;
        });

        tick(() => {
            for (const a of auroras) a.set({ rise: params.rise, speed: params.speed });
        });

        return undefined;
    },
});
