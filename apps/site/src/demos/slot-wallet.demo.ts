import { Text } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { signal } from 'pixi-silk/signal';
import { JogDial } from 'pixi-silk/ui/dial';
import { trackGesture } from 'pixi-silk/ui/gesture';
import { Odometer } from 'pixi-silk/ui/odometer';
import { defineDemo } from './runtime';

// Balance and win counters plus a bet dial, built on the library's Odometer and JogDial.
// Turn the dial to pick a bet from the ladder, press SPIN. Wins count up (tap the win to skip),
// then roll into the balance. Copy and restyle.

const LADDER = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100];
const money = { decimals: 2, prefix: '$' };
const label = (text: string, x: number, y: number) => {
    const t = new Text({ text, style: { fill: 0x8e8e93, fontFamily: 'system-ui, sans-serif', fontSize: 12 } });

    t.anchor.set(0.5);
    t.position.set(x, y);

    return t;
};

export default defineDemo({
    size: [600, 340],
    touchAction: 'none',
    setup({ silk, stage }) {
        const ticker = silk.app.ticker;
        const betIndex = signal(3);
        const busy = signal(false);
        const panel = new SilkGraphics();
        const balance = new Odometer({ ticker, ...money, value: 500, fontSize: 30 });
        const win = new Odometer({ ticker, ...money, value: 0, fontSize: 40, color: 0xffd60a });
        // the dial turns through ladder positions: one detent per bet, a full turn covers the ladder
        const bet = new JogDial({
            ticker,
            radius: 62,
            value: betIndex.value,
            min: 0,
            max: LADDER.length - 1,
            step: 1,
            format: (i) => `$${LADDER[Math.round(i)]}`,
            onCommit: (i) => betIndex.set(Math.round(i)),
        });
        const spin = new SilkGraphics();
        const spinText = new Text({
            text: 'SPIN',
            style: { fill: 0xffffff, fontFamily: 'system-ui, sans-serif', fontWeight: '700', fontSize: 16 },
        });

        panel.roundRect(30, 30, 260, 120, 20, 0.6).fill(0x1c1c1e);
        panel.roundRect(310, 30, 260, 120, 20, 0.6).fill(0x1c1c1e);
        balance.position.set(160, 100);
        win.position.set(440, 100);
        bet.position.set(160, 250);
        spin.position.set(440, 250);
        spinText.anchor.set(0.5);
        spinText.position.set(440, 250);
        stage.addChild(
            panel,
            label('BALANCE', 160, 55),
            label('WIN', 440, 55),
            label('BET', 160, 330),
            balance,
            win,
            bet,
            spin,
            spinText,
        );

        const drawSpin = () => {
            spin.clear()
                .circle(0, 0, 48)
                .fill(busy.value ? 0x3a3a3c : 0x30d158);
        };

        busy.subscribe(drawSpin);
        drawSpin();
        spin.hitArea = { contains: (x, y) => Math.hypot(x, y) <= 56 };
        trackGesture(spin, {
            onTap: () => {
                const stake = LADDER[betIndex.value];

                if (busy.value || balance.state.value.value < stake) return;
                busy.set(true);
                balance.set(balance.state.value.value - stake);
                setTimeout(() => {
                    const roll = Math.random();
                    const amount = roll < 0.45 ? 0 : roll < 0.9 ? stake * (1 + Math.random() * 4) : stake * 60;

                    if (amount === 0) {
                        busy.set(false);

                        return;
                    }
                    win.set(0);
                    win.skip();
                    win.set(Math.round(amount * 100) / 100);
                }, 600);
            },
        });
        // the win rolls into the balance when it finishes counting (or is skipped)
        win.state.counting.subscribe((counting) => {
            if (counting || !busy.value) return;
            const amount = win.state.value.value;

            setTimeout(() => {
                balance.set(balance.state.value.value + amount);
                win.set(0);
                busy.set(false);
            }, 500);
        });
        win.eventMode = 'static';
        win.hitArea = { contains: (x, y) => Math.abs(x) < 130 && Math.abs(y) < 50 };
        win.on('pointertap', () => win.skip());

        return undefined;
    },
});
