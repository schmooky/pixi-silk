#!/usr/bin/env node
/**
 * What an app pays for pixi-silk: bundles typical imports of the built package the way an app bundler
 * does (package `exports` and `sideEffects`, pixi.js external, minified) and reports the gzipped size of
 * each, compared with ci/size-baseline.json. Also checks that tree-shaking works: an import that has no
 * business pulling in the shader or the gradient atlas must not contain them. Sizes count the code an
 * app loads up front: chunks behind a dynamic import() (the WGSL shader createSilkApp fetches on
 * WebGPU) load only when used, so they are listed on their own and not added.
 *
 *   --check   fail when an import grew more than 10% over the baseline, or a tree-shaking check fails
 *   --update  rewrite the baseline
 */
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { rolldown } from 'rolldown';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkgDir = join(root, 'packages/pixi-silk');
const baselinePath = join(root, 'ci/size-baseline.json');
const work = join(root, 'node_modules/.cache/size-check');
const TOLERANCE = 0.1;

/** name: [what the app imports, markers that must NOT end up in that bundle, subpath (default the root)] */
// '@fragment' only appears in WGSL: WebGL2 apps must not load the WebGPU shader up front
const IMPORTS = {
    everything: ['*', ['@fragment']],
    SilkGraphics: ['SilkGraphics', ['silk-batch-paths', '@fragment']],
    'SilkGraphics + gradients': ['SilkGraphics, linear, vertical, radial, conic, along', ['@fragment']],
    createSilkApp: ['createSilkApp', ['#version 300 es', 'silk-gradient-atlas', '@fragment']],
    'webgpu (enableWebGPU)': ['*', ['#version 300 es', 'silk-gradient-atlas'], '/webgpu'],
    gradients: ['linear, radial, conic', ['#version 300 es', 'silk-gradient-atlas']],
    'motion (damp, Spring, ease)': [
        'damp, dampAngle, Spring, ease',
        ['#version 300 es', 'silk-gradient-atlas', 'oklab'],
    ],
    parseColor: ['parseColor', ['#version 300 es', 'silk-gradient-atlas']],
    'signal (signal, computed, batch)': ['signal, computed, batch', ['#version 300 es', 'RadialMenu'], '/signal'],
    selection: ['*', ['#version 300 es', 'RadialMenu', 'TransformGizmo'], '/selection'],
    history: ['*', ['#version 300 es', 'RadialMenu', 'TransformGizmo'], '/history'],
    path: ['*', ['#version 300 es', 'silk-gradient-atlas', 'RadialMenu'], '/path'],
    'ui/radial (RadialMenu)': ['RadialMenu, bindRadialTrigger', ['SilkButton', 'ButtonDock'], '/ui/radial'],
    'ui/button (SilkButton)': ['SilkButton', ['RadialMenu', 'ButtonDock'], '/ui/button'],
    'ui/dock (ButtonDock)': ['ButtonDock', ['RadialMenu', '#version 300 es'], '/ui/dock'],
    'ui/gizmo': ['*', ['RadialMenu', 'ColorModel'], '/ui/gizmo'],
    'ui/outline': ['*', ['RadialMenu', 'TransformGizmo'], '/ui/outline'],
    'ui/pathgizmo': ['*', ['RadialMenu', 'TransformGizmo', 'ColorModel'], '/ui/pathgizmo'],
    'ui/snap': ['*', ['RadialMenu'], '/ui/snap'],
    'ui/camera': ['*', ['RadialMenu', 'TransformGizmo'], '/ui/camera'],
    'ui/camera (Camera only)': ['Camera', ['#version 300 es', 'RadialMenu'], '/ui/camera'],
    'ui/measure': ['*', ['RadialMenu', 'TransformGizmo'], '/ui/measure'],
    'ui/grid': ['*', ['RadialMenu', 'TransformGizmo'], '/ui/grid'],
    'ui/ruler': ['*', ['RadialMenu', 'TransformGizmo'], '/ui/ruler'],
    'ui/guides': ['*', ['RadialMenu', 'TransformGizmo'], '/ui/guides'],
    'ui/marquee': ['*', ['RadialMenu', 'TransformGizmo'], '/ui/marquee'],
    'ui/group': ['*', ['#version 300 es', 'RadialMenu', 'TransformGizmo'], '/ui/group'],
    'ui/spacing': ['*', ['RadialMenu', 'TransformGizmo'], '/ui/spacing'],
    'ui/spacing (findSpacing)': ['findSpacing, gapsBetween', ['#version 300 es', 'RadialMenu'], '/ui/spacing'],
    'ui/snap (SnapEngine only)': ['SnapEngine', ['#version 300 es', 'RadialMenu'], '/ui/snap'],
    'ui/color': ['*', ['RadialMenu', 'TransformGizmo'], '/ui/color'],
    'ui/halo': ['*', ['ColorModel', 'TransformGizmo'], '/ui/halo'],
    'ui/brush': ['*', ['RadialMenu', 'ColorModel'], '/ui/brush'],
    'ui/modes': ['*', ['ColorModel', 'TransformGizmo'], '/ui/modes'],
    'ui/dial': ['*', ['RadialMenu', 'MiniTimeline'], '/ui/dial'],
    'ui/timeline': ['*', ['RadialMenu', 'JogDial'], '/ui/timeline'],
    'ui/odometer': ['*', ['RadialMenu', '#version 300 es'], '/ui/odometer'],
    'ui/gesture': ['*', ['#version 300 es', 'RadialMenu'], '/ui/gesture'],
    glass: ['*', ['RadialMenu'], '/glass'],
    glow: ['*', ['RadialMenu', 'silk-glass'], '/glow'],
    text: ['*', ['RadialMenu', 'silk-sdf', 'silk-paths'], '/text'],
    'text (SilkText)': ['SilkText', ['RadialMenu', 'silk-sdf', 'silk-paths'], '/text'],
    'text (layoutText, sdfFromAlpha)': ['layoutText, sdfFromAlpha', ['#version 300 es', 'silk-text-atlas'], '/text'],
    'ui/textedit (TextEditor)': ['TextEditor', ['RadialMenu', 'TransformGizmo', 'ColorModel'], '/ui/textedit'],
    'ui/pill (ValuePill)': ['ValuePill', ['silk-text', 'RadialMenu'], '/ui/pill'],
    'ui (everything)': ['*', [], '/ui'],
};

// a scratch project that depends on the built package, so resolution goes through its package.json
rmSync(work, { recursive: true, force: true });
mkdirSync(join(work, 'node_modules'), { recursive: true });
symlinkSync(pkgDir, join(work, 'node_modules/pixi-silk'), 'dir');

const kb = (n) => `${(n / 1024).toFixed(2)} kB`;
const results = {};
const failures = [];

for (const [name, [specifiers, forbidden, subpath = '']] of Object.entries(IMPORTS)) {
    const entry = join(work, `${Object.keys(results).length}.js`);

    writeFileSync(
        entry,
        specifiers === '*'
            ? `export * from 'pixi-silk${subpath}';\n`
            : `export { ${specifiers} } from 'pixi-silk${subpath}';\n`,
    );
    const bundle = await rolldown({ input: entry, external: [/^pixi\.js/], logLevel: 'silent' });
    const { output } = await bundle.generate({ format: 'esm', minify: true });
    // the entry and its static imports; dynamic chunks load on demand
    const chunks = new Map(output.filter((c) => c.type === 'chunk').map((c) => [c.fileName, c]));
    const upfront = new Set();
    const visit = (chunk) => {
        if (!chunk || upfront.has(chunk)) return;
        upfront.add(chunk);
        for (const name of chunk.imports) visit(chunks.get(name));
    };

    visit([...chunks.values()].find((c) => c.isEntry));
    const code = [...upfront].map((chunk) => chunk.code).join('\n');
    const lazy = [...chunks.values()].filter((c) => !upfront.has(c));

    if (lazy.length) {
        const lazyCode = lazy.map((c) => c.code).join('\n');

        console.log(`${name}: + ${kb(gzipSync(lazyCode, { level: 9 }).length)} gzip on demand (${lazy.length} chunk)`);
    }

    await bundle.close();
    results[name] = { minified: code.length, gzip: gzipSync(code, { level: 9 }).length };
    for (const marker of forbidden) {
        if (code.includes(marker)) failures.push(`${name}: bundle contains "${marker}" (tree-shaking broke)`);
    }
}
rmSync(work, { recursive: true, force: true });

const baseline = (() => {
    try {
        return JSON.parse(readFileSync(baselinePath, 'utf8'));
    } catch {
        return {};
    }
})();
const width = Math.max(...Object.keys(results).map((n) => n.length));

console.log(`${'import'.padEnd(width)}  ${'minified'.padStart(10)}  ${'gzip'.padStart(9)}  baseline`);
for (const [name, { minified, gzip }] of Object.entries(results)) {
    const base = baseline[name]?.gzip;
    const drift = base ? (gzip - base) / base : 0;
    const note = base ? `${kb(base)} (${drift >= 0 ? '+' : ''}${(drift * 100).toFixed(1)}%)` : 'none';

    console.log(`${name.padEnd(width)}  ${kb(minified).padStart(10)}  ${kb(gzip).padStart(9)}  ${note}`);
    if (base && drift > TOLERANCE)
        failures.push(`${name}: ${kb(gzip)} gzip is more than 10% over the baseline ${kb(base)}`);
}

if (process.argv.includes('--update')) {
    writeFileSync(
        baselinePath,
        `${JSON.stringify(Object.fromEntries(Object.entries(results).map(([n, r]) => [n, { gzip: r.gzip }])), null, 2)}\n`,
    );
    console.log('size-check: baseline updated');
} else if (failures.length) {
    for (const f of failures) console.error(`size-check: ${f}`);
    if (process.argv.includes('--check')) {
        console.error('If the growth is intended: pnpm size:update');
        process.exit(1);
    }
}
