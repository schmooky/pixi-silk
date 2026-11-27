import { Container } from 'pixi.js';
import { linear, SilkGraphics } from 'pixi-silk';
import { signal } from 'pixi-silk/signal';
import { gearIcon, Island, type IslandEdge, IslandMenu } from 'pixi-silk/ui/island';
import { defineDemo } from './runtime';

const W = 640;
const H = 400;
const SKIES: Record<string, [number, number]> = {
    Dawn: [0xffd6a5, 0xff6b6b],
    Noon: [0xa8dadc, 0x457b9d],
    Night: [0x3a0ca3, 0x10002b],
};

// A gear on the edge grows into a settings menu. The switches change the scene behind it.
export default defineDemo({
    title: 'Island settings menu',
    size: [W, H],
    touchAction: 'none',
    controls: {
        edge: { type: 'select', label: 'edge', options: ['right', 'left', 'bottom', 'top'], value: 'right' },
    },
    setup({ silk, stage, params, tick }) {
        const ticker = silk.app.ticker;
        const view = { width: W, height: H };
        const sky = new SilkGraphics();
        const sun = new SilkGraphics();
        const theme = signal('Dawn');
        const showSun = signal(true);
        const big = signal(false);
        const paint = () => {
            const [a, b] = SKIES[theme.value];

            sky.clear()
                .rect(0, 0, W, H)
                .fill({ gradient: linear([a, b], { from: [0, 0], to: [0.3, 1] }) });
            sun.clear();
            if (showSun.value)
                sun.circle(W * 0.35, H * 0.45, big.value ? 90 : 50).fill({ color: 0xffffff, alpha: 0.85 });
        };

        theme.subscribe(paint);
        showSun.subscribe(paint);
        big.subscribe(paint);
        paint();
        let island: Island | null = null;
        const build = () => {
            island?.destroy({ children: true });
            const menu = new IslandMenu({
                title: 'Settings',
                width: 220,
                items: [
                    { id: 'sun', label: 'Sun', type: 'toggle', value: showSun },
                    { id: 'big', label: 'Big sun', type: 'toggle', value: big },
                    { id: 'sky', label: 'Sky', type: 'choice', options: Object.keys(SKIES), value: theme },
                ],
                ticker,
            });
            const gear = new Container();
            const g = new SilkGraphics();

            gearIcon(g, 24);
            g.position.set(26, 26);
            gear.addChild(g);
            island = new Island({
                viewport: view,
                edge: params.edge as IslandEdge,
                align: 0.85,
                peek: 52,
                peekLength: 52,
                radius: 26,
                flare: 16,
                grip: false,
                length: params.edge === 'left' || params.edge === 'right' ? menu.boxHeight : menu.boxWidth,
                depth: params.edge === 'left' || params.edge === 'right' ? menu.boxWidth : menu.boxHeight,
                views: { peek: gear, open: menu },
                ticker,
            });
            stage.addChild(island);
        };

        stage.addChild(sky, sun);
        let edge = '';

        tick(() => {
            if (params.edge === edge) return;
            edge = params.edge;
            build();
        });

        return undefined;
    },
});
