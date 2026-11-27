/*
 * Three more HUD layouts on the same model (core.ts). Each one is a different arrangement of the
 * usual slot controls, built from the same parts:
 *
 * - every dock is a BlockSurface, a SmartContainer that keeps its design box inside the safe area
 *   and scales it from a reference resolution. The bottom bar extends to the window width; side
 *   docks anchor to an edge and centre vertically;
 * - inside a dock, flex groups place the blocks, with `media` rules for portrait;
 * - every block paints into its dock's one SilkGraphics, text included. A dock is one draw call
 *   while it moves and one cached texture at rest.
 *
 * The looks are drawn by small face painters, so a skin is layout plus paint, and the logic never
 * changes.
 */
import type { Application, Container } from 'pixi.js';
import { linear, radial, type SilkGraphics } from 'pixi-silk';
import { computed } from 'pixi-silk/signal';
import { type DrawTextStyle, drawText, measureText } from 'pixi-silk/text';
import {
    Block,
    BlockSurface,
    CounterBlock,
    group,
    PanelBlock,
    type PressState,
    read,
    stack,
    TextBlock,
    type Value,
} from 'pixi-silk/ui/blocks';
import type { SmartContainerOptions } from 'pixi-silk/ui/layout';
import { type HudModel, money } from './core';
import { FONT, iconMenu, iconSound, iconSpin } from './hud';

/** What a HUD builder returns: its docks, for stats, and a way to take it down. */
export interface Hud {
    surfaces: BlockSurface[];
    destroy(): void;
}

const TAU = Math.PI * 2;
const DISPLAY = '"Arial Black", "Helvetica Neue", Impact, system-ui, sans-serif';

// ---------------------------------------------------------------------------------- shared parts

/** Spring values a face painter reads. Each runs from 0 to 1. */
export interface FaceState {
    hover: number;
    press: number;
    active: number;
    dim: number;
}

/** Draws a button's face centred on `(cx, cy)`, `w` by `h` after the press scale. */
export type FacePainter = (g: SilkGraphics, cx: number, cy: number, w: number, h: number, s: FaceState) => void;

interface FaceButtonOptions {
    width: number;
    height: number;
    onPress: () => void;
    face: FacePainter;
    enabled?: Value<boolean>;
    active?: Value<boolean>;
    /** Hit the inscribed circle instead of the slot. */
    circle?: boolean;
    /** Scale while held. Default 0.92. */
    pressScale?: number;
    /** Repaints when these change: labels and counts the face reads. */
    watch?: readonly Value<unknown>[];
}

/** A button whose look is a painter function: pointer springs, active and disabled fades. */
class FaceButton extends Block {
    private readonly act = this.spring();
    private readonly dim = this.spring();
    private readonly st: PressState;

    constructor(private readonly o: FaceButtonOptions) {
        super({ width: o.width, height: o.height });
        this.st = this.pressable({ onPress: o.onPress, enabled: o.enabled, hitArea: o.circle ? 'circle' : 'rect' });
        this.watch(o.active ?? false, o.enabled ?? true, ...(o.watch ?? []));
        this.act.value = this.act.target = this.isActive();
        this.dim.value = this.dim.target = this.isDim();
    }

    private isActive(): number {
        return read(this.o.active ?? false) ? 1 : 0;
    }

    private isDim(): number {
        return read(this.o.enabled ?? true) ? 0 : 1;
    }

    protected override onChange(): void {
        this.act.target = this.isActive();
        this.dim.target = this.isDim();
        this.wake();
    }

    paint(g: SilkGraphics, x: number, y: number): void {
        const s = 1 - (1 - (this.o.pressScale ?? 0.92)) * this.st.press.value;

        this.o.face(g, x + this.w / 2, y + this.h / 2, this.w * s, this.h * s, {
            hover: this.st.hover.value,
            press: this.st.press.value,
            active: this.act.value,
            dim: this.dim.value,
        });
    }
}

/** Text with an outline: one drawText stroked outside, then one filled, so outlines never cover a neighbour. */
class OutlineText extends Block {
    constructor(
        private readonly o: {
            text: Value<string>;
            style: DrawTextStyle;
            fill: Value<number | ReturnType<typeof linear>>;
            outline: { width: number; color: number };
            width?: number;
            height?: number;
            align?: readonly [number, number];
            shadow?: number;
        },
    ) {
        const m = measureText(read(o.text), o.style);

        super({ width: o.width ?? Math.ceil(m.width + o.outline.width * 2), height: o.height ?? Math.ceil(m.height) });
        this.watch(o.text, o.fill);
    }

    paint(g: SilkGraphics, x: number, y: number): void {
        const [ax, ay] = this.o.align ?? [0.5, 0.5];
        const style = { ...this.o.style, anchor: [ax, ay] as [number, number] };
        const tx = x + this.w * ax;
        const ty = y + this.h * ay;
        const text = read(this.o.text);
        const fill = read(this.o.fill);

        if (this.o.shadow) {
            g.save();
            g.translateTransform(0, this.o.shadow);
            drawText(g, text, tx, ty, style).stroke({
                width: this.o.outline.width,
                color: 0x000000,
                alpha: 0.5,
                alignment: 'outside',
            });
            g.restore();
        }
        drawText(g, text, tx, ty, style).stroke({ ...this.o.outline, alignment: 'outside' });
        drawText(g, text, tx, ty, style).fill(typeof fill === 'number' ? fill : { gradient: fill, color: 0xffffff });
    }
}

const chevron = (g: SilkGraphics, cx: number, cy: number, s: number, up: boolean, color: number, alpha = 1) => {
    const d = up ? -1 : 1;

    g.moveTo(cx - s, cy - (d * s) / 2)
        .lineTo(cx, cy + (d * s) / 2)
        .lineTo(cx + s, cy - (d * s) / 2)
        .stroke({ width: s * 0.38, color, alpha, cap: 'round', join: 'round' });
};

const triangle = (g: SilkGraphics, cx: number, cy: number, s: number, up: boolean, color: number, alpha = 1) => {
    const d = up ? -1 : 1;

    g.poly([cx - s, cy - (d * s) / 2, cx + s, cy - (d * s) / 2, cx, cy + (d * s) / 2]).fill({ color, alpha });
};

/** One circular arrow, opening at the top right. Folds into a stop square as `t` goes to 1. */
const ringArrow = (g: SilkGraphics, cx: number, cy: number, r: number, width: number, t: number, color: number) => {
    const a = 1 - t;

    if (a > 0.01) {
        const start = -Math.PI / 2 + 0.55;
        const sweep = TAU - 1.1;
        const end = start + sweep;
        const tx = cx + Math.cos(end) * r;
        const ty = cy + Math.sin(end) * r;
        const d = end + Math.PI / 2;
        const k = width * 1.35;

        g.arcSweep(cx, cy, r, start, sweep).stroke({ width, color, alpha: a, cap: 'round' });
        g.poly([
            tx + Math.cos(d) * k,
            ty + Math.sin(d) * k,
            tx + Math.cos(d + 2.2) * k,
            ty + Math.sin(d + 2.2) * k,
            tx + Math.cos(d - 2.2) * k,
            ty + Math.sin(d - 2.2) * k,
        ]).fill({ color, alpha: a });
    }
    if (t > 0.01) {
        const q = r * 0.55 * t;

        g.roundRect(cx - q, cy - q, q * 2, q * 2, q * 0.25).fill({ color, alpha: t });
    }
};

/** A spin face reads busy while the round runs, idle otherwise. */
const busyOf = (model: HudModel) =>
    computed([model.spin.state], () => model.spin.state.value !== 'idle' && model.spin.state.value !== 'disabled');

const idleOf = (model: HudModel) =>
    computed([model.spin.state, model.locks], () => model.spin.state.value === 'idle' && model.locks.value === 0);

const betMinorOf = (model: HudModel) =>
    computed([model.bet.bet], () => Math.round(model.bet.bet.value * 10 ** model.decimals));

/** A dock: a BlockSurface with the app's ticker and no orientation tween. */
const dock = (app: Application, options: SmartContainerOptions) =>
    new BlockSurface({ viewport: app, ticker: app.ticker, switchTransition: false, ...options });

const mount = (app: Application, surfaces: BlockSurface[]): Hud => {
    for (const s of surfaces) app.stage.addChild(s);

    return {
        surfaces,
        destroy() {
            for (const s of surfaces) s.destroy({ children: true });
        },
    };
};

const absolute = (b: Container) => [b, { position: 'absolute' as const, inset: 0 }] as const;

// ---------------------------------------------------------------------------------- 1. console

/*
 * A steel bar under the reels. A round feature button sits left of the bar. In the bar: menu,
 * the balance, the bet box with stacked arrows, a large ring spin button that overflows the bar,
 * and autoplay.
 */
export function createConsoleHud(app: Application, model: HudModel): Hud {
    const C = { bar: 0x15181f, box: 0x0b0d12, text: 0xe9eef5, caption: 0xc9d2de, cyan: 0x3fd8ff, deep: 0x0a4d8f };
    const idle = idleOf(model);
    const busy = busyOf(model);
    const cap = { fontFamily: FONT, fontSize: 22, fontWeight: 500, letterSpacing: 0.5 } as const;
    const val = { fontFamily: FONT, fontSize: 38, fontWeight: 700 } as const;
    const featureFace = radial(
        [
            [0, 0x7ff0ff],
            [0.55, 0x20b6e6],
            [1, 0x0a4d8f],
        ],
        { center: [0.4, 0.3], radius: 0.8 },
    );

    const bar = dock(app, {
        layout: {
            direction: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 40,
            media: [{ breakpoint: 'portrait', style: { direction: 'column', gap: 18 } }],
        },
        landscapeData: { valign: 'bottom', width: 1920, height: 210, extendWidth: true },
        portraitData: { valign: 'bottom', width: 1080, height: 380, extendWidth: true, correctionOffsetY: -10 },
    });

    const feature = new FaceButton({
        width: 132,
        height: 132,
        circle: true,
        pressScale: 0.9,
        enabled: idle,
        onPress: () => model.bus.emit('featureRequested', { id: 'feature' }),
        face: (g, cx, cy, w, _h, s) => {
            const r = w / 2;

            g.circle(cx, cy + 4, r).fill({ color: 0x000000, alpha: 0.5, blur: 10 });
            g.circle(cx, cy, r).fill({ gradient: featureFace, color: 0xffffff });
            g.circle(cx, cy, r).stroke({ width: 5, color: 0x0b2b4a, alignment: 'inside' });
            g.circle(cx, cy, r - 5).stroke({
                width: 2,
                color: 0xffffff,
                alpha: 0.5 + 0.3 * s.hover,
                alignment: 'inside',
            });
            g.save();
            g.translateTransform(cx, cy);
            g.rotateTransform(-0.55);
            const st = { fontFamily: DISPLAY, fontSize: 22, anchor: 0.5 as const };

            drawText(g, 'BUY', 0, -13, st).stroke({ width: 3, color: 0x07345e, alignment: 'outside' });
            drawText(g, 'BUY', 0, -13, st).fill(0xffffff);
            drawText(g, 'FEATURE', 0, 13, st).stroke({ width: 3, color: 0x07345e, alignment: 'outside' });
            drawText(g, 'FEATURE', 0, 13, st).fill(0xffffff);
            g.restore();
            if (s.dim > 0.005) g.circle(cx, cy, r).fill({ color: 0x000000, alpha: 0.45 * s.dim });
        },
    });

    const iconFace =
        (icon: (g: SilkGraphics, cx: number, cy: number, s: number, t: number, color: number) => void): FacePainter =>
        (g, cx, cy, w, _h, s) => {
            if (s.hover > 0.005) g.circle(cx, cy, w / 2).fill({ color: 0xffffff, alpha: 0.08 * s.hover });
            icon(g, cx, cy, w * 0.42, s.active, C.text);
            if (s.dim > 0.005) g.circle(cx, cy, w / 2).fill({ color: C.bar, alpha: 0.6 * s.dim });
        };

    const arrows = group(
        [true, false].map(
            (up) =>
                new FaceButton({
                    width: 64,
                    height: 52,
                    enabled: up ? model.bet.canUp : model.bet.canDown,
                    onPress: () => model.bet.step(up ? 1 : -1),
                    face: (g, cx, cy, w, h, s) => {
                        if (s.hover > 0.005)
                            g.roundRect(cx - w / 2, cy - h / 2, w, h, 8).fill({
                                color: 0xffffff,
                                alpha: 0.08 * s.hover,
                            });
                        chevron(g, cx, cy, 13, up, C.text, 1 - 0.7 * s.dim);
                    },
                }),
        ),
        { direction: 'column', gap: 0 },
    );

    const betBox = group(
        [
            absolute(new PanelBlock({ radius: 4, fill: C.box, stroke: { width: 2, color: 0x2a2f3a } })),
            group(
                [
                    new TextBlock({ text: 'BET', style: cap, fill: C.caption, width: 170 }),
                    new CounterBlock({
                        width: 170,
                        height: 46,
                        value: betMinorOf(model),
                        seconds: 0,
                        format: (n) => money(n, model.decimals, '€'),
                        style: val,
                        fill: computed([model.bet.interactable], () =>
                            model.bet.interactable.value ? C.text : 0x80889a,
                        ),
                    }),
                    new LadderLine(model, 170, C.text),
                ],
                { direction: 'column', gap: 2, padding: [0, 22] },
            ),
            arrows,
        ],
        { direction: 'row', alignItems: 'center', height: 112, padding: [0, 12, 0, 0] },
    );

    const spin = new FaceButton({
        width: 176,
        height: 176,
        circle: true,
        pressScale: 0.9,
        enabled: model.spin.interactable,
        active: busy,
        onPress: () => model.spin.press(),
        face: (g, cx, cy, w, _h, s) => {
            const r = w / 2;

            g.circle(cx, cy, r).fill(0x0a0c10);
            g.circle(cx, cy, r).stroke({ width: 4, color: 0x2a2f3a, alignment: 'inside' });
            if (s.hover > 0.005) g.circle(cx, cy, r * 0.7).fill({ color: C.cyan, alpha: 0.12 * s.hover, blur: 18 });
            ringArrow(g, cx, cy, r * 0.56, 12, s.active, 0xffffff);
            if (s.dim > 0.005) g.circle(cx, cy, r).fill({ color: 0x000000, alpha: 0.45 * s.dim });
        },
    });

    const running = computed([model.autoplay.state], () => model.autoplay.state.value === 'running');
    const auto = new FaceButton({
        width: 84,
        height: 84,
        circle: true,
        enabled: model.autoplay.interactable,
        active: running,
        watch: [model.autoplay.left],
        onPress: () => model.autoplay.press(),
        face: (g, cx, cy, w, _h, s) => {
            if (s.hover > 0.005) g.circle(cx, cy, w / 2).fill({ color: 0xffffff, alpha: 0.08 * s.hover });
            ringArrow(g, cx, cy, w * 0.26, 5, 0, C.text);
            g.circle(cx, cy, 5).fill(C.text);
            if (s.active > 0.01) {
                g.circle(cx, cy, w * 0.4).fill({ color: C.cyan, alpha: s.active });
                drawText(g, String(model.autoplay.left.value), cx, cy, {
                    fontFamily: FONT,
                    fontSize: 28,
                    fontWeight: 800,
                    anchor: 0.5,
                }).fill({ color: C.box, alpha: s.active });
            }
            if (s.dim > 0.005) g.circle(cx, cy, w / 2).fill({ color: C.bar, alpha: 0.6 * s.dim });
        },
    });

    const strip = group(
        [
            absolute(
                new PanelBlock({
                    radius: 4,
                    fill: { color: C.bar, alpha: 0.94 },
                    stroke: { width: 2, color: 0x2d323d, alignment: 'inside' },
                }),
            ),
            new FaceButton({
                width: 84,
                height: 84,
                circle: true,
                enabled: idle,
                onPress: () => model.bus.emit('menuRequested', undefined),
                face: iconFace(iconMenu),
            }),
            new PanelBlock({ width: 2, height: 84, fill: { color: 0xffffff, alpha: 0.08 } }),
            group(
                [
                    new TextBlock({ text: 'BALANCE', style: cap, fill: C.caption, width: 300 }),
                    new CounterBlock({
                        width: 300,
                        height: 46,
                        value: model.balance.minor,
                        seconds: 0.6,
                        format: (n) => money(n, model.decimals, '€'),
                        style: val,
                        fill: C.text,
                    }),
                ],
                { direction: 'column', gap: 2, grow: 1, padding: [0, 24] },
            ),
            betBox,
            spin,
            auto,
        ],
        {
            direction: 'row',
            alignItems: 'center',
            gap: 6,
            width: 1160,
            height: 112,
            padding: [0, 16],
            media: [{ breakpoint: 'portrait', style: { width: 1040 } }],
        },
    );

    stack(bar, [feature, strip]);

    return mount(app, [bar]);
}

/** A thin line under the bet: where the bet sits on its ladder. */
class LadderLine extends Block {
    private readonly pos = this.spring();

    constructor(
        private readonly model: HudModel,
        width: number,
        private readonly color: number,
    ) {
        super({ width, height: 4 });
        this.pos.value = this.pos.target = this.at();
        this.watch(model.bet.index);
    }

    private at(): number {
        return this.model.bet.index.value / (this.model.bet.levels.length - 1);
    }

    protected override onChange(): void {
        this.pos.target = this.at();
        this.wake();
    }

    paint(g: SilkGraphics, x: number, y: number): void {
        g.rect(x, y, this.w, this.h).fill({ color: this.color, alpha: 0.12 });
        g.rect(x, y, Math.max(6, this.w * this.pos.value), this.h).fill({ color: this.color, alpha: 0.9 });
    }
}

// ---------------------------------------------------------------------------------- 2. strip

/*
 * A flat band across the whole bottom: info and settings over the balance on the left, the total
 * bet with two arrow tiles in the middle, autoplay and spin tiles on the right. A shop tile docks
 * to the right edge, centred, in a dock of its own.
 */
export function createStripHud(app: Application, model: HudModel): Hud {
    const C = { band: 0x2b1d52, tile: 0x3d2a75, tileHi: 0x5a43a3, text: 0xffffff, soft: 0xd9d0f5, gold: 0xffc83d };
    const idle = idleOf(model);
    const busy = busyOf(model);
    const body = { fontFamily: FONT, fontSize: 32, fontWeight: 500 } as const;
    const tileFill = linear(
        [
            [0, C.tileHi],
            [1, C.tile],
        ],
        { from: [0, 0], to: [0, 1] },
    );

    const tile =
        (
            radius: number,
            content: (g: SilkGraphics, cx: number, cy: number, w: number, s: FaceState) => void,
        ): FacePainter =>
        (g, cx, cy, w, h, s) => {
            g.roundRect(cx - w / 2, cy - h / 2, w, h, radius).fill({ gradient: tileFill, color: 0xffffff });
            g.roundRect(cx - w / 2, cy - h / 2, w, h, radius).stroke({
                width: 2,
                color: 0xffffff,
                alpha: 0.12 + 0.2 * s.hover,
                alignment: 'inside',
            });
            content(g, cx, cy, w, s);
            if (s.dim > 0.005)
                g.roundRect(cx - w / 2, cy - h / 2, w, h, radius).fill({ color: C.band, alpha: 0.6 * s.dim });
        };

    const bar = dock(app, {
        layout: {
            direction: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: [0, 80],
            media: [
                {
                    breakpoint: 'portrait',
                    style: {
                        wrap: 'wrap',
                        justifyContent: 'space-around',
                        alignContent: 'space-evenly',
                        padding: [10, 40],
                    },
                },
            ],
        },
        landscapeData: { valign: 'bottom', width: 1920, height: 140, extendWidth: true },
        portraitData: { valign: 'bottom', width: 1080, height: 200, extendWidth: true },
    });
    const band = new PanelBlock({ radius: 0, fill: { color: C.band, alpha: 0.96 } });

    bar.add(band, band.layout({ position: 'absolute', inset: 0 }));

    const round = (
        size: number,
        draw: (g: SilkGraphics, cx: number, cy: number, s: FaceState) => void,
        onPress: () => void,
        active?: Value<boolean>,
    ) =>
        new FaceButton({
            width: size,
            height: size,
            circle: true,
            enabled: idle,
            active,
            onPress,
            face: (g, cx, cy, w, _h, s) => {
                if (s.hover > 0.005) g.circle(cx, cy, w / 2).fill({ color: 0xffffff, alpha: 0.1 * s.hover });
                draw(g, cx, cy, s);
                if (s.dim > 0.005) g.circle(cx, cy, w / 2).fill({ color: C.band, alpha: 0.6 * s.dim });
            },
        });

    const info = round(
        56,
        (g, cx, cy) => {
            g.circle(cx, cy, 22).fill(C.soft);
            drawText(g, 'i', cx, cy + 1, {
                fontFamily: 'Georgia, serif',
                fontSize: 34,
                fontWeight: 700,
                anchor: 0.5,
            }).fill(C.band);
        },
        () => model.bus.emit('menuRequested', undefined),
    );
    const sound = round(
        56,
        (g, cx, cy, s) => iconSound(g, cx, cy, 30, s.active, C.soft),
        () => model.sound.toggle(),
        computed([model.sound.state], () => model.sound.on),
    );

    // the left column: icons over the balance
    stack(
        bar,
        [
            group([info, sound], { direction: 'row', gap: 8 }),
            new CounterBlock({
                width: 440,
                height: 44,
                value: model.balance.minor,
                seconds: 0.6,
                format: (n) => `Balance ${money(n, model.decimals, '')} FUN`,
                style: body,
                fill: C.soft,
            }),
        ],
        { direction: 'column', gap: 4, padding: [0, 0, 0, 8] },
    );

    // the middle: total bet over its value, arrow tiles on the right
    stack(
        bar,
        [
            group(
                [
                    new TextBlock({ text: 'Total bet', style: body, fill: C.soft, width: 220, align: [0.5, 0.5] }),
                    new CounterBlock({
                        width: 220,
                        height: 44,
                        value: betMinorOf(model),
                        seconds: 0,
                        format: (n) => `${money(n, model.decimals, '')} FUN`,
                        style: body,
                        fill: computed([model.bet.interactable], () =>
                            model.bet.interactable.value ? C.text : 0x9c92c2,
                        ),
                        align: [0.5, 0.5],
                    }),
                ],
                { direction: 'column', gap: 6 },
            ),
            group(
                [true, false].map(
                    (up) =>
                        new FaceButton({
                            width: 56,
                            height: 56,
                            enabled: up ? model.bet.canUp : model.bet.canDown,
                            onPress: () => model.bet.step(up ? 1 : -1),
                            face: tile(8, (g, cx, cy) => triangle(g, cx, cy, 12, up, C.text)),
                        }),
                ),
                { direction: 'column', gap: 6 },
            ),
        ],
        { direction: 'row', alignItems: 'center', gap: 14 },
    );

    // the right: autoplay and spin tiles
    const running = computed([model.autoplay.state], () => model.autoplay.state.value === 'running');

    stack(
        bar,
        [
            new FaceButton({
                width: 100,
                height: 100,
                enabled: model.autoplay.interactable,
                active: running,
                watch: [model.autoplay.left],
                onPress: () => model.autoplay.press(),
                face: tile(18, (g, cx, cy, w, s) => {
                    ringArrow(g, cx, cy, w * 0.3, 5, 0, C.text);
                    const label = s.active > 0.5 ? String(model.autoplay.left.value) : 'A';

                    drawText(g, label, cx, cy + 1, {
                        fontFamily: FONT,
                        fontSize: 28,
                        fontWeight: 600,
                        anchor: 0.5,
                    }).fill(s.active > 0.5 ? C.gold : C.text);
                }),
            }),
            new FaceButton({
                width: 124,
                height: 124,
                enabled: model.spin.interactable,
                active: busy,
                onPress: () => model.spin.press(),
                face: tile(22, (g, cx, cy, w, s) => iconSpin(g, cx, cy, w * 0.42, s.active, C.text)),
            }),
        ],
        { direction: 'row', alignItems: 'center', gap: 16 },
    );

    // the shop tile, docked to the right edge
    const side = dock(app, {
        layout: { direction: 'column', alignItems: 'end', justifyContent: 'center' },
        landscapeData: { align: 'right', valign: 'center', width: 220, height: 240, correctionOffsetX: -40 },
        portraitData: {
            align: 'right',
            valign: 'top',
            width: 220,
            height: 240,
            correctionOffsetY: 260,
            correctionOffsetX: -20,
        },
    });
    const shopFace = linear(
        [
            [0, 0x6b55c0],
            [1, 0x3a2a75],
        ],
        { from: [0, 0], to: [0, 1] },
    );

    stack(side, [
        new FaceButton({
            width: 190,
            height: 220,
            enabled: idle,
            onPress: () => model.bus.emit('featureRequested', { id: 'shop' }),
            face: (g, cx, cy, w, h, s) => {
                const x = cx - w / 2;
                const y = cy - h / 2;

                g.roundRect(x, y + 6, w, h, 34).fill({ color: 0x000000, alpha: 0.35, blur: 12 });
                g.roundRect(x, y, w, h, 34).fill({ gradient: shopFace, color: 0xffffff });
                g.roundRect(x, y, w, h, 34).stroke({
                    width: 3,
                    color: 0xffffff,
                    alpha: 0.15 + 0.25 * s.hover,
                    alignment: 'inside',
                });
                // a cart: basket, grid, wheels
                const k = w / 190;
                const bx = cx - 52 * k;
                const by = cy - 34 * k;

                g.moveTo(bx - 22 * k, by - 14 * k)
                    .lineTo(bx - 6 * k, by - 14 * k)
                    .lineTo(bx + 8 * k, by + 50 * k)
                    .lineTo(bx + 104 * k, by + 50 * k)
                    .stroke({ width: 9 * k, color: C.gold, cap: 'round', join: 'round' });
                g.roundRect(bx, by, 112 * k, 42 * k, 6 * k).stroke({ width: 8 * k, color: C.gold, join: 'round' });
                g.moveTo(bx + 37 * k, by)
                    .lineTo(bx + 37 * k, by + 42 * k)
                    .moveTo(bx + 75 * k, by)
                    .lineTo(bx + 75 * k, by + 42 * k)
                    .moveTo(bx, by + 21 * k)
                    .lineTo(bx + 112 * k, by + 21 * k)
                    .stroke({ width: 6 * k, color: C.gold });
                g.circle(bx + 22 * k, by + 70 * k, 10 * k).stroke({ width: 7 * k, color: C.gold });
                g.circle(bx + 92 * k, by + 70 * k, 10 * k).stroke({ width: 7 * k, color: C.gold });
                if (s.dim > 0.005) g.roundRect(x, y, w, h, 34).fill({ color: C.band, alpha: 0.6 * s.dim });
            },
        }),
    ]);

    return mount(app, [bar, side]);
}

// ---------------------------------------------------------------------------------- 3. floating

/*
 * No bar: controls float over the scene with outlined display type. Two framed feature tiles
 * dock to the left edge. At the bottom: small round buttons, credit and bet lines, the message,
 * and minus, spin and plus with an autoplay pill under the spin.
 */
export function createFloatingHud(app: Application, model: HudModel): Hud {
    const C = { gold: 0xffc21a, ink: 0x14070c, white: 0xffffff, red: 0xb3141c, green: 0x2a9d3a };
    const idle = idleOf(model);
    const busy = busyOf(model);
    const goldText = linear(
        [
            [0, 0xfff2a8],
            [0.5, 0xffc21a],
            [1, 0xe07b00],
        ],
        { from: [0, 0], to: [0, 1] },
    );

    const ring =
        (draw: (g: SilkGraphics, cx: number, cy: number, r: number, s: FaceState) => void, width = 4): FacePainter =>
        (g, cx, cy, w, _h, s) => {
            const r = w / 2;

            g.circle(cx, cy, r).fill({ color: 0x000000, alpha: 0.35 + 0.15 * s.hover });
            g.circle(cx, cy, r).stroke({ width, color: C.white, alpha: 1 - 0.6 * s.dim, alignment: 'inside' });
            draw(g, cx, cy, r, s);
        };

    // ---- the left dock: two framed feature tiles
    const left = dock(app, {
        layout: { direction: 'column', gap: 26, alignItems: 'start', justifyContent: 'center' },
        landscapeData: { align: 'left', valign: 'center', width: 340, height: 460, correctionOffsetX: 40 },
        portraitData: {
            align: 'center',
            valign: 'top',
            width: 1000,
            height: 220,
            correctionOffsetY: 40,
            layout: { direction: 'row', gap: 26, justifyContent: 'center', alignItems: 'center' },
        },
    });

    const frameTile = (
        title: string,
        sub: Value<string>,
        top: number,
        bottom: number,
        onPress: () => void,
        active?: Value<boolean>,
    ) => {
        const face = linear(
            [
                [0, top],
                [1, bottom],
            ],
            { from: [0, 0], to: [0, 1] },
        );

        return new FaceButton({
            width: 300,
            height: 200,
            enabled: idle,
            active,
            watch: [sub],
            onPress,
            face: (g, cx, cy, w, h, s) => {
                const x = cx - w / 2;
                const y = cy - h / 2;
                const style = { fontFamily: DISPLAY, fontSize: 38 * (w / 300), anchor: 0.5 as const, lineHeight: 1 };

                g.roundRect(x, y + 6, w, h, 10).fill({ color: 0x000000, alpha: 0.5, blur: 14 });
                g.roundRect(x, y, w, h, 10).fill({ gradient: goldText, color: 0xffffff });
                g.roundRect(x + 10, y + 10, w - 20, h - 20, 4).fill({ gradient: face, color: 0xffffff });
                if (s.hover > 0.005)
                    g.roundRect(x + 10, y + 10, w - 20, h - 20, 4).fill({ color: 0xffffff, alpha: 0.1 * s.hover });
                drawText(g, title, cx, cy - 26 * (h / 200), style).stroke({
                    width: 4,
                    color: C.ink,
                    alignment: 'outside',
                });
                drawText(g, title, cx, cy - 26 * (h / 200), style).fill(0xf4f0e6);
                const sub2 = { ...style, fontSize: 28 * (w / 300) };
                const label = read(sub);

                drawText(g, label, cx, cy + 34 * (h / 200), sub2).stroke({
                    width: 4,
                    color: C.ink,
                    alignment: 'outside',
                });
                drawText(g, label, cx, cy + 34 * (h / 200), sub2).fill({ gradient: goldText, color: 0xffffff });
                if (s.dim > 0.005) g.roundRect(x, y, w, h, 10).fill({ color: 0x000000, alpha: 0.45 * s.dim });
            },
        });
    };

    const turboOn = computed([model.turbo.state], () => model.turbo.on);

    stack(left, [
        frameTile('BUY FEATURE', '4 OPTIONS', 0xd8322e, 0x7a0d12, () =>
            model.bus.emit('featureRequested', { id: 'buy' }),
        ),
        frameTile(
            'TURBO SPIN',
            computed([turboOn], () => (turboOn.value ? 'ON' : 'OFF')),
            0x47b84f,
            0x17621f,
            () => model.turbo.toggle(),
            turboOn,
        ),
    ]);

    // ---- the bottom dock
    const bottom = dock(app, {
        layout: {
            direction: 'row',
            alignItems: 'center',
            gap: 28,
            padding: [0, 40],
            media: [
                {
                    breakpoint: 'portrait',
                    style: {
                        wrap: 'wrap-reverse',
                        justifyContent: 'center',
                        alignContent: 'space-evenly',
                        padding: [10, 24],
                    },
                },
            ],
        },
        landscapeData: { valign: 'bottom', width: 1920, height: 230, extendWidth: true },
        portraitData: { valign: 'bottom', width: 1080, height: 470, extendWidth: true, correctionOffsetY: -10 },
    });

    const small = (
        draw: (g: SilkGraphics, cx: number, cy: number, r: number, s: FaceState) => void,
        onPress: () => void,
        active?: Value<boolean>,
    ) => new FaceButton({ width: 56, height: 56, circle: true, enabled: idle, active, onPress, face: ring(draw, 3) });

    const line = (caption: string, value: CounterBlock) =>
        group(
            [
                new OutlineText({
                    text: caption,
                    style: { fontFamily: DISPLAY, fontSize: 34 },
                    fill: goldText,
                    outline: { width: 4, color: C.ink },
                    width: 150,
                    align: [1, 0.5],
                }),
                value,
            ],
            { direction: 'row', alignItems: 'center', gap: 14 },
        );
    const valueStyle = { fontFamily: DISPLAY, fontSize: 36 } as const;

    // left group: round buttons, then credit and bet
    stack(
        bottom,
        [
            group(
                [
                    small(
                        (g, cx, cy) => iconMenu(g, cx, cy, 24, 0, C.white),
                        () => model.bus.emit('menuRequested', undefined),
                    ),
                    small(
                        (g, cx, cy, _r, s) => iconSound(g, cx, cy, 26, s.active, C.white),
                        () => model.sound.toggle(),
                        computed([model.sound.state], () => model.sound.on),
                    ),
                ],
                { direction: 'column', gap: 12 },
            ),
            new FaceButton({
                width: 80,
                height: 80,
                circle: true,
                enabled: idle,
                onPress: () => model.bus.emit('menuRequested', undefined),
                face: ring((g, cx, cy) => {
                    drawText(g, 'i', cx, cy + 2, {
                        fontFamily: 'Georgia, serif',
                        fontSize: 46,
                        fontWeight: 700,
                        fontStyle: 'italic',
                        anchor: 0.5,
                    }).fill(C.white);
                }),
            }),
            group(
                [
                    line(
                        'CREDIT',
                        new CounterBlock({
                            width: 330,
                            height: 48,
                            value: model.balance.minor,
                            seconds: 0.6,
                            format: (n) => money(n, model.decimals),
                            style: valueStyle,
                            fill: C.white,
                        }),
                    ),
                    line(
                        'BET',
                        new CounterBlock({
                            width: 330,
                            height: 48,
                            value: betMinorOf(model),
                            seconds: 0,
                            format: (n) => money(n, model.decimals),
                            style: valueStyle,
                            fill: computed([model.bet.interactable], () =>
                                model.bet.interactable.value ? C.white : 0xb0b0b0,
                            ),
                        }),
                    ),
                ],
                { direction: 'column', gap: 0 },
            ),
        ],
        {
            direction: 'row',
            alignItems: 'center',
            gap: 18,
            media: [{ breakpoint: 'portrait', style: { basis: '100%', justifyContent: 'center' } }],
        },
    );

    // the message, between the two groups
    stack(
        bottom,
        [
            new OutlineText({
                text: model.message,
                style: { fontFamily: DISPLAY, fontSize: 40 },
                fill: C.white,
                outline: { width: 5, color: C.ink },
                shadow: 4,
                width: 640,
                height: 60,
            }),
        ],
        {
            direction: 'row',
            grow: 1,
            justifyContent: 'center',
            media: [{ breakpoint: 'portrait', style: { basis: '100%', grow: 0 } }],
        },
    );

    // the right group: minus, spin over the autoplay pill, plus
    const running = computed([model.autoplay.state], () => model.autoplay.state.value === 'running');
    const step = (up: boolean) =>
        new FaceButton({
            width: 84,
            height: 84,
            circle: true,
            enabled: up ? model.bet.canUp : model.bet.canDown,
            onPress: () => model.bet.step(up ? 1 : -1),
            face: ring((g, cx, cy, _r, s) => {
                const a = 1 - 0.6 * s.dim;

                g.roundRect(cx - 18, cy - 3, 36, 6, 3).fill({ color: C.white, alpha: a });
                if (up) g.roundRect(cx - 3, cy - 18, 6, 36, 3).fill({ color: C.white, alpha: a });
            }),
        });

    stack(
        bottom,
        [
            step(false),
            group(
                [
                    new FaceButton({
                        width: 168,
                        height: 168,
                        circle: true,
                        pressScale: 0.9,
                        enabled: model.spin.interactable,
                        active: busy,
                        onPress: () => model.spin.press(),
                        face: (g, cx, cy, w, _h, s) => {
                            const r = w / 2;

                            g.circle(cx, cy, r).fill({ color: 0x000000, alpha: 0.4 + 0.15 * s.hover });
                            g.circle(cx, cy, r).stroke({ width: 7, color: C.white, alignment: 'inside' });
                            iconSpin(g, cx, cy, r * 0.62, s.active, C.white);
                            if (s.dim > 0.005) g.circle(cx, cy, r).fill({ color: 0x000000, alpha: 0.4 * s.dim });
                        },
                    }),
                    new FaceButton({
                        width: 200,
                        height: 50,
                        enabled: model.autoplay.interactable,
                        active: running,
                        watch: [model.autoplay.left],
                        onPress: () => model.autoplay.press(),
                        face: (g, cx, cy, w, h, s) => {
                            const x = cx - w / 2;
                            const y = cy - h / 2;

                            g.roundRect(x, y, w, h, h / 2).fill({ color: 0x0b0b10, alpha: 0.9 });
                            g.roundRect(x, y, w, h, h / 2).stroke({
                                width: 3,
                                color: s.active > 0.5 ? C.gold : C.white,
                                alpha: 0.85,
                                alignment: 'inside',
                            });
                            const label = s.active > 0.5 ? `STOP ${model.autoplay.left.value}` : 'AUTOPLAY';

                            drawText(g, label, cx, cy + 1, { fontFamily: DISPLAY, fontSize: 22, anchor: 0.5 }).fill(
                                C.white,
                            );
                        },
                    }),
                ],
                { direction: 'column', alignItems: 'center', gap: 6 },
            ),
            step(true),
        ],
        { direction: 'row', alignItems: 'center', gap: 22 },
    );

    return mount(app, [bottom, left]);
}

/** The skins the lab can show, by name. */
export const SKINS = {
    console: createConsoleHud,
    strip: createStripHud,
    floating: createFloatingHud,
} as const;
