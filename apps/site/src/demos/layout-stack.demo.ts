import { Container } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import type { AlignItems, FlexDirection, JustifyContent } from 'pixi-silk/layout';
import { SilkText } from 'pixi-silk/text';
import { FlexContainer, layoutDebug } from 'pixi-silk/ui/layout';
import { defineDemo, INK, PAD, SERIES } from './runtime';

// An auto-layout stack, like a Figma frame. Change the item count, direction, gap, padding and
// alignment: cards glide to their new places on springs. The debug overlay draws the boxes and
// cells (blue), the padding (green), the gaps (pink) and real bounds (white). Tick debug, then
// hover a card.

const COLORS = SERIES;
const W = 720;
const H = 420;

/** A card of its own size that redraws at its cell size, so `align: stretch` shows. */
function card(frame: FlexContainer, i: number): Container {
    const c = new Container();
    const g = new SilkGraphics();
    const t = new SilkText({ text: String(i + 1), fontWeight: 700, fontSize: 22, fill: 0xffffff, anchor: 0.5 });

    c.addChild(g, t);

    return frame.add(c, {
        minWidth: 92 + (i % 3) * 16,
        minHeight: 64 + (i % 2) * 16,
        onSize: (w, h) => {
            g.clear()
                .roundRect(0, 0, w, h, 14, 0.6)
                .fill(COLORS[i % COLORS.length]);
            t.position.set(w / 2, h / 2);
        },
    });
}

export default defineDemo({
    title: 'Flex stack',
    size: [W, H],
    controls: {
        items: { type: 'range', label: 'items', min: 1, max: 14, step: 1, value: 8 },
        direction: {
            type: 'select',
            label: 'direction',
            options: ['row', 'column', 'row-reverse', 'column-reverse'],
            value: 'row',
        },
        wrap: { type: 'toggle', label: 'wrap', value: true },
        gap: { type: 'range', label: 'gap', min: 0, max: 40, step: 1, value: 12, unit: 'px' },
        padding: { type: 'range', label: 'padding', min: 0, max: 60, step: 1, value: 24, unit: 'px' },
        justify: {
            type: 'select',
            label: 'justify',
            options: ['start', 'center', 'end', 'space-between', 'space-around', 'space-evenly'],
            value: 'center',
        },
        align: { type: 'select', label: 'align', options: ['start', 'center', 'end', 'stretch'], value: 'center' },
        debug: { type: 'toggle', label: 'debug', value: false },
    },
    setup({ silk, stage, params, tick }) {
        const frame = new FlexContainer({ ticker: silk.app.ticker, transition: true });
        // the layout debug overlay: boxes, padding, gaps, cells against real bounds. Hover a card.
        const debug = layoutDebug(silk.app, { enabled: false });
        const bg = new SilkGraphics();
        const cards: Container[] = [];
        let last = '';

        frame.resize(W - 2 * PAD, H - 2 * PAD);
        frame.position.set(PAD, PAD);
        frame.add(bg, {
            position: 'absolute',
            inset: 0,
            animate: false,
            onSize: (w, h) => bg.clear().roundRect(0, 0, w, h, 20, 0.6).fill(INK.surface),
        });
        stage.addChild(frame);

        tick(() => {
            const key = JSON.stringify(params);

            if (key === last) return;
            last = key;
            while (cards.length < params.items) cards.push(card(frame, cards.length));
            while (cards.length > params.items) cards.pop()?.destroy({ children: true });
            frame.setStyle({
                direction: params.direction as FlexDirection,
                wrap: params.wrap ? 'wrap' : 'nowrap',
                gap: params.gap,
                padding: params.padding,
                justifyContent: params.justify as JustifyContent,
                alignItems: params.align as AlignItems,
                alignContent: 'center',
            });
            if (debug.enabled !== params.debug) debug.toggle();
        });

        return () => {
            debug.destroy();
            frame.destroy({ children: true });
        };
    },
});
