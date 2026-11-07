import { SilkGraphics } from 'pixi-silk';
import { ChannelSliders, ColorModel, checker, OklchPicker } from 'pixi-silk/ui/color';
import { defineDemo } from './runtime';

// Lightness against chroma for one OKLCH hue. The grey area is outside sRGB; dragging into it
// slides along the edge. The sliders edit the same colour in the chosen space.
export default defineDemo({
    size: [600, 260],
    touchAction: 'none',
    controls: {
        sliders: { type: 'select', label: 'sliders', options: ['oklch', 'hsv', 'rgb'], value: 'oklch' },
    },
    setup({ silk, stage, params, tick }) {
        const ticker = silk.app.ticker;
        const model = new ColorModel({ color: 0xbf5af2 });
        const plane = new OklchPicker({ model, width: 260, height: 180, ticker });
        const preview = new SilkGraphics();
        let mode = '';
        let sliders: ChannelSliders | null = null;

        plane.position.set(20, 20);
        preview.position.set(330, 196);
        stage.addChild(plane, preview);

        tick(() => {
            if (params.sliders !== mode) {
                mode = params.sliders;
                sliders?.destroy();
                sliders = new ChannelSliders({ model, mode: params.sliders as 'oklch', width: 220, ticker });
                sliders.position.set(330, 24);
                stage.addChild(sliders);
            }
            preview.clear();
            checker(preview, 22, 0, 220, 36, 10, 9);
            preview.roundRect(22, 0, 220, 36, 10).fill({ color: model.hex, alpha: model.alpha });
        });

        return undefined;
    },
});
