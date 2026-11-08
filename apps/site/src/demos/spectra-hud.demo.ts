import { Container, Text, type TextStyleFontWeight } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { defineDemo, MONO } from './runtime';

// A sci-fi spectrum readout. The frame, labels and gauges are drawn once, the heatmap cells and the
// orientation square redraw every frame.

const W = 720;
const H = 460;
const CX = 340;
const CY = 226;
const WHITE = 0xf2f2f2;
const DIM = 0x9a9aa2;
const RED = 0xff2b2b;
const AMBER = 0xffb020;

// heatmap grid: cells inside a circle around the centre
const CELL = 10;
const RADIUS = 120;
const GRID = Math.ceil((RADIUS * 2) / CELL);
// the orientation dial, top right
const DIAL = { x: 618, y: 122, r: 40 };

const hair = (alpha = 1) => ({ width: 1, color: WHITE, alpha });

/** Blue to red to white, the palette of the hot spot. */
function hot(v: number): number {
    const stops = [0x1a2cff, 0xff1e1e, 0xffffff];
    const x = Math.min(1, Math.max(0, v)) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(x));
    const t = x - i;
    const ch = (s: number) => Math.round(((stops[i] >> s) & 255) * (1 - t) + ((stops[i + 1] >> s) & 255) * t) << s;

    return ch(16) | ch(8) | ch(0);
}

const grey = (v: number) => {
    const c = Math.round(30 + v * 170);

    return (c << 16) | (c << 8) | c;
};

/** One block of the HUD: its own graphics and texts, so the phone layout can move it as a whole. */
interface Part {
    view: Container;
    g: SilkGraphics;
    text: TextFn;
}

function part(parent: Container, x = 0, y = 0): Part {
    const view = new Container();
    const g = new SilkGraphics();
    const texts = new Container();

    view.position.set(x, y);
    view.addChild(g, texts);
    parent.addChild(view);

    return {
        view,
        g,
        text: (value, tx, ty, size = 11, color = DIM, anchor = 0, weight = '400') => {
            const t = new Text({
                text: value,
                style: { fill: color, fontFamily: MONO, fontSize: size, fontWeight: weight, letterSpacing: 0.4 },
            });

            t.anchor.set(anchor, 0.5);
            t.position.set(tx, ty);
            texts.addChild(t);

            return t;
        },
    };
}

export default defineDemo({
    title: 'Spectrum HUD',
    size: [W, H],
    // phones: the plot in the middle, the title and the dial above it, the rest below
    phone: { size: [360, 780] },
    setup({ stage, tick, width, height, phone }) {
        const cells = new SilkGraphics();
        const live = new SilkGraphics();
        const blink = new SilkGraphics();
        let frameCount = 0;

        // the parts keep the wide coordinates, phones move each part to its own place
        const at = (x: number, y: number): [number, number] => (phone ? [x, y] : [0, 0]);
        const plot = part(stage, ...at(-160, 232));
        const title = part(stage);
        const times = part(stage, ...at(0, 360));
        const badge = part(stage, ...at(-360, 40));
        const dial = part(stage, ...at(-350, 38));
        const controls = part(stage, ...at(-360, 362));
        const footer = part(stage);

        plot.view.addChildAt(cells, 0);
        dial.view.addChild(live);
        footer.view.addChild(blink);
        drawTitle(title, times, badge);
        drawPlot(plot);
        drawDialFace(dial, controls);
        drawFooter(footer, width, height);

        tick((t) => {
            // the heatmap redraws at half the frame rate: plenty for a slow drift
            if (frameCount++ % 2 === 0) drawCells(cells, t);
            live.clear();
            const a = t * 0.35;

            live.save().translateTransform(DIAL.x, DIAL.y).rotateTransform(a);
            live.rect(-10, -10, 20, 20).stroke({ width: 1.5, color: AMBER });
            live.restore();
            live.line(DIAL.x, DIAL.y, DIAL.x + Math.cos(a - 1.2) * DIAL.r, DIAL.y + Math.sin(a - 1.2) * DIAL.r).stroke(
                hair(0.5),
            );
            blink.clear();
            blink.circle(30, height - 30, 3).fill({ color: AMBER, alpha: Math.sin(t * 4) > 0 ? 1 : 0.35 });
        });

        return undefined;
    },
});

type TextFn = (
    value: string,
    x: number,
    y: number,
    size?: number,
    color?: number,
    anchor?: number,
    weight?: TextStyleFontWeight,
) => Text;

function drawCells(g: SilkGraphics, t: number) {
    g.clear();
    const hotX = 0.22 + Math.sin(t * 0.4) * 0.05;
    const hotY = -0.18 + Math.cos(t * 0.33) * 0.04;

    for (let j = 0; j < GRID; j++) {
        for (let i = 0; i < GRID; i++) {
            const x = CX - RADIUS + i * CELL;
            const y = CY - RADIUS + j * CELL;
            const u = (x + CELL / 2 - CX) / RADIUS;
            const v = (y + CELL / 2 - CY) / RADIUS;

            if (u * u + v * v > 1) continue;
            // a soft grey body, brighter towards its lower right, with a slow ripple
            const body =
                Math.max(0, 1 - Math.hypot((u - 0.05) / 0.9, (v - 0.15) / 0.75)) *
                (0.6 + 0.4 * Math.sin(u * 6 + t * 0.7));
            // the hot spot: a squashed blob that drifts inside the selection box
            const heat =
                Math.max(0, 1 - Math.hypot((u - hotX) / 0.42, (v - hotY) / 0.28)) * 1.25 +
                Math.max(0, 0.6 - Math.hypot(u - 0.2, v + 0.55) * 1.6);

            if (heat > 0.18) g.rect(x, y, CELL - 1, CELL - 1).fill(hot(heat - 0.18));
            else if (body > 0.04) g.rect(x, y, CELL - 1, CELL - 1).fill({ color: grey(body), alpha: 0.85 });
        }
    }
}

function drawTitle({ text }: Part, times: Part, badge: Part) {
    text('06F', 24, 42, 30, WHITE, 0, '700');
    text('Neptune Spectra', 24, 76, 13, WHITE, 0, '600');
    text('APHELION', 24, 108);
    text('30.33 AU', 24, 124, 12, WHITE);
    text('PERIHELION', 24, 150);
    text('29.81 AU', 24, 166, 12, WHITE);
    times.g.rect(24, 290, 104, 20).fill(WHITE);
    times.text('SPECTRA / 06F', 30, 300, 11, 0x050505, 0, '700');
    times.text('C 19:28:24', 24, 330);
    times.text('P 17:06:47', 24, 348);
    badge.text('THRESHOLD 84%', 696 - 52, 32, 11, WHITE, 1);
    badge.g.roundRect(696 - 44, 23, 44, 18, 3).fill(RED);
    badge.text('HIGH', 696 - 22, 32, 11, WHITE, 0.5, '700');
}

function drawPlot({ g, text }: Part) {
    g.circle(CX, CY, RADIUS + 14).stroke(hair(0.35));
    g.rect(CX - 100, CY - 84, 200, 200).stroke(hair(0.9));
    g.rect(CX - 16, CY - 156, 184, 184).stroke({ width: 1, color: WHITE, alpha: 0.9, dash: [4, 4] });
    g.roundRect(CX + 128, CY - 148, 36, 20, 3).fill(WHITE);
    text('06F', CX + 146, CY - 138, 11, 0x050505, 0.5, '700');
    for (const [i, exp] of ['1e-2', '1e-4', '1e-6', '1e-8'].entries()) {
        text(exp, CX - 140, CY - 72 + i * 60, 11, WHITE, 1);
    }
    for (const [i, tick] of ['0.1', '1.0', '10.0'].entries()) text(tick, CX - 90 + i * 90, CY + 146, 11, WHITE, 0.5);
    text('ENERGY [keV]', CX, CY + 166, 11, DIM, 0.5);
    g.circle(CX - 6, CY + 2, 1.5).fill(WHITE);
    // the cross hair, out to the edges
    g.line(CX - RADIUS - 40, CY, CX - RADIUS - 18, CY).stroke(hair(0.6));
    g.line(CX + RADIUS + 18, CY, CX + RADIUS + 40, CY).stroke(hair(0.6));
    g.rect(CX - 3, 18, 6, 12).fill(WHITE);
}

function drawDialFace({ g, text }: Part, controls: Part) {
    const { x, y, r } = DIAL;

    g.circle(x, y, r).stroke(hair(0.6));
    for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2;
        const r0 = i % 9 === 0 ? r - 7 : r - 3;

        g.line(x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a) * r, y + Math.sin(a) * r).stroke(hair(0.6));
    }
    text('0', x, y - r - 12, 11, WHITE, 0.5);
    text('90', x + r + 8, y, 11, WHITE, 0);
    text('180', x, y + r + 12, 11, WHITE, 0.5);
    text('-90', x - r - 8, y, 11, WHITE, 1);
    text('ROT -17', x - r, y + r + 40);
    text('SEQ 1.42', x - r, y + r + 58);
    // play controls
    for (const [i, flip] of [false, true].entries()) {
        const cy = 300 + i * 32;
        const s = flip ? -1 : 1;

        controls.g.rect(668, cy - 12, 28, 24).stroke(hair(0.8));
        controls.g.triangle(682 - 5 * s, cy - 6, 682 - 5 * s, cy + 6, 682 + 6 * s, cy).fill(WHITE);
    }
}

function drawFooter({ g, text }: Part, w: number, h: number) {
    g.line(24, h - 52, w - 24, h - 52).stroke(hair(0.2));
    text('Selection  LDK 06F', 44, h - 30, 12, WHITE);
    text('Form A  1039 / 3972', w - 24, h - 30, 12, WHITE, 1);
}
