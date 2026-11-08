import { defineConfig } from 'tsdown';
import { glsl } from './build/glsl.ts';

export default defineConfig({
    entry: [
        'src/index.ts',
        'src/signal.ts',
        'src/glass.ts',
        'src/glow.ts',
        'src/webgpu.ts',
        'src/ui/index.ts',
        'src/ui/RadialMenu.ts',
        'src/ui/SilkButton.ts',
        'src/ui/ButtonDock.ts',
        'src/ui/gizmo.ts',
        'src/ui/outline.ts',
        'src/ui/camera.ts',
        'src/ui/measure.ts',
        'src/ui/snap.ts',
        'src/ui/color.ts',
        'src/ui/halo.ts',
        'src/ui/brush.ts',
        'src/ui/modes.ts',
        'src/ui/dial.ts',
        'src/ui/timeline.ts',
        'src/ui/odometer.ts',
        'src/ui/gesture.ts',
        'src/ui/arc.ts',
        'src/ui/keys.ts',
        'src/ui/pill.ts',
    ],
    // ESM only, one output file per source module: with `sideEffects: false` an app's bundler
    // drops every module it does not use (motion helpers never pull in the shader)
    format: 'esm',
    unbundle: true,
    platform: 'neutral',
    target: 'es2022',
    tsconfig: 'tsconfig.build.json',
    // declarations come from oxc (tsconfig `isolatedDeclarations`): no type checker in the build
    dts: true,
    sourcemap: false,
    plugins: [glsl()],
    // package checks on every build: exports, files and types must resolve for ESM consumers
    publint: true,
    attw: { profile: 'esm-only', level: 'error' },
});
