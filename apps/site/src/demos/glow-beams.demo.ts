import { Container } from 'pixi.js';
import { linear, SilkGraphics } from 'pixi-silk';
import { defineDemo } from './runtime';

const W = 760;

const hourglass = (g: SilkGraphics, cx: number, cy: number, w: number, h: number, waist: number) =>
    g
        .triangle(cx - w / 2, cy - h / 2, cx - w / 2, cy + h / 2, cx, cy + waist / 2)
        .triangle(cx - w / 2, cy - h / 2, cx, cy - waist / 2, cx, cy + waist / 2)
        .triangle(cx + w / 2, cy - h / 2, cx + w / 2, cy + h / 2, cx, cy + waist / 2)
        .triangle(cx + w / 2, cy - h / 2, cx, cy - waist / 2, cx, cy + waist / 2);

const bolt = (g: SilkGraphics, x: number, y: number, s: number) =>
    g
        .triangle(x + s * 0.12, y - s * 0.5, x - s * 0.32, y + s * 0.08, x + s * 0.06, y + s * 0.02, 3)
        .triangle(x - s * 0.12, y + s * 0.5, x + s * 0.32, y - s * 0.08, x - s * 0.06, y - s * 0.02, 3);

export default defineDemo({
    size: [W, 560],
    background: 0x030305,
    setup({ stage, tick }) {
        const beam = new SilkGraphics();
        const wave = new SilkGraphics();
        const slices = new Container();
        const strips = 9;
        const paint = linear([0xff4fd8, 0x9b5cff], { from: [0, 0], to: [1, 1] });
        const sliceArt: SilkGraphics[] = [];

        beam.blendMode = 'add';
        wave.blendMode = 'add';
        for (let i = 0; i < strips; i++) {
            const art = new SilkGraphics();
            const clip = new SilkGraphics();

            art.blendMode = 'add';
            clip.rect(0, 440 + i * 20 - 90, W, 20).fill(0xffffff);
            art.mask = clip;
            slices.addChild(art, clip);
            sliceArt.push(art);
        }
        stage.addChild(beam, wave, slices);

        tick((t) => {
            const breathe = 1 + Math.sin(t * 1.3) * 0.08;

            beam.clear();
            hourglass(beam, W / 2, 95, 700, 150 * breathe, 10).fill({ color: 0x6a3cff, alpha: 0.75, blur: 34 });
            hourglass(beam, W / 2, 95, 640, 70 * breathe, 4).fill({ color: 0xb59cff, alpha: 0.85, blur: 14 });
            hourglass(beam, W / 2, 95, 720, 8, 1.5).fill({ color: 0xffffff, alpha: 0.9, blur: 2.5 });
            beam.ellipse(W / 2, 95, 120, 16).fill({ color: 0xffffff, alpha: 0.75, blur: 16 });

            const pts = (dy: number, phase: number) => {
                const out: number[] = [];

                for (let x = 20; x <= W - 20; x += 6) out.push(x, 270 + dy + Math.sin(x / 70 + t * 1.4 + phase) * 42);

                return out;
            };

            wave.clear();
            wave.polyline(pts(0, 0), { smooth: 'catmull' }).stroke({
                width: 34,
                color: 0xffffff,
                alpha: 0.12,
                blur: 22,
                cap: 'round',
            });
            wave.polyline(pts(-9, -0.08), { smooth: 'catmull' }).stroke({
                width: 10,
                color: 0xff3b1f,
                alpha: 0.75,
                blur: 9,
                cap: 'round',
            });
            wave.polyline(pts(-4, -0.04), { smooth: 'catmull' }).stroke({
                width: 6,
                color: 0xffa500,
                alpha: 0.7,
                blur: 5,
                cap: 'round',
            });
            wave.polyline(pts(9, 0.08), { smooth: 'catmull' }).stroke({
                width: 10,
                color: 0x2a5cff,
                alpha: 0.8,
                blur: 9,
                cap: 'round',
            });
            wave.polyline(pts(4, 0.04), { smooth: 'catmull' }).stroke({
                width: 6,
                color: 0x00d4ff,
                alpha: 0.6,
                blur: 5,
                cap: 'round',
            });
            wave.polyline(pts(0, 0), { smooth: 'catmull' }).stroke({
                width: 3,
                color: 0xffffff,
                blur: 1.2,
                cap: 'round',
            });

            sliceArt.forEach((art, i) => {
                const lag = Math.sin(t * 3 + i * 0.7) * 26 + (i % 2 ? 12 : -12);

                art.clear();
                for (let k = 3; k >= 0; k--) {
                    bolt(art, W / 2 + lag + k * lag * 0.6, 440, 170).fill({
                        gradient: paint,
                        alpha: k === 0 ? 1 : 0.22 / k,
                        blur: k === 0 ? 1 : 3 + k * 3,
                    });
                }
            });
        });

        return undefined;
    },
});
