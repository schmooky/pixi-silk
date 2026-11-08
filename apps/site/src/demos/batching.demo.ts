import { Container, Text, type WebGLRenderer } from 'pixi.js';
import { enableSilkBatching, SilkGraphics } from 'pixi-silk';
import { defineDemo } from './runtime';

// 2000 separate SilkGraphics that move every frame. With batching on, runs of them share a draw,
// on WebGL2 and on WebGPU.
enableSilkBatching();

export default defineDemo({
    size: [480, 300],
    controls: {
        batching: { type: 'toggle', label: 'batching', value: true },
        count: { type: 'range', label: 'objects', min: 200, max: 4000, step: 200, value: 2000 },
    },
    setup({ silk, stage, params, tick }) {
        const layer = new Container();
        const caption = new Text({
            text: '',
            style: { fill: 0xffffff, fontSize: 12, fontFamily: 'ui-monospace, monospace' },
        });

        caption.position.set(12, 10);
        stage.addChild(layer, caption);

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
        const colors = [0x0a84ff, 0x30d158, 0xff9f0a, 0xff375f, 0xbf5af2];
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
                const r = Math.sqrt(i / n) * 130;

                g.position.set(240 + Math.cos(a) * r * 1.6, 150 + Math.sin(a) * r);
                g.rotation = t + i;
            });
            caption.text = `${n} objects, ${calls} draw calls last frame`;
        });

        return () => {
            for (const undo of restore) undo();
        };
    },
});
