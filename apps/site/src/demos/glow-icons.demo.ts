import { Container } from 'pixi.js';
import { linear, radial, SilkGraphics } from 'pixi-silk';
import { bolt, drop } from 'pixi-silk/glow';
import { defineDemo } from './runtime';

const S = 176;

interface Palette {
    lead: number;
    mid: number;
    deep: number;
    rim: number;
    accent: number;
}

const PALETTES: Record<string, Palette> = {
    violet: { lead: 0x56d8ff, mid: 0x5636ff, deep: 0x2a0d73, rim: 0xc8f6ff, accent: 0xff4060 },
    sunset: { lead: 0xffe45c, mid: 0xff5a36, deep: 0xc0129a, rim: 0xfff4c2, accent: 0xb43cff },
    ice: { lead: 0x8af4ff, mid: 0x2d7dff, deep: 0x5b2bff, rim: 0xeaffff, accent: 0x7c4dff },
};

type Draw = (g: SilkGraphics) => SilkGraphics;

/**
 * A big shape that runs off the tile, the direction its light travels (lead edge to trailing side)
 * and how far along its box the colour has faded out.
 */
const ICONS: [Draw, angle: number, reach: number][] = [
    // bolt, cut by the top and right edges, lit from its left notch
    [(g) => bolt(g, 34, -46, 168, 236), 0, 1],
    // a dome rising from the bottom right corner, lit along its rim
    [(g) => g.circle(S * 1.02, S * 1.04, S * 0.8), Math.PI / 4, 0.5],
    // a drop sitting on the bottom edge, lit from the left
    [(g) => drop(g, S * 0.5, S * 1.02, S * 0.4, S * 0.66), -Math.PI / 6, 1],
    // a zigzag wall, lit along its left edge
    [
        (g) =>
            g.poly([S * 0.96, -10, S * 0.3, S * 0.4, S * 0.74, S * 0.6, S * 0.5, S + 10, S + 10, S + 10, S + 10, -10]),
        0,
        0.8,
    ],
];

export default defineDemo({
    size: [440, 440],
    background: 0x08080a,
    controls: {
        palette: { type: 'select', label: 'palette', options: Object.keys(PALETTES), value: 'violet' },
    },
    setup({ stage, params, tick }) {
        const arts: SilkGraphics[] = [];

        ICONS.forEach((_, i) => {
            const tile = new Container();
            const plate = new SilkGraphics();
            const clip = new SilkGraphics();
            const art = new SilkGraphics();
            const rim = new SilkGraphics();

            plate.roundRect(0, 0, S, S, 42, 0.6).fill(
                radial(
                    [
                        [0, 0x16161c, 1],
                        [1, 0x0a0a0d, 1],
                    ],
                    { center: [0.3, 0.2], radius: 1.1 },
                ),
            );
            clip.roundRect(0, 0, S, S, 42, 0.6).fill(0xffffff);
            art.mask = clip;
            // a thin glassy rim on top of the art, brighter where the light is
            rim.roundRect(0.5, 0.5, S - 1, S - 1, 42, 0.6).stroke({
                width: 1.4,
                gradient: linear(
                    [
                        [0, 0xffffff, 0.32],
                        [0.5, 0xffffff, 0.06],
                        [1, 0xffffff, 0.2],
                    ],
                    { from: [0, 0], to: [1, 1] },
                ),
                alignment: 'inside',
            });
            tile.addChild(plate, art, clip, rim);
            tile.position.set(30 + (i % 2) * (S + 28), 30 + Math.floor(i / 2) * (S + 28));
            stage.addChild(tile);
            arts.push(art);
        });

        let last = '';

        tick(() => {
            if (params.palette === last) return;
            last = params.palette;
            const p = PALETTES[params.palette];

            ICONS.forEach(([draw, angle, reach], i) => {
                const art = arts[i];
                const dx = Math.cos(angle);
                const dy = Math.sin(angle);
                const from: [number, number] = [0.5 - dx * 0.5, 0.5 - dy * 0.5];
                const to: [number, number] = [0.5 + dx * 0.5, 0.5 + dy * 0.5];
                const body = linear(
                    [
                        [0, p.lead, 1],
                        [0.3 * reach, p.mid, 1],
                        [0.7 * reach, p.deep, 0.85],
                        [reach, p.deep, 0],
                    ],
                    { from, to },
                );

                art.clear();
                // bloom that spills past the lit edge
                draw(art).fill({ gradient: body, alpha: 0.45, blur: 20, spread: 6, blend: 'add' });
                // the body: crisp on the lit side, dissolving towards the trailing side
                draw(art).fill({ gradient: body, blur: { from: 0.8, to: 46 * reach, angle }, blend: 'add' });
                // the lit edge: a shadow pushed towards the trailing side leaves a bright band along the lead
                draw(art).fill({
                    color: 0x000000,
                    alpha: 0,
                    innerShadow: [
                        { color: p.rim, alpha: 0.8, x: dx * 4, y: dy * 4, blur: 1.5, blend: 'add' },
                        { color: p.lead, alpha: 0.45, x: dx * 16, y: dy * 16, blur: 9, blend: 'add' },
                    ],
                });
                // a warm or cool kick where the lit edge meets the tile
                art.circle(S * (0.5 - dx * 0.35), S * 0.98, 26).fill({
                    color: p.accent,
                    alpha: 0.35,
                    blur: 18,
                    blend: 'add',
                });
            });
        });

        return undefined;
    },
});
