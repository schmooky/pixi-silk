import { SilkGraphics } from 'pixi-silk';
import { ChannelSliders, ColorModel, checker, OklchPicker } from 'pixi-silk/ui/color';
import { defineDemo } from './runtime';

// Lightness against chroma for one OKLCH hue. The grey area is outside sRGB; dragging into it
// slides along the edge. The sliders edit the same colour in the chosen space.
export default defineDemo({
    title: 'OKLCH picker',
    size: [600, 260],
    touchAction: 'none',
    // phones: the plane above the sliders
    phone: { size: [360, 430] },
    controls: {
        sliders: { type: 'select', label: 'sliders', options: ['oklch', 'hsv', 'rgb'], value: 'oklch' },
    },
    setup({ silk, stage, params, tick, phone }) {
        const ticker = silk.app.ticker;
        const model = new ColorModel({ color: 0xbf5af2 });
        const plane = new OklchPicker({ model, width: phone ? 320 : 260, height: phone ? 170 : 180, ticker });
        // top left corner of the sliders, and how far below them the preview sits
        const side: [number, number] = phone ? [20, 244] : [330, 24];
        const below = phone ? 130 : 172;
        const preview = new SilkGraphics();
        let mode = '';
        let sliders: ChannelSliders | null = null;

        plane.position.set(20, 20);
        preview.position.set(side[0], side[1] + below);
        stage.addChild(plane, preview);

        tick(() => {
            if (params.sliders !== mode) {
                mode = params.sliders;
                sliders?.destroy();
                sliders = new ChannelSliders({
                    model,
                    mode: params.sliders as 'oklch',
                    width: phone ? 298 : 220,
                    ticker,
                });
                sliders.position.set(side[0], side[1]);
                stage.addChild(sliders);
            }
            preview.clear();
            checker(preview, 22, 0, phone ? 296 : 220, 36, 10, 9);
            preview.roundRect(22, 0, phone ? 296 : 220, 36, 10).fill({ color: model.hex, alpha: model.alpha });
        });

        return undefined;
    },
});
