import { Text, type TextStyleFontWeight } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { Glass } from 'pixi-silk/glass';
import { defineDemo } from './runtime';

const label = (text: string, size: number, color: number, weight: TextStyleFontWeight = '500') =>
    new Text({
        text,
        style: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: size, fill: color, fontWeight: weight },
    });

export default defineDemo({
    size: [640, 440],
    background: 0x260600,
    setup({ stage, tick }) {
        const orb = new SilkGraphics();
        const core = new SilkGraphics();
        const glass = new Glass({
            width: 300,
            height: 130,
            radius: 26,
            blur: 26,
            refraction: 10,
            frost: 0.1,
            tint: 0x3a0a00,
            tintAmount: 0.12,
        });
        const eyebrow = label('WORK SPACE', 10, 0xffd9b8, '600');
        const title = label('Enable Efficient Teamwork', 20, 0xffffff, '600');
        const body = label('Create a culture of clarity across every project.', 12, 0xffd9b8);

        eyebrow.style.letterSpacing = 1.4;
        eyebrow.position.set(24, 26);
        title.position.set(24, 46);
        body.position.set(24, 86);
        glass.content.addChild(eyebrow, title, body);
        glass.position.set(170, 286);
        stage.addChild(orb, core, glass);

        tick((t) => {
            const breathe = 1 + Math.sin(t * 0.8) * 0.03;
            const drift = Math.sin(t * 0.5) * 10;

            // shape 1: a red disc under layer blur 226
            orb.clear()
                .circle(320 + drift * 0.3, 170, 150 * breathe)
                .fill({ color: 0xe5400f, blur: 90 })
                .circle(320, 190, 110)
                .fill({ color: 0xff5a14, alpha: 0.55, blur: 50 });
            // shape 2: a yellow peanut under layer blur 140, and shape 3: the same with a
            // progressive blur, 100 at the top to 0 at the bottom, so it sits on a crisp horizon
            const peanut = (g: SilkGraphics) =>
                g.ellipse(310 + drift, 196, 92, 50).ellipse(330 + drift * 0.6, 228, 112, 46);

            core.clear();
            peanut(core).fill({ color: 0xffb21f, alpha: 0.7, blur: 60, spread: 10 });
            peanut(core).fill({ color: 0xffe14a, blur: { from: 48, to: 0.5, angle: Math.PI / 2 } });
        });

        return undefined;
    },
});
