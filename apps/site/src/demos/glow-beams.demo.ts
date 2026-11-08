import { Container, Text } from 'pixi.js';
import { along, linear, radial, SilkGraphics } from 'pixi-silk';
import { bolt } from 'pixi-silk/glow';
import { defineDemo, PAD } from './runtime';

const W = 760;
const mono = 'ui-monospace, SF Mono, Menlo, monospace';

/** A beam pinched in the middle: full height `h` at both ends, `waist` at the centre. */
function hourglass(g: SilkGraphics, cx: number, cy: number, w: number, h: number, waist: number): SilkGraphics {
    const x0 = cx - w / 2;
    const x1 = cx + w / 2;
    const t = cy - h / 2;
    const b = cy + h / 2;

    return g
        .beginPath()
        .moveTo(x0, t)
        .bezierCurveTo(x0 + w * 0.22, cy - h * 0.1, cx - w * 0.12, cy - waist / 2, cx, cy - waist / 2)
        .bezierCurveTo(cx + w * 0.12, cy - waist / 2, x1 - w * 0.22, cy - h * 0.1, x1, t)
        .lineTo(x1, b)
        .bezierCurveTo(x1 - w * 0.22, cy + h * 0.1, cx + w * 0.12, cy + waist / 2, cx, cy + waist / 2)
        .bezierCurveTo(cx - w * 0.12, cy + waist / 2, x0 + w * 0.22, cy + h * 0.1, x0, b)
        .closePath();
}

function label(text: string, x: number, y: number, color: number, anchorX = 0): Text {
    const t = new Text({ text, style: { fontFamily: mono, fontSize: 14, fill: color } });

    t.anchor.set(anchorX, 0);
    t.position.set(x, y);

    return t;
}

export default defineDemo({
    title: 'Beams and bolts',
    size: [720, 520],
    // phones: the three panels stack in one column
    phone: { size: [360, 840] },
    setup({ stage: frame, tick, width, height, phone }) {
        // the panels are drawn at 760 wide (370 on phones) and inset by the shared padding
        const stage = new Container();
        const hw = phone ? 370 : W;
        const drawn = phone ? 800 : 520;
        const fit = (width - 2 * PAD) / hw;

        stage.scale.set(fit);
        stage.position.set(PAD, (height - drawn * fit) / 2);
        frame.addChild(stage);

        // 1. hero light: three hourglass layers with layer blur 100, 55 and 24, as in the Figma file
        const hero = new Container();
        const heroBg = new SilkGraphics();
        const beam = new SilkGraphics();
        const heroClip = new SilkGraphics();

        heroBg.roundRect(0, 0, hw, 240, 18, 0.6).fill(0x05031a);
        heroClip.roundRect(0, 0, hw, 240, 18, 0.6).fill(0xffffff);
        beam.mask = heroClip;
        hero.addChild(heroBg, beam, heroClip);

        // 2. chromatic wave
        const wavePanel = new Container();
        const waveBg = new SilkGraphics();
        const wave = new SilkGraphics();
        const waveClip = new SilkGraphics();

        waveBg.roundRect(0, 0, 370, 260, 18, 0.6).fill(0x0b0b0c);
        waveClip.roundRect(0, 0, 370, 260, 18, 0.6).fill(0xffffff);
        wave.mask = waveClip;
        wavePanel.addChild(waveBg, wave, waveClip);
        wavePanel.position.set(0, 260);

        // 3. the bolt cut into strips, each smeared sideways
        const speed = new Container();
        const card = new SilkGraphics();
        const strips = 14;
        const top = 58;
        const bh = 154;
        const paint = linear(
            [
                [0, 0xffc2a8, 1],
                [0.4, 0xe05bd0, 1],
                [1, 0x6a3df0, 1],
            ],
            { from: [1, 0], to: [0.15, 1] },
        );
        const arts: SilkGraphics[] = [];
        // the white core is brightest in the middle and lets the colour fringes show at the ends
        const core = along([
            [0, 0xffffff, 0.35],
            [0.5, 0xffffff, 1],
            [1, 0xffffff, 0.35],
        ]);

        card.roundRect(0, 0, 370, 260, 18, 0.6)
            .fill(0x0f0d0f)
            .roundRect(10, 10, 350, 240, 12, 0.6)
            .fill(
                radial(
                    [
                        [0, 0x241821, 1],
                        [1, 0x120f12, 1],
                    ],
                    { center: [0.55, 0.5], radius: 0.7 },
                ),
            )
            .stroke({ width: 1, color: 0xffffff, alpha: 0.05, alignment: 'inside' });
        speed.addChild(card);
        for (let i = 0; i < strips; i++) {
            const art = new SilkGraphics();
            const clip = new SilkGraphics();
            const y = top + (i * bh) / strips;

            clip.rect(10, y, 350, bh / strips).fill(0xffffff);
            art.mask = clip;
            art.blendMode = 'add';
            speed.addChild(art, clip);
            arts.push(art);
        }
        speed.addChild(
            label('Test sample #07', 26, 22, 0x8a7484),
            label('Render complete', 344, 22, 0xd9a0b8, 1),
            label('Speed: ON', 26, 220, 0x8a7484),
            label('400 ms', 344, 220, 0x8a7484, 1),
        );
        if (phone) speed.position.set(0, 540);
        else speed.position.set(390, 260);

        stage.addChild(hero, wavePanel, speed);

        tick((t) => {
            const breathe = 1 + Math.sin(t * 0.9) * 0.06;

            beam.clear();
            hourglass(beam, hw / 2, 150, 900, 300 * breathe, 30).fill({ color: 0x6a4cff, blur: 50 });
            hourglass(beam, hw / 2, 150, 860, 220 * breathe, 14).fill({ color: 0xa48bff, blur: 27 });
            hourglass(beam, hw / 2, 150, 820, 120 * breathe, 4).fill({ color: 0xece6ff, blur: 12 });

            const pts = (dy: number) => {
                const out: number[] = [];

                for (let x = -20; x <= 390; x += 5) {
                    out.push(x, 128 + dy - Math.sin(x / 75 + 1.2 + t * 0.8) * 46 + x * 0.04);
                }

                return out;
            };
            const smooth = { smooth: 'catmull' as const };

            wave.clear()
                .polyline(pts(0), smooth)
                .stroke({ width: 90, color: 0xffffff, alpha: 0.12, blur: 36, blend: 'add' })
                .polyline(pts(-19), smooth)
                .stroke({ width: 9, color: 0xff2a14, alpha: 0.95, blur: 3.5, blend: 'add' })
                .polyline(pts(-12), smooth)
                .stroke({ width: 9, color: 0xff9a1a, alpha: 0.95, blur: 3, blend: 'add' })
                .polyline(pts(13), smooth)
                .stroke({ width: 9, color: 0x2a62ff, alpha: 1, blur: 3, blend: 'add' })
                .polyline(pts(0), smooth)
                .stroke({ width: 20, gradient: core, blur: 2.5, blend: 'add' })
                .polyline(pts(0), smooth)
                .stroke({ width: 34, gradient: core, alpha: 0.45, blur: 9, blend: 'add' });

            arts.forEach((art, i) => {
                // longer smears in the middle of the bolt, a slow ripple through the strips
                const f = i / (strips - 1);
                const smear = 30 + 70 * Math.sin(Math.PI * f) * (0.75 + 0.25 * Math.sin(t * 2.4 + i * 0.7));

                art.clear();
                for (let k = 3; k >= 0; k--) {
                    bolt(art, 150 - smear * (k / 3), top, 120, bh).fill({
                        gradient: paint,
                        alpha: k === 0 ? 0.9 : 0.22,
                        blur: { from: 0.6 + k * 2, to: 10 + k * 6, angle: Math.PI },
                    });
                }
            });
        });

        return undefined;
    },
});
