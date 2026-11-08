import { Container, Graphics } from 'pixi.js';
import { createSilkApp, SilkGraphics, Spring } from 'pixi-silk';
import { Cx, type SheetWidget } from './cx';

/** How a reference sheet paints: background, text condensing, and the chrome behind each widget. */
export interface CardStyle {
    background: number;
    /** Horizontal text condense (watch sheets use about 0.93). */
    condense?: number;
    /** Optical text scale, 2 for sheets exported from @2x designs. */
    optical?: number;
    /** Paints the card behind a widget (shadows, rounded black cards). */
    card?: (g: SilkGraphics, w: SheetWidget) => void;
}

/** One widget, ready to show on its own. */
export interface CardDef {
    id: string;
    name: string;
    /** Size in reference pixels. */
    size: [number, number];
    /** Corner radius for sheets that paint a card behind it. */
    radius?: number;
    style: CardStyle;
    draw: (c: Cx) => void;
}

/** Wraps a widget's draw function so Studio can show it alone, animated. Has no side effects. */
export function card(draw: (c: Cx) => void, o: Omit<CardDef, 'draw'>): CardDef {
    return { ...o, draw };
}

/**
 * Shows one widget, large and centred. It rises in and draws on from left to right, then its
 * live values keep moving. A click replays the entrance. `t` starts a little before the
 * reference pose, so the motion has somewhere to go.
 */
export async function mountCard(def: CardDef, host: HTMLElement): Promise<() => void> {
    const [w, h] = def.size;
    const widget: SheetWidget = { id: def.id, name: def.name, x: 0, y: 0, w, h, radius: def.radius, draw: def.draw };
    const light = def.style.background > 0x808080;
    const silk = await createSilkApp({ parent: host, background: light ? def.style.background : 0x000000 });
    const app = silk.app;
    const root = new Container();
    const chrome = new SilkGraphics();
    const c = new Cx();
    const rise = new Spring(0, 140, 18);
    // a wipe that draws the widget on from left to right (with room for card shadows)
    const wipe = new Spring(0, 60, 14);
    const mask = new Graphics();
    const PAD = 80;
    let t = 1.2;
    let age = 0;

    Cx.condense = def.style.condense ?? 1;
    Cx.optical = def.style.optical ?? 1;
    def.style.card?.(chrome, widget);
    root.addChild(chrome, c.view, mask);
    root.mask = mask;
    app.stage.addChild(root);

    const fit = () => {
        const pad = Math.min(silk.width, silk.height) * 0.12;
        const s = Math.min((silk.width - pad * 2) / w, (silk.height - pad * 2) / h, 4);

        Cx.textResolution = Math.min(8, silk.resolution * s * 1.25);

        return s;
    };
    let scale = fit();

    app.renderer.on('resize', () => {
        scale = fit();
    });
    const replay = () => {
        rise.value = 0;
        rise.velocity = 0;
        wipe.value = 0;
        wipe.velocity = 0;
        age = 0;
    };

    rise.target = 1;
    wipe.target = 1;
    app.canvas.addEventListener('pointerdown', replay);
    app.ticker.add((ticker) => {
        const dt = Math.min(0.1, ticker.deltaMS / 1000);

        t += dt;
        age += dt;
        rise.step(dt);
        wipe.step(dt);
        const k = Math.max(0, rise.value);
        const reach = Math.min(1, Math.max(0, wipe.value));

        mask.clear()
            .rect(-PAD, -PAD, PAD + (w + PAD) * reach, h + PAD * 2)
            .fill(0xffffff);
        const s = scale * (0.94 + 0.06 * k);

        root.scale.set(s);
        root.position.set((silk.width - w * s) / 2, (silk.height - h * s) / 2 + (1 - k) * 18);
        root.alpha = Math.min(1, k * 1.4);
        // the live values settle from a calmer pose while it rises in
        c.begin(t - Math.max(0, 0.8 - age) * 1.5);
        def.draw(c);
        c.end();
    });

    return () => {
        app.canvas.removeEventListener('pointerdown', replay);
        silk.destroy();
    };
}
