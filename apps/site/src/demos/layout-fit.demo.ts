import type { Container } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { SilkText } from 'pixi-silk/text';
import { type FitMode, FlexContainer } from 'pixi-silk/ui/layout';
import { defineDemo } from './runtime';

// The same 200x120 artwork in five slots, one per fit mode, like CSS object-fit. Resize the
// slots and move the alignment. The last slot shrinks a long text to fit, down to a floor.

const MODES: FitMode[] = ['none', 'contain', 'cover', 'scale-down', 'fill'];
const ALIGN: Record<string, [number, number]> = { center: [0.5, 0.5], start: [0, 0], end: [1, 1] };

/** A 200x120 card: sky, sun and hills. */
function artwork(): Container {
    const g = new SilkGraphics();

    // everything stays inside the card, so its bounds are exactly 200x120
    g.roundRect(0, 0, 200, 120, 16, 0.6).fill(0x0a84ff);
    g.circle(150, 38, 18).fill(0xffd60a);
    g.poly([0, 84, 50, 62, 110, 86, 160, 70, 200, 82, 200, 104, 184, 120, 16, 120, 0, 104]).fill(0x30d158);

    return g;
}

export default defineDemo({
    size: [900, 360],
    background: 0x151517,
    controls: {
        width: { type: 'range', label: 'slot width', min: 60, max: 130, step: 1, value: 120, unit: 'px' },
        height: { type: 'range', label: 'slot height', min: 60, max: 220, step: 1, value: 180, unit: 'px' },
        align: { type: 'select', label: 'fitAlign', options: ['center', 'start', 'end'], value: 'center' },
    },
    setup({ silk, stage, params, tick }) {
        const row = new FlexContainer({
            ticker: silk.app.ticker,
            layout: { gap: 14, padding: [24, 16], justifyContent: 'center', alignItems: 'start' },
        });
        const slots: { box: FlexContainer; art: Container }[] = [];
        const label = (text: string) => new SilkText({ text, fontSize: 14, fill: 0x8e8e93 });
        const slot = (title: string) => {
            const column = row.add(
                new FlexContainer({ layout: { direction: 'column', gap: 10, alignItems: 'center' } }),
            );
            const box = column.add(new FlexContainer());
            const frame = new SilkGraphics();
            const clip = new SilkGraphics();

            // the slot outline, drawn at its size
            box.add(frame, {
                position: 'absolute',
                inset: 0,
                onSize: (w, h) => {
                    frame.clear().roundRect(0, 0, w, h, 10).fill(0x232326).stroke({ width: 1, color: 0x48484a });
                    clip.clear().roundRect(0, 0, w, h, 10).fill(0xffffff);
                },
            });
            // the mask clips cover and fill to the slot. It goes on the slot, not on the child:
            // a masked child measures only what its mask shows.
            box.add(clip, { position: 'absolute', inset: 0, onSize: () => {} });
            box.mask = clip;
            column.add(label(title));

            return box;
        };

        for (const fit of MODES) {
            const box = slot(fit);

            slots.push({ box, art: box.add(artwork(), { fit }) });
        }
        // text shrink-to-fit: scale-down with a minimum scale
        const textBox = slot('scale-down text');
        const text = textBox.add(
            new SilkText({ text: 'MEGA WIN 1,250,000', fontWeight: 800, fontSize: 30, fill: 0xffd60a }),
            {
                fit: 'scale-down',
                minScale: 0.35,
            },
        );

        stage.addChild(row);
        row.resize(900, 360);

        let last = '';

        tick(() => {
            const key = JSON.stringify(params);

            if (key === last) return;
            last = key;
            const fitAlign = ALIGN[params.align];

            for (const { box, art } of slots) {
                box.setStyle({ width: params.width, height: params.height });
                box.setLayout(art, { ...box.getLayout(art), fitAlign });
            }
            textBox.setStyle({ width: params.width, height: params.height });
            textBox.setLayout(text, { ...textBox.getLayout(text), fitAlign });
        });

        return () => row.destroy({ children: true });
    },
});
