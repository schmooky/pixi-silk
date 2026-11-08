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
    title: 'Sunrise glow',
    size: [640, 440],
    // phones: a narrower card under the same sun
    phone: { size: [360, 440] },
    background: 0x260600,
    setup({ stage, tick, phone }) {
        // the sun's centre moves with the frame width
        const dx = phone ? -140 : 0;
        const orb = new SilkGraphics();
        const core = new SilkGraphics();
        const glass = new Glass({
            width: phone ? 312 : 360,
            height: phone ? 156 : 136,
            radius: 26,
            blur: 26,
            refraction: 10,
            frost: 0.1,
            tint: 0x3a0a00,
            tintAmount: 0.12,
        });
        const eyebrow = label('WORK SPACE', 11, 0xffd9b8, '600');
        const title = label('Enable Efficient Teamwork', phone ? 20 : 22, 0xffffff, '600');
        const body = label('Create a culture of clarity across every project.', 13, 0xffd9b8);

        eyebrow.style.letterSpacing = 1.4;
        eyebrow.position.set(24, 26);
        title.position.set(24, 44);
        body.position.set(24, 88);
        if (phone) {
            body.style.wordWrap = true;
            body.style.wordWrapWidth = 264;
        }
        glass.content.addChild(eyebrow, title, body);
        glass.position.set(phone ? 24 : 140, phone ? 268 : 280);
        stage.addChild(orb, core, glass);

        tick((t) => {
            const breathe = 1 + Math.sin(t * 0.8) * 0.03;
            const drift = Math.sin(t * 0.5) * 10;

            // shape 1: a red disc under layer blur 226
            orb.clear()
                .circle(320 + dx + drift * 0.3, 170, 150 * breathe)
                .fill({ color: 0xe5400f, blur: 90 })
                .circle(320 + dx, 190, 110)
                .fill({ color: 0xff5a14, alpha: 0.55, blur: 50 });
            // shape 2: a yellow peanut under layer blur 140, and shape 3: the same with a
            // progressive blur, 100 at the top to 0 at the bottom, so it sits on a crisp horizon
            const peanut = (g: SilkGraphics) =>
                g.ellipse(310 + dx + drift, 196, 92, 50).ellipse(330 + dx + drift * 0.6, 228, 112, 46);

            core.clear();
            peanut(core).fill({ color: 0xffb21f, alpha: 0.7, blur: 60, spread: 10 });
            peanut(core).fill({ color: 0xffe14a, blur: { from: 48, to: 0.5, angle: Math.PI / 2 } });
        });

        return undefined;
    },
});
