import { Container, Text } from 'pixi.js';
import { enableSilkBatching, linear, SilkGraphics } from 'pixi-silk';
import { signal } from 'pixi-silk/signal';
import {
    gearIcon,
    Island,
    IslandFrame,
    IslandGauge,
    IslandMenu,
    type IslandOptions,
    type IslandRect,
    IslandStack,
} from 'pixi-silk/ui/island';
import { boot } from './_shared/kit';

const proto = await boot({
    title: 'Island playground',
    subtitle:
        'Nine phones, one island idea each. Lips of every size, hints, a lip that leans to the pointer, edge swipes, sheets, notifications, a live activity and drawers inside cards.',
    background: 0x0b0c10,
    touchAction: 'none',
});
const { app } = proto;

enableSilkBatching();

const FONT = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
const label = (text: string, size: number, color = 0xffffff, weight = '600') =>
    new Text({ text, style: { fontFamily: FONT, fontSize: size, fontWeight: weight as '600', fill: color } });

// ------------------------------------------------------------------ a phone: bezel, screen, caption

const PW = 230;
const PH = 470;
const SCREEN: IslandRect = { x: 10, y: 10, width: PW - 20, height: PH - 20 };
const SKIES: [number, number][] = [
    [0x8fb3c7, 0xe9d8c4],
    [0xf6b5a4, 0x6a5acd],
    [0x9be7c4, 0x2b6cb0],
    [0xfbe3a1, 0xe76f51],
    [0xc3b1e1, 0x5e60ce],
    [0xa8dadc, 0x1d3557],
    [0xffd6a5, 0xff6b6b],
    [0xe0e1dd, 0x778da9],
    [0xb7e4c7, 0x40916c],
];
const phones: Container[] = [];
const cleanups: (() => void)[] = [];

function phone(title: string, caption: string, build: (screen: Container, view: IslandRect) => void): void {
    const root = new Container();
    const body = new SilkGraphics()
        .roundRect(0, 0, PW, PH, 36, 0.6)
        .fill(0x000000)
        .roundRect(0.5, 0.5, PW - 1, PH - 1, 36, 0.6)
        .stroke({ width: 1, color: 0xffffff, alpha: 0.12 });
    const [a, b] = SKIES[phones.length % SKIES.length];
    const sky = new SilkGraphics()
        .rect(SCREEN.x, SCREEN.y, SCREEN.width, SCREEN.height)
        .fill({ gradient: linear([a, b], { from: [0, 0], to: [0.4, 1] }) });
    // rounded screen corners: a frame with no bands
    const corners = new IslandFrame({ viewport: SCREEN, radius: 26 });
    const screen = new Container();
    const t = label(title, 15);
    const c = label(caption, 12, 0x8e8e93, '500');

    t.position.set(4, PH + 14);
    c.position.set(4, PH + 36);
    c.style.wordWrap = true;
    c.style.wordWrapWidth = PW - 8;
    root.addChild(body, sky, screen, corners, t, c);
    build(screen, SCREEN);
    // islands go above the rounded corners
    for (const child of [...screen.children]) if (child instanceof Island) root.addChild(child);
    phones.push(root);
}

const grid = new Container();

app.stage.addChild(grid);

// ------------------------------------------------------------------ 1. the plain lip, with a pulse hint

const dotIcon = (g: SilkGraphics, s: number) => g.circle(0, 0, s * 0.22).fill(0xffffff);

phone('Lip', 'A 12-unit lip on the right. It pulses every few seconds until you open it once.', (screen, view) => {
    screen.addChild(
        new Island({
            viewport: view,
            edge: 'right',
            align: 0.4,
            hintEvery: 3000,
            items: [
                new IslandGauge({ value: 0.73, color: 0xff5a1f, icon: dotIcon, size: 44 }),
                new IslandGauge({ value: 0.21, color: 0x30d158, icon: dotIcon, size: 44 }),
            ],
            gap: 12,
            padding: 14,
        }),
    );
});

// ------------------------------------------------------------------ 2. a dot that wiggles

phone('Dot', 'The smallest lip: 22 by 8. It wiggles along the edge to be found.', (screen, view) => {
    const rows = new IslandStack(
        ['Inbox', 'Starred', 'Sent'].map((s) => label(s, 14, 0xffffff, '500')),
        { gap: 14 },
    );

    screen.addChild(
        new Island({
            viewport: view,
            edge: 'left',
            align: 0.3,
            peek: 8,
            peekLength: 22,
            radius: 20,
            flare: 14,
            grip: false,
            hintEvery: 2600,
            hintKind: 'wiggle',
            views: { open: rows },
            length: 150,
            depth: 110,
        }),
    );
    rows.layout(110, 150);
});

// ------------------------------------------------------------------ 3. a hairline that is a bottom sheet with three stops

phone(
    'Sheet',
    'A 5-unit hairline the whole width. Pull it to half or full: a sheet with three stops.',
    (screen, view) => {
        const half = new Container();
        const full = new Container();
        const h = label('Half: drag up for more', 13, 0xffffff, '500');
        const f = new IslandStack(
            ['Now playing', 'Queue', 'Lyrics', 'Devices', 'Sleep timer'].map((s) => label(s, 15, 0xffffff, '500')),
            { gap: 18 },
        );

        h.anchor.set(0.5);
        h.position.set(view.width / 2, 40);
        half.addChild(h);
        full.addChild(f);
        f.layout(view.width, 300);
        screen.addChild(
            new Island({
                viewport: view,
                edge: 'bottom',
                peek: 5,
                peekLength: 1000,
                radius: 26,
                flare: 0,
                sizes: { half: { length: 1000, depth: 160 } },
                length: 1000,
                depth: 360,
                views: { half, open: full },
            }),
        );
    },
);

// ------------------------------------------------------------------ 4. hidden: swipe in from the edge

phone(
    'Edge swipe',
    'Nothing shows at rest. Swipe in from the left edge, or wait: it peeks out now and then.',
    (screen, view) => {
        const nav = new IslandStack(
            ['Home', 'Search', 'Library', 'Profile'].map((s) => label(s, 15, 0xffffff, '500')),
            { gap: 20 },
        );

        screen.addChild(
            new Island({
                viewport: view,
                edge: 'left',
                peek: 0,
                grab: 28,
                radius: 30,
                flare: 18,
                hintEvery: 3500,
                views: { open: nav },
                length: 300,
                depth: 130,
            }),
        );
        nav.layout(130, 300);
    },
);

// ------------------------------------------------------------------ 5. the magnet

phone(
    'Magnet',
    'Bring the pointer near the right edge: the lip leans out and slides toward it. On a phone, touch near the edge.',
    (screen, view) => {
        const hint = label('Leaning in', 14, 0xffffff, '500');

        hint.anchor.set(0.5);
        hint.position.set(60, 60);
        const holder = new Container();

        holder.addChild(hint);
        screen.addChild(
            new Island({
                viewport: view,
                edge: 'right',
                align: 0.5,
                peek: 10,
                peekLength: 70,
                magnet: { radius: 170, depth: 16, slide: 40 },
                views: { open: holder },
                length: 120,
                depth: 120,
            }),
        );
    },
);

// ------------------------------------------------------------------ 6. notifications that flash in and leave

phone(
    'Notification',
    'A notch that flashes a message every few seconds, then folds back. Hover it to keep it.',
    (screen, view) => {
        const msg = new Container();
        const dot = new SilkGraphics().circle(0, 0, 14).fill(0x30d158);
        const text = label('', 13);
        const messages = ['Big win +$250', 'Free spins ready', 'Daily bonus x2', 'Friend joined'];
        let i = 0;

        dot.position.set(26, 28);
        text.anchor.set(0, 0.5);
        text.position.set(48, 28);
        msg.addChild(dot, text);
        const notch = new Island({
            viewport: view,
            edge: 'top',
            peek: 22,
            peekLength: 80,
            radius: 22,
            flare: 14,
            grip: false,
            sizes: { note: { length: 190, depth: 56 } },
            views: { note: msg },
            length: 190,
            depth: 56,
        });

        screen.addChild(notch);
        const timer = setInterval(() => {
            text.text = messages[i++ % messages.length];
            notch.flash('note', 2200);
        }, 4200);

        cleanups.push(() => clearInterval(timer));
    },
);

// ------------------------------------------------------------------ 7. a live activity with a countdown

phone('Live activity', 'A compact notch with a countdown ring. Hover or tap it for the details.', (screen, view) => {
    const left = signal(1);
    const ring = new IslandGauge({ value: left, color: 0xffd60a, size: 30, thickness: 4, caption: false });
    const compact = new Container();
    const time = label('', 13);
    const panel = new Container();
    const big = new IslandGauge({ value: left, color: 0xffd60a, size: 60, thickness: 6, caption: false });
    const title = label('Bonus round', 14);
    const sub = label('', 12, 0x8e8e93, '500');

    ring.position.set(12, 10);
    time.anchor.set(1, 0.5);
    time.position.set(156, 25);
    compact.addChild(ring, time);
    big.position.set(16, 30);
    title.position.set(88, 42);
    sub.position.set(88, 64);
    panel.addChild(big, title, sub);
    screen.addChild(
        new Island({
            viewport: view,
            edge: 'top',
            peek: 50,
            peekLength: 168,
            radius: 24,
            flare: 14,
            grip: false,
            hover: 'open',
            views: { peek: compact, open: panel },
            length: 182,
            depth: 112,
        }),
    );
    let seconds = 30;
    const tick = () => {
        seconds = seconds <= 0 ? 30 : seconds - 1;
        left.value = seconds / 30;
        time.text = `0:${String(seconds).padStart(2, '0')}`;
        sub.text = `starts in ${seconds} s`;
    };

    tick();
    const timer = setInterval(tick, 1000);

    cleanups.push(() => clearInterval(timer));
});

// ------------------------------------------------------------------ 8. islands inside cards

phone('Cards', 'An island can live on the side of any rectangle. Pull the drawer out of each card.', (screen, view) => {
    const cards: [IslandRect, IslandOptions][] = [
        [
            { x: view.x + 16, y: view.y + 40, width: view.width - 32, height: 170 },
            { edge: 'bottom', peek: 8, peekLength: 50, length: 150, depth: 56, color: 0x1c1c1e },
        ],
        [
            { x: view.x + 16, y: view.y + 232, width: view.width - 32, height: 170 },
            { edge: 'right', peek: 8, peekLength: 46, length: 120, depth: 64, color: 0x0a84ff },
        ],
    ];

    for (const [rect, options] of cards) {
        const card = new SilkGraphics()
            .roundRect(rect.x, rect.y, rect.width, rect.height, 22, 0.6)
            .fill({ color: 0xffffff, alpha: 0.92 });
        const icons = new IslandStack(
            [0, 1, 2].map(() => new SilkGraphics().circle(9, 9, 9).fill({ color: 0xffffff, alpha: 0.9 })),
            { axis: options.edge === 'bottom' ? 'x' : 'y', gap: 14 },
        );
        const island = new Island({ viewport: rect, radius: 18, flare: 12, views: { open: icons }, ...options });
        const box = island.boxOf('open');

        icons.layout(box.width, box.height);
        screen.addChild(card, island);
    }
});

// ------------------------------------------------------------------ 9. a fat lip that is a button

phone('Button lip', 'A 44-unit lip with an icon is a button. It grows into a menu.', (screen, view) => {
    const sound = signal(true);
    const menu = new IslandMenu({
        width: 180,
        rowHeight: 38,
        items: [
            { id: 'sound', label: 'Sound', type: 'toggle', value: sound },
            { id: 'speed', label: 'Speed', type: 'choice', options: ['1x', '2x', '4x'], value: signal('1x') },
            { id: 'rules', label: 'Rules' },
        ],
    });
    const gear = new Container();
    const g = new SilkGraphics();

    gearIcon(g, 22);
    g.position.set(22, 22);
    gear.addChild(g);
    screen.addChild(
        new Island({
            viewport: view,
            edge: 'left',
            align: 0.85,
            peek: 44,
            peekLength: 44,
            radius: 22,
            flare: 14,
            grip: false,
            views: { peek: gear, open: menu },
            length: menu.boxHeight,
            depth: menu.boxWidth,
        }),
    );
});

// ------------------------------------------------------------------ layout: a grid, or one phone at a time on a narrow screen

grid.addChild(...phones);
let page = 0;
const CELL_W = PW + 40;
const CELL_H = PH + 110;
const layout = (w: number, h: number) => {
    const narrow = w < 640;
    const top = 120;

    if (narrow) {
        const k = Math.min((w - 24) / PW, (h - top - 110) / (PH + 70));

        grid.scale.set(k);
        phones.forEach((p, i) => {
            p.visible = i === page;
            p.position.set(0, 0);
        });
        grid.position.set((w - PW * k) / 2, top);
    } else {
        const cols = Math.max(1, Math.min(phones.length, Math.floor((w - 40) / CELL_W)));
        const rows = Math.ceil(phones.length / cols);
        const k = Math.min(1, (h - top - 20) / (rows * CELL_H), (w - 40) / (cols * CELL_W));

        grid.scale.set(k);
        phones.forEach((p, i) => {
            p.visible = true;
            p.position.set((i % cols) * CELL_W, Math.floor(i / cols) * CELL_H);
        });
        grid.position.set((w - (cols * CELL_W - 40) * k) / 2, top);
    }
};

proto.onResize(layout);
proto.button('Prev', () => {
    page = (page + phones.length - 1) % phones.length;
    layout(proto.width, proto.height);
});
proto.button('Next', () => {
    page = (page + 1) % phones.length;
    layout(proto.width, proto.height);
});
proto.button('Hint all', () => {
    for (const p of phones) for (const c of p.children) if (c instanceof Island) c.hint('wiggle');
});

window.addEventListener('pagehide', () => {
    for (const c of cleanups) c();
});
(globalThis as Record<string, unknown>).__phones = phones;
