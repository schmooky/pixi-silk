import { Graphics } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { SilkRichText, SilkText } from 'pixi-silk/text';
import { defineDemo, FONT, INK, label, PALETTE } from './runtime';

// One line per script, then wrapped paragraphs without spaces and a line with inline icons.
// Stacked marks (Burmese, Thai, Vietnamese) grow the line instead of being cut, and outlines sit
// under every letter. Tick "boxes" to see each text's line boxes.
const SAMPLES: [string, string][] = [
    ['en', 'Order total 1,250.00'],
    ['vi', 'Cài đặt đã được lưu'],
    ['ru', 'Настройки сохранены'],
    ['el', 'Καλημέρα κόσμε'],
    ['ka', 'გამარჯობა სამყაროვ'],
    ['hi', 'नमस्ते दुनिया'],
    ['bn', 'স্বাগতম বন্ধু'],
    ['ta', 'வணக்கம் உலகம்'],
    ['th', 'สวัสดีชาวโลก'],
    ['my', 'မင်္ဂလာပါ ကမ္ဘာ'],
    ['km', 'សួស្តីពិភពលោក'],
    ['ja', 'こんにちは、世界'],
    ['zh', '你好，世界'],
    ['ko', '안녕하세요, 세계'],
    ['ar', 'المجموع 1,250.00'],
    ['he', 'סך הכול 1,250.00'],
];

export default defineDemo({
    title: 'Scripts, wrapping and inline icons',
    size: [720, 660],
    phone: { size: [360, 1180] },
    controls: {
        outline: { type: 'toggle', label: 'outline', value: true },
        boxes: { type: 'toggle', label: 'boxes', value: false },
    },
    setup({ stage, params, tick, width, phone }) {
        const size = phone ? 17 : 19;
        const texts: SilkText[] = [];
        const boxes = new Graphics();
        const col = phone ? width : width / 2;
        let y = 16;

        SAMPLES.forEach(([lang, text], i) => {
            const x = phone ? 0 : (i % 2) * col;

            if (!phone && i % 2 === 0 && i > 0) y += 34;
            if (phone && i > 0) y += 34;
            stage.addChild(label(lang, x + 16, y + 6, { fontSize: 11 }));
            const t = new SilkText({ text, fontFamily: FONT, fontSize: size, fill: INK.text });

            t.position.set(x + 48, y);
            texts.push(t);
        });
        y += 54;
        // paragraphs with no spaces to break at: they wrap between characters or words
        const paraW = phone ? width - 64 : col - 64;
        const paragraphs = [
            '今日は晴れです。「明日」も晴れる予報なので、公園まで散歩に出かけましょう。',
            'ကျေးဇူးပြု၍ သင့်အကောင့်ဆက်တင်များကို စစ်ဆေးပြီးမှ သိမ်းဆည်းပါ။',
            'กรุณาตรวจสอบการตั้งค่าบัญชีของคุณก่อนบันทึกการเปลี่ยนแปลง',
            '변경 사항은 저장 버튼을 누른 뒤에 적용됩니다.',
        ];
        const paraY = y;

        paragraphs.forEach((text, i) => {
            const x = phone ? 0 : (i % 2) * col;
            const top = phone ? paraY + i * 130 : paraY + Math.floor(i / 2) * 120;
            const t = new SilkText({
                text,
                fontFamily: FONT,
                fontSize: size - 3,
                fill: INK.muted,
                wordWrap: true,
                wordWrapWidth: paraW,
                wordBreak: i === 3 ? 'keep-all' : 'normal',
            });

            t.position.set(x + 48, top);
            texts.push(t);
        });
        y = phone ? paraY + 4 * 130 : paraY + 2 * 120;
        // inline icons: a SilkGraphics status dot on the cap height, a star on the line box
        const dot = () =>
            new SilkGraphics()
                .circle(0, 0, 10)
                .fill(PALETTE.green)
                .circle(0, 0, 5)
                .fill({ color: 0xffffff, alpha: 0.85 });
        const star = () => new SilkGraphics().star(0, 0, 5, 10, 4.5, 0, 1).fill(PALETTE.blue);
        const rich = [
            new SilkRichText({
                text: 'Online {dot} 1,250 {star} 4.8',
                fontFamily: FONT,
                fontSize: size + 3,
                fill: INK.text,
                inlines: {
                    dot: { object: dot, height: 'cap', margin: 3 },
                    star: { object: star, height: 'em', align: 'center', margin: 2 },
                },
            }),
            new SilkRichText({
                text: 'التقييم {star} 4.8 {dot}',
                fontFamily: FONT,
                fontSize: size + 3,
                fill: INK.text,
                inlines: {
                    dot: { object: dot, height: 'cap', margin: 3 },
                    star: { object: star, height: 'em', align: 'center', margin: 2 },
                },
            }),
            new SilkRichText({
                text: '評価 {star} 4.8、{dot} 1,250',
                fontFamily: FONT,
                fontSize: size + 3,
                fill: INK.text,
                inlines: {
                    dot: { object: dot, height: 'cap', margin: 3 },
                    star: { object: star, height: 'em', align: 'center', margin: 2 },
                },
            }),
        ];

        rich.forEach((r, i) => {
            const x = phone ? 0 : i === 2 ? 0 : i * col;
            const top = phone ? y + i * 48 : y + (i === 2 ? 52 : 0);

            r.position.set(x + 48, top);
            texts.push(r.textObject);
            stage.addChild(r);
        });
        stage.addChild(...texts.filter((t) => !t.parent), boxes);
        if (!phone) stage.addChild(new Graphics().rect(col - 0.5, 0, 1, 660).fill(INK.line));

        let outline: boolean | null = null;
        let shown: boolean | null = null;

        tick(() => {
            if (params.outline !== outline) {
                outline = params.outline;
                for (const t of texts) t.outline = outline ? { width: 2.5, color: 0x1d1d1f } : null;
            }
            if (params.boxes !== shown) shown = null;
            if (shown === null) {
                shown = params.boxes;
                boxes.clear();
                if (!shown) return;
                for (const t of texts) {
                    const parent = t.parent;
                    const p = !parent || parent === stage ? t.position : { x: parent.x + t.x, y: parent.y + t.y };

                    for (const line of t.lines) {
                        boxes
                            .rect(p.x + line.x, p.y + line.top, line.width, line.bottom - line.top)
                            .stroke({ width: 1, color: PALETTE.blue, alpha: 0.5 });
                    }
                }
            }
        });
    },
});
