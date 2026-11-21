import type { Renderer, WebGLRenderer } from 'pixi.js';
import { silkGl1 } from './shader-slot';
import { createGl1Hooks } from './webgl1/hooks';

/** Whether `renderer` is Pixi's WebGL renderer on a WebGL1 context. */
export function isWebGL1(renderer: Renderer): boolean {
    return renderer.name === 'webgl' && (renderer as WebGLRenderer).context.webGLVersion === 1;
}

/** Pixi's format tables (private): texture format to GL internal format, format and type. */
interface FormatTables {
    _mapFormatToInternalFormat?: Record<string, number>;
    _mapFormatToFormat?: Record<string, number>;
    _mapFormatToType?: Record<string, number>;
}

/** `HALF_FLOAT_OES` of `OES_texture_half_float`. */
const HALF_FLOAT_OES = 0x8d61;

/**
 * The texture formats silk uploads, fixed for WebGL1. Pixi 8 maps them to WebGL2 formats
 * (`RGBA32F`, `RGBA16F`, `R8`, `RED`), so the uploads fail on WebGL1. WebGL1 takes the base format
 * as the internal format, with the float types of `OES_texture_float` and `OES_texture_half_float`.
 * It has no one-channel `RED`, so the text atlas uploads as `LUMINANCE`. The shader reads it the
 * same through `.r`. The tables are private to Pixi: returns `false` when they are not there.
 */
function patchFormats(renderer: WebGLRenderer): boolean {
    const gl = renderer.gl;
    const t = renderer.texture as unknown as FormatTables;
    const internal = t._mapFormatToInternalFormat;
    const format = t._mapFormatToFormat;
    const type = t._mapFormatToType;

    if (!internal || !format || !type) return false;
    internal.rgba32float = gl.RGBA;
    internal.rgba16float = gl.RGBA;
    type.rgba16float = HALF_FLOAT_OES;
    internal.r8unorm = gl.LUMINANCE;
    format.r8unorm = gl.LUMINANCE;

    return true;
}

/** What the device lacks for the WebGL1 programs, or `null` when it has everything. */
function missing(renderer: WebGLRenderer): string | null {
    const gl = renderer.gl;
    const ext = renderer.context.extensions;

    if (!ext.floatTexture) return 'OES_texture_float';
    if (!ext.textureHalfFloat) return 'OES_texture_half_float';
    // the shaders use dFdx, dFdy and fwidth. Enabling it here also turns it on for them.
    if (!gl.getExtension('OES_standard_derivatives')) return 'OES_standard_derivatives';
    // the shaders declare highp ints, floats and samplers, which do not compile without it
    const high = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);

    if (!high || high.precision === 0) return 'highp precision in fragment shaders';

    return null;
}

const prepared = new WeakSet<Renderer>();

/**
 * Lets SilkGraphics, SilkText and Glass render on a WebGL1 context. Pixi falls back to WebGL1 when
 * the browser has no WebGL2. This installs GLSL ES 1.00 versions of the shaders, which live in this
 * module so that apps that leave it out do not ship them.
 *
 * Pass it to {@link createSilkApp} as `webgl1: enableWebGL1`, or call it with the renderer of an
 * application you create yourself. It does nothing unless the renderer runs WebGL1. Call it before
 * you create any SilkGraphics: objects created earlier keep the WebGL2 program and draw nothing.
 *
 * The device needs `OES_texture_float`, `OES_texture_half_float`, `OES_standard_derivatives` and
 * highp in fragment shaders. Without one of them this logs an error, installs nothing and returns
 * `false`: silk objects then draw nothing, and the app can show a fallback. Without
 * `OES_texture_half_float_linear` the gradient ramps switch to nearest filtering, which the WebGL1
 * shaders blend themselves, so they look the same.
 *
 * Limits on WebGL1: `enableSilkBatching()` has no effect, each object is one draw call. A filled
 * path with more than 4096 edges, or a stroked path with more than 256 windows, draws in part with
 * a warning. Programs are global: once enabled, objects on a WebGL2 renderer on the same page use
 * the WebGL1 shaders too and do not batch. They give the same pixels.
 *
 * @param renderer - The renderer of the application.
 * @returns `true` when WebGL1 support is on for this renderer. `false` when the renderer is not
 * WebGL1, or the device lacks something the shaders need (an error is logged).
 *
 * @example
 * ```ts
 * import { createSilkApp, SilkGraphics } from 'pixi-silk';
 * import { enableWebGL1 } from 'pixi-silk/webgl1';
 *
 * const silk = await createSilkApp({ parent: document.body, webgl1: enableWebGL1 });
 * silk.app.stage.addChild(new SilkGraphics().circle(50, 50, 40).fill(0x30d158));
 * ```
 */
export function enableWebGL1(renderer: Renderer): boolean {
    if (!isWebGL1(renderer)) return false;
    const r = renderer as WebGLRenderer;
    const lack = missing(r);

    if (lack) {
        console.error(
            `pixi-silk: this WebGL1 device lacks ${lack}, which SilkGraphics needs. Silk objects draw nothing.`,
        );

        return false;
    }
    if (!prepared.has(renderer)) {
        if (!patchFormats(r)) {
            console.error(
                'pixi-silk: the format tables of Pixi texture system were not found (a Pixi version silk does not know). WebGL1 support is off.',
            );

            return false;
        }
        prepared.add(renderer);
        // a restored context needs the derivatives extension again. Pixi keeps its format tables
        // across a lost context, but patching them twice is harmless if a later Pixi rebuilds them.
        r.runners.contextChange.add({
            contextChange: () => {
                r.gl.getExtension('OES_standard_derivatives');
                patchFormats(r);
            },
        });
    }
    silkGl1.hooks ??= createGl1Hooks();
    // half floats are not filterable without this extension: the ramps would sample black
    if (!r.context.extensions.textureHalfFloatLinear) silkGl1.hooks.nearestRamps = true;

    return true;
}

/** Whether {@link enableWebGL1} has run on a WebGL1 renderer, so new SilkGraphics carry the WebGL1 program. */
export function isWebGL1Enabled(): boolean {
    return silkGl1.hooks !== null;
}
