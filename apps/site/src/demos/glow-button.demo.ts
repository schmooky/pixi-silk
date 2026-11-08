import { Container, Text } from 'pixi.js';
import { along, linear, radial, SilkGraphics } from 'pixi-silk';
import { trackGesture } from 'pixi-silk/ui/gesture';
import { defineDemo } from './runtime';

const W = 400;
const H = 128;

/** Point at `u` (0..1) around a pill centred at (0, 0), clockwise from the middle of its right end. */
function onPill(u: number): [number, number] {
    const r = H / 2;
    const straight = W - H;
    const total = 2 * straight + 2 * Math.PI * r;
    let d = (((u % 1) + 1) % 1) * total;

    if (d < Math.PI * r * 0.5) {
        const a = d / r;

        return [straight / 2 + Math.cos(a) * r, Math.sin(a) * r];
    }
    d -= Math.PI * r * 0.5;
    if (d < straight) return [straight / 2 - d, r];
    d -= straight;
    if (d < Math.PI * r) {
        const a = Math.PI / 2 + d / r;

        return [-straight / 2 + Math.cos(a) * r, Math.sin(a) * r];
    }
    d -= Math.PI * r;
    if (d < straight) return [-straight / 2 + d, -r];
    d -= straight;
    const a = -Math.PI / 2 + d / r;

    return [straight / 2 + Math.cos(a) * r, Math.sin(a) * r];
}

/** The border as an open path: it starts at `u0` and stops short of closing, leaving a gap. */
function border(u0: number, gap: number): number[] {
    const out: number[] = [];
    const n = 220;

    for (let i = 0; i <= n; i++) out.push(...onPill(u0 + (i / n) * (1 - gap)));

    return out;
}

export default defineDemo({
    size: [620, 360],
    background: 0x05061a,
    touchAction: 'none',
    setup({ stage, tick }) {
        const room = new SilkGraphics();
        const button = new Container();
        const bloom = new SilkGraphics();
        const body = new SilkGraphics();
        const line = new SilkGraphics();
        const dust = new SilkGraphics();
        const label = new Text({
            text: 'Magic button',
            style: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 34, fontWeight: '500', fill: 0xe4e2f4 },
        });
        // violet on the long run of the border, cooling to teal at its head
        const tube = along([
            [0, 0xffffff, 0],
            [0.08, 0xd9c8ff, 1],
            [0.55, 0xffffff, 1],
            [0.85, 0xc8f4ff, 1],
            [1, 0x7cf7e8, 0.9],
        ]);
        const halo = along([
            [0, 0x8b3dff, 0],
            [0.15, 0x9b4dff, 1],
            [0.5, 0x6d5bff, 1],
            [0.8, 0x3d8bff, 1],
            [1, 0x2ee6d6, 1],
        ]);
        const dots = Array.from({ length: 70 }, (_, i) => ({
            x: (((i * 0.618034) % 1) - 0.5) * 340,
            y: ((((i * 0.7548777 + 0.31) * 7) % 1) - 0.5) * 90,
            r: 0.6 + ((i * 31) % 10) / 10,
            p: i * 1.37,
        }));
        let hover = 0;
        let hot = 0;
        let burst = 0;
        let head = 0;

        room.rect(0, 0, 620, 360).fill(
            radial(
                [
                    [0, 0x1a1060, 1],
                    [0.6, 0x0a0a2c, 1],
                    [1, 0x05061a, 1],
                ],
                { center: [0.45, 0.5], radius: 0.8 },
            ),
        );
        bloom.blendMode = 'add';
        line.blendMode = 'add';
        dust.blendMode = 'add';
        label.anchor.set(0.5);
        button.position.set(310, 180);
        button.addChild(bloom, body, dust, line, label);
        button.eventMode = 'static';
        button.cursor = 'pointer';
        button.hitArea = { contains: (x, y) => Math.abs(x) <= W / 2 && Math.abs(y) <= H / 2 };
        button.on('pointerover', () => (hot = 1));
        button.on('pointerout', () => (hot = 0));
        trackGesture(button, { onTap: () => (burst = 1) });
        stage.addChild(room, button);

        body.pill(-W / 2, -H / 2, W, H).fill({
            gradient: linear(
                [
                    [0, 0x1d1a8a, 1],
                    [1, 0x0f1150, 1],
                ],
                { from: [0, 0], to: [0, 1] },
            ),
            innerShadow: [
                { color: 0x000000, alpha: 0.45, y: 18, blur: 22, spread: 4 },
                { color: 0x8f7bff, alpha: 0.35, y: -2, blur: 6, blend: 'add' },
            ],
        });

        tick((t, dt) => {
            hover += (hot - hover) * Math.min(1, dt * 8);
            burst = Math.max(0, burst - dt * 1.4);
            head += dt * (0.05 + hover * 0.12 + burst * 0.4);
            const glow = 0.8 + hover * 0.3 + burst * 0.7;
            const pts = border(head, 0.035);

            bloom
                .clear()
                .pill(-W / 2, -H / 2, W, H)
                .fill({ color: 0x5b3dff, alpha: 0.35 * glow, blur: 60, spread: 10 })
                .polyline(pts)
                .stroke({ width: 26, gradient: halo, alpha: 0.75 * glow, blur: 16 });
            line.clear()
                .polyline(pts)
                .stroke({ width: 12, gradient: halo, alpha: glow, blur: 4 })
                .polyline(pts)
                .stroke({ width: 5, gradient: tube, cap: 'round' })
                .polyline(pts)
                .stroke({ width: 3, gradient: tube, alpha: 0.6, blur: 1.5 });
            // a star of light sits on the head of the border
            const [hx, hy] = onPill(head + 0.965);

            line.circle(hx, hy, 18)
                .fill({ color: 0xbffff6, alpha: 0.5 * glow, blur: 14 })
                .star(hx, hy, 4, 28 * glow, 1.2, 0, 0)
                .fill({ color: 0xffffff, alpha: 0.5, blur: 2 });
            dust.clear();
            for (const d of dots) {
                const a = (0.25 + 0.75 * Math.max(0, Math.sin(t * 1.6 + d.p)) ** 4) * (0.5 + hover * 0.5 + burst);

                dust.circle(d.x, d.y, d.r).fill({ color: 0xc7d2ff, alpha: Math.min(1, a * 0.7), blur: 0.4 });
            }
            button.scale.set(1 + burst * 0.03);
        });

        return undefined;
    },
});
