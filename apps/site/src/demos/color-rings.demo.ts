import { SilkGraphics } from 'pixi-silk';
import { ColorModel, ColorWheel, HueSquarePicker, HueTrianglePicker, SwatchPalette } from 'pixi-silk/ui/color';
import { defineDemo } from './runtime';

// Three pickers bound to one model: drag any of them and the others follow. Releasing a drag
// commits the colour into the recent row at the bottom.
export default defineDemo({
    title: 'Colour rings',
    size: [740, 330],
    touchAction: 'none',
    // phones: triangle and square side by side under the Studio link, the wheel under them
    phone: { size: [360, 490] },
    setup({ silk, stage, tick, phone }) {
        const ticker = silk.app.ticker;
        const model = new ColorModel({ color: 0x30d158 });
        const triangle = new HueTrianglePicker({ model, size: phone ? 160 : 220, ticker });
        const square = new HueSquarePicker({ model, size: phone ? 160 : 220, ticker });
        const wheel = new ColorWheel({ model, size: phone ? 200 : 196, ticker });
        const recent = new SwatchPalette({ model, columns: phone ? 8 : 12, size: 26, gap: 8, ticker });
        const chip = new SilkGraphics();

        if (phone) {
            triangle.position.set(14, 40);
            square.position.set(186, 40);
            wheel.position.set(80, 218);
            recent.position.set(60, 442);
            chip.position.set(16, 442);
        } else {
            triangle.position.set(20, 16);
            square.position.set(262, 16);
            wheel.position.set(506, 28);
            recent.position.set(64, 278);
            chip.position.set(20, 278);
        }
        stage.addChild(triangle, square, wheel, recent, chip);
        for (const c of [0xff453a, 0xffd60a, 0x0a84ff]) {
            model.setHex(c);
            model.commit();
        }
        model.setHex(0x30d158);

        tick(() => {
            chip.clear().roundRect(0, 0, 32, 26, 8).fill(model.hex);
        });

        return undefined;
    },
});
