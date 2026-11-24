import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (file: string) => fileURLToPath(new URL(`../pixi-silk/src/${file}`, import.meta.url));

export default defineConfig({
    resolve: {
        alias: {
            'pixi-silk/i18n/pixi': src('i18n-pixi.ts'),
            'pixi-silk/i18n': src('i18n.ts'),
            'pixi-silk/text': src('text.ts'),
        },
    },
    test: { environment: 'node', include: ['tests/**/*.test.ts'], testTimeout: 60000 },
});
