import { Container, Graphics, Text } from 'pixi.js';
import { SilkText } from 'pixi-silk/text';
import { defineDemo, FONT, INK, label, PALETTE, readout } from './runtime';

// Left: PixiJS Text, a bitmap drawn once. Right: SilkText, distance fields drawn per pixel.
// Both zoom around the same point. The animation holds at 1x, zooms to 8x and back.
// Turn it off and drag the slider for up to 100x.
export default defineDemo({
    title: 'Text and SilkText under zoom',
    size: [720, 320],
    // phones: the two sides stack, each with its own title row
    phone: { size: [360, 440] },
    controls: {
        zoom: { type: 'range', label: 'zoom (log)', min: 0, max: 2, step: 0.01, value: 0, unit: '' },
        auto: { type: 'toggle', label: 'animate', value: true },
    },
    setup({ stage, params, tick, width, height, phone }) {
        const half = 360;
        const top = 48;
        // each side's box: its title row on top, the zooming text below
        const box = (i: number) =>
            phone ? { x: 0, y: i * 220, w: width, h: 220 } : { x: i * half, y: 0, w: half, h: height };
        const sides: Container[] = [];
        const style = { fontFamily: FONT, fontWeight: '600' as const };

        for (let i = 0; i < 2; i++) {
            const side = new Container();
            const b = box(i);
            const mask = new Graphics().rect(b.x, b.y + top, b.w, b.h - top).fill(0xffffff);
            const make = (text: string, size: number, color: number) =>
                i === 0
                    ? new Text({ text, style: { ...style, fontSize: size, fill: color } })
                    : new SilkText({ text, ...style, fontSize: size, fill: color });
            const title = make('Zoom 42%', 22, INK.text);
            const body = make('Labels, readouts and editor text', 13, INK.muted);
            const tiny = make('W 128  H 64', 11, PALETTE.blue);

            title.position.set(-100, -34);
            body.position.set(-100, 0);
            tiny.position.set(-100, 22);
            side.addChild(title, body, tiny);
            side.mask = mask;
            sides.push(side);
            stage.addChild(side, mask);
            stage.addChild(
                label(i ? 'SilkText (distance field)' : 'Text (bitmap)', b.x + 24, b.y + 16, { fontSize: 13 }),
            );
            stage.addChild(new Graphics().rect(b.x, b.y + top - 0.5, b.w, 1).fill(INK.line));
        }
        if (phone) stage.addChild(new Graphics().rect(0, 219.5, width, 1).fill(INK.line));
        else stage.addChild(new Graphics().rect(half - 0.5, 0, 1, height).fill(INK.line));
        const zoom = readout('', width - 24, 16, { fontSize: 13 }, 1);

        stage.addChild(zoom);

        // the point both sides zoom into (the "42" of the title), and the middle of the text block
        const focus = { x: -26, y: -21 };
        const block = { x: 25, y: 0 };
        const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));
        let t = 0;

        tick((_t, dt) => {
            if (params.auto) {
                t += dt;
                // a 10 s loop: 3 s at 1x, 2.5 s up to 8x, 2 s there, 2.5 s back
                const u = t % 10;
                const up = u < 3 ? 0 : u < 5.5 ? ease((u - 3) / 2.5) : u < 7.5 ? 1 : 1 - ease((u - 7.5) / 2.5);

                params.zoom = up * Math.log10(8);
            }
            const k = 10 ** params.zoom;

            // at 1x the block sits in the middle of its half, zoomed in the focus point does
            sides.forEach((side, i) => {
                const b = box(i);

                side.pivot.set(focus.x, focus.y);
                side.position.set(
                    b.x + b.w / 2 - (block.x - focus.x) / k,
                    b.y + top + (b.h - top) / 2 - (block.y - focus.y) / k,
                );
                side.scale.set(k);
            });
            zoom.text = `${k.toFixed(1)}x`;
        });
    },
});
