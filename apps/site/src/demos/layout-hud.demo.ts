import { Container } from 'pixi.js';
import { SilkGraphics, vertical } from 'pixi-silk';
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

// A media player HUD built from SmartContainers, each placed by a portrait and a landscape record.
// The track title pins to the top left corner, the menu to the top right, the artwork stays
// centred and fits, and the bar stretches along the bottom with a flex row inside. Pick a device:
// the page previews it letterboxed, and the HUD glides to the new breakpoint. Press L, or tick
// debug, for the layout overlay. Hover a box for its readout. Press play to run the clock.

const font = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

/** Cover art for the track: a sun over hills, 1040x640 design units. */
function artwork(): Container {
    const g = new SilkGraphics();

    g.roundRect(0, 0, 1040, 640, 40, 0.6)
        .fill({ gradient: vertical([0x1e1b4b, 0x7c3aed, 0xf472b6]) })
        .circle(520, 360, 170)
        .fill({ gradient: vertical([0xffd60a, 0xff9f0a]) });
    // the hills are cut to the card
    g.boolean(
        'intersect',
        (g) => g.roundRect(0, 0, 1040, 640, 40, 0.6),
        (g) => g.ellipse(260, 640, 420, 190),
    ).fill(0x2e1065);
    g.boolean(
        'intersect',
        (g) => g.roundRect(0, 0, 1040, 640, 40, 0.6),
        (g) => g.ellipse(820, 660, 420, 220),
    ).fill(0x3b0764);
    g.roundRect(0, 0, 1040, 640, 40, 0.6).stroke({ width: 2, color: 0xffffff, alpha: 0.12, alignment: 'inside' });

    return g;
}

/** A pill with a label and a value. The value shrinks to fit the pill, never below 0.55. */
function pill(label: string, value: string, color: number): { box: FlexContainer; value: SilkText } {
    const box = new FlexContainer({ layout: { direction: 'column', padding: [14, 28], gap: 2 } });
    const bg = new SilkGraphics();
    const v = new SilkText({ text: value, fontFamily: font, fontWeight: 700, fontSize: 60, fill: color });

    box.add(bg, {
        position: 'absolute',
        inset: 0,
        onSize: (w, h) => bg.clear().roundRect(0, 0, w, h, 30, 0.6).fill(0x1c1c1e),
    });
    box.add(new SilkText({ text: label, fontFamily: font, fontSize: 38, fill: 0xa1a1aa }));
    box.add(v, { fit: 'scale-down', minScale: 0.55 });

    return { box, value: v };
}

/** A round button with a label on it, `size` design units tall. */
function button(radius: number, color: number, text: string, size: number): Container {
    const c = new Container();

    c.addChild(
        new SilkGraphics().circle(0, 0, radius).fill(color),
        new SilkText({ text, fontFamily: font, fontWeight: 800, fontSize: size, fill: 0xffffff, anchor: 0.5 }),
    );
    c.eventMode = 'static';
    c.cursor = 'pointer';

    return c;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const LENGTH = 238;

export default defineDemo({
    title: 'Responsive player HUD',
    size: [920, 520],
    // phones: a tall area, so a portrait device shows at about 0.85 of its real size
    phone: { size: [360, 700] },
    controls: {
        device: {
            type: 'select',
            label: 'device',
            options: Object.keys(DEVICES),
            value: 'desktop',
            phoneValue: 'phone portrait',
        },
        notch: { type: 'toggle', label: 'notch', value: false },
        debug: { type: 'toggle', label: 'debug', value: false },
    },
    setup({ silk, stage, params, tick, width, height }) {
        // a device window previewed inside the page. Every SmartContainer follows it.
        const sim = simulateViewport({ area: { x: 0, y: 0, width, height }, device: 'desktop' });
        const debug = layoutDebug(silk.app, { key: 'KeyL' });
        const all: SmartContainer[] = [];
        const make = (label: string, options: SmartContainerOptions) => {
            const c = new SmartContainer({
                ticker: silk.app.ticker,
                viewport: sim,
                // apps usually snap. The demo glides on the switch to show where things go.
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

        bg.addChild(new SilkGraphics().rect(0, 0, 1920, 1920).fill(0x111113));

        // artwork: centred, fit to the reference resolution, moved up to leave room for the bar
        make('artwork', {
            portraitData: { width: 1040, height: 640, correctionOffsetY: -200 },
            landscapeData: { width: 1040, height: 640, correctionOffsetY: -50 },
        }).addChild(artwork());

        // track title pinned to the top left corner, menu to the top right
        const corner = make('title', {
            layout: { padding: 24 },
            portraitData: { align: 'left', valign: 'top', width: 440, height: 170 },
            landscapeData: { align: 'left', valign: 'top', width: 440, height: 170 },
        });

        corner.add(pill('NOW PLAYING', 'Night Drive', 0xffffff).box, { grow: 1 });

        make('menu', {
            layout: { justifyContent: 'center', alignItems: 'center' },
            portraitData: { align: 'right', valign: 'top', width: 140, height: 140 },
            landscapeData: { align: 'right', valign: 'top', width: 140, height: 140 },
        }).add(button(60, 0x2c2c2e, 'MENU', 34));

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
        const time = pill('TIME', `0:00 / ${clock(LENGTH)}`, 0xffffff);
        const volume = pill('VOLUME', '72%', 0x64d2ff);
        const play = button(76, 0x30d158, 'PLAY', 36);
        const playLabel = play.children[1] as SilkText;
        let playing = false;
        let position = 0;

        // in portrait the play button takes a row of its own above the two pills
        bar.add(play, { media: [{ breakpoint: 'portrait', style: { basis: '100%' } }] });
        bar.add(time.box, { grow: 1, basis: 0, maxWidth: 440 });
        bar.add(volume.box, { grow: 1, basis: 0, maxWidth: 440 });

        play.on('pointertap', () => {
            playing = !playing;
            playLabel.text = playing ? 'PAUSE' : 'PLAY';
        });

        stage.addChild(sim);

        let last = '';
        let debugParam = false;

        tick((_t, dt) => {
            if (playing) {
                const before = Math.floor(position);

                position = (position + dt) % LENGTH;
                if (Math.floor(position) !== before) {
                    time.value.text = `${clock(position)} / ${clock(LENGTH)}`;
                    // new text, new size: measure it again
                    time.box.invalidate(time.value);
                }
            }
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
