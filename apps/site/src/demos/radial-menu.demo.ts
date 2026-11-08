import { Container, Text } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { SilkButton } from 'pixi-silk/ui/button';
import { bindRadialTrigger, type RadialItem, RadialMenu } from 'pixi-silk/ui/radial';
import { defineDemo, FONT, INK, label, PALETTE } from './runtime';

// Vector icons: drawn once in white around (0, 0); the menu tints them.
type Icon = (g: SilkGraphics, s: number) => void;
const pointer: Icon = (g, s) => {
    g.triangle(-s * 0.3, -s * 0.42, s * 0.34, s * 0.06, -s * 0.06, s * 0.16, 2).fill(0xffffff);
    g.line(-s * 0.02, s * 0.12, s * 0.16, s * 0.42).stroke({ width: s * 0.12, cap: 'round', color: 0xffffff });
};
const move: Icon = (g, s) => {
    const r = s * 0.42;

    g.line(-r, 0, r, 0).stroke({ width: s * 0.09, cap: 'round', color: 0xffffff });
    g.line(0, -r, 0, r).stroke({ width: s * 0.09, cap: 'round', color: 0xffffff });
    for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;

        g.regularPoly(Math.cos(a) * r, Math.sin(a) * r, s * 0.14, 3, a + Math.PI / 2, 1).fill(0xffffff);
    }
};
const rotate: Icon = (g, s) => {
    g.arcSweep(0, 0, s * 0.32, -Math.PI * 0.35, Math.PI * 1.6).stroke({
        width: s * 0.1,
        cap: 'round',
        color: 0xffffff,
    });
    g.regularPoly(s * 0.18, -s * 0.3, s * 0.14, 3, Math.PI / 2, 1).fill(0xffffff);
};
const scale: Icon = (g, s) => {
    g.roundRect(-s * 0.4, -s * 0.1, s * 0.5, s * 0.5, 3).stroke({ width: s * 0.08, color: 0xffffff });
    g.roundRect(-s * 0.1, -s * 0.42, s * 0.52, s * 0.52, 3).fill(0xffffff);
};
const gear: Icon = (g, s) => {
    g.circle(0, 0, s * 0.33).stroke({ width: s * 0.16, dash: [s * 0.13, s * 0.13], color: 0xffffff });
    g.circle(0, 0, s * 0.22).stroke({ width: s * 0.1, color: 0xffffff });
};
const more: Icon = (g, s) => {
    for (const x of [-1, 0, 1]) g.circle(x * s * 0.28, 0, s * 0.09).fill(0xffffff);
};
const heart: Icon = (g, s) => g.heart(0, 0, s * 0.8, 0.1).fill(0xffffff);
const star: Icon = (g, s) => g.star(0, 0, 5, s * 0.45, undefined, 0, 1.5).fill(0xffffff);
const plus: Icon = (g, s) => {
    g.line(-s * 0.35, 0, s * 0.35, 0).stroke({ width: s * 0.13, cap: 'round', color: 0xffffff });
    g.line(0, -s * 0.35, 0, s * 0.35).stroke({ width: s * 0.13, cap: 'round', color: 0xffffff });
};

const tools: RadialItem[] = [
    { id: 'select', label: 'SELECT', icon: pointer },
    {
        id: 'move',
        label: 'MOVE',
        icon: move,
        children: [
            { id: 'intuitive', label: 'Intuitive' },
            { id: 'axis', label: 'Axis' },
            { id: 'free', label: 'Free' },
        ],
    },
    {
        id: 'rotate',
        label: 'ROTATE',
        icon: rotate,
        children: [
            { id: 'uniform', label: 'Uniform' },
            { id: 'axis', label: 'Axis' },
            { id: 'free', label: 'Free' },
        ],
    },
    { id: 'scale', label: 'SCALE', icon: scale },
    { id: 'settings', label: 'SETTINGS', icon: gear, disabled: true },
    { id: 'more', label: 'MORE', icon: more },
];

// Press anywhere (or the round button) and drag to an item, or tap to keep the menu open.
// The `+` button opens a half ring that turns away from the edge it sits on. The artboard
// on the right is only scenery: the menus pick tools, they do not edit it.
export default defineDemo({
    title: 'Radial menu',
    size: [720, 400],
    touchAction: 'none',
    controls: {
        closeOnLeave: { type: 'toggle', label: 'close on leave', value: false },
    },
    setup({ silk, stage, params, tick }) {
        const ticker = silk.app.ticker;
        const surface = new Container();
        const status = new Text({
            text: 'press, drag, release, or tap',
            style: { fill: INK.muted, fontFamily: FONT, fontSize: 13 },
        });
        const bounds = { x: 0, y: 0, width: 720, height: 400 };
        const report = (_item: RadialItem, path: readonly RadialItem[]) => {
            status.text = `picked  ${path.map((i) => i.id).join(' › ')}`;
        };
        const menu = new RadialMenu({ items: tools, bounds, ticker, onSelect: report });
        const quick = new RadialMenu({
            items: [
                { id: 'heart', label: 'LIKE', icon: heart },
                { id: 'star', label: 'FAVOURITE', icon: star },
                { id: 'plus', label: 'ADD', icon: plus },
                { id: 'more', label: 'MORE', icon: more },
            ],
            sweep: Math.PI * 0.9,
            innerRadius: 34,
            outerRadius: 92,
            bounds,
            ticker,
            onSelect: report,
        });
        const hub = new SilkButton({ shape: 'circle', height: 64, icon: gear, iconSize: 28, ticker });
        const add = new SilkButton({ shape: 'circle', height: 52, icon: plus, iconSize: 22, ticker });

        // scenery: an artboard with a few layers, as in a drawing app
        const board = new SilkGraphics()
            .roundRect(330, 70, 300, 250, 16, 0.6)
            .fill(INK.surface)
            .stroke({ width: 1, color: INK.line, alignment: 'inside' })
            .roundRect(360, 104, 120, 84, 14, 0.6)
            .fill(PALETTE.blue)
            .circle(550, 150, 44)
            .fill(PALETTE.pink)
            .star(420, 258, 5, 40, undefined, 0, 4)
            .fill(PALETTE.yellow)
            .roundRect(500, 224, 100, 64, 32)
            .fill(PALETTE.green);

        surface.eventMode = 'static';
        surface.hitArea = { contains: (x, y) => x >= 0 && y >= 0 && x <= 720 && y <= 400 };
        status.position.set(24, 20);
        hub.position.set(170, 200);
        add.position.set(670, 350);
        stage.addChild(
            surface,
            board,
            label('Artboard', 330, 46),
            label('tools', 170, 244, {}, 0.5),
            label('quick add', 634, 342, {}, 1),
            status,
            hub,
            add,
            menu,
            quick,
        );

        bindRadialTrigger(surface, menu, { at: 'pointer' });
        bindRadialTrigger(hub, menu);
        bindRadialTrigger(add, quick);
        menu.state.hover.subscribe((item) => {
            if (item) status.text = `${menu.state.kind.value}: ${item.id}${item.disabled ? ' (disabled)' : ''}`;
        });

        tick(() => {
            menu.closeOnLeave = quick.closeOnLeave = params.closeOnLeave;
        });

        return undefined;
    },
});
