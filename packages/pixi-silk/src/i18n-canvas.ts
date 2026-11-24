/**
 * pixi-silk/i18n/canvas: draws text slots (player names, user input) of baked messages. The browser
 * shapes the value with Canvas2D, and a distance transform turns it into a run sprite the message
 * shader draws with the slot's style. Loaded lazily by `Silk.create({ dynamicText: { mode: 'canvas' } })`.
 */
export {
    type CanvasFont,
    type CanvasTextOptions,
    CanvasTextProvider,
    createCanvasText,
    SYSTEM_FONTS,
    slotDirection,
} from './i18n/canvas';
