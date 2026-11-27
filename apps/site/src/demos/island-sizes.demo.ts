import { Container, Text } from 'pixi.js';
import { linear, SilkGraphics } from 'pixi-silk';
import { gearIcon, Island } from 'pixi-silk/ui/island';
import { defineDemo } from './runtime';

const W = 640;
const H = 400;

// a line of text centred in a box of w by h, for a view
const note = (text: string, w: number, h: number) => {
    const view = new Container();
    const t = new Text({ text, style: { fontSize: 13, fill: 0xffffff, fontWeight: '500' } });

    t.anchor.set(0.5);
    t.position.set(w / 2, h / 2);
    view.addChild(t);

    return view;
};

// Four closed sizes on four edges: a dot, a lip, a hairline and a button. Pull one, or open them all.
export default defineDemo({
    title: 'Island closed sizes',
    size: [W, H],
    touchAction: 'none',
    controls: {
        state: { type: 'select', label: 'all islands', options: ['peek', 'open'], value: 'peek' },
    },
    setup({ silk, stage, params, tick }) {
        const ticker = silk.app.ticker;
        const view = { width: W, height: H };
        const sky = new SilkGraphics()
            .rect(0, 0, W, H)
            .fill({ gradient: linear([0xc3b1e1, 0x5e60ce], { from: [0, 0], to: [0.3, 1] }) });
        const gear = new Container();
        const g = new SilkGraphics();

        gearIcon(g, 22);
        g.position.set(22, 22);
        gear.addChild(g);
        const islands = [
            // a dot: 22 long, 8 deep
            new Island({
                viewport: view,
                edge: 'left',
                align: 0.3,
                peek: 8,
                peekLength: 22,
                radius: 18,
                flare: 12,
                grip: false,
                length: 140,
                depth: 100,
                views: { open: note('Dot, 22 x 8', 100, 140) },
                ticker,
            }),
            // the default lip: 12 deep
            new Island({
                viewport: view,
                edge: 'right',
                length: 180,
                depth: 110,
                views: { open: note('Lip, 12 deep', 110, 180) },
                ticker,
            }),
            // a hairline as long as the edge (a longer length is clamped to the edge)
            new Island({
                viewport: view,
                edge: 'bottom',
                peek: 5,
                peekLength: W,
                flare: 0,
                radius: 24,
                length: W,
                depth: 110,
                views: { open: note('Hairline, the whole edge', W, 110) },
                ticker,
            }),
            // a 44-unit button with an icon
            new Island({
                viewport: view,
                edge: 'top',
                align: 0.75,
                peek: 44,
                peekLength: 44,
                radius: 22,
                flare: 14,
                grip: false,
                length: 200,
                depth: 80,
                views: { peek: gear, open: note('Button, 44 x 44', 200, 80) },
                ticker,
            }),
        ];

        stage.addChild(sky, ...islands);
        let state = params.state;

        tick(() => {
            if (params.state === state) return;
            state = params.state;
            for (const island of islands) island.go(state);
        });

        return undefined;
    },
});
