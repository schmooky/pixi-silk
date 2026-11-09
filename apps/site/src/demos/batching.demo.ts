import { Container, Graphics, type WebGLRenderer } from 'pixi.js';
import { enableSilkBatching, SilkGraphics } from 'pixi-silk';
import { defineDemo, INK, readout, SERIES } from './runtime';

// 2000 separate SilkGraphics that move every frame. With batching on, runs of them share a draw,
// on WebGL2 and on WebGPU.
enableSilkBatching();

export default defineDemo({
    title: 'Batching',
    size: [720, 320],
    // phones: a taller strip with the stats on two lines, a narrower spiral
    phone: { size: [360, 320] },
    controls: {
        batching: { type: 'toggle', label: 'batching', value: true },
        count: { type: 'range', label: 'objects', min: 200, max: 4000, step: 200, value: 2000 },
    },
    setup({ silk, stage, params, tick, width, phone }) {
        const layer = new Container();
        // the stats sit in a strip above the drawing
        const top = phone ? 58 : 40;
        const strip = new Graphics().rect(0, 0, width, top).fill(INK.surface).rect(0, top, width, 1).fill(INK.line);
        const caption = readout('', phone ? 16 : 24, 13, phone ? { fontSize: 13, lineHeight: 18 } : { fontSize: 13 });

        stage.addChild(layer, strip, caption);

        // count draw calls: wrap the WebGL context, or the WebGPU render pass encoder
        const renderer = silk.app.renderer as WebGLRenderer;
        const gl = renderer.gl as WebGL2RenderingContext | undefined;
        const restore: (() => void)[] = [];
        let calls = 0;
        // only draws of this demo's renderer count: other demos on the page may draw in between
        let mine = false;
        const wrap = <T extends object>(target: T, names: (keyof T & string)[]) => {
            for (const name of names) {
                const fn = target[name] as unknown as (...a: unknown[]) => unknown;

                (target as Record<string, unknown>)[name] = function (this: unknown, ...a: unknown[]) {
                    if (mine) calls++;

                    return fn.apply(this, a);
                };
                restore.push(() => {
                    (target as Record<string, unknown>)[name] = fn;
                });
            }
        };

        if (gl) wrap(gl, ['drawElementsInstanced', 'drawElements']);
        else if (typeof GPURenderPassEncoder !== 'undefined')
            wrap(GPURenderPassEncoder.prototype, ['drawIndexed', 'draw']);
        const counter = {
            prerender: () => {
                calls = 0;
                mine = true;
            },
            postrender: () => {
                mine = false;
            },
        };

        silk.app.renderer.runners.prerender.add(counter);
        silk.app.renderer.runners.postrender.add(counter);

        let built = '';
        const colors = SERIES.slice(0, 5);
        const build = () => {
            for (const child of layer.removeChildren()) child.destroy();
            for (let i = 0; i < params.count; i++) {
                const g = new SilkGraphics({ batch: params.batching });
                const color = colors[i % colors.length];

                if (i % 3 === 0) g.circle(0, 0, 4).fill({ color, alpha: 0.8 });
                else if (i % 3 === 1) g.roundRect(-4, -4, 8, 8, 2).stroke({ width: 1.5, color });
                else g.star(0, 0, 5, 5).fill(color);
                layer.addChild(g);
            }
            built = `${params.batching}:${params.count}`;
        };

        tick((t) => {
            if (built !== `${params.batching}:${params.count}`) build();
            const n = layer.children.length;

            layer.children.forEach((g, i) => {
                const a = i * 2.399963 + t * 0.3;
                const r = Math.sqrt(i / n) * 118;

                g.position.set(
                    width / 2 + Math.cos(a) * r * (phone ? 1.4 : 2.6),
                    (phone ? 190 : 184) + Math.sin(a) * r,
                );
                g.rotation = t + i;
            });
            caption.text = `${n} objects${phone ? '\n' : '   '}${calls} draw calls last frame`;
        });

        return () => {
            for (const undo of restore) undo();
        };
    },
});
