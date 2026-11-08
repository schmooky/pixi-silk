import { Container, Text } from 'pixi.js';
import { conic, SilkGraphics } from 'pixi-silk';
import { trackGesture } from 'pixi-silk/ui/gesture';
import { defineDemo } from './runtime';

const W = 260;
const H = 64;

/** Point at `u` (0..1) around a pill centred at (0, 0), clockwise from the top middle. */
function onPill(u: number): [number, number] {
    const r = H / 2;
    const straight = W - H;
    const total = 2 * straight + 2 * Math.PI * r;
    let d = (((u % 1) + 1) % 1) * total;

    if (d < straight / 2) return [d, -r];
    d -= straight / 2;
    if (d < Math.PI * r) {
        const a = -Math.PI / 2 + d / r;

        return [straight / 2 + Math.cos(a) * r, Math.sin(a) * r];
    }
    d -= Math.PI * r;
    if (d < straight) return [straight / 2 - d, r];
    d -= straight;
    if (d < Math.PI * r) {
        const a = Math.PI / 2 + d / r;

        return [-straight / 2 + Math.cos(a) * r, Math.sin(a) * r];
    }
    d -= Math.PI * r;

    return [-straight / 2 + d, -r];
}

export default defineDemo({
    size: [520, 300],
    background: 0x050508,
    touchAction: 'none',
    setup({ stage, tick }) {
        const button = new Container();
        const bloom = new SilkGraphics();
        const body = new SilkGraphics();
        const spark = new SilkGraphics();
        const border = conic([0x7c3aed, 0x22d3ee, 0xa855f7, 0x7c3aed]);
        const label = new Text({
            text: '✦  Generate',
            style: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 18, fontWeight: '600', fill: 0xffffff },
        });
        const sparkles = Array.from({ length: 14 }, (_, i) => ({
            x: ((i * 97) % (W - 40)) - (W - 40) / 2,
            y: ((i * 53) % 40) - 20,
            p: i * 0.71,
        }));
        let hover = 0;
        let hot = 0;
        let burst = 0;
        let spin = 0;

        bloom.blendMode = 'add';
        spark.blendMode = 'add';
        label.anchor.set(0.5);
        button.position.set(260, 150);
        button.addChild(bloom, body, spark, label);
        button.eventMode = 'static';
        button.cursor = 'pointer';
        button.hitArea = { contains: (x, y) => Math.abs(x) <= W / 2 && Math.abs(y) <= H / 2 };
        button.on('pointerover', () => (hot = 1));
        button.on('pointerout', () => (hot = 0));
        trackGesture(button, { onTap: () => (burst = 1) });
        stage.addChild(button);

        tick((t, dt) => {
            hover += (hot - hover) * Math.min(1, dt * 8);
            burst = Math.max(0, burst - dt * 1.6);
            spin += dt * (0.25 + hover * 0.35);
            border.startAngle = spin * Math.PI * 2;
            const [sx, sy] = onPill(spin);
            const glow = 0.55 + hover * 0.35 + burst * 0.6;

            bloom
                .clear()
                .pill(-W / 2 - 6, -H / 2 - 6, W + 12, H + 12)
                .stroke({ width: 18, gradient: border, alpha: 0.35 * glow, blur: 22 })
                .circle(sx, sy, 34)
                .fill({ color: 0x9be7ff, alpha: 0.45 * glow, blur: 26 });
            body.clear()
                .pill(-W / 2, -H / 2, W, H)
                .fill(0x0c0b14)
                .stroke({ width: 1.6, gradient: border, alignment: 'inside' });
            spark.clear().circle(sx, sy, 3).fill({ color: 0xffffff, blur: 2 });
            for (const s of sparkles) {
                const a = Math.max(0, Math.sin(t * 2.4 + s.p)) ** 6 * (0.5 + hover * 0.5 + burst);

                if (a > 0.02)
                    spark
                        .star(s.x, s.y, 4, 4 + a * 3, 1, 0, 0)
                        .fill({ color: 0xe9d5ff, alpha: Math.min(1, a), blur: 0.6 });
            }
            button.scale.set(1 + burst * 0.04 - (hover > 0.5 && burst > 0.8 ? 0.02 : 0));
        });

        return undefined;
    },
});
