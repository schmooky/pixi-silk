import { Container, Text } from 'pixi.js';
import { linear, SilkGraphics } from 'pixi-silk';
import { signal } from 'pixi-silk/signal';
import { Island, IslandGauge } from 'pixi-silk/ui/island';
import { defineDemo } from './runtime';

const W = 640;
const H = 400;

// One notch, four states: a lip, a live activity with a countdown, a notification that flashes in
// and leaves, and a panel. Hover it for the panel, or let it flash a message.
export default defineDemo({
    title: 'Island notch',
    size: [W, H],
    touchAction: 'none',
    controls: {
        notify: { type: 'toggle', label: 'flash messages', value: true },
        state: { type: 'select', label: 'state', options: ['peek', 'live', 'note', 'open'], value: 'live' },
    },
    setup({ silk, stage, params, tick }) {
        const ticker = silk.app.ticker;
        const view = { width: W, height: H };
        const sky = new SilkGraphics()
            .rect(0, 0, W, H)
            .fill({ gradient: linear([0x8fb3c7, 0xe9d8c4], { from: [0, 0], to: [0.3, 1] }) });
        const text = (s: string, size = 13, color = 0xffffff) =>
            new Text({ text: s, style: { fontSize: size, fill: color, fontWeight: '600' } });
        const left = signal(1);
        // live: a ring and the time left
        const live = new Container();
        const ring = new IslandGauge({ value: left, color: 0xffd60a, size: 28, thickness: 4, caption: false, ticker });
        const time = text('');

        ring.position.set(14, 10);
        time.anchor.set(1, 0.5);
        time.position.set(206, 24);
        live.addChild(ring, time);
        // note: a dot and a message
        const note = new Container();
        const dot = new SilkGraphics().circle(28, 28, 12).fill(0x30d158);
        const msg = text('Big win +$250', 14);

        msg.anchor.set(0, 0.5);
        msg.position.set(50, 28);
        note.addChild(dot, msg);
        // open: the countdown, large
        const panel = new Container();
        const big = new IslandGauge({ value: left, color: 0xffd60a, size: 80, thickness: 8, caption: false, ticker });
        const heading = text('Bonus round', 18);
        const sub = text('', 13, 0x8e8e93);

        big.position.set(24, 28);
        heading.position.set(124, 46);
        sub.position.set(124, 76);
        panel.addChild(big, heading, sub);
        const notch = new Island({
            viewport: view,
            edge: 'top',
            peek: 26,
            peekLength: 110,
            radius: 24,
            flare: 16,
            grip: false,
            sizes: { live: { length: 220, depth: 48 }, note: { length: 260, depth: 56 } },
            rest: 'live',
            state: 'live',
            hover: 'open',
            length: 340,
            depth: 140,
            views: { live, note, open: panel },
            ticker,
        });

        stage.addChild(sky, notch);
        const messages = ['Big win +$250', 'Free spins ready', 'Daily bonus x2', 'Friend joined'];
        let seconds = 30;
        let clock = 0;
        let flashIn = 2;
        let m = 0;
        let state = params.state;

        tick((_, dt) => {
            clock += dt;
            if (clock >= 1) {
                clock -= 1;
                seconds = seconds <= 0 ? 30 : seconds - 1;
                left.value = seconds / 30;
                time.text = `0:${String(seconds).padStart(2, '0')}`;
                sub.text = `starts in ${seconds} s`;
            }
            if (params.notify && notch.state.name.value === 'live') {
                flashIn -= dt;
                if (flashIn <= 0) {
                    flashIn = 4;
                    msg.text = messages[m++ % messages.length];
                    notch.flash('note', 2200);
                }
            }
            if (params.state !== state) {
                state = params.state;
                notch.go(state);
            }
        });

        return undefined;
    },
});
