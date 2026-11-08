import { Container } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import type { AlignItems, FlexDirection, JustifyContent } from 'pixi-silk/layout';
import { SilkText } from 'pixi-silk/text';
import { FlexContainer, layoutDebug } from 'pixi-silk/ui/layout';
import { defineDemo } from './runtime';

// An auto-layout stack, like a Figma frame. Change the item count, direction, gap, padding and
// alignment: cards glide to their new slots on springs. The debug overlay draws the boxes and
// slots (blue), the padding (green), the gaps (pink) and real bounds (white). Hover a card.

const COLORS = [0x0a84ff, 0x5e5ce6, 0xbf5af2, 0xff375f, 0xff9f0a, 0x30d158, 0x64d2ff, 0xffd60a];
const W = 860;
const H = 420;

/** A card of its own size that redraws at its slot size, so `align: stretch` shows. */
function card(frame: FlexContainer, i: number): Container {
    const c = new Container();
    const g = new SilkGraphics();
    const t = new SilkText({ text: String(i + 1), fontWeight: 700, fontSize: 22, fill: 0xffffff, anchor: 0.5 });

    c.addChild(g, t);

    return frame.add(c, {
        minWidth: 70 + ((i * 37) % 4) * 18,
        minHeight: 56 + ((i * 53) % 3) * 22,
        onSize: (w, h) => {
            g.clear()
                .roundRect(0, 0, w, h, 14, 0.6)
                .fill(COLORS[i % COLORS.length]);
            t.position.set(w / 2, h / 2);
        },
    });
}

export default defineDemo({
    size: [W, H],
    background: 0x151517,
    controls: {
        items: { type: 'range', label: 'items', min: 1, max: 14, step: 1, value: 6 },
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
            value: 'start',
        },
        align: { type: 'select', label: 'align', options: ['start', 'center', 'end', 'stretch'], value: 'start' },
        debug: { type: 'toggle', label: 'debug', value: true },
    },
    setup({ silk, stage, params, tick }) {
        const frame = new FlexContainer({ ticker: silk.app.ticker, transition: true });
        // the layout debug overlay: boxes, padding, gaps, slots against real bounds. Hover a card.
        const debug = layoutDebug(silk.app, { enabled: true });
        const bg = new SilkGraphics();
        const cards: Container[] = [];
        let last = '';

        frame.resize(W, H);
        frame.add(bg, {
            position: 'absolute',
            inset: 0,
            animate: false,
            onSize: (w, h) => bg.clear().roundRect(0, 0, w, h, 20, 0.6).fill(0x1c1c1e),
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
                alignContent: 'start',
            });
            if (debug.enabled !== params.debug) debug.toggle();
        });

        return () => {
            debug.destroy();
            frame.destroy({ children: true });
        };
    },
});
