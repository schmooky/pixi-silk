#!/usr/bin/env node
/**
 * Compiles the library's WGSL programs on a real WebGPU device and builds a render pipeline for
 * each with the bind group and vertex layouts Pixi derives from them. Any WGSL error, binding
 * mismatch or layout problem fails the check. Unit tests run in node without a GPU, so this is the
 * one place the WGSL meets a compiler.
 *
 * usage: pnpm build && node scripts/check-wgsl.mjs
 *
 * Runs Playwright's Chromium headless with WebGPU on (SwiftShader when there is no GPU).
 * CHROME_PATH picks another Chromium build.
 */
import { createServer } from 'node:http';
import { chromium } from 'playwright-core';
import { glassWgsl } from '../packages/pixi-silk/dist/glass/glass-wgsl.js';
import { createSilkGpuProgram } from '../packages/pixi-silk/dist/shader-wgsl.js';
// the library's own pixi.js (the workspace root has none)
import { GpuProgram } from '../packages/pixi-silk/node_modules/pixi.js/lib/index.mjs';

// what Pixi would hand WebGPU: sources, entry points, bind group layouts, vertex attributes
const describe = (name, program, buffers) => ({
    name,
    source: program.vertex.source,
    vertex: program.vertex.entryPoint,
    fragment: program.fragment.entryPoint,
    layout: program.gpuLayout,
    buffers: buffers(program.attributeData),
});
const silk = createSilkGpuProgram();
// built like GlassFilter builds it (the filter itself needs a DOM for its GLSL twin)
const glass = GpuProgram.from({
    name: 'silk-glass',
    vertex: { source: glassWgsl, entryPoint: 'mainVertex' },
    fragment: { source: glassWgsl, entryPoint: 'mainFragment' },
});
const programs = [
    // corner quad per vertex, everything else per instance (one interleaved buffer)
    describe('silk-sdf', silk, (attrs) => {
        const sorted = Object.entries(attrs).sort(([, a], [, b]) => a.location - b.location);
        const [, corner] = sorted[0];
        const instance = sorted.slice(1);

        return [
            {
                arrayStride: 8,
                stepMode: 'vertex',
                attributes: [{ shaderLocation: corner.location, offset: 0, format: corner.format }],
            },
            {
                arrayStride: instance.length * 16,
                stepMode: 'instance',
                attributes: instance.map(([, a], i) => ({
                    shaderLocation: a.location,
                    offset: i * 16,
                    format: a.format,
                })),
            },
        ];
    }),
    describe('silk-glass', glass, (attrs) =>
        Object.values(attrs).map((a) => ({
            arrayStride: 8,
            stepMode: 'vertex',
            attributes: [{ shaderLocation: a.location, offset: 0, format: a.format }],
        })),
    ),
];

// a canary the device must reject (an f32 where a vec2 belongs): proves errors are not swallowed
programs.push({
    ...programs[0],
    name: 'canary',
    source: programs[0].source.replace('var p = input.vPos;', 'var p: vec2<f32> = input.vProg;'),
});

const server = createServer((_, res) => res.end('<!doctype html><title>wgsl</title>'));

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
    args: ['--enable-unsafe-webgpu'],
});
const page = await browser.newPage();

await page.goto(`http://127.0.0.1:${port}/`);
const report = await page.evaluate(async (list) => {
    if (!navigator.gpu) return { error: 'this browser has no WebGPU' };
    const adapter = await navigator.gpu.requestAdapter();

    if (!adapter) return { error: 'no WebGPU adapter' };
    const device = await adapter.requestDevice();
    const results = [];

    for (const p of list) {
        const errors = [];

        device.pushErrorScope('validation');
        const module = device.createShaderModule({ code: p.source, label: p.name });
        const info = await module.getCompilationInfo();

        for (const m of info.messages) {
            if (m.type === 'error') errors.push(`${m.lineNum}:${m.linePos} ${m.message}`);
        }
        const layout = device.createPipelineLayout({
            bindGroupLayouts: p.layout.map((entries) => device.createBindGroupLayout({ entries })),
        });

        device.createRenderPipeline({
            layout,
            vertex: { module, entryPoint: p.vertex, buffers: p.buffers },
            fragment: {
                module,
                entryPoint: p.fragment,
                targets: [
                    {
                        format: 'bgra8unorm',
                        blend: {
                            color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
                            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
                        },
                    },
                ],
            },
            primitive: { topology: 'triangle-list' },
        });
        const scoped = await device.popErrorScope();

        if (scoped) errors.push(scoped.message);
        results.push({ name: p.name, errors, warnings: info.messages.filter((m) => m.type !== 'error').length });
    }

    return { adapter: adapter.info?.architecture || adapter.info?.vendor || 'unknown', results };
}, programs);

await browser.close();
server.close();

if (report.error) {
    console.error(`check-wgsl: ${report.error}`);
    process.exit(1);
}
let failed = 0;
const canary = report.results.pop();

console.log(`check-wgsl: Chromium ${browser.version()}, adapter ${report.adapter}`);
if (!canary.errors.length) {
    console.error('check-wgsl: the broken canary program compiled, so errors are not reported');
    process.exit(1);
}
for (const r of report.results) {
    console.log(`  ${r.errors.length ? 'FAIL' : 'ok  '} ${r.name}${r.warnings ? ` (${r.warnings} warnings)` : ''}`);
    for (const e of r.errors) console.log(`       ${e}`);
    failed += r.errors.length ? 1 : 0;
}
process.exit(failed ? 1 : 0);
