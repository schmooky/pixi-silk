import { Container, Graphics } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { SilkText } from 'pixi-silk/text';
import { SmartContainer } from 'pixi-silk/ui/layout';
import { defineDemo } from './runtime';

// A slot game HUD on SmartContainer. Drag the width: under the screen height it turns portrait,
// the controls move under the reels, the win moves up to a banner and every piece glides to
// its new slot. The design is 960x540 (540x960 in portrait), scaled to the screen. Values shrink
// to fit their pills. Press SPIN for a new win.

const SCREEN_H = 460;
const GOLD = 0xffd60a;
const font = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

/** A 5 by 3 reel window with a few vector symbols. */
function reels(): Container {
    const g = new SilkGraphics();
    const cell = 100;

    g.roundRect(0, 0, cell * 5 + 20, cell * 3 + 20, 22, 0.6).fill(0x1c1c1e);
    for (let c = 0; c < 5; c++) {
        for (let r = 0; r < 3; r++) {
            const x = 10 + c * cell + cell / 2;
            const y = 10 + r * cell + cell / 2;
            const kind = (c * 7 + r * 3) % 5;

            g.roundRect(x - 44, y - 44, 88, 88, 18, 0.6).fill(0x2c2c2e);
            if (kind === 0) g.heart(x, y + 2, 52, 4).fill(0xff375f);
            else if (kind === 1) g.circle(x, y, 26).fill(0x0a84ff);
            else if (kind === 2) g.regularPoly(x, y, 30, 6, 0, 6).fill(0x30d158);
            else if (kind === 3) g.triangle(x, y - 28, x + 28, y + 22, x - 28, y + 22, 6).fill(0xbf5af2);
            else g.regularPoly(x, y, 30, 4, Math.PI / 4, 4).fill(GOLD);
        }
    }

    return g;
}

/** A round button with a label on it. */
function button(radius: number, color: number, text: string): Container {
    const c = new Container();
    const g = new SilkGraphics().circle(0, 0, radius).fill(color);
    const t = new SilkText({
        text,
        fontFamily: font,
        fontWeight: 700,
        fontSize: radius * 0.42,
        fill: 0xffffff,
        anchor: 0.5,
    });

    c.addChild(g, t);
    c.eventMode = 'static';
    c.cursor = 'pointer';

    return c;
}

/** A pill with a small label and a value, its background drawn at the slot size. */
function pill(label: string, value: string, color: number): { box: SmartContainer; value: SilkText } {
    const box = new SmartContainer({ layout: { direction: 'column', padding: [10, 18], gap: 2 } });
    const bg = new SilkGraphics();
    const v = new SilkText({ text: value, fontFamily: font, fontWeight: 700, fontSize: 30, fill: color });

    box.add(bg, {
        position: 'absolute',
        inset: 0,
        onSize: (w, h) => bg.clear().roundRect(0, 0, w, h, 18, 0.6).fill(0x1c1c1e),
    });
    box.add(new SilkText({ text: label, fontFamily: font, fontSize: 14, fill: 0x8e8e93 }), { fitAlign: [0.5, 0] });
    // text shrink-to-fit: the value scales down to its slot, never below 0.55
    box.add(v, { fit: 'scale-down', minScale: 0.55 });

    return { box, value: v };
}

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default defineDemo({
    size: [920, 520],
    background: 0x0b0b0d,
    controls: {
        width: { type: 'range', label: 'screen width', min: 260, max: 880, step: 1, value: 820, unit: 'px' },
        debug: { type: 'toggle', label: 'debug', value: false },
    },
    setup({ silk, stage, params, tick }) {
        const frame = new SilkGraphics();
        const screen = new Container();
        const mask = new Graphics();
        const hud = new SmartContainer({
            ticker: silk.app.ticker,
            reference: { width: 960, height: 540 },
            transition: { stiffness: 190, damping: 24 },
            layout: { direction: 'column', padding: 20, gap: 16 },
        });

        // background, drawn at the screen size
        const bg = new SilkGraphics();

        hud.add(bg, {
            position: 'absolute',
            inset: 0,
            onSize: (w, h) => bg.clear().rect(0, 0, w, h).fill(0x101014),
        });

        // top bar: title on the left, menu on the right
        const top = hud.add(new SmartContainer({ layout: { justifyContent: 'space-between', alignItems: 'center' } }));

        top.add(new SilkText({ text: 'GOLDEN REELS', fontFamily: font, fontWeight: 800, fontSize: 30, fill: GOLD }));
        top.add(button(22, 0x2c2c2e, 'MENU'));

        // reels and controls: side by side in landscape, stacked in portrait
        const main = hud.add(
            new SmartContainer({
                layout: {
                    gap: 20,
                    alignItems: 'center',
                    landscape: { direction: 'row' },
                    portrait: { direction: 'column' },
                },
            }),
            { grow: 1, basis: 0 },
        );

        main.add(reels(), { grow: 1, basis: 0, alignSelf: 'stretch', fit: 'contain' });
        // portrait only: a large win line between the reels and the controls
        const banner = main.add(
            new SilkText({ text: 'WIN $0.00', fontFamily: font, fontWeight: 800, fontSize: 44, fill: GOLD }),
            { alignSelf: 'stretch', fit: 'scale-down', minScale: 0.5, landscape: { display: 'none' } },
        );
        const controls = main.add(
            new SmartContainer({
                layout: {
                    alignItems: 'center',
                    justifyContent: 'center',
                    landscape: { direction: 'column', gap: 18 },
                    portrait: { direction: 'row', gap: 36 },
                },
            }),
        );
        const spin = button(58, 0x30d158, 'SPIN');

        controls.add(button(30, 0x2c2c2e, 'AUTO'));
        controls.add(spin);
        controls.add(button(30, 0x2c2c2e, 'TURBO'));

        // the meters share the bar equally. In portrait the win moves up to the banner.
        const bar = hud.add(new SmartContainer({ layout: { gap: 12 } }));
        const balance = pill('BALANCE', '$12,480.00', 0xffffff);
        const win = pill('WIN', '$0.00', GOLD);
        const bet = pill('BET', '$2.00', 0xffffff);

        bar.add(balance.box, { grow: 1, basis: 0 });
        bar.add(win.box, { grow: 1, basis: 0, portrait: { display: 'none' } });
        bar.add(bet.box, { grow: 1, basis: 0 });

        spin.on('pointertap', () => {
            const amount = money(Math.random() < 0.3 ? 0 : 10 ** (1 + Math.random() * 5));

            win.value.text = amount;
            banner.text = `WIN ${amount}`;
            // new text, new size: measure both again
            win.box.invalidate(win.value);
            main.invalidate(banner);
        });

        screen.addChild(hud);
        screen.mask = mask;
        stage.addChild(frame, screen, mask);

        let width = -1;

        tick(() => {
            hud.debug = params.debug;
            if (params.width === width) return;
            width = params.width;
            const x = (920 - width) / 2;
            const y = (520 - SCREEN_H) / 2;

            frame
                .clear()
                .roundRect(x - 8, y - 8, width + 16, SCREEN_H + 16, 26, 0.6)
                .fill(0x2c2c2e);
            mask.clear().roundRect(x, y, width, SCREEN_H, 18).fill(0xffffff);
            screen.position.set(x, y);
            hud.fitTo({ width, height: SCREEN_H });
        });

        return () => hud.destroy({ children: true });
    },
});
