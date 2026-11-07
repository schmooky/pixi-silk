import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rehypeHeadingIds } from '@astrojs/markdown-remark';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import { rehypeHeadingAnchors } from './src/lib/rehypeHeadingAnchors.mjs';
import { SITE_URL } from './src/lib/site-url.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '../..');

export default defineConfig({
    // old shelves now live inside the docs areas
    redirects: {
        '/lab/': '/docs/',
        '/showcase/': '/docs/showcase/',
    },
    site: SITE_URL,
    trailingSlash: 'always',
    prefetch: { defaultStrategy: 'hover', prefetchAll: false },
    markdown: {
        // heading ids first, so the anchor plugin can link to them
        rehypePlugins: [rehypeHeadingIds, rehypeHeadingAnchors],
        // code surfaces are dark in both site themes
        shikiConfig: { theme: 'github-dark-dimmed' },
    },
    integrations: [mdx(), react()],
    vite: {
        plugins: [tailwindcss()],
        resolve: {
            alias: [
                // the site always builds against the library source, never a published version
                { find: /^pixi-silk$/, replacement: resolve(repoRoot, 'packages/pixi-silk/src/index.ts') },
                { find: /^pixi-silk\/signal$/, replacement: resolve(repoRoot, 'packages/pixi-silk/src/signal.ts') },
                { find: /^pixi-silk\/ui$/, replacement: resolve(repoRoot, 'packages/pixi-silk/src/ui/index.ts') },
                {
                    find: /^pixi-silk\/ui\/radial$/,
                    replacement: resolve(repoRoot, 'packages/pixi-silk/src/ui/RadialMenu.ts'),
                },
                {
                    find: /^pixi-silk\/ui\/button$/,
                    replacement: resolve(repoRoot, 'packages/pixi-silk/src/ui/SilkButton.ts'),
                },
                {
                    find: /^pixi-silk\/ui\/dock$/,
                    replacement: resolve(repoRoot, 'packages/pixi-silk/src/ui/ButtonDock.ts'),
                },
                // editor widgets: pixi-silk/ui/<name> is src/ui/<name>.ts
                {
                    find: /^pixi-silk\/ui\/(gizmo|outline|snap|color|halo|brush|modes|dial|timeline|odometer|gesture|arc|keys|pill)$/,
                    replacement: `${resolve(repoRoot, 'packages/pixi-silk/src/ui')}/$1.ts`,
                },
                { find: '@', replacement: resolve(here, 'src') },
            ],
            dedupe: ['react', 'react-dom', 'pixi.js'],
        },
        // lab pages use top-level await
        build: { target: 'es2022' },
        ssr: { noExternal: ['pixi-silk'] },
        server: { fs: { allow: [repoRoot] } },
    },
});
