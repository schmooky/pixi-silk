import { Container, Text, type TextStyleFontWeight, type TextStyleOptions } from 'pixi.js';
import { damp, ease, SilkGraphics } from 'pixi-silk';
import { Odometer } from 'pixi-silk/ui/odometer';
import { defineDemo } from './runtime';

// A finance bento board. Every tile is its own container: it slides in on load, lifts on hover,
// and animates its numbers and bars once it has landed.

const W = 720;
const H = 900;
const GAP = 19;
const COL_W = (W - GAP * 4) / 3;
const col = (i: number) => GAP + i * (COL_W + GAP);
const SANS = 'Inter, "Helvetica Neue", system-ui, sans-serif';

const C = {
    page: 0x2a2a2a,
    orange: 0xf28a2e,
    orangeDeep: 0xd9762a,
    ink: 0x111111,
    stone: 0x8f8f8b,
    mist: 0xd9d9d6,
    paper: 0xf2f2f0,
    olive: 0x7f8b6c,
    oliveDeep: 0x5e6950,
    slate: 0x5a5a5a,
    arrow: 0xc4c4c4,
    clay: 0x7d5546,
    taupe: 0x857a5c,
    sand: 0xc8b88d,
    donut: 0x4a4a4a,
};

interface Tile {
    view: Container;
    /** 0..1 entrance progress, starts after `delay`. */
    enter: number;
    delay: number;
    lift: number;
    hover: boolean;
    /** Redraws the animated parts with the eased entrance value. */
    update?: (p: number, t: number) => void;
}

type Label = (
    text: string,
    size: number,
    color: number,
    weight?: TextStyleFontWeight,
    extra?: TextStyleOptions,
) => Text;

/** Text in the board's font. Sizes under `floor` grow to it, and so does their line height. */
const labelWithFloor =
    (floor: number): Label =>
    (text, size, color, weight = '500', extra = {}) => {
        const k = Math.max(1, floor / size);
        const lineHeight = extra.lineHeight === undefined ? undefined : extra.lineHeight * k;

        return new Text({
            text,
            style: { fill: color, fontFamily: SANS, fontSize: size * k, fontWeight: weight, ...extra, lineHeight },
        });
    };

// phones: two columns instead of three, shown at about 0.73, so labels grow to 15 to stay readable
const PHONE_W = 2 * COL_W + 3 * GAP;
const PHONE_H = 1396;
/** Tile positions on phones: column and top. */
const PHONE: Record<string, [number, number]> = {
    orange: [0, 20],
    volume: [0, 279],
    bars: [0, 628],
    clock: [0, 1022],
    send: [1, 20],
    research: [1, 209],
    currency: [1, 698],
    arrow: [1, 907],
    donut: [1, 1176],
};

function tile(x: number, y: number, w: number, h: number, fill: number, delay: number, radius = 10): Tile {
    const view = new Container();
    const bg = new SilkGraphics();

    bg.roundRect(0, 0, w, h, radius).fill(fill);
    view.addChild(bg);
    view.position.set(x, y);
    view.eventMode = 'static';
    view.hitArea = { contains: (px, py) => px >= 0 && py >= 0 && px <= w && py <= h };

    const t: Tile = { view, enter: 0, delay, lift: 0, hover: false };

    view.on('pointerover', () => (t.hover = true));
    view.on('pointerout', () => (t.hover = false));

    return t;
}

function place(child: Container, x: number, y: number, ax = 0, ay = 0) {
    if ('anchor' in child) (child as Text).anchor.set(ax, ay);
    child.position.set(x, y);

    return child;
}

export default defineDemo({
    title: 'Finance bento',
    size: [W, H],
    phone: { size: [PHONE_W, PHONE_H] },
    setup({ silk, stage, tick, width, height, phone }) {
        const ticker = silk.app.ticker;
        const tiles: Tile[] = [];
        const bg = new SilkGraphics().rect(0, 0, width, height).fill(C.page);
        const label = labelWithFloor(phone ? 15 : 0);
        /** A tile's place: its wide column and top, or its phone place. */
        const at = (name: string, column: number, y: number): [number, number] =>
            phone ? [col(PHONE[name][0]), PHONE[name][1]] : [col(column), y];
        const add = (t: Tile) => {
            tiles.push(t);
            stage.addChild(t.view);

            return t;
        };

        stage.addChild(bg);

        // the 78% card: orange, with a progress bar
        {
            const t = add(tile(...at('orange', 0, 20), COL_W, 240, C.orange, 0));
            const value = new Odometer({
                ticker,
                prefix: '\u2248', // almost equal
                suffix: '%',
                fontSize: 52,
                color: C.ink,
                textStyle: { fontFamily: SANS },
            });
            const bar = new SilkGraphics();

            t.view.addChild(
                value,
                place(label('●  Winning\nInvestors', 22, C.ink, '700', { lineHeight: 24 }), 14, 100),
                place(label('2024 May', 22, 0xb5611d, '700'), 14, 150),
                bar,
            );
            value.position.set(COL_W - 14, 52);
            t.update = (p) => {
                if (p > 0.2 && value.state.value.value === 0) value.set(78);
                value.x = COL_W - 14 - value.width / 2;
                bar.clear()
                    .roundRect(10, 186, COL_W - 20, 44, 4)
                    .fill(C.orangeDeep);
                bar.roundRect(10, 186, (COL_W - 20) * 0.7 * p, 44, 4).fill(C.ink);
            };
        }

        // up arrow tile
        {
            const t = add(tile(...at('arrow', 0, 280), COL_W, 250, C.slate, 0.08));
            const g = new SilkGraphics();
            const cx = COL_W / 2;

            g.rect(cx - 9, 70, 18, 140).fill(C.arrow);
            g.beginPath()
                .moveTo(cx, 60)
                .bezierCurveTo(cx - 8, 90, cx - 40, 110, cx - 72, 110)
                .stroke({ width: 18, color: C.arrow });
            g.beginPath()
                .moveTo(cx, 60)
                .bezierCurveTo(cx + 8, 90, cx + 40, 110, cx + 72, 110)
                .stroke({ width: 18, color: C.arrow });
            t.view.addChild(g);
            t.update = (p, time) => {
                g.y = (1 - p) * 30 + Math.sin(time * 1.4) * 3 * p;
            };
        }

        // 24h trading volume
        {
            const t = add(tile(...at('volume', 0, 550), COL_W, 330, C.clay, 0.16));
            const rows: [boolean, string, string][] = [
                [true, 'Bitcoin', '$67,258.69'],
                [false, 'Ethereum', '$2,631.39'],
                [true, 'Tether', '$0.9992'],
                [false, 'Solana', '$167.92'],
                [true, 'Cardano', '$0.362'],
                [false, 'Toncoin', '$5.25'],
            ];
            const lines = new SilkGraphics();

            t.view.addChild(place(label('24h Trading\nVolume', 22, C.ink, '700', { lineHeight: 24 }), 16, 20), lines);
            rows.forEach(([up, name, price], i) => {
                const y = 330 - (rows.length - i) * 37 + 12;

                lines.rect(0, y - 18, COL_W, 1).fill({ color: C.ink, alpha: 0.25 });
                t.view.addChild(
                    place(label(up ? '▲' : '▼', 10, C.ink), 16, y, 0, 0.5),
                    place(label(name, 13, C.ink, '600'), 34, y, 0, 0.5),
                    place(label(price, 13, C.ink, '600'), COL_W - 14, y, 1, 0.5),
                );
            });
        }

        // send / receive
        {
            const t = add(tile(...at('send', 1, 20), COL_W, 170, C.stone, 0.04));
            const inner = new SilkGraphics();
            const send = new Odometer({
                ticker,
                fontSize: 38,
                color: C.ink,
                textStyle: { fontFamily: SANS, fontWeight: '400' },
            });

            inner.roundRect(8, 8, COL_W - 16, 72, 7).fill(0xadada9);
            inner.roundRect(8, 88, COL_W - 16, 74, 7).fill(C.mist);
            t.view.addChild(
                inner,
                place(label('Send', 16, 0x3b3b3b, '400'), 22, 30, 0, 0.5),
                place(label('USD', 11, 0x555555, '400'), 22, 64, 0, 0.5),
                send,
                place(label('Receive', 16, 0x3b3b3b, '400'), 22, 110, 0, 0.5),
                place(label('BTC', 11, 0x555555, '400'), 22, 146, 0, 0.5),
                place(label('0,0018', 38, C.ink, '400'), COL_W - 22, 136, 1, 0.5),
            );
            send.y = 54;
            t.update = (p) => {
                if (p > 0.2 && send.state.value.value === 0) send.set(134);
                send.x = COL_W - 22 - send.width / 2;
            };
        }

        // research card: a price, then three plan cards stacked on its lower half
        {
            const t = add(tile(...at('research', 1, 205), COL_W, 470, 0xbdbdba, 0.12));
            const g = new SilkGraphics();
            const plans: [string, string, number, number][] = [
                ['Key\nBenefits', 'AI tools', 2, 0xdcdcda],
                ['Pricing\nPlans', 'Premium', 15, C.paper],
                ['Trusted\nInvestors', 'Trust', 54, C.taupe],
            ];
            const top = [214, 278, 342];
            const bottom = 462;
            const counters: Odometer[] = [];
            const trust = new SilkGraphics();
            const price = label('$23,485', 32, C.ink, '400');
            const cents = label('.95', 32, 0x8c8c8a, '400');

            t.view.addChild(
                g,
                place(label('Best Crypto\nResearch', 22, C.ink, '700', { lineHeight: 24 }), 16, 16),
                place(price, 16, 186, 0, 0.5),
                place(cents, 16 + price.width, 186, 0, 0.5),
            );
            plans.forEach(([name, sub, , fill], i) => {
                const y = top[i];

                g.roundRect(6, y, COL_W - 12, bottom - y, 8).fill(fill);
                const counter = new Odometer({
                    ticker,
                    fontSize: 40,
                    color: C.ink,
                    textStyle: { fontFamily: SANS, fontWeight: '400' },
                });

                counter.y = y + 38;
                counters.push(counter);
                t.view.addChild(
                    place(label(name, 11, C.ink, '700', { lineHeight: 12 }), 16, y + 10),
                    place(label(sub, 9, 0x5d5d5b, '400'), 16, y + 52, 0, 0.5),
                    counter,
                );
            });
            t.view.addChild(
                place(label('%', 18, 0x3b3b3b, '400'), COL_W - 80, top[2] + 44, 1, 0.5),
                place(label('Do not trust', 9, 0x4a4535, '400'), COL_W - 16, top[2] + 74, 1, 0.5),
                trust,
            );
            t.update = (p) => {
                counters.forEach((c, i) => {
                    if (p > 0.3 && c.state.value.value === 0) c.set(plans[i][2]);
                    c.x = COL_W - 18 - c.width / 2;
                });
                const barY = top[2] + 84;

                trust
                    .clear()
                    .roundRect(10, barY + 8, COL_W - 20, bottom - barY - 12, 6)
                    .fill(0x6c6450);
                trust.roundRect(10, barY, (COL_W - 20) * 0.54 * p, bottom - barY - 4, 6).fill(C.sand);
            };
        }

        // currency tiles
        {
            const t = add(tile(...at('currency', 1, 690), COL_W, 190, 0xbdbdba, 0.2));
            const g = new SilkGraphics();
            const half = (COL_W - 24) / 2;

            t.view.addChild(g);
            ['₿', '$', '€', '¥'].forEach((sign, i) => {
                const x = 8 + (i % 2) * (half + 8);
                const y = 8 + Math.floor(i / 2) * 91;

                g.roundRect(x, y, half, 83, 7).fill(C.paper);
                t.view.addChild(place(label(sign, 38, C.ink, '400'), x + half / 2, y + 42, 0.5, 0.5));
            });
        }

        // weekly bars
        {
            const t = add(tile(...at('bars', 2, 20), COL_W, 375, C.olive, 0.08));
            const bars = new SilkGraphics();
            const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            const totals = [0.86, 0.75, 0.6, 0.68, 0.84, 0.67, 0.78];
            const filled = [0.3, 0.55, 0.18, 0.37, 0.75, 0.42, 0.28];
            const total = new Odometer({
                ticker,
                decimals: 2,
                prefix: '$',
                fontSize: 22,
                color: C.ink,
                textStyle: { fontFamily: SANS, fontWeight: '400' },
            });
            const cell = (COL_W - 24) / 7;

            t.view.addChild(
                place(label('You Shop\nData Insights', 20, C.ink, '700', { lineHeight: 22 }), 14, 14),
                bars,
                place(label('All Time:', 12, 0x2f3527, '400'), 14, 350, 0, 0.5),
                total,
            );
            // phones show the first letter only: the cells are narrow for the larger text
            days.forEach((d, i) =>
                t.view.addChild(
                    place(label(phone ? d[0] : d, 10, 0x3a4130, '400'), 12 + cell * (i + 0.5), 316, 0.5, 0.5),
                ),
            );
            total.y = 350;
            t.update = (p) => {
                if (p > 0.4 && total.state.value.value === 0) total.set(637.55);
                total.x = COL_W - 14 - total.width / 2;
                bars.clear();
                totals.forEach((v, i) => {
                    const x = 12 + cell * i + 3;
                    const w = cell - 6;
                    const grow = ease.outCubic(Math.min(1, Math.max(0, p * 1.4 - i * 0.06)));
                    const full = 220 * v * grow;
                    const fill = 220 * filled[i] * grow;

                    if (full > 1) bars.roundRect(x, 300 - full, w, full, 6).fill(C.oliveDeep);
                    if (fill > 1) bars.roundRect(x, 300 - fill, w, fill, 6).fill(C.ink);
                });
            };
        }

        // one quarter donut
        {
            const t = add(tile(...at('donut', 2, 415), COL_W, 200, C.page, 0.16));
            const g = new SilkGraphics();
            const cx = COL_W / 2;

            t.view.addChild(g, place(label('¼', 40, C.paper, '500'), cx, 100, 0.5, 0.5));
            t.update = (p) => {
                g.clear().circle(cx, 100, 100).fill(C.donut);
                g.sector(cx, 100, 100, -Math.PI / 2, -Math.PI / 2 + (Math.PI / 2) * p, 0).fill(C.mist);
                g.circle(cx, 100, 46).fill(0x262626);
            };
        }

        // clock dial with rotated numbers
        {
            const t = add(tile(...at('clock', 2, 630), COL_W, 250, C.page, 0.24));
            const face = new SilkGraphics();
            const numbers = new Container();
            const cx = COL_W / 2;
            const cy = 125;

            face.circle(cx, cy, 122).fill(C.mist);
            face.regularPoly(cx + 20, cy + 40, 8, 3, -Math.PI / 6, 1).fill(C.ink);
            numbers.position.set(cx, cy);
            for (let h = 1; h <= 12; h++) {
                const a = (h / 12) * Math.PI * 2;
                const n = place(label(String(h), 30, C.ink, '400'), Math.sin(a) * 96, -Math.cos(a) * 96, 0.5, 0.5);

                n.rotation = a;
                numbers.addChild(n);
            }
            t.view.addChild(face, numbers);
            t.update = (p, time) => {
                numbers.rotation = (1 - p) * -1.2 + Math.sin(time * 0.3) * 0.04;
            };
        }

        tick((time, dt) => {
            for (const t of tiles) {
                const target = time > t.delay ? 1 : 0;

                t.enter = damp(t.enter, target, 5, dt);
                t.lift = damp(t.lift, t.hover ? 1 : 0, 14, dt);
                const p = ease.outCubic(Math.min(1, t.enter));

                t.view.alpha = p;
                t.view.pivot.y = (1 - p) * -24 + t.lift * 4;
                t.update?.(p, time);
            }
        });

        return undefined;
    },
});
