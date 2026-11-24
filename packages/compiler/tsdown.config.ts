import { defineConfig } from 'tsdown';

export default defineConfig({
    entry: ['src/index.ts', 'src/cli.ts'],
    format: 'esm',
    platform: 'node',
    // resolve pixi-silk through its built package, not the source paths of tsconfig.json
    tsconfig: 'tsconfig.build.json',
    dts: true,
    unbundle: true,
    external: [/^pixi-silk/, 'harfbuzzjs', 'exceljs'],
});
