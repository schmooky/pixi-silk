import { linear, SilkGraphics } from 'pixi-silk';
import { Island } from 'pixi-silk/ui/island';
import { defineDemo } from './runtime';

const W = 640;
const H = 400;

// Move the pointer toward an edge: the lip there leans out and slides to meet it. On a phone, touch
// near an edge. The rings show the magnet's reach.
export default defineDemo({
    title: 'Island magnet',
    size: [W, H],
    touchAction: 'none',
    controls: {
        radius: { type: 'range', label: 'radius', min: 40, max: 240, step: 10, value: 150 },
        depth: { type: 'range', label: 'lean', min: 2, max: 30, step: 1, value: 14 },
        slide: { type: 'range', label: 'slide', min: 0, max: 80, step: 2, value: 34 },
        reach: { type: 'toggle', label: 'show reach', value: true },
    },
    setup({ silk, stage, params, tick }) {
        const ticker = silk.app.ticker;
        const view = { width: W, height: H };
        const sky = new SilkGraphics()
            .rect(0, 0, W, H)
            .fill({ gradient: linear([0xa8dadc, 0x1d3557], { from: [0, 0], to: [0.3, 1] }) });
        const rings = new SilkGraphics();
        let islands: Island[] = [];
        const build = () => {
            for (const island of islands) island.destroy({ children: true });
            const magnet = { radius: params.radius, depth: params.depth, slide: params.slide };

            islands = [
                new Island({
                    viewport: view,
                    edge: 'right',
                    peek: 10,
                    peekLength: 70,
                    magnet,
                    length: 200,
                    depth: 110,
                    ticker,
                }),
                new Island({
                    viewport: view,
                    edge: 'left',
                    peek: 10,
                    peekLength: 70,
                    magnet,
                    length: 200,
                    depth: 110,
                    ticker,
                }),
                new Island({
                    viewport: view,
                    edge: 'bottom',
                    peek: 10,
                    peekLength: 90,
                    magnet,
                    length: 260,
                    depth: 90,
                    ticker,
                }),
            ];
            stage.addChild(...islands);
            // the reach: how far from each lip the magnet starts to pull
            rings.clear();
            if (params.reach) {
                for (const island of islands) {
                    const b = island.box;

                    rings
                        .roundRect(
                            b.x - params.radius,
                            b.y - params.radius,
                            b.width + params.radius * 2,
                            b.height + params.radius * 2,
                            params.radius,
                        )
                        .stroke({ width: 1, color: 0xffffff, alpha: 0.25, dash: [4, 6] });
                }
            }
        };

        stage.addChild(sky, rings);
        build();
        let key = '';

        tick(() => {
            const next = `${params.radius}/${params.depth}/${params.slide}/${params.reach}`;

            if (next === key) return;
            key = next;
            build();
        });

        return undefined;
    },
});
