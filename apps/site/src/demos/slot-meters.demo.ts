import { Text } from 'pixi.js';
import { conic, damp, SilkGraphics, Spring } from 'pixi-silk';
import { signal } from 'pixi-silk/signal';
import { trackGesture } from 'pixi-silk/ui/gesture';
import { defineDemo } from './runtime';

// Slot HUD pieces drawn with one SilkGraphics each, state in signals. Copy and restyle.
// Win meter with tiers, multiplier badge, free-spin pips, feature path and a hold-to-buy button.
// Press "WIN" to feed the meter, hold "BUY" to confirm.

const TIERS = [
    { at: 0.25, name: 'BIG', color: 0x30d158 },
    { at: 0.55, name: 'MEGA', color: 0x0a84ff },
    { at: 0.85, name: 'EPIC', color: 0xbf5af2 },
];
const font = { fontFamily: 'system-ui, sans-serif', fontWeight: '700' } as const;

export default defineDemo({
    size: [640, 360],
    touchAction: 'none',
    setup({ stage, tick }) {
        const win = signal(0); // 0..1 of the max win
        const mult = signal(1);
        const spins = signal(10);
        const used = signal(0);
        const path = signal(0); // feature collect progress, 0..6

        const g = new SilkGraphics();
        const tierText = new Text({ text: '', style: { ...font, fill: 0xffffff, fontSize: 18 } });
        const multText = new Text({ text: 'x1', style: { ...font, fill: 0x1c1c1e, fontSize: 22 } });
        const winBtn = new Text({ text: 'WIN', style: { ...font, fill: 0xffffff, fontSize: 14 } });
        const buyText = new Text({ text: 'HOLD TO BUY', style: { ...font, fill: 0xffffff, fontSize: 13 } });

        // one ramp over the whole gauge, so the colour says how far the win got
        const meterPaint = conic([0x30d158, 0x0a84ff, 0xbf5af2, 0xff375f], {
            center: [150, 170],
            units: 'local',
            startAngle: Math.PI * 0.75,
            sweep: Math.PI * 1.5,
        });
        let shown = 0;
        let tierPop = 0;
        let lastTier = -1;
        const badge = new Spring(1, 520, 14);
        let shake = 0;
        let pipPop = new Array(10).fill(0);
        let pathShown = 0;
        let buy = 0;
        let holding = false;
        let bought = 0;
        let time = 0;

        for (const t of [tierText, multText, winBtn, buyText]) t.anchor.set(0.5);
        tierText.position.set(150, 190);
        multText.position.set(380, 112);
        winBtn.position.set(150, 300);
        buyText.position.set(520, 300);
        stage.addChild(g, tierText, multText, winBtn, buyText);

        mult.subscribe(() => {
            badge.value = 1.45;
            shake = 1;
        });
        used.subscribe((u) => (pipPop[u - 1] = 1));

        // hit zones: a container per control keeps the example readable
        const zone = (x: number, y: number, w: number, h: number) => {
            const z = new SilkGraphics();

            z.hitArea = { contains: (px, py) => px >= x && px <= x + w && py >= y && py <= y + h };
            stage.addChild(z);

            return z;
        };

        trackGesture(zone(90, 280, 120, 40), {
            onTap: () => {
                win.update((v) => (v >= 1 ? 0 : Math.min(1, v + 0.12 + Math.random() * 0.1)));
                if (Math.random() < 0.5) mult.update((m) => (m >= 10 ? 1 : m + 1));
                if (used.value < spins.value) used.update((u) => u + 1);
                else {
                    used.set(0);
                    pipPop = pipPop.map(() => 0);
                }
                path.update((p) => (p >= 6 ? 0 : p + 1));
            },
        });
        trackGesture(
            zone(440, 280, 160, 40),
            {
                onDown: () => (holding = true),
                onUp: () => (holding = false),
            },
            { holdMs: 0, flickSpeed: 0 },
        );

        tick((_t, dt) => {
            time += dt;
            shown = damp(shown, win.value, 4, dt);
            badge.target = 1;
            badge.step(dt);
            shake = damp(shake, 0, 6, dt);
            pipPop = pipPop.map((p) => damp(p, 0, 5, dt));
            pathShown = damp(pathShown, path.value, 6, dt);
            buy = holding ? Math.min(1, buy + dt / 1.2) : damp(buy, 0, 10, dt);
            if (buy >= 1 && holding) {
                holding = false;
                bought = 1;
                buy = 0;
            }
            bought = damp(bought, 0, 2.5, dt);

            const tier = TIERS.reduce((acc, t, i) => (shown >= t.at ? i : acc), -1);

            if (tier !== lastTier) {
                if (tier > lastTier) tierPop = 1;
                lastTier = tier;
            }
            tierPop = damp(tierPop, 0, 5, dt);

            g.clear();
            // win meter: a 270deg gauge with tier ticks; the fill takes the colour of the tier reached
            const cx = 150;
            const cy = 170;
            const start = Math.PI * 0.75;
            const sweep = Math.PI * 1.5;

            g.arcSweep(cx, cy, 90, start, sweep).stroke({ width: 16, cap: 'round', color: 0x2c2c2e });
            if (shown > 0.003) {
                g.arcSweep(cx, cy, 90, start, sweep * shown).stroke({
                    width: 16,
                    cap: 'round',
                    gradient: meterPaint,
                });
            }
            for (const t of TIERS) {
                const a = start + sweep * t.at;

                g.line(
                    cx + Math.cos(a) * 76,
                    cy + Math.sin(a) * 76,
                    cx + Math.cos(a) * 104,
                    cy + Math.sin(a) * 104,
                ).stroke({
                    width: 2,
                    color: shown >= t.at ? t.color : 0x48484a,
                });
            }
            if (tier >= 0) {
                g.circle(cx, cy + 20, 34 + tierPop * 20).fill({
                    color: TIERS[tier].color,
                    alpha: 0.25 + tierPop * 0.4,
                    blur: 14,
                });
            }
            tierText.text = tier >= 0 ? `${TIERS[tier].name} WIN` : `${Math.round(shown * 100)}%`;
            tierText.scale.set(1 + tierPop * 0.35);

            // multiplier badge: a rounded star that pops and shakes when the value changes
            const bx = 380 + Math.sin(time * 60) * 4 * shake;

            g.star(bx, 112, 8, 46 * badge.value, 38 * badge.value, time * 0.4, 4).fill({
                color: 0xffd60a,
                blur: 0,
            });
            g.circle(bx, 112, 56 * badge.value).fill({ color: 0xffd60a, alpha: 0.18 * shake, blur: 12 });
            multText.text = `x${mult.value}`;
            multText.position.x = bx;
            multText.scale.set(badge.value);

            // free-spin pips: used ones fill, the newest one bursts
            for (let i = 0; i < spins.value; i++) {
                const x = 300 + i * 30;
                const y = 220;
                const on = i < used.value;

                g.circle(x, y, 9 + pipPop[i] * 6).fill({ color: on ? 0xff9f0a : 0x2c2c2e });
                if (pipPop[i] > 0.02) {
                    g.circle(x, y, 12 + (1 - pipPop[i]) * 16).stroke({
                        width: 2,
                        color: 0xff9f0a,
                        alpha: pipPop[i],
                    });
                }
            }

            // feature path: collect points along a wave, the trail grows to the reached point
            const pts: number[] = [];

            for (let i = 0; i <= 60; i++) {
                const t = i / 60;

                pts.push(300 + t * 300, 160 + Math.sin(t * Math.PI * 3) * 14);
            }
            g.polyline(pts, { smooth: 'catmull' }).stroke({ width: 6, cap: 'round', color: 0x2c2c2e });
            const reach = Math.round((pathShown / 6) * 60);

            if (reach > 0) {
                g.polyline(pts.slice(0, (reach + 1) * 2), { smooth: 'catmull' }).stroke({
                    width: 6,
                    cap: 'round',
                    color: 0x64d2ff,
                });
            }
            for (let k = 0; k <= 6; k++) {
                const i = k * 10;
                const on = pathShown >= k - 0.01;

                g.circle(pts[i * 2], pts[i * 2 + 1], on ? 8 : 6).fill(on ? 0x64d2ff : 0x48484a);
            }

            // buttons
            g.pill(90, 280, 120, 40).fill(0x0a84ff);
            g.pill(440, 280, 160, 40).fill(bought > 0.05 ? 0x30d158 : 0x3a3a3c);
            if (buy > 0.002) g.pill(440, 280, Math.max(40, 160 * buy), 40).fill({ color: 0xff9f0a, alpha: 0.9 });
            buyText.text = bought > 0.05 ? 'BOUGHT' : 'HOLD TO BUY';
        });

        return undefined;
    },
});
