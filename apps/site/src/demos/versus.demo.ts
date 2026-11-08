import { Container, Graphics, Text } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { defineDemo } from './runtime';

// Left: Pixi v8 Graphics (tessellated, no MSAA). Right: SilkGraphics (distance fields).
export default defineDemo({
    title: 'Graphics and SilkGraphics',
    size: [480, 240],
    // phones: each half is 180 wide and shows the drawing at 0.75
    phone: { size: [360, 210] },
    controls: {
        zoom: { type: 'range', label: 'zoom', min: 1, max: 6, step: 0.01, value: 1 },
        rotate: { type: 'toggle', label: 'rotate', value: true },
    },
    setup({ stage, params, tick, width, height, phone }) {
        const sides = [new Container(), new Container()];
        const pixi = new Graphics();
        const silk = new SilkGraphics();
        const half = width / 2;
        const fit = phone ? 0.75 : 1;

        sides[0].addChild(pixi);
        sides[1].addChild(silk);
        sides.forEach((side, i) => {
            const mask = new Graphics().rect(i * half, 0, half, height).fill(0xffffff);
            const label = new Text({
                text: i ? 'SilkGraphics' : 'Graphics',
                style: { fill: 0x8e8e93, fontSize: 12, fontFamily: 'system-ui' },
            });

            label.position.set(i * half + 12, 10);
            side.mask = mask;
            stage.addChild(side, mask, label);
        });
        let angle = 0;

        tick((_t, dt) => {
            if (params.rotate) angle += dt * 0.15;
            for (const [i, side] of sides.entries()) {
                side.pivot.set(120, 130);
                side.position.set(i * half + half / 2, phone ? 115 : 130);
                side.scale.set(params.zoom * fit);
                side.rotation = angle;
            }
            for (const g of [pixi, silk]) {
                g.clear();
                g.circle(120, 130, 62).stroke({ width: 3, color: 0x64d2ff });
                g.roundRect(70, 90, 100, 80, 24).stroke({ width: 1, color: 0xffffff });
                g.circle(120, 130, 18).fill(0xff375f);
                for (let k = 0; k < 6; k++)
                    g.moveTo(40, 60 + k * 3)
                        .lineTo(200, 64 + k * 5)
                        .stroke({ width: 0.6, color: 0xffd60a });
            }
        });
    },
});
