import { Container, Text } from 'pixi.js';
import { linear, SilkGraphics } from 'pixi-silk';
import { Island, IslandStack } from 'pixi-silk/ui/island';
import { defineDemo } from './runtime';

const W = 360;
const H = 640;

// A bottom sheet with three stops, on a phone-sized screen. Pull the hairline to half or full, or
// pick a stop below. A flick carries it one stop further.
export default defineDemo({
    title: 'Island bottom sheet',
    size: [W, H],
    touchAction: 'none',
    controls: {
        stop: { type: 'select', label: 'stop', options: ['peek', 'half', 'open'], value: 'peek' },
    },
    setup({ silk, stage, params, tick }) {
        const ticker = silk.app.ticker;
        const view = { width: W, height: H };
        const sky = new SilkGraphics()
            .rect(0, 0, W, H)
            .fill({ gradient: linear([0xffd6a5, 0xff6b6b], { from: [0, 0], to: [0.3, 1] }) });
        const text = (s: string, size = 16, color = 0xffffff) =>
            new Text({ text: s, style: { fontSize: size, fill: color, fontWeight: '500' } });
        // half: what is playing
        const half = new Container();
        const title = text('Night Swim', 18);
        const by = text('Cloud Atlas', 13, 0x8e8e93);
        const bar = new SilkGraphics()
            .pill(24, 92, W - 48, 4)
            .fill({ color: 0xffffff, alpha: 0.2 })
            .pill(24, 92, (W - 48) * 0.4, 4)
            .fill(0xffffff);

        title.position.set(24, 30);
        by.position.set(24, 56);
        half.addChild(title, by, bar);
        // open: the whole queue
        const queue = new IslandStack(
            ['Night Swim', 'Low Tide', 'Paper Moon', 'Glass Hours', 'Northbound', 'Static Bloom'].map((s) => text(s)),
            { gap: 22 },
        );
        const full = new Container();

        full.addChild(queue);
        queue.layout(W, 420);
        const sheet = new Island({
            viewport: view,
            edge: 'bottom',
            peek: 6,
            peekLength: W,
            flare: 0,
            radius: 28,
            sizes: { half: { length: W, depth: 130 } },
            length: W,
            depth: 480,
            views: { half, open: full },
            ticker,
        });

        stage.addChild(sky, sheet);
        let stop = params.stop;

        tick(() => {
            if (params.stop !== stop) {
                stop = params.stop;
                sheet.go(stop);
            }
        });

        return undefined;
    },
});
