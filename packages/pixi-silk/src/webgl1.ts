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
 * WebGL1 setup that Pixi leaves out: the derivatives extension the shaders use, and the formats of
 * the textures silk uploads. Pixi 8 maps them to WebGL2 formats (`RGBA32F`, `RGBA16F`, `R8`, `RED`),
 * so the uploads fail on WebGL1. WebGL1 takes the base format as the internal format, with the
 * float types of `OES_texture_float` and `OES_texture_half_float`. It has no one-channel `RED`, so
 * the text atlas uploads as `LUMINANCE`. The shader reads it the same through `.r`.
 */
function prepareContext(renderer: WebGLRenderer): void {
    const gl = renderer.gl;

    gl.getExtension('OES_standard_derivatives');
    const t = renderer.texture as unknown as FormatTables;
    const internal = t._mapFormatToInternalFormat;
    const format = t._mapFormatToFormat;
    const type = t._mapFormatToType;

    if (!internal || !format || !type) return;
    internal.rgba32float = gl.RGBA;
    internal.rgba16float = gl.RGBA;
    type.rgba16float = HALF_FLOAT_OES;
    internal.r8unorm = gl.LUMINANCE;
    format.r8unorm = gl.LUMINANCE;
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
 * On WebGL1, `enableSilkBatching()` has no effect: each object is one draw call. A filled path
 * with more than 4096 edges, or a stroked path with more than 256 windows, draws in part with a
 * warning. Programs are global: once enabled, objects on a WebGL2 renderer on the same page use the
 * WebGL1 shaders too, which give the same pixels.
 *
 * @param renderer - The renderer of the application.
 * @returns `true` when WebGL1 support is on for this renderer. `false` when the renderer is not WebGL1,
 * or the device lacks `OES_texture_float` or `OES_texture_half_float` (an error is logged).
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

    const ext = r.context.extensions;

    if (!ext.floatTexture || !ext.textureHalfFloat) {
        console.error(
            'pixi-silk: this WebGL1 device lacks OES_texture_float or OES_texture_half_float, which SilkGraphics needs.',
        );

        return false;
    }
    const gl = r.gl;
    const high = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);

    if (!high || high.precision === 0) {
        console.warn(
            'pixi-silk: this WebGL1 device has no highp in fragment shaders. Edges and paths may show artefacts.',
        );
    }
    if (!prepared.has(renderer)) {
        prepared.add(renderer);
        prepareContext(r);
        // a lost and restored context rebuilds Pixi's format table
        r.runners.contextChange.add({ contextChange: () => prepareContext(r) });
    }
    silkGl1.hooks ??= createGl1Hooks();

    return true;
}

/** Whether {@link enableWebGL1} has run on a WebGL1 renderer, so new SilkGraphics carry the WebGL1 program. */
export function isWebGL1Enabled(): boolean {
    return silkGl1.hooks !== null;
}
