import type { Container } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { SilkText } from 'pixi-silk/text';
import { type FitMode, FlexContainer } from 'pixi-silk/ui/layout';
import { defineDemo, INK, PALETTE } from './runtime';

// The same 200x120 artwork in five boxes, one per fit mode, like CSS object-fit. Resize the
// boxes and move the alignment. The last box shrinks a long title to fit, down to a floor.

const MODES: FitMode[] = ['none', 'contain', 'cover', 'scale-down', 'fill'];
const ALIGN: Record<string, [number, number]> = { center: [0.5, 0.5], start: [0, 0], end: [1, 1] };

/** A 200x120 card: sky, sun and hills. */
function artwork(): Container {
    const g = new SilkGraphics();

    // everything stays inside the card, so its bounds are exactly 200x120
    g.roundRect(0, 0, 200, 120, 16, 0.6).fill(PALETTE.blue);
    g.circle(150, 38, 18).fill(PALETTE.yellow);
    g.poly([0, 84, 50, 62, 110, 86, 160, 70, 200, 82, 200, 104, 184, 120, 16, 120, 0, 104]).fill(PALETTE.green);

    return g;
}

export default defineDemo({
    title: 'Fit modes',
    size: [720, 360],
    // phones: three rows of two boxes, and labels one step larger
    phone: { size: [440, 520] },
    controls: {
        width: { type: 'range', label: 'box width', min: 60, max: 200, step: 1, value: 170, unit: 'px' },
        height: { type: 'range', label: 'box height', min: 50, max: 120, step: 1, value: 100, unit: 'px' },
        align: { type: 'select', label: 'fitAlign', options: ['center', 'start', 'end'], value: 'center' },
    },
    setup({ silk, stage, params, tick, width, height, phone }) {
        // two rows of three boxes, or three rows of two on phones
        const perRow = phone ? 2 : 3;
        const grid = new FlexContainer({
            ticker: silk.app.ticker,
            layout: {
                direction: 'column',
                gap: 18,
                padding: phone ? 16 : 24,
                alignItems: 'center',
                ...(phone ? { justifyContent: 'center' as const } : {}),
            },
        });
        const rows = Array.from({ length: 6 / perRow }, () =>
            grid.add(
                new FlexContainer({ layout: { gap: phone ? 16 : 24, justifyContent: 'center', alignItems: 'start' } }),
            ),
        );
        const boxes: { box: FlexContainer; art: Container }[] = [];
        const label = (text: string) => new SilkText({ text, fontSize: phone ? 14 : 13, fill: INK.muted });
        const makeBox = (title: string) => {
            const column = rows[Math.floor(boxes.length / perRow)].add(
                new FlexContainer({ layout: { direction: 'column', gap: 10, alignItems: 'center' } }),
            );
            const box = column.add(new FlexContainer());
            const frame = new SilkGraphics();
            const clip = new SilkGraphics();

            // the box outline, drawn at its size
            box.add(frame, {
                position: 'absolute',
                inset: 0,
                onSize: (w, h) => {
                    frame.clear().roundRect(0, 0, w, h, 10).fill(INK.surface).stroke({ width: 1, color: INK.line });
                    clip.clear().roundRect(0, 0, w, h, 10).fill(0xffffff);
                },
            });
            // the mask clips cover and fill to the box. It goes on the box, not on the child:
            // a masked child measures only what its mask shows.
            box.add(clip, { position: 'absolute', inset: 0, onSize: () => {} });
            box.mask = clip;
            column.add(label(title));

            return box;
        };

        for (const fit of MODES) {
            const box = makeBox(fit);

            boxes.push({ box, art: box.add(artwork(), { fit }) });
        }
        // text shrink-to-fit: scale-down with a minimum scale
        const textBox = makeBox('scale-down text');
        const text = textBox.add(
            new SilkText({ text: 'Quarterly report', fontWeight: 800, fontSize: 30, fill: INK.text }),
            {
                fit: 'scale-down',
                minScale: 0.35,
            },
        );

        stage.addChild(grid);
        grid.resize(width, height);

        let last = '';

        tick(() => {
            const key = JSON.stringify(params);

            if (key === last) return;
            last = key;
            const fitAlign = ALIGN[params.align];

            for (const { box, art } of boxes) {
                box.setStyle({ width: params.width, height: params.height });
                box.setLayout(art, { ...box.getLayout(art), fitAlign });
            }
            textBox.setStyle({ width: params.width, height: params.height });
            textBox.setLayout(text, { ...textBox.getLayout(text), fitAlign });
        });

        return () => grid.destroy({ children: true });
    },
});
