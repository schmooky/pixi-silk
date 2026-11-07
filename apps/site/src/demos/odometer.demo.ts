import { Container } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { Odometer } from 'pixi-silk/ui/odometer';
import { defineDemo } from './runtime';

// Tap the canvas to add a random amount. Bigger jumps count for longer, and a second tap while
// it counts skips to the end. The small readout below rolls frame numbers with a minimum width.
export default defineDemo({
    size: [520, 240],
    touchAction: 'none',
    setup({ silk, stage, tick }) {
        const ticker = silk.app.ticker;
        const panel = new SilkGraphics();
        const balance = new Odometer({ ticker, value: 1250, decimals: 2, prefix: '$', fontSize: 44 });
        const frame = new Odometer({
            ticker,
            minDigits: 4,
            thousands: '',
            fontSize: 18,
            color: 0x8e8e93,
            duration: 0.06,
            speedUp: false,
        });
        const hit = new Container();
        let f = 0;

        panel.roundRect(40, 40, 440, 110, 22, 0.6).fill(0x1c1c1e);
        balance.position.set(260, 95);
        frame.position.set(260, 190);
        hit.eventMode = 'static';
        hit.hitArea = { contains: (x, y) => x >= 0 && y >= 0 && x <= 520 && y <= 240 };
        hit.cursor = 'pointer';
        hit.on('pointertap', () => {
            if (balance.state.counting.value) {
                balance.skip();

                return;
            }
            const big = Math.random() < 0.25;

            balance.set(balance.state.value.value + (big ? 2000 + Math.random() * 40000 : 1 + Math.random() * 90));
        });
        stage.addChild(panel, balance, frame, hit);
        tick((_t, dt) => {
            f += dt * 12;
            frame.set(Math.floor(f));
        });

        return undefined;
    },
});
