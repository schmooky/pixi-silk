import { Container, Text, type TextStyleFontWeight } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { defineDemo } from './runtime';

// A sci-fi spectrum readout. The frame, labels and gauges are drawn once, the heatmap cells and the
// orientation square redraw every frame.

const W = 1280;
const H = 720;
const CX = 640;
const CY = 360;
const MONO = '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace';
const WHITE = 0xf2f2f2;
const DIM = 0x8a8a8a;
const RED = 0xff2b2b;

// heatmap grid: cells inside a circle around the centre
const CELL = 11;
const RADIUS = 150;
const GRID = Math.ceil((RADIUS * 2) / CELL);

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

export default defineDemo({
    size: [W, H],
    background: 0x050505,
    setup({ stage, tick }) {
        const frame = new SilkGraphics();
        const cells = new SilkGraphics();
        const live = new SilkGraphics();
        const texts = new Container();
        let frameCount = 0;

        stage.addChild(cells, frame, live, texts);

        const text = (
            value: string,
            x: number,
            y: number,
            size = 8,
            color = DIM,
            anchor = 0,
            weight: TextStyleFontWeight = '400',
        ) => {
            const t = new Text({
                text: value,
                style: { fill: color, fontFamily: MONO, fontSize: size, fontWeight: weight, letterSpacing: 0.6 },
            });

            t.anchor.set(anchor, 0.5);
            t.position.set(x, y);
            texts.addChild(t);

            return t;
        };

        drawTabs(text);
        drawWarning(frame, text);
        drawTitle(text);
        drawPlot(frame, text);
        drawTimeline(frame, text);
        drawCompassFace(frame, text);
        drawEdges(frame);
        drawControls(frame, text);
        drawFooter(frame, text);

        tick((t) => {
            // the heatmap redraws at half the frame rate: plenty for a slow drift
            if (frameCount++ % 2 === 0) drawCells(cells, t);
            live.clear();
            const a = t * 0.35;

            live.save().translateTransform(1165, 98).rotateTransform(a);
            live.rect(-11, -11, 22, 22).stroke({ width: 1, color: 0xffb020 });
            live.restore();
            live.line(1165, 98, 1165 + Math.cos(a - 1.2) * 46, 98 + Math.sin(a - 1.2) * 46).stroke(hair(0.5));
            const blink = Math.sin(t * 4) > 0 ? 1 : 0.35;

            live.circle(30, 680, 2.5).fill({ color: 0xffb020, alpha: blink });
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

function drawTabs(text: TextFn) {
    const tabs = [
        'SPATIAL PREPROCESSING',
        'SPECTRAL PREPROCESSING',
        'UNIVARIATE IMAGING',
        'MULTIVARIATE IMAGING',
        'IMAGE PROCESSING',
    ];
    let x = 30;

    for (const [i, tab] of tabs.entries()) {
        const label = text(tab, x, 22, 7, i === 1 ? WHITE : DIM);

        x += label.width + 26;
    }
}

function drawWarning(g: SilkGraphics, text: TextFn) {
    text('IRP WARNING THRESHOLD  84%', 1205, 22, 7, WHITE, 1);
    g.roundRect(1215, 16, 36, 12, 2).fill(RED);
    text('HIGH', 1233, 22, 6, WHITE, 0.5, '700');
}

function drawTitle(text: TextFn) {
    text('06F', 40, 82, 30, WHITE, 0, '700');
    text('Neptune Spectra  /  Logged', 40, 112, 13, WHITE, 0, '600');
    text('APHELION', 40, 140, 6);
    text('30.33 AU (4.54 BILLION KM)', 40, 150, 7, WHITE);
    text('PERIHELION', 40, 168, 6);
    text('29.81 AU (4.46 BILLION KM)', 40, 178, 7, WHITE);
    text('C Time  19:28:24', 40, 486, 7);
    text('P Time  17:06:47', 40, 498, 7);
}

function drawPlot(g: SilkGraphics, text: TextFn) {
    g.circle(CX, CY, RADIUS + 18).stroke(hair(0.35));
    g.rect(CX - 125, CY - 105, 250, 250).stroke(hair(0.9));
    g.rect(CX - 20, CY - 195, 230, 230).stroke({ width: 1, color: WHITE, alpha: 0.9, dash: [4, 4] });
    g.roundRect(CX + 165, CY - 182, 34, 20, 2).fill(WHITE);
    text('06F', CX + 182, CY - 172, 8, 0x050505, 0.5, '700');
    for (const [i, exp] of ['10⁻⁰²', '10⁻⁰⁴', '10⁻⁰⁶', '10⁻¹⁴'].entries()) {
        text(exp, CX - 150, CY - 92 + i * 75, 9, WHITE, 1);
    }
    for (const [i, tick] of ['0.1', '1.0', '10.0'].entries()) text(tick, CX - 110 + i * 110, CY + 225, 10, WHITE, 0.5);
    text('ENERGY  [keV]', CX, CY + 250, 6, DIM, 0.5);
    const axis = text('FLUX  [1 / C M² S]', CX - 196, CY, 6, DIM, 0.5);

    axis.rotation = -Math.PI / 2;
    g.circle(CX - 6, CY + 2, 1.5).fill(WHITE);
}

function drawTimeline(g: SilkGraphics, text: TextFn) {
    const x0 = 560;
    const y = 74;

    text('TIMELINE', x0 - 14, y, 6, DIM, 1);
    for (let i = 0; i <= 40; i++) g.rect(x0 + i * 4, y - 2, 1, 4).fill({ color: WHITE, alpha: 0.35 });
    g.rect(x0 + 30, y - 6, 6, 12).fill(WHITE);
    for (const [i, m] of ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'].entries()) {
        text(m, x0 + 20 + i * 30, y - 12, 6, i === 1 ? WHITE : DIM, 0.5);
    }
    g.rect(CX - 3, 34, 6, 14).fill(WHITE);
    g.rect(CX - 3, H - 48, 6, 14).fill(WHITE);
}

function drawCompassFace(g: SilkGraphics, text: TextFn) {
    const cx = 1165;
    const cy = 98;

    g.circle(cx, cy, 46).stroke(hair(0.6));
    for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2;
        const r0 = i % 9 === 0 ? 40 : 43;

        g.line(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * 46, cy + Math.sin(a) * 46).stroke(
            hair(0.6),
        );
    }
    text('0°', cx, cy - 56, 7, WHITE, 0.5);
    text('90°', cx + 58, cy, 7, WHITE, 0);
    text('180°', cx, cy + 56, 7, WHITE, 0.5);
    text('-90°', cx - 58, cy, 7, WHITE, 1);
    text('ROT  -17°', 1140, 168, 6);
    text('SEQ  1.42', 1140, 180, 6);
}

function drawEdges(g: SilkGraphics) {
    g.line(20, CY, 200, CY).stroke(hair(0.3));
    g.line(W - 200, CY, W - 20, CY).stroke(hair(0.3));
    g.line(CX - RADIUS - 40, CY, CX - RADIUS - 18, CY).stroke(hair(0.6));
    g.line(CX + RADIUS + 18, CY, CX + RADIUS + 40, CY).stroke(hair(0.6));
    for (const x of [24, W - 24]) {
        g.circle(x, CY, 2).fill(WHITE);
        g.line(x, CY - 5, x, CY + 5).stroke(hair(0.8));
    }
    for (const x of [CX - 270, CX + 270]) g.circle(x, CY, 2).fill(WHITE);
}

function drawControls(g: SilkGraphics, text: TextFn) {
    text('R', 1214, 548, 11, WHITE, 0.5, '700');
    for (const [i, flip] of [false, true].entries()) {
        const y = 584 + i * 34;

        g.rect(1200, y - 12, 28, 24).stroke(hair(0.8));
        const s = flip ? -1 : 1;

        g.triangle(1214 - 5 * s, y - 6, 1214 - 5 * s, y + 6, 1214 + 6 * s, y).fill(WHITE);
    }
}

function drawFooter(g: SilkGraphics, text: TextFn) {
    text('SPECTRA / 06F', 46, 452, 7, 0x050505, 0, '700');
    g.rect(34, 444, 80, 16).fill(WHITE);
    text('FLUX  [1 / C M² S]', 42, 680, 6);
    text('ENERGY  [keV]', 42, 694, 6);
    g.rect(27, 691, 6, 6).fill(DIM);
    text('Selection  LDK 06F', 80, 700, 10, WHITE);
    text('Form A', 560, 700, 10, WHITE);
    text('1039 / 3972  E', 620, 700, 10, WHITE);
    text('Show Log', W - 30, 700, 7, WHITE, 1);
}
