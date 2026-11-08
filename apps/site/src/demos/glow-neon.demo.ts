import { Container, Text } from 'pixi.js';
import { linear, radial, SilkGraphics } from 'pixi-silk';
import { bolt, Glow, neon } from 'pixi-silk/glow';
import { defineDemo } from './runtime';

const YELLOW = 0xffd60a;
const font = 'Inter, system-ui, sans-serif';

export default defineDemo({
    title: 'Neon bolt',
    size: [720, 440],
    // phones: the big bolt above the card
    phone: { size: [360, 600] },
    background: 0x0b0b09,
    controls: {
        intensity: { type: 'range', label: 'glow', min: 0, max: 2, step: 0.05, value: 1 },
    },
    setup({ stage, params, tick, phone }) {
        const room = new SilkGraphics();

        // warm light spilling into the room, like the reference backdrop
        // taller than the canvas, so a wide frame shows no band above or below
        room.rect(0, -220, 720, 1000).fill(
            radial(
                [
                    [0, 0x3a3410, 1],
                    [0.55, 0x15140c, 1],
                    [1, 0x0b0b09, 1],
                ],
                { center: [0.28, 0.45], radius: 0.75 },
            ),
        );

        // the bolt alone: about 120 wide, so the recipe runs at size 120
        const big = new Glow({ draw: (g) => bolt(g, -60, -84, 120, 168), layers: neon(YELLOW, { size: 120 }) });

        if (phone) big.position.set(180, 110);
        else big.position.set(180, 220);

        // the ticket card
        const card = new Container();
        const back = new SilkGraphics();
        const ticket = new SilkGraphics();
        const ring = new SilkGraphics();
        const small = new Glow({ draw: (g) => bolt(g, -52, -74, 104, 148), layers: neon(YELLOW, { size: 104 }) });

        // translucent yellow folder behind the ticket
        back.roundRect(0, 0, 230, 250, 18, 0.6)
            .fill({ color: 0x000000, alpha: 0.6, blur: 30, spread: 6 })
            .roundRect(0, 0, 230, 250, 18, 0.6)
            .fill({
                gradient: linear(
                    [
                        [0, 0x8a7d1c, 0.95],
                        [1, 0x4f4710, 0.95],
                    ],
                    { from: [0, 0], to: [0, 1] },
                ),
                innerShadow: { color: 0xfff6b0, alpha: 0.25, y: 1, blur: 1 },
            });
        small.position.set(118, 50);
        // the white ticket with a notch where the ring sits
        ticket
            .beginPath()
            .moveTo(14, 160)
            .lineTo(146, 160)
            .bezierCurveTo(160, 160, 160, 176, 176, 176)
            .lineTo(244, 176)
            .bezierCurveTo(252, 176, 258, 182, 258, 190)
            .lineTo(258, 300)
            .bezierCurveTo(258, 308, 252, 314, 244, 314)
            .lineTo(14, 314)
            .bezierCurveTo(6, 314, 0, 308, 0, 300)
            .lineTo(0, 174)
            .bezierCurveTo(0, 166, 6, 160, 14, 160)
            .closePath()
            .fill({ color: 0x000000, alpha: 0.55, blur: 18, spread: 2 })
            .fill({
                gradient: linear(
                    [
                        [0, 0xf4f5f0, 1],
                        [1, 0xc9ccd2, 1],
                    ],
                    { from: [0, 0], to: [0.3, 1] },
                ),
                innerShadow: { color: 0xffffff, alpha: 0.9, y: 1, blur: 0.5 },
            });
        for (let i = 0; i < 46; i++) {
            const w = [1, 2, 1, 3, 1, 2][i % 6];

            ticket.rect(22 + i * 4.6, 284, w, 12).fill({ color: 0x1d2a3a, alpha: 0.85 });
        }
        const title = new Text({
            text: 'Supercharged', // prose-ignore: copy from the design reference
            style: { fontFamily: font, fontSize: 23, fontWeight: '700', fill: 0x18181b },
        });
        const sub = new Text({
            text: 'Experience network speed\nlike never before',
            style: { fontFamily: font, fontSize: 12.5, fill: 0x52525b, lineHeight: 17 },
        });

        title.position.set(22, 222);
        sub.position.set(22, 250);
        ring.position.set(206, 172);
        card.addChild(back, small, ticket, ring, title, sub);
        if (phone) card.position.set(51, 250);
        else card.position.set(414, 62);
        stage.addChild(room, big, card);

        let last = -1;

        tick((t) => {
            const flicker = 0.92 + 0.08 * Math.sin(t * 7.3) * Math.sin(t * 2.1);

            if (params.intensity !== last) {
                last = params.intensity;
                big.setLayers(neon(YELLOW, { size: 120, intensity: params.intensity }));
                small.setLayers(neon(YELLOW, { size: 104, intensity: params.intensity }));
            }
            big.alpha = flicker;
            ring.clear()
                .circle(0, 0, 30)
                .stroke({ width: 12, color: YELLOW, alpha: 0.75 * params.intensity, blur: 9, blend: 'add' })
                .circle(0, 0, 30)
                .stroke({ width: 3.5, color: 0xfff27a, blur: 0.8 })
                .circle(0, 0, 30)
                .stroke({ width: 2, color: 0xffffff, alpha: 0.9, blur: 3, blend: 'add' });
        });

        return undefined;
    },
});
