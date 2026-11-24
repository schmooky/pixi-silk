import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: {
            'pixi-silk/i18n': fileURLToPath(new URL('../pixi-silk/src/i18n.ts', import.meta.url)),
            'pixi-silk/text/bidi': fileURLToPath(new URL('../pixi-silk/src/text/bidi.ts', import.meta.url)),
        },
    },
    test: { environment: 'node', include: ['tests/**/*.test.ts'], testTimeout: 60000 },
});
