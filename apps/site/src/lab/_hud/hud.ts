/*
 * The HUD's views, built from pixi-silk/ui/blocks. The logic (core.ts) holds the state as
 * signals, and every block is connected to the signals it shows: nothing here pushes values
 * around by hand.
 *
 * - BlockSurface is a SmartContainer docked to the bottom. Its rows and columns are flex groups.
 * - Every block paints into the surface's one SilkGraphics, text included (drawText), so a
 *   repaint is one instanced draw. At rest the surface is cached: one textured quad on screen.
 * - The loop runs while a spring moves or a counter counts, then sleeps. The spin button changes
 *   face once per round and never loops an animation.
 */
import type { Application } from 'pixi.js';
import { radial, type SilkGraphics } from 'pixi-silk';
import { computed } from 'pixi-silk/signal';
import {
    Block,
    BlockSurface,
    ButtonBlock,
    CounterBlock,
    group,
    type IconPainter,
    PanelBlock,
    stack,
    TextBlock,
} from 'pixi-silk/ui/blocks';
import { type HudModel, money, type Readout } from './core';

const TAU = Math.PI * 2;
export const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", "Segoe UI", system-ui, sans-serif';
const C = { plate: 0x0b0d14, chip: 0x1b1f2c, muted: 0x8e93a6, gold: 0xffc94d, accent: 0x5ac8fa, red: 0xff5a5f };

// Gradients take rows in a shared atlas: make them once, never per repaint.
const SPIN_FACE = radial(
    [
        [0, 0x46f09a],
        [0.7, 0x2fd27a],
        [1, 0x0d7a44],
    ],
    { center: [0.5, 0.32], radius: 0.75 },
);
const SPIN_BUSY = radial(
    [
        [0, 0xffa0a3],
        [0.7, C.red],
        [1, 0x8a1d22],
    ],
    { center: [0.5, 0.32], radius: 0.75 },
);

// ---------------------------------------------------------------------------------- icons

export const iconMenu: IconPainter = (g, cx, cy, s, _t, color) => {
    const w = s * 0.9;

    for (const dy of [-0.32, 0, 0.32]) g.roundRect(cx - w / 2, cy + dy * s - 2, w, 4, 2).fill(color);
};

export const iconSound: IconPainter = (g, cx, cy, s, t, color) => {
    const k = s / 32;

    g.poly([
        cx - 14 * k,
        cy - 6 * k,
        cx - 7 * k,
        cy - 6 * k,
        cx + 2 * k,
        cy - 14 * k,
        cx + 2 * k,
        cy + 14 * k,
        cx - 7 * k,
        cy + 6 * k,
        cx - 14 * k,
        cy + 6 * k,
    ]).fill(color);
    if (t > 0.01) {
        g.arcSweep(cx + 4 * k, cy, 8 * k, -0.8, 1.6).stroke({ width: 3, color, alpha: t, cap: 'round' });
        g.arcSweep(cx + 4 * k, cy, 15 * k, -0.8, 1.6).stroke({ width: 3, color, alpha: t, cap: 'round' });
    }
    if (t < 0.99) {
        g.moveTo(cx + 8 * k, cy - 6 * k)
            .lineTo(cx + 18 * k, cy + 6 * k)
            .moveTo(cx + 18 * k, cy - 6 * k)
            .lineTo(cx + 8 * k, cy + 6 * k)
            .stroke({ width: 3, color: C.red, alpha: 1 - t, cap: 'round' });
    }
};

export const iconTurbo: IconPainter = (g, cx, cy, s, _t, color) => {
    const k = s / 34;

    g.poly([
        cx + 3 * k,
        cy - 17 * k,
        cx - 11 * k,
        cy + 3 * k,
        cx - 1 * k,
        cy + 3 * k,
        cx - 4 * k,
        cy + 17 * k,
        cx + 11 * k,
        cy - 4 * k,
        cx + 1 * k,
        cy - 4 * k,
    ]).fill(color);
};

/** The autoplay loop, faded out while the rounds-left count shows. */
export const iconAuto: IconPainter = (g, cx, cy, s, t, color) => {
    if (t > 0.99) return;
    const k = s / 34;

    g.arcSweep(cx, cy, 13 * k, -Math.PI / 2 + 0.5, TAU - 1.2).stroke({ width: 3.5, color, alpha: 1 - t, cap: 'round' });
    g.poly([cx - 3 * k, cy - 20 * k, cx + 7 * k, cy - 13 * k, cx - 3 * k, cy - 6 * k]).fill({ color, alpha: 1 - t });
};

/** Two arrows that fold into a stop square as the button turns busy (`t` 0 to 1). */
export const iconSpin: IconPainter = (g, cx, cy, s, t) => {
    const a = 1 - t;

    if (a > 0.01) {
        const rr = s * 0.9 * (0.6 + 0.4 * a);

        for (let i = 0; i < 2; i++) {
            const start = -Math.PI / 2 + i * Math.PI + 0.35;
            const sweep = Math.PI - 0.7;
            const end = start + sweep;
            const tx = cx + Math.cos(end) * rr;
            const ty = cy + Math.sin(end) * rr;
            const d = end + Math.PI / 2;
            const k = 13 * (0.6 + 0.4 * a);

            g.arcSweep(cx, cy, rr, start, sweep).stroke({
                width: 10 * (0.6 + 0.4 * a),
                color: 0xffffff,
                alpha: a,
                cap: 'round',
            });
            g.poly([
                tx + Math.cos(d) * k,
                ty + Math.sin(d) * k,
                tx + Math.cos(d + 2.3) * k,
                ty + Math.sin(d + 2.3) * k,
                tx + Math.cos(d - 2.3) * k,
                ty + Math.sin(d - 2.3) * k,
            ]).fill({ color: 0xffffff, alpha: a });
        }
    }
    if (t > 0.01) {
        const q = 26 * t;

        g.roundRect(cx - q, cy - q, q * 2, q * 2, 8 * t).fill({ color: 0xffffff, alpha: t });
    }
};

// ---------------------------------------------------------------------------------- custom blocks

/** The thin bar under the bet: where the bet sits on its ladder. A custom block: a spring and a paint. */
class LadderBlock extends Block {
    private readonly pos = this.spring();

    constructor(private readonly model: HudModel) {
        super({ width: 150, height: 4 });
        this.pos.value = this.pos.target = this.at();
        this.watch(model.bet.index, model.bet.interactable);
    }

    private at(): number {
        return this.model.bet.index.value / (this.model.bet.levels.length - 1);
    }

    protected override onChange(): void {
        this.pos.target = this.at();
        this.wake();
    }

    paint(g: SilkGraphics, x: number, y: number): void {
        const locked = !this.model.bet.interactable.value;

        g.roundRect(x, y, this.w, this.h, 2).fill({ color: 0xffffff, alpha: 0.1 });
        g.roundRect(x, y, Math.max(4, this.w * this.pos.value), this.h, 2).fill({
            color: C.gold,
            alpha: locked ? 0.4 : 0.9,
        });
    }
}

/** A caption over a counting money value, on a chip that glows gold while it holds a win. */
function readout(r: Readout, decimals: number, seconds: number, glow: boolean) {
    const lit = computed([r.minor], () => glow && r.minor.value > 0);

    return group(
        [
            [
                new PanelBlock({
                    radius: 22,
                    fill: computed([lit], () =>
                        lit.value ? { color: C.gold, alpha: 0.14 } : { color: C.chip, alpha: 0.75 },
                    ),
                    stroke: computed([lit], () => ({
                        width: lit.value ? 2 : 1,
                        color: lit.value ? C.gold : 0xffffff,
                        alpha: lit.value ? 0.6 : 0.08,
                        alignment: 'inside' as const,
                    })),
                }),
                { position: 'absolute', inset: 0 },
            ],
            new TextBlock({
                text: r.caption,
                style: { fontFamily: FONT, fontSize: 20, fontWeight: 700, letterSpacing: 2 },
                fill: C.muted,
            }),
            new CounterBlock({
                width: 216,
                height: 48,
                value: r.minor,
                seconds,
                format: (n) => money(n, decimals),
                style: { fontFamily: FONT, fontSize: 40, fontWeight: 700 },
                fill: computed([lit], () => (lit.value ? C.gold : 0xffffff)),
            }),
        ],
        { direction: 'column', width: 260, height: 104, padding: [12, 22], justifyContent: 'center', gap: 2 },
    );
}

// ---------------------------------------------------------------------------------- the HUD

/** Builds the HUD for `model`: a BlockSurface docked to the bottom, connected to the model's signals. */
export function createHud(
    app: Application,
    model: HudModel,
): { bar: BlockSurface; surfaces: BlockSurface[]; destroy(): void } {
    const bar = new BlockSurface({
        viewport: app,
        ticker: app.ticker,
        switchTransition: false,
        layout: {
            direction: 'row',
            alignItems: 'center',
            gap: 28,
            padding: [0, 44],
            media: [
                {
                    breakpoint: 'portrait',
                    style: {
                        wrap: 'wrap-reverse',
                        justifyContent: 'center',
                        alignContent: 'space-evenly',
                        padding: [16, 24],
                    },
                },
            ],
        },
        landscapeData: { valign: 'bottom', width: 1920, height: 220, extendWidth: true, correctionOffsetY: -16 },
        portraitData: { valign: 'bottom', width: 1080, height: 470, extendWidth: true, correctionOffsetY: -12 },
    });
    const ui = model;
    const plate = new PanelBlock({
        radius: 40,
        fill: { color: 0x10131c, alpha: 0.94 },
        stroke: { width: 1, color: 0xffffff, alpha: 0.1 },
    });

    bar.add(plate, plate.layout({ position: 'absolute', inset: 0 }));
    // the message line, above the bar
    const message = new TextBlock({
        text: ui.message,
        style: { fontFamily: FONT, fontSize: 22, fontWeight: 700, letterSpacing: 3 },
        fill: C.muted,
        align: [0.5, 0.5],
        height: 30,
    });

    bar.add(message, message.layout({ position: 'absolute', left: 0, right: 0, top: -40 }));

    const chip = { fill: C.chip, active: C.accent, content: 0xffffff, contentActive: C.plate };
    const idle = computed([ui.spin.state, ui.locks], () => ui.spin.state.value === 'idle' && ui.locks.value === 0);

    // left: menu, sound, balance, win
    stack(
        bar,
        [
            new ButtonBlock({
                width: 76,
                height: 76,
                shape: 'circle',
                icon: iconMenu,
                colors: chip,
                enabled: idle,
                onPress: () => ui.bus.emit('menuRequested', undefined),
            }),
            new ButtonBlock({
                width: 76,
                height: 76,
                shape: 'circle',
                icon: iconSound,
                colors: { ...chip, active: C.chip, contentActive: 0xffffff },
                active: computed([ui.sound.state], () => ui.sound.on),
                enabled: ui.sound.interactable,
                onPress: () => ui.sound.toggle(),
            }),
            readout(ui.balance, ui.decimals, 0.6, false),
            readout(ui.win, ui.decimals, 1.4, true),
        ],
        {
            direction: 'row',
            alignItems: 'center',
            gap: 16,
            grow: 1,
            media: [{ breakpoint: 'portrait', style: { basis: '100%', grow: 0, justifyContent: 'center' } }],
        },
    );

    // bet: minus, caption and value, plus, on a pill
    const betMinor = computed([ui.bet.bet], () => Math.round(ui.bet.bet.value * 10 ** ui.decimals));
    const step = {
        width: 68,
        height: 68,
        shape: 'circle' as const,
        colors: { fill: 0x2a3042 },
        labelStyle: { fontSize: 34, fontWeight: 600 },
    };

    stack(
        bar,
        [
            [new PanelBlock({ radius: 52, fill: { color: C.chip, alpha: 0.75 } }), { position: 'absolute', inset: 0 }],
            new ButtonBlock({ ...step, label: '−', enabled: ui.bet.canDown, onPress: () => ui.bet.step(-1) }),
            group(
                [
                    new TextBlock({
                        text: 'BET',
                        width: 150,
                        style: { fontFamily: FONT, fontSize: 20, fontWeight: 700, letterSpacing: 2 },
                        fill: C.muted,
                        align: [0.5, 0.5],
                    }),
                    new CounterBlock({
                        width: 150,
                        height: 44,
                        value: betMinor,
                        seconds: 0,
                        format: (n) => money(n, ui.decimals),
                        style: { fontFamily: FONT, fontSize: 36, fontWeight: 700 },
                        fill: computed([ui.bet.interactable], () => (ui.bet.interactable.value ? 0xffffff : 0x7d8296)),
                        align: [0.5, 0.5],
                    }),
                    new LadderBlock(ui),
                ],
                { direction: 'column', alignItems: 'center', gap: 2 },
            ),
            new ButtonBlock({ ...step, label: '+', enabled: ui.bet.canUp, onPress: () => ui.bet.step(1) }),
        ],
        { direction: 'row', alignItems: 'center', gap: 10, padding: [0, 18], height: 104 },
    );

    // the round button: arrows when idle, a stop square while the round runs
    const busy = computed([ui.spin.state], () => ui.spin.state.value !== 'idle' && ui.spin.state.value !== 'disabled');

    stack(bar, [
        new ButtonBlock({
            width: 184,
            height: 184,
            shape: 'circle',
            icon: iconSpin,
            shadow: 14,
            pressScale: 0.88,
            active: busy,
            enabled: ui.spin.interactable,
            colors: {
                fill: { gradient: SPIN_FACE, color: 0xffffff },
                active: { gradient: SPIN_BUSY, color: 0xffffff },
            },
            onPress: () => ui.spin.press(),
        }),
    ]);

    // turbo and autoplay, in a column
    const running = computed([ui.autoplay.state], () => ui.autoplay.state.value === 'running');

    stack(
        bar,
        [
            new ButtonBlock({
                width: 76,
                height: 76,
                shape: 'circle',
                icon: iconTurbo,
                colors: chip,
                active: computed([ui.turbo.state], () => ui.turbo.on),
                enabled: ui.turbo.interactable,
                onPress: () => ui.turbo.toggle(),
            }),
            new ButtonBlock({
                width: 76,
                height: 76,
                shape: 'circle',
                icon: iconAuto,
                label: computed([ui.autoplay.left, running], () =>
                    running.value ? String(ui.autoplay.left.value) : '',
                ),
                labelStyle: { fontFamily: FONT, fontSize: 24, fontWeight: 800 },
                colors: chip,
                active: running,
                enabled: ui.autoplay.interactable,
                onPress: () => ui.autoplay.press(),
            }),
        ],
        { direction: 'column', gap: 14 },
    );

    app.stage.addChild(bar);

    return {
        bar,
        surfaces: [bar],
        destroy() {
            bar.destroy({ children: true });
        },
    };
}
