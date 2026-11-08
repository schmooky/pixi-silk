/**
 * pixi-silk/glass: a frosted glass pane that blurs and bends what is drawn behind it. Works on
 * WebGL2, with the renderer's back buffer, and on WebGPU. Not part of the root `pixi-silk` import.
 */
export { Glass, type GlassOptions } from './glass/Glass';
export { GlassFilter } from './glass/GlassFilter';
export { GLASS_DEFAULTS, type GlassStyle, lightVector, type ResolvedGlass, resolveGlass } from './glass/options';
