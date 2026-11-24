/**
 * pixi-silk/i18n/pixi: draws baked localized text from `pixi-silk/i18n` with PixiJS v8, on WebGL2
 * and WebGPU. `Silk` holds bundles, atlas pages and themes. `SilkMessage` shows one message.
 * Register `silkBundleLoader` with `extensions.add` to load `.silk` files through `Assets`.
 */
export {
    type DynamicTextProvider,
    type InlineObject,
    loadAtlasPage,
    type MessageSpec,
    type PreparedMessage,
    PreparedSet,
    type PrepareOptions,
    Silk,
    SilkMessage,
    type SilkOptions,
    SilkTheme,
    silkBundleLoader,
    type TagTapEvent,
    type UpdateEvent,
    type UpdateTier,
} from './i18n/pixi/silk';
