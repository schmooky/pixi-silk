import { writeFileSync } from 'node:fs';
import { HeadlessBackend, layoutMessage, SilkBundle, StyleTable, submitLayout } from 'pixi-silk/i18n';
import { describe, expect, it } from 'vitest';
import { encodePng } from '../src/atlas/png';
import { compileProject } from '../src/compile';
import { loadProject } from '../src/project';
import { decodePng, fixtures, theme } from './helpers';

describe('a second backend (brief sec. 2.3, M6)', () => {
    it('draws the shop messages through SilkBackend with no renderer at all', async () => {
        const project = await loadProject({
            config: `${fixtures}silk.config.json`,
            strings: `${fixtures}strings.xlsx`,
            theme: `${fixtures}theme.json`,
        });
        const result = compileProject(project);
        const backend = new HeadlessBackend();

        result.atlas.pages.forEach((p, id) => {
            const { width, height, rgba } = decodePng(p.png);

            backend.uploadAtlasPage(id, rgba, width, height, 'msdf');
        });
        for (const locale of ['en', 'ar']) {
            const bundle = new SilkBundle(result.bundles.get(locale)?.slice().buffer as ArrayBuffer);
            const styles = new StyleTable(theme);
            const layout = layoutMessage(bundle, bundle.variant(bundle.message('shop.terms')), {
                size: 32,
                maxWidth: 0,
                align: 'start',
                lineHeight: 1.3,
                values: {},
                styles,
            });
            const handle = submitLayout(backend, layout, styles);
            const w = Math.ceil(layout.width) + 8;
            const h = Math.ceil(layout.height) + 8;
            const rgba = backend.rasterize(handle, bundle, w, h, -4, -4);
            let ink = 0;

            for (let i = 3; i < rgba.length; i += 4) ink += rgba[i] / 255;
            // a line of 32 px text covers a good part of its box, and nothing is drawn outside it
            expect(ink / (w * h)).toBeGreaterThan(0.08);
            expect(ink / (w * h)).toBeLessThan(0.6);
            if (process.env.SILK_DUMP)
                writeFileSync(`${process.env.SILK_DUMP}/headless-${locale}.png`, encodePng(rgba, w, h, 4));
            backend.destroyTextBuffer(handle);
        }
    });
});
