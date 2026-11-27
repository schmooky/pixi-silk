import { Container, Text } from 'pixi.js';
import { enableSilkBatching, linear, radial, SilkGraphics } from 'pixi-silk';
import { signal } from 'pixi-silk/signal';
import {
    createRenderStats,
    fpsTone,
    gearIcon,
    Island,
    IslandFrame,
    IslandGauge,
    IslandMenu,
    IslandMeter,
    IslandStack,
} from 'pixi-silk/ui/island';
import { boot } from './_shared/kit';

const proto = await boot({
    title: 'Islands',
    subtitle:
        'Surfaces that grow out of the edges. Pull the lips out, hover and click the notch, open the gear. The bezel and its rail spring in and out.',
    background: 0x000000,
    touchAction: 'none',
});
const { app } = proto;

// runs of SilkGraphics share a draw call (the notch shows the count)
enableSilkBatching();
const FONT = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
const text = (size: number, weight = '600', color = 0xffffff) =>
    new Text({ text: '', style: { fontFamily: FONT, fontSize: size, fontWeight: weight as '600', fill: color } });

// ------------------------------------------------------------------ the bezel and the app inside it

const RAIL = 64;
const BEZEL = 10;
const railIcon = (draw: (g: SilkGraphics) => void, active = false) => {
    const c = new Container();
    const bg = new SilkGraphics();
    const g = new SilkGraphics();

    if (active) bg.circle(0, 0, 20).fill({ color: 0xffffff, alpha: 0.12 });
    draw(g);
    c.addChild(bg, g);
    c.eventMode = 'static';
    c.cursor = 'pointer';

    return c;
};
const stroke = { width: 2, color: 0xffffff, cap: 'round', join: 'round' } as const;
const frame = new IslandFrame({
    viewport: app,
    bands: { left: RAIL, top: BEZEL, right: BEZEL, bottom: BEZEL },
    radius: 26,
    rail: {
        side: 'left',
        start: [
            railIcon((g) => g.circle(0, 0, 9).stroke(stroke).circle(0, 0, 3).fill(0xffffff)),
            railIcon(
                (g) =>
                    g
                        .roundRect(-9, -9, 18, 18, 5)
                        .stroke(stroke)
                        .rect(-4, 1, 2, 4)
                        .fill(0xffffff)
                        .rect(1, -3, 2, 8)
                        .fill(0xffffff),
                true,
            ),
            railIcon((g) => g.moveTo(-9, 4).lineTo(-3, -2).lineTo(2, 3).lineTo(9, -5).stroke(stroke)),
            railIcon((g) => {
                for (const [x, y] of [
                    [-5, -5],
                    [5, -5],
                    [-5, 5],
                    [5, 5],
                ]) {
                    g.circle(x, y, 3.6).stroke(stroke);
                }
            }),
        ],
        end: [
            railIcon((g) =>
                g
                    .moveTo(-8, -7)
                    .lineTo(0, -4)
                    .lineTo(8, -7)
                    .lineTo(8, 7)
                    .lineTo(0, 10)
                    .lineTo(-8, 7)
                    .closePath()
                    .stroke(stroke),
            ),
            railIcon((g) =>
                g
                    .circle(0, 0, 11)
                    .fill({ gradient: linear([0xff2d55, 0xffd60a, 0x30d158, 0x0a84ff], { from: [0, 0], to: [1, 1] }) }),
            ),
        ],
    },
});

// the "app": a gradient sky in the window the bezel leaves
const scene = new SilkGraphics();
const paintScene = () => {
    const r = frame.inner.value;

    scene
        .clear()
        .rect(r.x, r.y, r.width, r.height)
        .fill({ gradient: linear([0x8fb3c7, 0xc6d4d6, 0xe9d8c4], { from: [0, 0], to: [0.3, 1] }) })
        .circle(r.x + r.width * 0.3, r.y + r.height * 0.75, Math.min(r.width, r.height) * 0.45)
        .fill({ gradient: radial(['#fff3dc', [1, '#fff3dc00']]), alpha: 0.9 })
        .circle(r.x + r.width * 0.75, r.y + r.height * 0.3, Math.min(r.width, r.height) * 0.35)
        .fill({ gradient: radial(['#b98cff', [1, '#b98cff00']]), alpha: 0.5 });
};

frame.inner.subscribe(paintScene);
paintScene();

// ------------------------------------------------------------------ side island: three gauges

const spark = (g: SilkGraphics, s: number) => g.star(0, 0, 8, s / 2, s / 7, 0, 1).fill(0xffffff);
const knot = (g: SilkGraphics, s: number) => {
    for (let i = 0; i < 3; i++) {
        g.save()
            .rotateTransform((i * Math.PI) / 3)
            .ellipse(0, 0, s / 2, s / 5)
            .stroke({ width: 1.6, color: 0xffffff })
            .restore();
    }
};
const flake = (g: SilkGraphics, s: number) => {
    for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3;

        g.moveTo(Math.cos(a) * s * 0.48, Math.sin(a) * s * 0.48)
            .lineTo(-Math.cos(a) * s * 0.48, -Math.sin(a) * s * 0.48)
            .stroke({ width: 1.6, color: 0xffffff, cap: 'round' });
    }
};
const gauges = [
    new IslandGauge({ value: 0.73, color: 0xff5a1f, icon: spark }),
    new IslandGauge({ value: 0.21, color: 0x30d158, icon: knot }),
    new IslandGauge({ value: 0.52, color: 0xffd60a, icon: flake }),
];
const side = new Island({
    viewport: frame.inner,
    edge: 'right',
    align: 0.38,
    items: gauges,
    gap: 18,
    padding: 18,
    state: 'open',
});

setInterval(() => {
    for (const g of gauges)
        g.state.value.value = Math.min(1, Math.max(0.02, g.state.value.value + (Math.random() - 0.45) * 0.25));
}, 2600);

// ------------------------------------------------------------------ gear bud: grows into a settings menu

const bezelOn = signal(true);
const railOn = signal(true);
const theme = signal('Night');
const menu = new IslandMenu({
    title: 'Settings',
    width: 232,
    items: [
        { id: 'bezel', label: 'Bezel', type: 'toggle', value: bezelOn },
        { id: 'rail', label: 'Side rail', type: 'toggle', value: railOn },
        { id: 'theme', label: 'Sky', type: 'choice', options: ['Night', 'Dawn', 'Noon'], value: theme },
        { id: 'peek', label: 'Peek everything' },
    ],
    onSelect: (id) => {
        if (id === 'peek') for (const i of [side, notch, bud]) i.close();
    },
});
const gear = new Container();
const gearG = new SilkGraphics();

gearIcon(gearG, 26);
gearG.position.set(28, 28);
gear.addChild(gearG);
const bud = new Island({
    viewport: frame.inner,
    edge: 'right',
    align: 1,
    offset: -8,
    peek: 56,
    peekLength: 56,
    radius: 28,
    flare: 18,
    grip: false,
    length: menu.boxHeight,
    depth: menu.boxWidth,
    views: { peek: gear, open: menu },
});

bezelOn.subscribe((on) =>
    frame.setBands(
        on
            ? { top: BEZEL, right: BEZEL, bottom: BEZEL, left: railOn.value ? RAIL : BEZEL }
            : { top: 0, right: 0, bottom: 0, left: 0 },
    ),
);
railOn.subscribe((on) => frame.setBands({ left: on ? RAIL : bezelOn.value ? BEZEL : 0 }));
theme.subscribe((t) => {
    app.renderer.background.color = t === 'Night' ? 0x000000 : t === 'Dawn' ? 0x1c1424 : 0x101418;
});

// ------------------------------------------------------------------ top notch: live render stats

const stats = createRenderStats(app);
const lipText = text(12);
const peekView = new Container();

lipText.anchor.set(0.5);
lipText.position.set(90, 15);
peekView.addChild(lipText);
const compactView = new Container();
const compactText = text(14, '500');
const dot = new SilkGraphics().circle(0, 0, 5).fill(0x30d158);

dot.position.set(26, 30);
compactText.anchor.set(0, 0.5);
compactText.position.set(40, 30);
compactView.addChild(dot, compactText);
const meters = new IslandStack(
    [
        new IslandMeter({ title: 'fps', value: stats.fps, tone: fpsTone }),
        new IslandMeter({ title: 'cpu ms', value: stats.frameMs, format: (v) => v.toFixed(1) }),
        new IslandMeter({ title: 'draws', value: stats.drawCalls, tone: (v) => (v <= 8 ? 0x0a84ff : 0xffd60a) }),
    ],
    { axis: 'x', gap: 26 },
);
const openView = new Container();
const caption = text(12, '500', 0x8e8e93);

caption.text = 'Drag the notch up to put it away.';
openView.addChild(meters, caption);
const notch = new Island({
    viewport: frame.inner,
    edge: 'top',
    peek: 30,
    peekLength: 180,
    hover: 'compact',
    sizes: { compact: { length: 340, depth: 60 }, open: { length: 400, depth: 150 } },
    views: { peek: peekView, compact: compactView, open: openView },
    radius: 26,
    flare: 20,
});

meters.layout(400, 110);
meters.y = 14;
caption.anchor.set(0.5, 0);
caption.position.set(200, 118);
const readout = () => {
    const f = stats.fps.value;
    const d = stats.drawCalls.value;

    lipText.text = `${f} fps`;
    compactText.text = `${f} fps   ${stats.frameMs.value.toFixed(1)} ms   ${d ?? '-'} draws`;
    dot.tint = fpsTone(f);
};

stats.fps.subscribe(readout);
stats.drawCalls.subscribe(readout);
readout();

// ------------------------------------------------------------------ a lip on the bottom: pull it out

const tray = new Island({
    viewport: frame.inner,
    edge: 'bottom',
    align: 0.5,
    length: 280,
    depth: 84,
    items: [text(15, '500')].map((t) => {
        t.text = 'Pull me up, flick me down';

        return t;
    }),
});

app.stage.addChild(scene, frame, side, bud, notch, tray);

proto.button('Open all', () => {
    for (const i of [side, bud, notch, tray]) i.open();
});
proto.button('Peek all', () => {
    for (const i of [side, bud, notch, tray]) i.close();
});

(globalThis as Record<string, unknown>).__islands = { side, bud, notch, tray, frame, stats };
