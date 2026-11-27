import { Container, Text } from 'pixi.js';
import { linear, SilkGraphics } from 'pixi-silk';
import {
    createRenderStats,
    fpsTone,
    gearIcon,
    Island,
    IslandFrame,
    IslandGauge,
    IslandMeter,
} from 'pixi-silk/ui/island';
import { defineDemo } from './runtime';

const W = 640;
const H = 400;

// Pull the lips out, hover the notch, tap the gear. Every surface follows the bezel.
export default defineDemo({
    title: 'Edge islands',
    size: [W, H],
    touchAction: 'none',
    controls: {
        bezel: { type: 'toggle', label: 'bezel', value: true },
        side: { type: 'select', label: 'side island', options: ['peek', 'open', 'hidden'], value: 'open' },
    },
    setup({ silk, stage, params, tick }) {
        const ticker = silk.app.ticker;
        const frame = new IslandFrame({ viewport: { width: W, height: H }, bands: 8, radius: 22, ticker });
        const sky = new SilkGraphics();

        const paintSky = () => {
            const r = frame.inner.value;

            sky.clear()
                .rect(r.x, r.y, r.width, r.height)
                .fill({ gradient: linear([0x8fb3c7, 0xd9d4cc, 0xe9c9a8], { from: [0, 0], to: [0.2, 1] }) });
        };

        frame.inner.subscribe(paintSky);
        paintSky();
        const dot = (g: SilkGraphics, s: number) => g.circle(0, 0, s * 0.22).fill(0xffffff);
        const side = new Island({
            viewport: frame.inner,
            edge: 'right',
            align: 0.3,
            ticker,
            items: [
                new IslandGauge({ value: 0.73, color: 0xff5a1f, icon: dot, size: 44, ticker }),
                new IslandGauge({ value: 0.21, color: 0x30d158, icon: dot, size: 44, ticker }),
                new IslandGauge({ value: 0.52, color: 0xffd60a, icon: dot, size: 44, ticker }),
            ],
            gap: 12,
            padding: 14,
        });
        const stats = createRenderStats(silk.app);
        const notch = new Island({
            viewport: frame.inner,
            edge: 'top',
            peek: 24,
            peekLength: 120,
            hover: 'open',
            radius: 22,
            flare: 16,
            ticker,
            items: [
                new IslandMeter({ title: 'fps', value: stats.fps, tone: fpsTone }),
                new IslandMeter({ title: 'draws', value: stats.drawCalls }),
            ],
            gap: 24,
        });
        const gear = new Container();
        const gearG = new SilkGraphics();
        const hint = new Text({ text: 'Settings go here', style: { fontSize: 13, fill: 0xffffff, fontWeight: '500' } });

        gearIcon(gearG, 22);
        gearG.position.set(24, 24);
        gear.addChild(gearG);
        hint.anchor.set(0.5);
        hint.position.set(80, 24);
        const bud = new Island({
            viewport: frame.inner,
            edge: 'bottom',
            align: 0,
            peek: 48,
            peekLength: 48,
            radius: 24,
            flare: 16,
            grip: false,
            length: 160,
            depth: 48,
            views: { peek: gear, open: hint },
            ticker,
        });

        stage.addChild(sky, frame, side, notch, bud);
        side.go(params.side, true);
        let bezel = params.bezel;
        let sideState = params.side;

        tick(() => {
            if (params.bezel !== bezel) {
                bezel = params.bezel;
                frame.setBands(
                    bezel ? { top: 8, right: 8, bottom: 8, left: 8 } : { top: 0, right: 0, bottom: 0, left: 0 },
                );
            }
            if (params.side !== sideState) {
                sideState = params.side;
                side.go(sideState);
            }
        });

        return () => stats.destroy();
    },
});
