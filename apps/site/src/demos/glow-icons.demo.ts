import { Container } from 'pixi.js';
import { linear, SilkGraphics, type StopInput } from 'pixi-silk';
import { defineDemo } from './runtime';

const HOT: StopInput[] = [
    [0, 0xfff1a8, 1],
    [0.35, 0xff9f0a, 1],
    [0.7, 0xff2d78, 0.9],
    [1, 0xff2d78, 0],
];
const COLD: StopInput[] = [
    [0, 0xd8fbff, 1],
    [0.35, 0x00c8ff, 1],
    [0.7, 0x5b4dff, 0.9],
    [1, 0x7c4dff, 0],
];

type Shape = (g: SilkGraphics) => SilkGraphics;
const S = 150;
/** Shape, ramp, and where the light leads from and trails to (fractions of the tile). */
const SHAPES: [Shape, StopInput[], [number, number], [number, number]][] = [
    [(g) => g.triangle(95, -10, 20, 95, 80, 85, 6).triangle(55, 165, 130, 60, 70, 70, 6), HOT, [0, 0], [1, 1]],
    [(g) => g.circle(80, 95, 55).triangle(80, 0, 30, 70, 130, 70, 8), COLD, [1, 0], [0, 1]],
    [(g) => g.sector(20, 130, 120, -Math.PI / 2, 0), COLD, [0, 1], [1, 0]],
    [(g) => g.arc(75, 130, 60, Math.PI, 0), HOT, [1, 1], [0, 0]],
];

export default defineDemo({
    size: [420, 420],
    background: 0x070708,
    setup({ stage }) {
        SHAPES.forEach(([shape, stops, from, to], i) => {
            const tile = new Container();
            const plate = new SilkGraphics();
            const clip = new SilkGraphics();
            const art = new SilkGraphics();
            const paint = linear(stops, { from, to });
            const arch = i === 3;

            plate.roundRect(0, 0, S, S, 34, 0.6).fill(0x111114);
            clip.roundRect(0, 0, S, S, 34, 0.6).fill(0xffffff);
            art.blendMode = 'add';
            art.mask = clip;
            // a copy whose blur grows from the lit edge to the trailing one, so the colour bleeds out
            const blur = { from: 2, to: 34, angle: Math.atan2(to[1] - from[1], to[0] - from[0]) };

            if (arch) shape(art).stroke({ width: 40, gradient: paint, alpha: 0.85, blur });
            else shape(art).fill({ gradient: paint, alpha: 0.85, blur });
            // leading side: crisp
            if (arch) shape(art).stroke({ width: 26, gradient: paint });
            else shape(art).fill({ gradient: paint, alpha: 0.95 });
            plate.roundRect(0, 0, S, S, 34, 0.6).stroke({
                width: 1.2,
                gradient: linear([
                    [0, 0xffffff, 0.35],
                    [0.5, 0xffffff, 0.04],
                    [1, 0xffffff, 0.18],
                ]),
                alignment: 'inside',
            });
            tile.addChild(plate, art, clip);
            tile.position.set(45 + (i % 2) * (S + 30), 45 + Math.floor(i / 2) * (S + 30));
            stage.addChild(tile);
        });

        return undefined;
    },
});
