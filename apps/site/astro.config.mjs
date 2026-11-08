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
        // pages merged, renamed or regrouped for 1.0, and the old area hubs
        '/docs/introduction/': '/docs/getting-started/',
        '/docs/installation/': '/docs/getting-started/',
        '/docs/quick-start/': '/docs/getting-started/',
        '/docs/arcs-and-rings/': '/docs/shapes/',
        '/docs/transforms/': '/docs/shapes/',
        '/docs/fills-and-strokes/': '/docs/strokes-and-dashes/',
        '/docs/dashes/': '/docs/strokes-and-dashes/',
        '/docs/blur-and-shadows/': '/docs/shadows-and-effects/',
        '/docs/effects/': '/docs/shadows-and-effects/',
        '/docs/hit-testing/': '/docs/interaction-and-motion/',
        '/docs/animation/': '/docs/interaction-and-motion/',
        '/docs/canvas-and-measurements/': '/docs/canvas-and-rulers/',
        '/docs/canvas-tools/': '/docs/canvas-and-rulers/',
        '/docs/transform-gizmos/': '/docs/gizmos-and-selection/',
        '/docs/selection-and-history/': '/docs/gizmos-and-selection/',
        '/docs/gallery/': '/docs/showcase/',
        '/docs/webgpu/': '/docs/renderers/',
        '/docs/smooth-graphics-pixijs/': '/docs/anti-aliasing-compared/',
        '/docs/graphics-smooth-v8/': '/docs/anti-aliasing-compared/',
        '/docs/antialiasing-in-pixijs/': '/docs/anti-aliasing-compared/',
        '/docs/start/': '/docs/learn/',
        '/docs/drawing/': '/docs/shapes-and-strokes/',
        '/docs/editor-ui/': '/docs/editor-kit/',
        '/docs/rendering/': '/docs/architecture/',
        '/docs/game-ui/': '/docs/ui/',
        '/docs/slot-hud/': '/docs/radial-menus-and-buttons/',
        // lab experiments cut for 1.0: each repeated a demo on its page
        '/lab/02-versus/': '/docs/migrating-from-graphics/',
        '/lab/08-activity-rings/': '/docs/shapes/',
        '/lab/09-lines/': '/docs/lines-and-paths/',
        '/lab/10-dashes/': '/docs/strokes-and-dashes/',
        '/lab/12-gradients/': '/docs/gradients/',
        '/lab/14-glow/': '/docs/shadows-and-effects/',
        '/lab/27-stress/': '/docs/performance/',
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
                {
                    find: /^pixi-silk\/(glass|glow|webgpu|text|selection|history|path|layout)$/,
                    replacement: `${resolve(repoRoot, 'packages/pixi-silk/src')}/$1.ts`,
                },
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
                    find: /^pixi-silk\/ui\/(gizmo|outline|camera|measure|grid|ruler|guides|marquee|group|spacing|snap|color|halo|brush|modes|dial|timeline|odometer|gesture|arc|keys|pill|pathgizmo|label|layout|textedit|panel|layers|inspector|minimap)$/,
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
