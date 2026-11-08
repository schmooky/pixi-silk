import { Container } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { SilkText } from 'pixi-silk/text';
import {
    DEVICES,
    FlexContainer,
    layoutDebug,
    SmartContainer,
    type SmartContainerOptions,
    simulateViewport,
} from 'pixi-silk/ui/layout';
import { defineDemo } from './runtime';

// A slot game HUD built from SmartContainers, each placed by a portrait and a landscape record.
// The balance pins to the top left corner, the menu to the top right, the reels stay centred and
// fit, and the bar stretches along the bottom with a flex row inside. Pick a device: the page
// previews it letterboxed, and the HUD glides to the new breakpoint. Press L, or tick debug, for
// the layout overlay. Hover a box for its readout.

const GOLD = 0xffd60a;
const font = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

/** A 5 by 3 reel window with a few vector symbols, 1040x640 design units. */
function reels(): Container {
    const g = new SilkGraphics();

    g.roundRect(0, 0, 1040, 640, 40, 0.6).fill(0x1c1c1e);
    for (let c = 0; c < 5; c++) {
        for (let r = 0; r < 3; r++) {
            const x = 20 + c * 200 + 100;
            const y = 20 + r * 200 + 100;
            const kind = (c * 7 + r * 3) % 5;

            g.roundRect(x - 88, y - 88, 176, 176, 32, 0.6).fill(0x2c2c2e);
            if (kind === 0) g.heart(x, y + 4, 104, 8).fill(0xff375f);
            else if (kind === 1) g.circle(x, y, 52).fill(0x0a84ff);
            else if (kind === 2) g.regularPoly(x, y, 60, 6, 0, 12).fill(0x30d158);
            else if (kind === 3) g.triangle(x, y - 56, x + 56, y + 44, x - 56, y + 44, 12).fill(0xbf5af2);
            else g.regularPoly(x, y, 60, 4, Math.PI / 4, 8).fill(GOLD);
        }
    }

    return g;
}

/** A pill with a label and a value. The value shrinks to fit the pill, never below 0.55. */
function pill(label: string, value: string, color: number): { box: FlexContainer; value: SilkText } {
    const box = new FlexContainer({ layout: { direction: 'column', padding: [14, 28], gap: 2 } });
    const bg = new SilkGraphics();
    const v = new SilkText({ text: value, fontFamily: font, fontWeight: 700, fontSize: 52, fill: color });

    box.add(bg, {
        position: 'absolute',
        inset: 0,
        onSize: (w, h) => bg.clear().roundRect(0, 0, w, h, 30, 0.6).fill(0x1c1c1e),
    });
    box.add(new SilkText({ text: label, fontFamily: font, fontSize: 24, fill: 0x8e8e93 }));
    box.add(v, { fit: 'scale-down', minScale: 0.55 });

    return { box, value: v };
}

/** A round button with a label on it. */
function button(radius: number, color: number, text: string): Container {
    const c = new Container();

    c.addChild(
        new SilkGraphics().circle(0, 0, radius).fill(color),
        new SilkText({ text, fontFamily: font, fontWeight: 800, fontSize: radius * 0.4, fill: 0xffffff, anchor: 0.5 }),
    );
    c.eventMode = 'static';
    c.cursor = 'pointer';

    return c;
}

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default defineDemo({
    size: [920, 520],
    background: 0x0b0b0d,
    controls: {
        device: { type: 'select', label: 'device', options: Object.keys(DEVICES), value: 'desktop' },
        notch: { type: 'toggle', label: 'notch', value: false },
        debug: { type: 'toggle', label: 'debug', value: false },
    },
    setup({ silk, stage, params, tick }) {
        // a device window previewed inside the page. Every SmartContainer follows it.
        const sim = simulateViewport({ area: { x: 0, y: 0, width: 920, height: 520 }, device: 'desktop' });
        const debug = layoutDebug(silk.app, { key: 'KeyL' });
        const all: SmartContainer[] = [];
        const make = (label: string, options: SmartContainerOptions) => {
            const c = new SmartContainer({
                ticker: silk.app.ticker,
                viewport: sim,
                // games usually snap. The demo glides on the switch to show where things go.
                switchTransition: { stiffness: 160, damping: 22 },
                ...options,
            });

            c.label = label;
            all.push(c);
            sim.content.addChild(c);

            return c;
        };

        // background: covers the whole window, under the notch too
        const bg = make('background', {
            portraitData: { width: 1080, height: 1920, fitCover: true, ignoreSafeArea: true },
            landscapeData: { width: 1920, height: 1080, fitCover: true, ignoreSafeArea: true },
        });

        bg.addChild(new SilkGraphics().rect(0, 0, 1920, 1920).fill(0x101014));

        // reels: centred, fit to the reference resolution, moved up to leave room for the bar
        make('reels', {
            portraitData: { width: 1040, height: 640, correctionOffsetY: -200 },
            landscapeData: { width: 1040, height: 640, correctionOffsetY: -50 },
        }).addChild(reels());

        // balance pinned to the top left corner, menu to the top right
        const corner = make('balance', {
            layout: { padding: 24 },
            portraitData: { align: 'left', valign: 'top', width: 440, height: 170 },
            landscapeData: { align: 'left', valign: 'top', width: 440, height: 170 },
        });

        corner.add(pill('BALANCE', '$12,480.00', 0xffffff).box, { grow: 1 });

        make('menu', {
            layout: { justifyContent: 'center', alignItems: 'center' },
            portraitData: { align: 'right', valign: 'top', width: 140, height: 140 },
            landscapeData: { align: 'right', valign: 'top', width: 140, height: 140 },
        }).add(button(40, 0x2c2c2e, 'MENU'));

        // the bar: along the bottom and as wide as the window, with a flex row inside
        const bar = make('bar', {
            layout: {
                padding: [16, 32, 28],
                gap: 24,
                alignItems: 'center',
                justifyContent: 'space-between',
                media: [{ breakpoint: 'portrait', style: { wrap: 'wrap', justifyContent: 'center', rowGap: 16 } }],
            },
            portraitData: { valign: 'bottom', width: 1080, height: 420, extendWidth: true },
            landscapeData: { valign: 'bottom', width: 1920, height: 200, extendWidth: true },
        });
        const win = pill('WIN', '$0.00', GOLD);
        const bet = pill('BET', '$2.00', 0xffffff);
        const spin = button(76, 0x30d158, 'SPIN');

        // in portrait the spin button takes a row of its own above the two pills
        bar.add(spin, { media: [{ breakpoint: 'portrait', style: { basis: '100%' } }] });
        bar.add(bet.box, { grow: 1, basis: 0, maxWidth: 440 });
        bar.add(win.box, { grow: 1, basis: 0, maxWidth: 440 });

        spin.on('pointertap', () => {
            win.value.text = money(Math.random() < 0.3 ? 0 : 10 ** (1 + Math.random() * 5));
            // new text, new size: measure it again
            win.box.invalidate(win.value);
        });

        stage.addChild(sim);

        let last = '';
        let debugParam = false;

        tick(() => {
            // the checkbox and the L key both toggle the overlay
            if (params.debug !== debugParam) {
                debugParam = params.debug;
                if (debug.enabled !== debugParam) debug.toggle();
            }
            const key = `${params.device}|${params.notch}`;

            if (key === last) return;
            last = key;
            const [w, h] = DEVICES[params.device];

            for (const c of all)
                c.setSafeArea(params.notch ? (w > h ? { left: 44, right: 44 } : { top: 47, bottom: 34 }) : {});
            sim.setDevice(params.device);
        });

        return () => {
            debug.destroy();
            for (const c of all) c.destroy({ children: true });
        };
    },
});
