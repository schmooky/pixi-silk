import { Container } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { Odometer } from 'pixi-silk/ui/odometer';
import { defineDemo, INK, label } from './runtime';

// Tap the canvas to add some downloads. Bigger jumps count for longer, and a second tap while
// it counts skips to the end. The small readout below rolls frame numbers with a minimum width.
export default defineDemo({
    title: 'Odometer counter',
    size: [720, 240],
    // the counter is centred on the width: phones get a narrower panel
    phone: { size: [360, 240] },
    touchAction: 'none',
    setup({ silk, stage, tick, width, height, phone }) {
        const cx = width / 2;
        const ticker = silk.app.ticker;
        const panel = new SilkGraphics();
        const downloads = new Odometer({ ticker, value: 12480, fontSize: 44 });
        const frame = new Odometer({
            ticker,
            minDigits: 4,
            thousands: '',
            fontSize: 18,
            color: INK.muted,
            duration: 0.06,
            speedUp: false,
        });
        const hit = new Container();
        let f = 0;

        panel.roundRect(phone ? 20 : 140, 24, phone ? 320 : 440, 130, 22, 0.6).fill(INK.surface);
        downloads.position.set(cx, 100);
        frame.position.set(cx, 196);
        hit.eventMode = 'static';
        hit.hitArea = { contains: (x, y) => x >= 0 && y >= 0 && x <= width && y <= height };
        hit.cursor = 'pointer';
        hit.on('pointertap', () => {
            if (downloads.state.counting.value) {
                downloads.skip();

                return;
            }
            const big = Math.random() < 0.25;

            downloads.set(
                downloads.state.value.value + Math.round(big ? 2000 + Math.random() * 40000 : 1 + Math.random() * 90),
            );
        });
        stage.addChild(
            panel,
            label('Downloads', cx, 40, {}, 0.5),
            downloads,
            label('Frame', cx, 162, {}, 0.5),
            frame,
            hit,
        );
        tick((_t, dt) => {
            f += dt * 12;
            frame.set(Math.floor(f));
        });

        return undefined;
    },
});
