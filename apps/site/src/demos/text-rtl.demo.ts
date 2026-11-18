import { Graphics } from 'pixi.js';
import { SilkText } from 'pixi-silk/text';
import { defineDemo, FONT, INK, label, PALETTE } from './runtime';

// Arabic and Hebrew in SilkText. Numbers, prices, percentages and Latin words inside the
// right-to-left lines keep reading left to right. The right column zooms the first line in.
const LINES = [
    'مرحبا بالعالم',
    'السعر 1,234.56 دولار',
    'خصم 50% حتى ٢٠٢٦/١٢/٣١',
    'أنا أحب JavaScript كثيرا',
    'רשימת קניות (3 פריטים)',
];

export default defineDemo({
    title: 'Right-to-left text',
    size: [720, 360],
    phone: { size: [360, 520] },
    setup({ stage, width, phone }) {
        const col = phone ? width : 420;
        const top = 48;
        const step = phone ? 46 : 58;
        const size = phone ? 18 : 22;

        stage.addChild(label('SilkText, align start', 24, 16, { fontSize: 13 }));
        LINES.forEach((line, i) => {
            const t = new SilkText({
                text: line,
                fontFamily: FONT,
                fontSize: size,
                fill: i ? INK.text : PALETTE.blue,
                anchor: { x: 1, y: 0 },
            });

            t.position.set(col - 24, top + i * step);
            stage.addChild(t);
        });
        // the same glyphs at 4x: joined letters stay smooth, the dots stay round
        const x0 = phone ? 0 : col;
        const y0 = phone ? 330 : 0;
        const zoom = new SilkText({
            text: 'بالعالم',
            fontFamily: FONT,
            fontSize: size,
            fill: PALETTE.blue,
            anchor: 0.5,
        });

        zoom.scale.set(phone ? 3 : 4);
        zoom.position.set(x0 + (width - x0) / 2, y0 + (phone ? 110 : 190));
        stage.addChild(zoom, label('4x', x0 + 24, y0 + 16, { fontSize: 13 }));
        if (phone) stage.addChild(new Graphics().rect(0, y0 - 0.5, width, 1).fill(INK.line));
        else stage.addChild(new Graphics().rect(col - 0.5, 0, 1, 360).fill(INK.line));
    },
});
