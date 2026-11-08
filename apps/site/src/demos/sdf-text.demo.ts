import { Container, Graphics, Text } from 'pixi.js';
import { SilkText } from 'pixi-silk/text';
import { defineDemo } from './runtime';

// Left: PixiJS Text, a bitmap drawn once. Right: SilkText, distance fields drawn per pixel.
// Both zoom around the same point, from 1x to 100x.
export default defineDemo({
    size: [520, 260],
    background: 0x0b0b0d,
    controls: {
        zoom: { type: 'range', label: 'zoom (log)', min: 0, max: 2, step: 0.01, value: 0, unit: '' },
        auto: { type: 'toggle', label: 'animate', value: true },
    },
    setup({ stage, params, tick }) {
        const half = 260;
        const sides: Container[] = [];
        const style = { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13, fontWeight: '600' as const };

        for (let i = 0; i < 2; i++) {
            const side = new Container();
            const mask = new Graphics().rect(i * half, 0, half, 260).fill(0xffffff);
            const make = (text: string, size: number, color: number) =>
                i === 0
                    ? new Text({ text, style: { ...style, fontSize: size, fill: color } })
                    : new SilkText({ text, ...style, fontSize: size, fill: color });
            const title = make('Zoom 42%', 13, 0xffffff);
            const body = make('Labels, readouts and editor text', 9, 0x8e8e93);
            const tiny = make('W 128  H 64', 6, 0x0a84ff);

            title.position.set(70, 112);
            body.position.set(70, 132);
            tiny.position.set(70, 146);
            side.addChild(title, body, tiny);
            side.mask = mask;
            sides.push(side);
            const caption = new Text({
                text: i ? 'SilkText' : 'Text',
                style: { fill: 0x8e8e93, fontSize: 12, fontFamily: 'system-ui' },
            });

            caption.position.set(i * half + 12, 10);
            stage.addChild(side, mask, caption);
        }
        stage.addChild(new Graphics().rect(half - 0.5, 0, 1, 260).fill(0x2c2c2e));
        const readout = new SilkText({
            ...style,
            fontSize: 12,
            fill: 0x8e8e93,
            tabularNumbers: true,
            anchor: { x: 1, y: 0 },
        });

        readout.position.set(508, 10);
        stage.addChild(readout);

        let t = 0;

        tick((_t, dt) => {
            if (params.auto) {
                t += dt;
                // ease in and out between 1x and 100x every 12 s
                params.zoom = 1 - Math.cos((t / 12) * Math.PI * 2);
            }
            const k = 10 ** params.zoom;
            // zoom into the "4" of the title
            const fx = 70 + 44;
            const fy = 112 + 9;

            sides.forEach((side, i) => {
                side.pivot.set(fx, fy);
                side.position.set(i * half + 130, 130);
                side.scale.set(k);
            });
            readout.text = `${k.toFixed(1)}x`;
        });
    },
});
