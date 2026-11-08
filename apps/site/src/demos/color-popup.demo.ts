import { Container } from 'pixi.js';
import { horizontal, SilkGraphics, vertical } from 'pixi-silk';
import { SilkButton } from 'pixi-silk/ui/button';
import { ColorModel, Eyedropper, hsvToRgb, rgbToHex, SwatchPalette, SwatchPopup } from 'pixi-silk/ui/color';
import { defineDemo } from './runtime';

// Press anywhere on the artwork for the swatch ring: drag to a colour and let go, or tap to keep
// it open. The pipette samples the artwork (the app supplies the sampler, here plain maths).
const W = 600;
const H = 260;
const ART = { x: 20, y: 20, w: 420, h: 220 };
/** Colour of the artwork at a design-space point: hue across, value down. */
const artColor = (x: number, y: number): number | null => {
    const u = (x - ART.x) / ART.w;
    const v = (y - ART.y) / ART.h;

    return u < 0 || u > 1 || v < 0 || v > 1 ? null : rgbToHex(hsvToRgb(u * 360, 0.85, 1 - v * 0.8));
};
const pipette = (g: SilkGraphics, s: number) => {
    g.line(-s * 0.32, s * 0.32, s * 0.12, -s * 0.12).stroke({ width: s * 0.16, cap: 'round', color: 0xffffff });
    g.circle(s * 0.22, -s * 0.22, s * 0.16).fill(0xffffff);
};

export default defineDemo({
    title: 'Colour popup',
    size: [W, H],
    touchAction: 'none',
    setup({ silk, stage }) {
        const ticker = silk.app.ticker;
        const model = new ColorModel({ color: 0xff9f0a });
        const art = new SilkGraphics();
        const surface = new Container();
        const popup = new SwatchPopup({
            model,
            colors: [0xff453a, 0xff9f0a, 0xffd60a, 0x30d158, 0x64d2ff, 0x0a84ff, 0xbf5af2, 0xffffff],
            ticker,
        });
        const chip = new SilkGraphics();
        const recent = new SwatchPalette({ model, columns: 4, size: 26, gap: 8, ticker });
        const dropper = new Eyedropper({
            model,
            ticker,
            // global canvas point -> design space of the demo
            sample: (gx, gy) => {
                const p = stage.toLocal({ x: gx, y: gy });

                return artColor(p.x, p.y);
            },
        });
        const button = new SilkButton({
            shape: 'circle',
            height: 44,
            icon: pipette,
            ticker,
            theme: { fill: 0x2c2c2e, fillHover: 0x3a3a3c, fillPress: 0x1c1c1e },
            onPress: () => dropper.start(),
        });

        art.roundRect(ART.x, ART.y, ART.w, ART.h, 14).fill({
            gradient: horizontal([0xff0000, 0xffff00, 0x00ff00, 0x00ffff, 0x0000ff, 0xff00ff, 0xff0000], {
                space: 'srgb',
            }),
        });
        art.roundRect(ART.x, ART.y, ART.w, ART.h, 14).fill({ color: 0xffffff, alpha: 0.15 });
        art.roundRect(ART.x, ART.y, ART.w, ART.h, 14).fill({
            gradient: vertical(
                [
                    [0, 0x000000, 0],
                    [1, 0x000000, 0.8],
                ],
                { space: 'srgb' },
            ),
        });
        surface.eventMode = 'static';
        surface.hitArea = { contains: (x, y) => x >= ART.x && y >= ART.y && x <= ART.x + ART.w && y <= ART.y + ART.h };
        surface.on('pointerdown', (e) => {
            const p = stage.toLocal(e.global);

            popup.openAt(p.x, p.y, e);
        });
        button.position.set(482, 42);
        chip.position.set(520, 20);
        recent.position.set(462, 96);
        stage.addChild(art, surface, chip, recent, button, popup, dropper);
        model.value.subscribe(() => chip.clear().roundRect(0, 0, 60, 44, 12).fill(model.hex));
        chip.roundRect(0, 0, 60, 44, 12).fill(model.hex);

        return undefined;
    },
});
