import { Graphics } from 'pixi.js';
import { SilkText } from 'pixi-silk/text';
import { defineDemo, FONT, INK, label, PALETTE } from './runtime';

// Three ways to keep long text in its box. Drag the width: the boxes follow it.
// Left: two lines at most, then an ellipsis. Middle: the font shrinks to fit, then cuts.
// Right: justified paragraphs, with kashida in the Arabic one.
const LONG = 'Changes are saved on this device and sync to your other devices when you are back online.';
const ARABIC = 'يتم حفظ التغييرات على هذا الجهاز وتتم مزامنتها مع أجهزتك الأخرى عند الاتصال بالإنترنت.';

export default defineDemo({
    title: 'Long text in a small box',
    size: [720, 420],
    phone: { size: [360, 900] },
    controls: {
        width: { type: 'range', label: 'width', min: 120, max: 220, step: 1, value: 190, unit: 'px' },
    },
    setup({ stage, params, tick, phone }) {
        const style = { fontFamily: FONT, fill: INK.text };
        const cut = new SilkText({ ...style, text: LONG, fontSize: 16, wordWrap: true, maxLines: 2 });
        const shrink = new SilkText({
            ...style,
            text: 'Synchronisation settings',
            fontSize: 22,
            fontWeight: 600,
            shrinkToFit: true,
            minFontSize: 13,
        });
        const justified = new SilkText({ ...style, text: LONG, fontSize: 15, wordWrap: true, align: 'justify' });
        const arabic = new SilkText({ ...style, text: ARABIC, fontSize: 16, wordWrap: true, align: 'justify' });
        const status = new SilkText({ fontFamily: FONT, fontSize: 12, fill: INK.muted });
        const boxes = new Graphics();
        const cols = phone ? [24, 24, 24] : [24, 264, 504];
        const tops = phone ? [40, 220, 400] : [40, 40, 40];

        ['maxLines: 2', 'shrinkToFit', "align: 'justify'"].forEach((t, i) =>
            stage.addChild(label(t, cols[i], tops[i] - 26, { fontSize: 12 })),
        );
        cut.position.set(cols[0], tops[0]);
        shrink.position.set(cols[1], tops[1]);
        justified.position.set(cols[2], tops[2]);
        arabic.position.set(cols[2], tops[2] + 150);
        status.position.set(cols[1], tops[1] + 50);
        stage.addChild(boxes, cut, shrink, justified, arabic, status);
        let last = -1;

        tick(() => {
            const w = params.width;

            if (w === last) return;
            last = w;
            cut.wordWrapWidth = w;
            shrink.maxWidth = w;
            justified.wordWrapWidth = w;
            arabic.wordWrapWidth = w;
            status.text = `drawn at ${shrink.renderedFontSize.toFixed(1)} px${shrink.truncated ? ', cut' : ''}`;
            boxes.clear();
            for (const [i, t] of [cut, shrink, justified, arabic].entries()) {
                const x = i < 2 ? cols[i] : cols[2];

                boxes
                    .rect(x - 0.5, t.y - 0.5, w + 1, Math.max(t.layout.height, 24) + 1)
                    .stroke({ width: 1, color: PALETTE.blue, alpha: 0.35 });
            }
        });
    },
});
