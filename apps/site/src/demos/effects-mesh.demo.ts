import { Container } from 'pixi.js';
import { linear, mesh, SilkGraphics } from 'pixi-silk';
import { defineDemo } from './runtime';

// A light beam over a lit tablet. A linear gradient can only fade upwards, so its sides stay hard.
// A 3 x 3 mesh also fades towards the sides. Drag a yellow handle up or down to change its brightness.
const LIGHT = 0xffd9ec;
const BOX = { x0: 150, y0: 40, x1: 450, y1: 262 };

export default defineDemo({
    title: 'Mesh gradient',
    size: [600, 340],
    background: 0x2e2f7a,
    touchAction: 'none',
    controls: {
        paint: { type: 'select', label: 'beam', options: ['mesh', 'linear'], value: 'mesh' },
    },
    setup({ stage, params, tick }) {
        const beam = new SilkGraphics();
        const tablet = new SilkGraphics();
        const handles = new SilkGraphics();
        const hit = new Container();
        // brightness of the control points, top row first
        const alpha = [0, 0, 0, 0, 0.35, 0, 0.15, 1, 0.15];
        let grab: { i: number; y: number; a: number } | null = null;
        let drawn = '';

        const point = (i: number) => ({
            x: BOX.x0 + ((i % 3) / 2) * (BOX.x1 - BOX.x0),
            y: BOX.y0 + (Math.floor(i / 3) / 2) * (BOX.y1 - BOX.y0),
        });

        tablet.triangle(165, 262, 435, 262, 470, 300, 2).fill(0x1d1e52);
        tablet.triangle(165, 262, 130, 300, 470, 300, 2).fill(0x1d1e52);
        tablet.roundRect(170, 266, 260, 26, 4).fill(0xffe2ee);
        tablet.rect(130, 300, 340, 9).fill(0x15163d);

        hit.eventMode = 'static';
        hit.hitArea = { contains: () => true };
        hit.on('pointerdown', (e) => {
            if (params.paint !== 'mesh') return;
            const p = e.getLocalPosition(stage);
            const i = alpha.findIndex((_, k) => Math.hypot(point(k).x - p.x, point(k).y - p.y) < 20);

            grab = i < 0 ? null : { i, y: p.y, a: alpha[i] };
        });
        hit.on('globalpointermove', (e) => {
            if (!grab) return;
            alpha[grab.i] = Math.min(1, Math.max(0, grab.a - (e.getLocalPosition(stage).y - grab.y) / 120));
        });
        hit.on('pointerup', () => (grab = null));
        hit.on('pointerupoutside', () => (grab = null));
        stage.addChild(beam, tablet, handles, hit);

        tick(() => {
            const key = `${params.paint}|${alpha.join(',')}`;

            if (key === drawn) return;
            drawn = key;
            const units = { units: 'local' as const };
            const paint =
                params.paint === 'mesh'
                    ? mesh(
                          3,
                          3,
                          alpha.map((a) => [LIGHT, a] as [number, number]),
                          { ...units, from: [BOX.x0, BOX.y0], to: [BOX.x1, BOX.y1] },
                      )
                    : linear(
                          [
                              [0, LIGHT, 0],
                              [1, LIGHT, 1],
                          ],
                          { ...units, from: [0, BOX.y0], to: [0, BOX.y1] },
                      );

            beam.clear();
            beam.rect(BOX.x0, BOX.y0, BOX.x1 - BOX.x0, BOX.y1 - BOX.y0).fill(paint);

            handles.clear();
            if (params.paint !== 'mesh') return;
            handles.rect(BOX.x0, BOX.y0, BOX.x1 - BOX.x0, BOX.y1 - BOX.y0).stroke({
                width: 1,
                color: 0xffef6e,
                alpha: 0.4,
                dash: [4, 4],
            });
            alpha.forEach((a, i) => {
                const p = point(i);

                handles
                    .circle(p.x, p.y, 6)
                    .fill({ color: 0xffef6e, alpha: 0.2 + a * 0.8 })
                    .stroke({ width: 1.5, color: 0xffef6e });
            });
        });

        return undefined;
    },
});
