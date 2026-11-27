import { Text } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { Island, type IslandEdge, IslandStack } from 'pixi-silk/ui/island';
import { defineDemo } from './runtime';

const W = 640;
const H = 400;

// An island on the side of any rectangle: each card hides a drawer of actions. Pull one out, or tap
// its lip.
export default defineDemo({
    title: 'Islands inside cards',
    size: [W, H],
    touchAction: 'none',
    setup({ silk, stage }) {
        const ticker = silk.app.ticker;
        const bg = new SilkGraphics().rect(0, 0, W, H).fill(0xeef0f4);
        const cards: [number, number, IslandEdge, number, string][] = [
            [24, 24, 'bottom', 0x1c1c1e, 'Order #2048'],
            [332, 24, 'right', 0x0a84ff, 'Team sync'],
            [24, 214, 'left', 0xff375f, 'Playlist'],
            [332, 214, 'top', 0x30d158, 'Savings'],
        ];

        stage.addChild(bg);
        for (const [x, y, edge, color, title] of cards) {
            const rect = { x, y, width: 284, height: 162 };
            const card = new SilkGraphics().roundRect(x, y, rect.width, rect.height, 22, 0.6).fill(0xffffff);
            const name = new Text({ text: title, style: { fontSize: 15, fill: 0x1c1c1e, fontWeight: '600' } });
            const vertical = edge === 'left' || edge === 'right';
            const icons = new IslandStack(
                [0, 1, 2].map(() => new SilkGraphics().circle(10, 10, 10).fill({ color: 0xffffff, alpha: 0.92 })),
                { axis: vertical ? 'y' : 'x', gap: 16 },
            );
            const island = new Island({
                viewport: rect,
                edge,
                peek: 8,
                peekLength: 48,
                radius: 18,
                flare: 12,
                color,
                length: vertical ? 132 : 150,
                depth: vertical ? 60 : 56,
                views: { open: icons },
                ticker,
            });
            const box = island.boxOf('open');

            icons.layout(box.width, box.height);
            name.position.set(edge === 'left' ? x + 70 : x + 20, edge === 'top' ? y + 112 : y + 18);
            stage.addChild(card, name, island);
        }

        return undefined;
    },
});
