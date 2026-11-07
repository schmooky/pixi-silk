#!/usr/bin/env node
/**
 * Type-checks every TypeScript sample in the docs against the library source, so examples
 * cannot drift from the API.
 *
 * Each ```ts block becomes its own module. Samples may be fragments: the declarations below
 * provide the usual variables (`g`, `app`, ...) and the library's exports without imports.
 * A block whose info string contains `nocheck` (```ts nocheck) is skipped.
 *
 * usage: node scripts/check-snippets.mjs   (from apps/site)
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DOCS = resolve('src/content/docs');
const OUT = resolve('node_modules/.cache/snippets');
const LIB = resolve('../../packages/pixi-silk/src/index.ts');
const SRC = resolve('../../packages/pixi-silk/src');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const origin = new Map();

for (const file of readdirSync(DOCS).filter((f) => f.endsWith('.mdx'))) {
    const text = readFileSync(join(DOCS, file), 'utf8');
    let n = 0;

    for (const m of text.matchAll(/^```(ts|typescript)([^\n]*)\n([\s\S]*?)^```/gm)) {
        n++;
        if (/\bnocheck\b/.test(m[2])) continue;
        const name = `${file.replace(/\.mdx$/, '')}-${n}.ts`;
        const line = text.slice(0, m.index).split('\n').length + 1;

        origin.set(name, `src/content/docs/${file}:${line}`);
        // `export {}` keeps each sample in its own module scope
        writeFileSync(join(OUT, name), `${m[3]}\nexport {};\n`);
    }
}

// what a fragment may use without declaring it
writeFileSync(
    join(OUT, 'globals.d.ts'),
    `import type * as Silk from 'pixi-silk';
import type * as Pixi from 'pixi.js';

declare global {
    const app: Pixi.Application;
    const g: Silk.SilkGraphics;
    const stage: Pixi.Container;
    const ticker: Pixi.Ticker;
    const SilkGraphics: typeof Silk.SilkGraphics;
    type SilkGraphics = Silk.SilkGraphics;
    const createSilkApp: typeof Silk.createSilkApp;
    const linear: typeof Silk.linear;
    const vertical: typeof Silk.vertical;
    const horizontal: typeof Silk.horizontal;
    const radial: typeof Silk.radial;
    const conic: typeof Silk.conic;
    const along: typeof Silk.along;
    const Spring: typeof Silk.Spring;
    const damp: typeof Silk.damp;
    const dampAngle: typeof Silk.dampAngle;
    const ease: typeof Silk.ease;
    const Filter: typeof Pixi.Filter;

    // placeholder values in fragments. \`x\` and \`points\` mean different things in different
    // samples (a number or a function, a flat array, [x, y] pairs or a star's point count)
    let x: any, points: any;
    let y: number, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number;
    let cx: number, cy: number, width: number, height: number, radius: number, radiusX: number, radiusY: number;
    let innerRadius: number, cornerRadius: number, rounding: number, rotation: number, sides: number;
    let startAngle: number, endAngle: number, sweep: number, angle: number, progress: number;
    let t: number, dt: number, target: number, baseline: number;
    let upperPoints: number[], lowerPoints: number[], values: number[];
    let stops: Silk.StopInput[];
    const RED: number, BLUE: number;
    const GAUGE: Silk.Gradient;
    const el: HTMLElement;
    const pointerGlobal: Pixi.PointData;
    function draw(value?: number): void;

    // UI samples: icon drawers, a trigger and the actions buttons call
    const drawPointer: (g: Silk.SilkGraphics, size: number) => void;
    const drawMove: typeof drawPointer, drawTrash: typeof drawPointer, drawPlay: typeof drawPointer;
    const toolButton: Pixi.Container;
    function spinOnce(): void;
    function autoplay(): void;
}
`,
);
writeFileSync(
    join(OUT, 'tsconfig.json'),
    JSON.stringify({
        compilerOptions: {
            target: 'ES2022',
            module: 'ESNext',
            moduleResolution: 'bundler',
            lib: ['ES2023', 'DOM', 'DOM.Iterable'],
            types: [],
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            allowUnusedLabels: false,
            paths: {
                'pixi-silk': [LIB],
                'pixi-silk/signal': [join(SRC, 'signal.ts')],
                'pixi-silk/ui': [join(SRC, 'ui/index.ts')],
                'pixi-silk/ui/radial': [join(SRC, 'ui/RadialMenu.ts')],
                'pixi-silk/ui/button': [join(SRC, 'ui/SilkButton.ts')],
                'pixi-silk/ui/dock': [join(SRC, 'ui/ButtonDock.ts')],
                'pixi-silk/ui/*': [join(SRC, 'ui/*.ts')],
            },
        },
        include: ['*.ts'],
    }),
);

try {
    execFileSync(resolve('node_modules/.bin/tsc'), ['-p', OUT], { encoding: 'utf8' });
    console.log(`check-snippets: ${origin.size} samples type-check`);
} catch (e) {
    const out = String(e.stdout ?? e);

    console.log(
        out.replace(
            /^(?:.*[\\/])?([\w-]+\.ts)\((\d+),(\d+)\)/gm,
            (_, f, l) => `${origin.get(f) ?? f} (sample line ${l})`,
        ),
    );
    console.log('check-snippets: fix the samples, or mark a deliberate fragment with ```ts nocheck');
    process.exit(1);
}
