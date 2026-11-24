/**
 * pixi-silk/i18n/shaper: draws text slots (player names) with the font a bundle was baked from.
 * kb_text_shape in WebAssembly shapes the value. The TrueType outlines are filled in JavaScript, and
 * a distance transform turns them into a run sprite. Pass `await createShapedText({ font })` as
 * `dynamicText` to `Silk.create`. The `kb.wasm` file is fetched next to this module.
 */
export { type Contour, type FontTables, type OutlinePoint, readFont } from './i18n/kb/font';
export { createKbShaper, KbShaper, type KbShaperOptions, type KbWasmSource } from './i18n/kb/kb';
export { fillContours } from './i18n/kb/raster';
export { createShapedText, type ShapedTextOptions, ShapedTextProvider } from './i18n/kb/text';
