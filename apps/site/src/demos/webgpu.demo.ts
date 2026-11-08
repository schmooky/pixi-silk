import { along, conic, linear, mesh, radial, SilkGraphics, vertical } from 'pixi-silk';
import { defineDemo } from './runtime';

// The same scene on both renderers: WebGL2 runs the GLSL shader, WebGPU its WGSL port.
// Each cell uses a different part of the shader: every shape, dashes, caps, alignment,
// hairlines, blur, spread, progressive blur, inner shadows, every gradient kind and plus-lighter.
const CELL = 72;

export default defineDemo({
    title: 'WebGL2 and WebGPU',
    size: [460, 310],
    renderers: ['webgl', 'webgpu'],
    controls: {
        spin: { type: 'toggle', label: 'rotate', value: false },
    },
    setup({ stage, params, tick }) {
        const g = new SilkGraphics();

        stage.addChild(g);
        tick((t) => {
            const a = params.spin ? t * 0.5 : 0;
            const cells: ((g: SilkGraphics) => void)[] = [
                (g) => g.roundRect(-28, -22, 56, 44, 14, 0.6).fill(linear([0x0a84ff, 0xbf5af2])),
                (g) => g.circle(0, 0, 26).fill(radial([0xffffff, 0xff9f0a, [1, 0xff375f, 0]])),
                (g) => g.ellipse(0, 0, 30, 20).stroke({ width: 4, color: 0x64d2ff, dash: [0, 9], cap: 'round' }),
                (g) =>
                    g.arcSweep(0, 0, 22, -Math.PI / 2, Math.PI * 1.5).stroke({
                        width: 9,
                        cap: 'round',
                        gradient: conic([0x30d158, 0xffd60a, 0xff453a]),
                    }),
                (g) => g.sector(0, 0, 28, -2.2, 1.4, 12, 4).fill(0x30d158),
                (g) => g.heart(0, 2, 54, 0.12).fill({ color: 0xff375f, blur: 6, blend: 'add' }),
                (g) =>
                    g
                        .star(0, 0, 5, 28, undefined, 0, 3)
                        .fill(0xffd60a)
                        .stroke({ width: 3, color: 0xffffff, alignment: 'outside' }),
                (g) =>
                    g.triangle(-26, 20, 26, 20, 0, -26, 5).stroke({ width: 4, color: 0xac8e68, alignment: 'inside' }),
                (g) =>
                    g
                        .beginPath()
                        .moveTo(-26, 18)
                        .bezierCurveTo(-30, -30, 10, -10, 4, -2)
                        .bezierCurveTo(30, -30, 30, 20, -26, 18)
                        .closePath()
                        .fill(vertical([0xff9f0a, 0xff375f])),
                (g) =>
                    g.polyline([-30, 16, -12, -14, 8, 10, 30, -18], { smooth: 'catmull' }).stroke({
                        width: [2, 9],
                        cap: 'round',
                        gradient: along([0x5e5ce6, 0x64d2ff]),
                    }),
                (g) =>
                    g.area([-30, 10, -15, -6, 0, 2, 15, -16, 30, -8], 20, { smooth: 'monotone' }).fill(
                        vertical([
                            [0, 0x30d158, 0.9],
                            [1, 0x30d158, 0.05],
                        ]),
                    ),
                (g) => {
                    for (let i = 0; i < 6; i++)
                        g.line(-28, -18 + i * 7, 28, -18 + i * 7).stroke({ width: 0.25 + i * 0.25, color: 0xffffff });
                },
                (g) =>
                    g
                        .roundRect(-22, -16, 44, 32, 8)
                        .fill({ color: 0x0a84ff, alpha: 0.9, blur: 7, spread: 4 })
                        .roundRect(-22, -16, 44, 32, 8)
                        .fill(0x1c1c1e),
                (g) =>
                    g.roundRect(-26, -22, 52, 44, 12).fill({
                        color: 0x1c1c1e,
                        innerShadow: [
                            { color: 0x6694ff, x: 0, y: -10, blur: 8, spread: -2 },
                            { color: 0xffffff, alpha: 0.5, x: 0, y: 4, blur: 2, blend: 'add' },
                        ],
                    }),
                (g) => g.roundRect(-26, -22, 52, 44, 10).fill({ color: 0xff9f0a, blur: { from: 0, to: 9 } }),
                (g) => g.roundRect(-28, -22, 56, 44, 6).fill(mesh(2, 2, [0xff375f, 0x0a84ff, 0xffd60a, 0x30d158])),
                (g) => g.circle(0, 0, 24).stroke({ width: 6, color: 0xbf5af2, dash: [10, 6], cap: 'butt' }),
                (g) => g.regularPoly(0, 0, 26, 6, 0, 5).fill({ gradient: linear([0x64d2ff, 0x0a84ff]), alpha: 0.85 }),
            ];

            g.clear();
            cells.forEach((draw, i) => {
                g.save()
                    // the top row leaves room for the renderer label
                    .translateTransform(50 + (i % 6) * CELL, 76 + Math.floor(i / 6) * 90)
                    .rotateTransform(a);
                draw(g);
                g.restore();
            });
        });

        return undefined;
    },
});
