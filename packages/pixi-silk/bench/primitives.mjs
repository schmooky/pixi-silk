// CPU cost of rebuilding a SilkGraphics every frame, in node, without a GPU.
//
//   pnpm build && pnpm --filter pixi-silk bench
//   node packages/pixi-silk/bench/primitives.mjs [count] [frames]
//
// Each frame does what the stress demo does: clear(), then `count` shapes, a third each of
// circle().fill(), roundRect().fill() and line().stroke(). It times only that CPU work: the GPU
// upload and the draw are not included. The docs quote the result in performance.mdx.
import { arch, cpus, platform } from 'node:os';
import { BrowserAdapter, DOMAdapter } from 'pixi.js';
import { SilkGraphics } from '../dist/index.js';

// No DOM in node: Pixi only needs a canvas to probe shader precision (as in tests/setup.ts).
DOMAdapter.set({
    ...BrowserAdapter,
    createCanvas: (width = 1, height = 1) => ({ width, height, getContext: () => null }),
});

const count = Number(process.argv[2] ?? 50_000);
const frames = Number(process.argv[3] ?? 200);
const warmup = 50;
const g = new SilkGraphics();

function frame(t) {
    g.clear();
    for (let i = 0; i < count; i++) {
        const a = i * 2.399963 + t * 0.2;
        const r = Math.sqrt(i / count) * 100;
        const x = 360 + Math.cos(a) * r * 2.6;
        const y = 160 + Math.sin(a) * r;

        if (i % 3 === 0) g.circle(x, y, 2.2).fill(0xff375f);
        else if (i % 3 === 1) g.roundRect(x - 2, y - 2, 4, 4, 1).fill(0x0a84ff);
        else g.line(x, y, x + 5, y + 2).stroke({ width: 1, color: 0x30d158 });
    }
}

for (let i = 0; i < warmup; i++) frame(i / 60);
const times = [];

for (let i = 0; i < frames; i++) {
    const start = performance.now();

    frame((warmup + i) / 60);
    times.push(performance.now() - start);
}
times.sort((a, b) => a - b);
const at = (q) => times[Math.min(times.length - 1, Math.floor(q * times.length))];

console.log(`${cpus()[0]?.model ?? 'unknown cpu'}, ${platform()} ${arch()}, node ${process.version}`);
console.log(`${count} primitives (${g.primitiveCount} instances), ${frames} frames after ${warmup} warm-up frames`);
console.log(`median ${at(0.5).toFixed(2)} ms, p95 ${at(0.95).toFixed(2)} ms, min ${times[0].toFixed(2)} ms`);
