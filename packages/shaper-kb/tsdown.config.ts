import { defineConfig } from 'tsdown';

export default defineConfig({
    entry: ['src/index.ts'],
    format: 'esm',
    platform: 'neutral',
    tsconfig: 'tsconfig.build.json',
    dts: true,
    unbundle: true,
    external: [/^pixi-silk/],
});
