import { Container, type Rectangle, Text } from 'pixi.js';
import { linear, SilkGraphics } from 'pixi-silk';
import { Island, IslandStack } from 'pixi-silk/ui/island';
import { defineDemo } from './runtime';

const W = 640;
const H = 400;

// Nothing shows at rest. Swipe in from the left edge, anywhere in the shaded zone, to pull the
// drawer out. Flick it back to close.
export default defineDemo({
    title: 'Island edge swipe',
    size: [W, H],
    touchAction: 'none',
    controls: {
        grab: { type: 'range', label: 'grab zone', min: 8, max: 60, step: 2, value: 28 },
        zone: { type: 'toggle', label: 'show zone', value: true },
    },
    setup({ silk, stage, params, tick }) {
        const ticker = silk.app.ticker;
        const view = { width: W, height: H };
        const sky = new SilkGraphics()
            .rect(0, 0, W, H)
            .fill({ gradient: linear([0x9be7c4, 0x2b6cb0], { from: [0, 0], to: [0.3, 1] }) });
        const shade = new SilkGraphics();
        const items = ['Home', 'Search', 'Library', 'Settings'].map(
            (s) => new Text({ text: s, style: { fontSize: 16, fill: 0xffffff, fontWeight: '500' } }),
        );
        const nav = new IslandStack(items, { gap: 22 });
        const holder = new Container();
        let drawer: Island | null = null;
        const build = () => {
            drawer?.destroy();
            if (nav.parent) nav.parent.removeChild(nav);
            holder.addChild(nav);
            drawer = new Island({
                viewport: view,
                edge: 'left',
                peek: 0,
                // the whole edge takes the swipe
                peekLength: H,
                grab: params.grab,
                radius: 30,
                flare: 20,
                length: 320,
                depth: 170,
                hintEvery: 4000,
                views: { open: holder },
                ticker,
            });
            nav.layout(170, 320);
            stage.addChild(drawer);
            shade.clear();
            // the zone that takes the swipe: the island's grab area
            const zone = drawer.children[0].hitArea as Rectangle;

            if (params.zone) shade.rect(zone.x, zone.y, zone.width, zone.height).fill({ color: 0xffffff, alpha: 0.18 });
        };

        stage.addChild(sky, shade);
        build();
        let key = '';

        tick(() => {
            const next = `${params.grab}/${params.zone}`;

            if (next === key) return;
            key = next;
            build();
        });

        return undefined;
    },
});
