import { Container, Text, type TextStyleFontWeight } from 'pixi.js';
import { damp, SilkGraphics } from 'pixi-silk';
import { defineDemo } from './runtime';

// A monochrome weather dashboard. Static shapes redraw only while the theme fades, the needle,
// compass and sunrise arrow move on their own layer every frame.

const W = 390;
const H = 900;
const MONO = '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace';

interface Palette {
    bg: number;
    card: number;
    disc: number;
    onDisc: number;
    ink: number;
    faint: number;
}

const LIGHT: Palette = {
    bg: 0xdcdedb,
    card: 0xebecea,
    disc: 0x1d1d1d,
    onDisc: 0xf2f2f2,
    ink: 0x1d1d1d,
    faint: 0x9a9c99,
};
const DARK: Palette = {
    bg: 0x000000,
    card: 0x1e1f21,
    disc: 0xe9eaea,
    onDisc: 0x111111,
    ink: 0xf2f2f2,
    faint: 0x6a6b6d,
};

const mix = (a: number, b: number, t: number) => {
    const ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t) << s;

    return ch(16) | ch(8) | ch(0);
};
const blend = (t: number): Palette => ({
    bg: mix(LIGHT.bg, DARK.bg, t),
    card: mix(LIGHT.card, DARK.card, t),
    disc: mix(LIGHT.disc, DARK.disc, t),
    onDisc: mix(LIGHT.onDisc, DARK.onDisc, t),
    ink: mix(LIGHT.ink, DARK.ink, t),
    faint: mix(LIGHT.faint, DARK.faint, t),
});

// layout: two columns of cards under the hero row
const COL = [20, 205];
const CARD_W = 165;
const CARD_H = 165;
const ROW = [330, 515, 700];
const hair = (color: number, alpha = 1) => ({ width: 1.25, color, alpha });

type Role = 'ink' | 'onDisc' | 'faint';

export default defineDemo({
    title: 'Weather card',
    size: [W, H],
    // phones: the same card, as tall as the frame width allows, with no text under 12 px
    phone: { size: [W, H] },
    controls: {
        theme: { type: 'select', label: 'theme', options: ['light', 'dark'], value: 'dark' },
    },
    setup({ stage, params, tick, phone }) {
        const base = new SilkGraphics();
        const live = new SilkGraphics();
        const texts = new Container();
        const labels: [Text, Role][] = [];
        let fade = params.theme === 'dark' ? 1 : 0;
        let drawnFade = -1;

        stage.addChild(base, live, texts);

        const text = (
            value: string,
            x: number,
            y: number,
            size: number,
            role: Role,
            anchor = 0,
            weight: TextStyleFontWeight = '400',
        ) => {
            // a phone frame shows the card at about 0.9: the small labels grow to stay readable
            const t = new Text({
                text: value,
                style: {
                    fill: 0xffffff,
                    fontFamily: MONO,
                    fontSize: phone ? Math.max(12, size) : size,
                    fontWeight: weight,
                    letterSpacing: size * 0.08,
                },
            });

            t.anchor.set(anchor, 0.5);
            t.position.set(x, y);
            texts.addChild(t);
            labels.push([t, role]);
        };

        // header
        text('BROADGATE', W / 2, 92, 17, 'ink', 0.5);
        // hero
        text('12°', 115, 204, 66, 'onDisc', 0.5, '300');
        text('H:14° L:9°', 115, 254, 13, 'onDisc', 0.5);
        text('AIR QUALITY  21', 228, 162, 13, 'ink');
        text('Fair', 228, 184, 13, 'ink');
        text('UV INDEX 02', 228, 254, 13, 'ink');
        text('Low', 228, 276, 13, 'ink');
        // card titles and values
        const card = (col: number, row: number, title: string, sub: string, value: string, unit = '') => {
            const x = COL[col] + 16;
            const y = ROW[row];

            text(title, x, y + 22, 11, 'ink');
            if (sub) text(sub, x, y + 38, 11, 'ink', 0, '700');
            text(value, x, y + CARD_H - 26, 26, 'ink', 0, '300');
            if (unit) text(unit, x + value.length * 17 + 4, y + CARD_H - 22, 10, 'ink');
        };

        card(0, 0, 'AIR QUALITY', 'Fair', '21');
        card(1, 0, 'HUMIDITY', '', '79%');
        card(0, 1, 'WIND SPEED', '', '7', 'MPH');
        card(1, 1, 'UV INDEX', 'Low', '02');
        card(0, 2, 'SUNRISE', '', '06:11');
        text('N', COL[0] + CARD_W / 2, ROW[1] + 56, 9, 'ink', 0.5, '700');
        text('FEELS LIKE', COL[1] + CARD_W / 2, ROW[2] + 60, 12, 'onDisc', 0.5);
        text('11°', COL[1] + CARD_W / 2, ROW[2] + 100, 46, 'onDisc', 0.5, '300');

        const drawBase = (p: Palette) => {
            const g = base.clear();

            g.rect(0, 0, W, H).fill(p.bg);
            menuIcon(g, 28, 92, p.ink);
            gearIcon(g, W - 38, 92, p);
            g.circle(115, 218, 90).fill(p.disc);
            g.pill(212, 130, 160, 74).fill(p.card);
            g.pill(212, 222, 160, 74).fill(p.card);
            g.line(20, 318, W - 20, 318).stroke(hair(p.ink));
            for (const [col, row] of [
                [0, 0],
                [1, 0],
                [0, 1],
                [1, 1],
                [0, 2],
            ]) {
                g.roundRect(COL[col], ROW[row], CARD_W, CARD_H, 14).fill(p.card);
            }
            gaugeFace(g, COL[0] + CARD_W / 2, ROW[0] + 108, p);
            g.circle(COL[1] + CARD_W / 2, ROW[0] + 82, 46).stroke(hair(p.ink, 0.6));
            g.circle(COL[1] + CARD_W / 2, ROW[0] + 82, 37).fill(p.disc);
            compassFace(g, COL[0] + CARD_W / 2, ROW[1] + 92, p);
            uvStack(g, COL[1] + CARD_W / 2, ROW[1] + 120, p);
            sunriseFace(g, COL[0] + CARD_W / 2, ROW[2] + 92, p);
            g.circle(COL[1] + CARD_W / 2, ROW[2] + CARD_H / 2, 82).fill(p.disc);
        };

        tick((t, dt) => {
            fade = damp(fade, params.theme === 'dark' ? 1 : 0, 6, dt);
            const p = blend(fade);

            if (Math.abs(fade - drawnFade) > 0.001) {
                drawBase(p);
                drawnFade = fade;
                for (const [label, role] of labels) label.tint = p[role];
            }
            const g = live.clear();

            gaugeNeedle(g, COL[0] + CARD_W / 2, ROW[0] + 108, 0.28 + Math.sin(t * 0.7) * 0.04, p.ink);
            compassNeedle(g, COL[0] + CARD_W / 2, ROW[1] + 92, 0.45 + Math.sin(t * 0.9) * 0.08, p.onDisc);
            sunriseArrow(g, COL[0] + CARD_W / 2, ROW[2] + 92, Math.sin(t * 1.6) * 2.5, p.ink);
        });

        return undefined;
    },
});

function menuIcon(g: SilkGraphics, x: number, y: number, color: number) {
    for (let i = -1; i <= 1; i++) {
        g.circle(x, y + i * 7, 1.5).fill(color);
        g.line(x + 6, y + i * 7, x + 24, y + i * 7).stroke({ width: 1.5, color, cap: 'round' });
    }
}

function gearIcon(g: SilkGraphics, x: number, y: number, p: Palette) {
    g.star(x, y, 8, 13, 10.5, 0, 1.2).fill(p.ink);
    g.circle(x, y, 8.5).fill(p.bg);
    g.circle(x, y, 4).fill(p.ink);
    g.circle(x, y, 2.6).fill(p.bg);
}

function gaugeFace(g: SilkGraphics, cx: number, cy: number, p: Palette) {
    const r = 50;

    g.line(cx - 72, cy, cx + 72, cy).stroke(hair(p.ink));
    g.arc(cx, cy, r, Math.PI, Math.PI * 2).stroke(hair(p.ink));
    for (let i = 0; i <= 16; i++) {
        const a = Math.PI + (i / 16) * Math.PI;
        const inner = i % 4 === 0 ? r - 9 : r - 5;

        g.line(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner, cx + Math.cos(a) * r, cy + Math.sin(a) * r).stroke(
            hair(p.ink),
        );
    }
}

function gaugeNeedle(g: SilkGraphics, cx: number, cy: number, value: number, color: number) {
    const a = Math.PI + value * Math.PI;
    const tipX = cx + Math.cos(a) * 44;
    const tipY = cy + Math.sin(a) * 44;
    const head = 7;

    g.line(cx, cy, tipX, tipY).stroke({ width: 1.5, color, cap: 'round' });
    for (const side of [-0.45, 0.45]) {
        g.line(tipX, tipY, tipX - Math.cos(a + side) * head, tipY - Math.sin(a + side) * head).stroke({
            width: 1.5,
            color,
            cap: 'round',
        });
    }
}

function compassFace(g: SilkGraphics, cx: number, cy: number, p: Palette) {
    g.circle(cx, cy, 44).stroke(hair(p.ink));
    g.circle(cx, cy, 30).fill(p.disc);
    g.regularPoly(cx, cy - 47, 3.5, 3, 0, 0.5).fill(p.ink);
}

function compassNeedle(g: SilkGraphics, cx: number, cy: number, angle: number, color: number) {
    const dx = Math.sin(angle) * 24;
    const dy = -Math.cos(angle) * 24;

    g.line(cx + dx, cy + dy, cx - dx, cy - dy).stroke({ width: 1.4, color, cap: 'round' });
    const back = Math.atan2(-dy, -dx);

    for (const side of [-0.5, 0.5]) {
        g.line(cx - dx, cy - dy, cx - dx - Math.cos(back + side) * 6, cy - dy - Math.sin(back + side) * 6).stroke({
            width: 1.4,
            color,
            cap: 'round',
        });
    }
}

function uvStack(g: SilkGraphics, cx: number, cy: number, p: Palette) {
    // `cy` is the shared base line: each ellipse sits on it, the tallest faintest
    for (let i = 0; i < 5; i++) {
        const ry = 36 - i * 6.5;

        g.ellipse(cx, cy - ry, 46, ry).stroke(hair(p.ink, 0.22 + i * 0.13));
    }
    g.ellipse(cx, cy, 46, 4.5).stroke({ width: 1.8, color: p.ink });
}

function sunriseFace(g: SilkGraphics, cx: number, cy: number, p: Palette) {
    g.line(cx - 72, cy, cx + 72, cy).stroke(hair(p.ink));
    g.arc(cx, cy, 52, Math.PI, Math.PI * 2).stroke(hair(p.ink, 0.45));
    g.arc(cx, cy, 40, Math.PI, Math.PI * 2).stroke({ width: 1.6, color: p.ink });
    g.line(cx - 52, cy + 10, cx + 52, cy + 10).stroke(hair(p.ink, 0.7));
    g.line(cx - 34, cy + 18, cx + 34, cy + 18).stroke(hair(p.ink, 0.7));
    g.line(cx - 12, cy + 26, cx + 12, cy + 26).stroke(hair(p.ink, 0.7));
}

function sunriseArrow(g: SilkGraphics, cx: number, cy: number, lift: number, color: number) {
    const top = cy - 26 - lift;

    g.line(cx, cy - 8, cx, top).stroke({ width: 1.4, color, cap: 'round' });
    g.line(cx, top, cx - 5, top + 6).stroke({ width: 1.4, color, cap: 'round' });
    g.line(cx, top, cx + 5, top + 6).stroke({ width: 1.4, color, cap: 'round' });
}
