import { GlProgram, GpuProgram, Shader, type TextureSource, UniformGroup } from 'pixi.js';
import { GradientAtlas } from '../atlas';

/*
 * One instanced quad per glyph (and one more per glyph for the shadow, drawn first). The fragment
 * stage reads the glyph's distance field, converts it to device pixels with the screen-space scale
 * of the quad, and turns it into coverage with a box filter one device pixel wide. When a texel is
 * smaller than a pixel (small text), it averages four taps across the pixel instead of one.
 *
 * Uniforms (straight from SilkText):
 *   uParams: radius (texels), cutoff, local units per texel, font size (local)
 *   uFx:     dilate (local), outline width (local), shadow blur (local), AA width (device px)
 *   uPaint:  gradient kind (0 none, 1 linear, 2 radial, 3 conic), atlas row, extend mode
 */

/** @internal Vertex stage (GLSL ES 3.00). */
export const textVertex = /* glsl */ `#version 300 es
in vec2 aCorner;
in vec4 aRect;
in vec4 aUv;
in vec4 aMeta;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform vec4 uWorldColorAlpha;
uniform vec2 uResolution;
uniform mat3 uTransformMatrix;
uniform vec4 uColor;

out vec2 vPos;
out vec2 vTex;
flat out vec4 vCell;
flat out vec4 vMeta;
flat out vec4 vTint;
flat out float vPx;

void main(void)
{
    mat3 m = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
    vec2 hr = 0.5 * abs(uResolution);
    vec2 jx = m[0].xy * hr;
    vec2 jy = m[1].xy * hr;

    // device pixels per local unit (geometric mean of the two axes)
    vPx = sqrt(max(abs(jx.x * jy.y - jx.y * jy.x), 1e-12));
    vec2 pos = mix(aRect.xy, aRect.zw, aCorner);

    vPos = pos;
    vTex = mix(aUv.xy, aUv.zw, aCorner);
    vCell = aUv;
    vMeta = aMeta;
    vTint = uColor * uWorldColorAlpha;
    gl_Position = vec4((m * vec3(pos, 1.0)).xy, 0.0, 1.0);
}
`;

/** @internal Fragment stage (GLSL ES 3.00). */
export const textFragment = /* glsl */ `#version 300 es
precision highp float;

in vec2 vPos;
in vec2 vTex;
flat in vec4 vCell;
flat in vec4 vMeta;
flat in vec4 vTint;
flat in float vPx;

uniform highp sampler2D uAtlas;
uniform highp sampler2D uGradients;
uniform vec4 uFill;
uniform vec4 uOutline;
uniform vec4 uShadow;
uniform vec4 uParams;
uniform vec4 uFx;
uniform vec4 uGrad;
uniform vec4 uPaint;

out vec4 finalColor;

vec2 gInv;

// signed distance in texels at a texel position, positive outside, clamped to the glyph's cell
float field(vec2 t)
{
    t = clamp(t, vCell.xy + 0.5, vCell.zw - 0.5);
    return (1.0 - uParams.y - textureLod(uAtlas, t * gInv, 0.0).r) * uParams.x;
}

float cover(float d, float w)
{
    return clamp(0.5 - d / w, 0.0, 1.0);
}

float erfApprox(float x)
{
    float s = sign(x);
    float a = abs(x);
    float t = 1.0 + (0.278393 + (0.230389 + 0.078108 * (a * a)) * a) * a;
    t *= t;
    return s - s / (t * t);
}

vec4 gradientColor(vec2 p)
{
    int kind = int(uPaint.x + 0.5);
    float t;
    if (kind == 2)
    {
        t = (length(p - uGrad.xy) - uGrad.w) / max(uGrad.z - uGrad.w, 1e-9);
    }
    else if (kind == 3)
    {
        vec2 q = p - uGrad.xy;
        float sw = uGrad.w;
        float rel = mod((atan(q.y, q.x) - uGrad.z) * (sw < 0.0 ? -1.0 : 1.0), 6.28318530717959);
        t = rel / max(abs(sw), 1e-9);
    }
    else
    {
        vec2 ab = uGrad.zw - uGrad.xy;
        t = dot(p - uGrad.xy, ab) / max(dot(ab, ab), 1e-12);
    }
    int ext = int(uPaint.z + 0.5);
    if (ext == 1) t = fract(t);
    else if (ext == 2) t = 1.0 - abs(mod(t, 2.0) - 1.0);
    t = clamp(t, 0.0, 1.0);
    return textureLod(uGradients, vec2((t * 255.0 + 0.5) / 256.0, (uPaint.y + 0.5) / 256.0), 0.0);
}

void main(void)
{
    gInv = 1.0 / vec2(textureSize(uAtlas, 0));
    vec2 dx = dFdx(vTex);
    vec2 dy = dFdy(vTex);
    float px = vPx;
    float k = px * uParams.z;
    float aa = max(uFx.w, 1e-3);
    float reach = (1.0 - uParams.y) * uParams.x * k;
    float grow = clamp(uFx.x * px, -uParams.y * uParams.x * k, reach - aa);
    float line = clamp(uFx.y * px, 0.0, max(reach - aa - grow, 0.0));
    vec4 col;

    if (vMeta.x > 0.5)
    {
        float d = field(vTex) * k - grow - line;
        float room = max((reach - grow - line) / 2.5, 0.5 * aa);
        float sigma = clamp(uFx.z * 0.5 * px, 0.5 * aa, room);
        col = uShadow * (0.5 - 0.5 * erfApprox(d / (1.41421356 * sigma)));
    }
    else
    {
        float fc = 0.0;
        float oc = 0.0;
        if (k < 1.0)
        {
            // the pixel spans several texels: four rotated-grid taps instead of one
            float w = aa * 0.5;
            for (int i = 0; i < 4; i++)
            {
                vec2 o = i == 0 ? vec2(0.125, 0.375) : i == 1 ? vec2(-0.375, 0.125) : i == 2 ? vec2(0.375, -0.125) : vec2(-0.125, -0.375);
                float d = field(vTex + dx * o.x + dy * o.y) * k - grow;
                fc += cover(d, w);
                oc += cover(d - line, w);
            }
            fc *= 0.25;
            oc *= 0.25;
        }
        else
        {
            float d = field(vTex) * k - grow;
            fc = cover(d, aa);
            oc = cover(d - line, aa);
        }
        if (uFx.y <= 0.0) oc = 0.0;
        vec4 fill = uPaint.x > 0.5 ? uFill * gradientColor(vPos) : uFill;
        col = fill * fc + uOutline * (oc * (1.0 - fill.a * fc));
    }

    col *= vTint;
    if (col.a <= 0.0) discard;
    finalColor = col;
}
`;

/** @internal The same program in WGSL, for Pixi's WebGPU renderer. */
export const textWgsl = /* wgsl */ `
struct GlobalUniforms {
    uProjectionMatrix: mat3x3<f32>,
    uWorldTransformMatrix: mat3x3<f32>,
    uWorldColorAlpha: vec4<f32>,
    uResolution: vec2<f32>,
}

struct LocalUniforms {
    uTransformMatrix: mat3x3<f32>,
    uColor: vec4<f32>,
    uRound: f32,
}

struct TextUniforms {
    uFill: vec4<f32>,
    uOutline: vec4<f32>,
    uShadow: vec4<f32>,
    uParams: vec4<f32>,
    uFx: vec4<f32>,
    uGrad: vec4<f32>,
    uPaint: vec4<f32>,
}

@group(0) @binding(0) var<uniform> globalUniforms: GlobalUniforms;
@group(1) @binding(0) var<uniform> localUniforms: LocalUniforms;
@group(2) @binding(0) var<uniform> textUniforms: TextUniforms;
@group(2) @binding(1) var uAtlas: texture_2d<f32>;
@group(2) @binding(2) var uAtlasSampler: sampler;
@group(2) @binding(3) var uGradients: texture_2d<f32>;
@group(2) @binding(4) var uGradientsSampler: sampler;

struct VSOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) vPos: vec2<f32>,
    @location(1) vTex: vec2<f32>,
    @location(2) @interpolate(flat) vCell: vec4<f32>,
    @location(3) @interpolate(flat) vMeta: vec4<f32>,
    @location(4) @interpolate(flat) vTint: vec4<f32>,
    @location(5) @interpolate(flat) vPx: f32,
}

@vertex
fn mainVertex(
    @location(0) aCorner: vec2<f32>,
    @location(1) aRect: vec4<f32>,
    @location(2) aUv: vec4<f32>,
    @location(3) aMeta: vec4<f32>,
) -> VSOutput {
    let m = globalUniforms.uProjectionMatrix * globalUniforms.uWorldTransformMatrix * localUniforms.uTransformMatrix;
    let hr = 0.5 * abs(globalUniforms.uResolution);
    let jx = m[0].xy * hr;
    let jy = m[1].xy * hr;
    let pos = mix(aRect.xy, aRect.zw, aCorner);
    var out: VSOutput;

    out.vPx = sqrt(max(abs(jx.x * jy.y - jx.y * jy.x), 1e-12));
    out.vPos = pos;
    out.vTex = mix(aUv.xy, aUv.zw, aCorner);
    out.vCell = aUv;
    out.vMeta = aMeta;
    out.vTint = localUniforms.uColor * globalUniforms.uWorldColorAlpha;
    out.position = vec4<f32>((m * vec3<f32>(pos, 1.0)).xy, 0.0, 1.0);

    return out;
}

fn field(t0: vec2<f32>, cell: vec4<f32>, inv: vec2<f32>) -> f32 {
    let t = clamp(t0, cell.xy + 0.5, cell.zw - 0.5);
    let s = textureSampleLevel(uAtlas, uAtlasSampler, t * inv, 0.0).r;

    return (1.0 - textUniforms.uParams.y - s) * textUniforms.uParams.x;
}

fn cover(d: f32, w: f32) -> f32 {
    return clamp(0.5 - d / w, 0.0, 1.0);
}

fn erfApprox(x: f32) -> f32 {
    let s = sign(x);
    let a = abs(x);
    var t = 1.0 + (0.278393 + (0.230389 + 0.078108 * (a * a)) * a) * a;

    t = t * t;

    return s - s / (t * t);
}

fn gradientColor(p: vec2<f32>) -> vec4<f32> {
    let g = textUniforms.uGrad;
    let paint = textUniforms.uPaint;
    let kind = i32(paint.x + 0.5);
    var t: f32;

    if (kind == 2) {
        t = (length(p - g.xy) - g.w) / max(g.z - g.w, 1e-9);
    } else if (kind == 3) {
        let q = p - g.xy;
        let sw = g.w;
        let a = (atan2(q.y, q.x) - g.z) * select(1.0, -1.0, sw < 0.0);
        let rel = a - 6.28318530717959 * floor(a / 6.28318530717959);

        t = rel / max(abs(sw), 1e-9);
    } else {
        let ab = g.zw - g.xy;

        t = dot(p - g.xy, ab) / max(dot(ab, ab), 1e-12);
    }
    let ext = i32(paint.z + 0.5);

    if (ext == 1) {
        t = fract(t);
    } else if (ext == 2) {
        t = 1.0 - abs(t - 2.0 * floor(t / 2.0) - 1.0);
    }
    t = clamp(t, 0.0, 1.0);

    return textureSampleLevel(uGradients, uGradientsSampler, vec2<f32>((t * 255.0 + 0.5) / 256.0, (paint.y + 0.5) / 256.0), 0.0);
}

@fragment
fn mainFragment(input: VSOutput) -> @location(0) vec4<f32> {
    let u = textUniforms;
    let inv = 1.0 / vec2<f32>(textureDimensions(uAtlas));
    let dx = dpdx(input.vTex);
    let dy = dpdy(input.vTex);
    let px = input.vPx;
    let k = px * u.uParams.z;
    let aa = max(u.uFx.w, 1e-3);
    let reach = (1.0 - u.uParams.y) * u.uParams.x * k;
    let grow = clamp(u.uFx.x * px, -u.uParams.y * u.uParams.x * k, reach - aa);
    let line = clamp(u.uFx.y * px, 0.0, max(reach - aa - grow, 0.0));
    var col: vec4<f32>;

    if (input.vMeta.x > 0.5) {
        let d = field(input.vTex, input.vCell, inv) * k - grow - line;
        let room = max((reach - grow - line) / 2.5, 0.5 * aa);
        let sigma = clamp(u.uFx.z * 0.5 * px, 0.5 * aa, room);

        col = u.uShadow * (0.5 - 0.5 * erfApprox(d / (1.41421356 * sigma)));
    } else {
        var fc = 0.0;
        var oc = 0.0;

        if (k < 1.0) {
            let w = aa * 0.5;
            let taps = array<vec2<f32>, 4>(
                vec2<f32>(0.125, 0.375),
                vec2<f32>(-0.375, 0.125),
                vec2<f32>(0.375, -0.125),
                vec2<f32>(-0.125, -0.375),
            );

            for (var i = 0; i < 4; i++) {
                let o = taps[i];
                let d = field(input.vTex + dx * o.x + dy * o.y, input.vCell, inv) * k - grow;

                fc += cover(d, w);
                oc += cover(d - line, w);
            }
            fc *= 0.25;
            oc *= 0.25;
        } else {
            let d = field(input.vTex, input.vCell, inv) * k - grow;

            fc = cover(d, aa);
            oc = cover(d - line, aa);
        }
        if (u.uFx.y <= 0.0) {
            oc = 0.0;
        }
        var fill = u.uFill;

        if (u.uPaint.x > 0.5) {
            fill = fill * gradientColor(input.vPos);
        }
        col = fill * fc + u.uOutline * (oc * (1.0 - fill.a * fc));
    }
    col *= input.vTint;
    if (col.a <= 0.0) {
        discard;
    }

    return col;
}
`;

let glProgram: GlProgram | null = null;
let gpuProgram: GpuProgram | null = null;

/** @internal Builds the shader of one SilkText: shared programs, its own uniforms. */
export function createTextShader(atlas: TextureSource): Shader {
    glProgram ??= GlProgram.from({
        vertex: textVertex,
        fragment: textFragment,
        name: 'silk-text',
        preferredVertexPrecision: 'highp',
        preferredFragmentPrecision: 'highp',
    });
    gpuProgram ??= GpuProgram.from({
        name: 'silk-text',
        vertex: { source: textWgsl, entryPoint: 'mainVertex' },
        fragment: { source: textWgsl, entryPoint: 'mainFragment' },
    });
    const gradients = GradientAtlas.shared.source;
    const v4 = (): { value: Float32Array; type: 'vec4<f32>' } => ({ value: new Float32Array(4), type: 'vec4<f32>' });

    return new Shader({
        glProgram,
        gpuProgram,
        resources: {
            textUniforms: new UniformGroup({
                uFill: v4(),
                uOutline: v4(),
                uShadow: v4(),
                uParams: v4(),
                uFx: v4(),
                uGrad: v4(),
                uPaint: v4(),
            }),
            uAtlas: atlas,
            uAtlasSampler: atlas.style,
            uGradients: gradients,
            uGradientsSampler: gradients.style,
        },
    });
}
