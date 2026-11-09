import { Color, Container, Text } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { Aurora, hexLabel } from 'pixi-silk/glow';
import { defineDemo, PAD } from './runtime';

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
    title: 'Aurora',
    size: [720, 470],
    // phones: one device at full size instead of three at half size
    phone: { size: [360, 470] },
    controls: {
        rise: { type: 'range', label: 'rise', min: 0.3, max: 0.9, step: 0.01, value: 0.62 },
        speed: { type: 'range', label: 'speed', min: 0, max: 3, step: 0.1, value: 1 },
    },
    setup({ silk, stage: frame, params, tick, phone: narrow }) {
        // the phones span x 30 to 750 and y 20 to 434: fit that inside the shared padding
        const stage = new Container();
        const fit = (720 - 2 * PAD) / 720;

        if (!narrow) {
            stage.scale.set(fit);
            stage.position.set(PAD - 30 * fit, (470 - 414 * fit) / 2 - 20 * fit);
        }
        frame.addChild(stage);
        const auroras = PALETTES.slice(0, narrow ? 1 : 3).map((colors, i) => {
            const x = narrow ? 80 : 40 + i * 240;
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
                    style: { fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: 13, fill: readable(c) },
                });

                label.anchor.set(0.5);
                bg.roundRect(-35, -13, 70, 26, 7).fill({ color: c, alpha: 0.12 });
                chip.addChild(bg, label);
                chip.position.set(x + 26 + j * 74, 420);
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
