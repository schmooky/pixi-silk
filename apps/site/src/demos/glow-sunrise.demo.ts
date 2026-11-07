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
            height: 150,
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

        core.blendMode = 'add';
        eyebrow.style.letterSpacing = 1.4;
        eyebrow.position.set(24, 26);
        title.position.set(24, 46);
        body.position.set(24, 86);
        glass.content.addChild(eyebrow, title, body);
        glass.position.set(150, 250);
        stage.addChild(orb, core, glass);

        tick((t) => {
            const breathe = 1 + Math.sin(t * 0.8) * 0.04;
            const drift = Math.sin(t * 0.5) * 18;

            orb.clear()
                .ellipse(300 + drift * 0.4, 190, 210 * breathe, 190 * breathe)
                .fill({ color: 0xe8401c, alpha: 0.9, blur: 70 });
            core.clear()
                .ellipse(285 + drift, 250, 150 * breathe, 70)
                .fill({ color: 0xffd23f, alpha: 0.95, blur: { from: 70, to: 6, angle: Math.PI / 2 } })
                .ellipse(330 - drift * 0.5, 262, 120, 52)
                .fill({ color: 0xffe36b, alpha: 0.9, blur: 45 })
                .ellipse(300, 290, 170, 30)
                .fill({ color: 0xfff4c2, alpha: 0.7, blur: 30 });
        });

        return undefined;
    },
});
