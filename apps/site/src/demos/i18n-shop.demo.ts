import { Assets, extensions, Graphics, type Texture } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import type { ThemeData } from 'pixi-silk/i18n';
import { Silk, SilkMessage, silkBundleLoader } from 'pixi-silk/i18n/pixi';
import { defineDemo, INK } from './runtime';

// The shop screen of the localized text guide: English and Arabic from baked .silk bundles, no
// font file and no shaper. The counter counts up through the value-fast tier, the plural form
// changes on the way, and the terms link reports taps.
export default defineDemo({
    title: 'Localized shop screen',
    size: [720, 380],
    phone: { size: [360, 640] },
    controls: {
        count: { type: 'range', label: 'coins', min: 0, max: 2000, step: 1, value: 1250 },
        gold: { type: 'select', label: 'gold', options: ['#FFC53D', '#7CFFB2', '#FF7AB8'], value: '#FFC53D' },
    },
    renderers: ['webgl', 'webgpu'],
    setup({ stage, params, tick, phone, silk: app }) {
        let alive = true;
        const messages: SilkMessage[] = [];
        let theme: ReturnType<Silk['createTheme']> | null = null;
        let lastCount = -1;
        let lastGold = '';

        (async () => {
            extensions.add(silkBundleLoader);
            const silk = await Silk.create({ dynamicText: { mode: 'canvas' } });
            const base = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/i18n`;
            const [en, ar, themeData] = await Promise.all([
                Assets.load(`${base}/en.silk`),
                Assets.load(`${base}/ar.silk`),
                fetch(`${base}/theme.json`).then((r) => r.json() as Promise<ThemeData>),
            ]);

            await silk.addBundle(en);
            await silk.addBundle(ar);
            if (!alive) return;
            const coin = new Graphics()
                .circle(32, 32, 30)
                .fill('#FFC53D')
                .circle(32, 32, 20)
                .stroke({ width: 4, color: '#B07A00' });
            const coinTexture: Texture = app.app.renderer.generateTexture({ target: coin, resolution: 2 });

            silk.registerInline({ coin: { texture: coinTexture, size: '1.1em', baseline: 0.15 } });
            theme = silk.createTheme(themeData);
            const columns = phone ? [16, 16] : [24, 376];

            for (const [i, locale] of ['en', 'ar'].entries()) {
                const set = await silk.prepare({
                    locale,
                    fallbackLocale: 'en',
                    theme,
                    defaults: { size: phone ? 22 : 24, maxWidth: phone ? 328 : 320, lineHeight: 1.35 },
                    messages: {
                        title: { key: 'shop.title', size: phone ? 34 : 40 },
                        // a name typed by the player: drawn by the canvas path, mixed direction on purpose
                        greeting: {
                            key: 'player.greeting',
                            values: { name: locale === 'ar' ? 'Alex' : '\u0644\u064a\u0644\u0649' },
                        },
                        coins: { key: 'shop.coins', values: { count: params.count } },
                        terms: { key: 'shop.terms', size: 18 },
                    },
                });
                const x = columns[i];
                const y0 = phone ? 24 + i * 300 : 40;
                const title = new SilkMessage(set.get('title'));
                const greeting = new SilkMessage(set.get('greeting'));
                const coins = new SilkMessage(set.get('coins'));
                const terms = new SilkMessage(set.get('terms'));

                title.position.set(x, y0);
                greeting.position.set(x, y0 + 70);
                coins.position.set(x, y0 + 120);
                terms.position.set(x, y0 + 190);
                terms.on('tagtap', (e) => {
                    terms.alpha = terms.alpha === 1 ? 0.6 : 1;
                    void e;
                });
                stage.addChild(title, greeting, coins, terms);
                messages.push(coins);
            }
        })().catch((e) => console.error('i18n-shop:', e));

        stage.addChild(
            new SilkGraphics().roundRect(8, 8, phone ? 344 : 704, phone ? 624 : 364, 20, 0.6).fill(INK.surface),
        );
        tick(() => {
            if (!theme) return;
            if (params.count !== lastCount) {
                lastCount = params.count;
                for (const m of messages) m.set({ count: params.count });
            }
            if (params.gold !== lastGold) {
                lastGold = params.gold;
                theme.set('gold', { fill: params.gold });
            }
        });

        return () => {
            alive = false;
        };
    },
});
