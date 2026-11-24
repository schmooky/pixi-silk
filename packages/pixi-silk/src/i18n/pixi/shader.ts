import { BufferImageSource, GlProgram, GpuProgram, Shader, type TextureSource, UniformGroup } from 'pixi.js';
import { messageWgsl } from './shader-wgsl';

/**
 * @internal The shader of `SilkMessage`: one instanced quad per glyph or decoration.
 *
 * Each instance has 8 floats (`INSTANCE_FLOATS`). The first vec4 (aInst0) holds the pen x and y
 * on the baseline, the pixels per font unit and the atlas glyph index. The second (aInst1) holds the
 * style row, the kind (0 glyph, 1 underline, 2 strike) plus 4 times the message index in a batch,
 * the font size and the width.
 *
 * uTransforms is RGBA32F with 2 texels per message: a, b, c, d of its matrix, then tx, ty and alpha.
 *
 * uMetrics is RGBA32F with 3 texels per glyph and 512 glyphs per row. Texel 0 holds the page
 * slot and x, y, w in atlas pixels. Texel 1 holds h, then planeL, planeB, planeR in font units.
 * Texel 2 holds planeT and the atlas pixels per font unit.
 *
 * uStyles is RGBA32F with 8 texels per style row and 64 rows per texture row, as `packStyle` packs them.
 *
 * uPage0..3 hold the width, height, distance range and kind (0 msdf, 1 sdf, 2 mtsdf) of up to four pages.
 *
 * The fragment stage turns the distance field into local pixels, so outline, glow and shadow widths
 * from the theme are pixel exact at any scale, and anti-aliases over one device pixel. Colours are
 * straight in the style table and composed premultiplied: shadow, glow, outline, then fill.
 */
export const messageVertex = /* glsl */ `#version 300 es
in vec2 aCorner;
in vec4 aInst0;
in vec4 aInst1;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform vec4 uWorldColorAlpha;
uniform mat3 uTransformMatrix;
uniform vec4 uColor;

uniform sampler2D uMetrics;
uniform sampler2D uStyles;
uniform sampler2D uTransforms;

out vec2 vPos;
out vec2 vUv;
flat out vec4 vCell;
flat out vec4 vInfo;
flat out vec4 vRect;
flat out vec4 vTint;

vec4 metric(float glyph, int t) {
    int g = int(glyph);
    return texelFetch(uMetrics, ivec2((g % 512) * 3 + t, g / 512), 0);
}

vec4 styleTexel(float row, int t) {
    int r = int(row);
    return texelFetch(uStyles, ivec2((r % 64) * 8 + t, r / 64), 0);
}

void main(void)
{
    mat3 m = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
    // kind holds the instance kind (0 to 2) plus 4 times its message index in a batch
    float kind = mod(aInst1.y, 4.0);
    int message = int(aInst1.y / 4.0);
    vec4 xf0 = texelFetch(uTransforms, ivec2((message % 512) * 2, message / 512), 0);
    vec4 xf1 = texelFetch(uTransforms, ivec2((message % 512) * 2 + 1, message / 512), 0);
    float size = aInst1.z;
    vec2 pos;

    // uColor is premultiplied: the batch alpha scales all four channels
    vTint = uColor * uWorldColorAlpha * xf1.z;
    if (kind < 0.5) {
        vec4 t0 = metric(aInst0.w, 0);
        vec4 t1 = metric(aInst0.w, 1);
        vec4 t2 = metric(aInst0.w, 2);
        float scale = aInst0.z;
        // local rectangle of the glyph cell, y down
        vec2 lo = vec2(aInst0.x + t1.y * scale, aInst0.y - t2.x * scale);
        vec2 hi = vec2(aInst0.x + t1.w * scale, aInst0.y - t1.z * scale);
        // grow it by the shadow offset, so the shadow is not cut
        vec2 off = styleTexel(aInst1.x, 5).xy;

        pos = mix(lo + min(vec2(0.0), off), hi + max(vec2(0.0), off), aCorner);
        // atlas pixels per local pixel
        float k = t2.y / scale;

        vUv = t0.yz + (pos - lo) * k;
        vCell = vec4(t0.yz, t0.yz + vec2(t0.w, t1.x));
        vInfo = vec4(t0.x, k, kind, aInst1.x);
        vRect = vec4(0.0, size, 0.0, 0.0);
    } else {
        vec4 s5 = styleTexel(aInst1.x, 5);
        vec4 s7 = styleTexel(aInst1.x, 7);
        float thickness = (kind < 1.5 ? s5.z : s7.x) * size;
        float centre = kind < 1.5 ? aInst0.y + s5.w * size : aInst0.y - s7.y * size;
        vec2 lo = vec2(aInst0.x, centre - thickness * 0.5 - 1.0);
        vec2 hi = vec2(aInst0.x + aInst1.w, centre + thickness * 0.5 + 1.0);

        pos = mix(lo, hi, aCorner);
        vUv = vec2(0.0);
        vCell = vec4(0.0);
        vInfo = vec4(0.0, 0.0, kind, aInst1.x);
        vRect = vec4(centre, size, thickness, 0.0);
    }
    vPos = pos;
    // the message's transform inside its batch (identity outside one)
    vec2 placed = vec2(xf0.x * pos.x + xf0.z * pos.y + xf1.x, xf0.y * pos.x + xf0.w * pos.y + xf1.y);

    gl_Position = vec4((m * vec3(placed, 1.0)).xy, 0.0, 1.0);
}
`;

/** @internal Fragment stage (GLSL ES 3.00). */
export const messageFragment = /* glsl */ `#version 300 es
precision highp float;

in vec2 vPos;
in vec2 vUv;
flat in vec4 vCell;
flat in vec4 vInfo;
flat in vec4 vRect;
flat in vec4 vTint;

uniform sampler2D uStyles;
uniform sampler2D uAtlas0;
uniform sampler2D uAtlas1;
uniform sampler2D uAtlas2;
uniform sampler2D uAtlas3;
uniform vec4 uPage0;
uniform vec4 uPage1;
uniform vec4 uPage2;
uniform vec4 uPage3;

out vec4 finalColor;

vec4 styleTexel(float row, int t) {
    int r = int(row);
    return texelFetch(uStyles, ivec2((r % 64) * 8 + t, r / 64), 0);
}

vec4 page(float slot) {
    return slot < 0.5 ? uPage0 : slot < 1.5 ? uPage1 : slot < 2.5 ? uPage2 : uPage3;
}

vec4 sampleAtlas(float slot, vec2 uv) {
    vec2 c = clamp(uv, vCell.xy + 0.5, vCell.zw - 0.5) / page(slot).xy;
    if (slot < 0.5) return texture(uAtlas0, c);
    if (slot < 1.5) return texture(uAtlas1, c);
    if (slot < 2.5) return texture(uAtlas2, c);
    return texture(uAtlas3, c);
}

float median(vec3 v) {
    return max(min(v.r, v.g), min(max(v.r, v.g), v.b));
}

// signed distance in local pixels, positive inside
float distanceAt(vec2 uv) {
    vec4 p = page(vInfo.x);
    vec4 s = sampleAtlas(vInfo.x, uv);
    float v = p.w > 0.5 && p.w < 1.5 ? s.r : median(s.rgb);

    return (v - 0.5) * p.z / vInfo.y;
}

// the true distance, for soft effects: alpha of mtsdf pages, the median elsewhere
float softDistanceAt(vec2 uv) {
    vec4 p = page(vInfo.x);

    if (p.w < 1.5) return distanceAt(uv);
    return (sampleAtlas(vInfo.x, uv).a - 0.5) * p.z / vInfo.y;
}

vec4 over(vec4 top, vec4 bottom) {
    return top + bottom * (1.0 - top.a);
}

vec4 premul(vec4 c, float cov) {
    return vec4(c.rgb * c.a, c.a) * cov;
}

void main(void)
{
    // local pixels per device pixel
    float aa = max(0.5 * (length(dFdx(vPos)) + length(dFdy(vPos))), 1e-4);
    float row = vInfo.w;
    vec4 fill = styleTexel(row, 0);
    vec4 color;

    if (vInfo.z > 0.5) {
        vec4 line = styleTexel(row, 6);
        float d = vRect.z * 0.5 - abs(vPos.y - vRect.x);
        float cov = clamp(d / aa + 0.5, 0.0, 1.0);

        color = premul(line.a > 0.0 ? line : fill, cov);
    } else {
        vec4 outline = styleTexel(row, 1);
        vec4 glow = styleTexel(row, 2);
        vec4 shadow = styleTexel(row, 3);
        vec4 fx = styleTexel(row, 4);
        vec4 s5 = styleTexel(row, 5);
        float bias = fx.w * vRect.y;
        float sd = distanceAt(vUv) + bias;
        // effects end where the distance field ends (half the range, in local pixels)
        float reach = max(0.5 * page(vInfo.x).z / vInfo.y - aa, 0.0);
        float ow = min(fx.x, reach);
        float room = max(reach - ow, 0.0);

        color = vec4(0.0);
        if (shadow.a > 0.0) {
            float blur = min(fx.z * 4.0, 2.0 * room);
            float ss = softDistanceAt(vUv - s5.xy * vInfo.y) + bias + ow;
            float cov = smoothstep(-0.5 * blur - aa * 0.5, 0.5 * blur + aa * 0.5, ss);

            color = premul(shadow, cov);
        }
        if (glow.a > 0.0 && fx.y > 0.0) {
            float g = clamp(1.0 + (softDistanceAt(vUv) + bias + ow) / max(min(fx.y, room), 1e-4), 0.0, 1.0);

            color = over(premul(glow, g * g), color);
        }
        if (outline.a > 0.0 && ow > 0.0) {
            color = over(premul(outline, clamp((sd + ow) / aa + 0.5, 0.0, 1.0)), color);
        }
        color = over(premul(fill, clamp(sd / aa + 0.5, 0.0, 1.0)), color);
    }
    finalColor = color * vTint;
}
`;

let glProgram: GlProgram | null = null;
let gpuProgram: GpuProgram | null = null;

/** @internal The resources one SilkMessage binds: its bundle's metrics and pages, its theme's styles. */
export interface MessageResources {
    /** Glyph metrics data texture. */
    metrics: TextureSource;
    /** Style rows data texture. */
    styles: TextureSource;
    /** Up to four atlas pages. Missing slots repeat page 0. */
    pages: TextureSource[];
    /** Width, height, distance range and kind of each page. */
    pageInfo: Float32Array[];
    /** Message transforms of a batch. Default the identity for one message. */
    transforms?: TextureSource;
}

let identity: BufferImageSource | null = null;

/** @internal The transform texture of an unbatched message: one identity matrix, alpha 1. */
export function identityTransforms(): BufferImageSource {
    identity ??= new BufferImageSource({
        resource: new Float32Array([1, 0, 0, 1, 0, 0, 1, 0]),
        width: 2,
        height: 1,
        format: 'rgba32float',
        alphaMode: 'premultiplied-alpha',
        scaleMode: 'nearest',
        autoGenerateMipmaps: false,
        label: 'silk-message-identity',
    });

    return identity;
}

/** @internal Builds a SilkMessage shader: shared programs, the message's own resources. */
export function createMessageShader(r: MessageResources): Shader {
    glProgram ??= GlProgram.from({
        vertex: messageVertex,
        fragment: messageFragment,
        name: 'silk-message',
        preferredVertexPrecision: 'highp',
        preferredFragmentPrecision: 'highp',
    });
    if (!gpuProgram) {
        gpuProgram = GpuProgram.from({
            name: 'silk-message',
            vertex: { source: messageWgsl, entryPoint: 'mainVertex' },
            fragment: { source: messageWgsl, entryPoint: 'mainFragment' },
        });
        // the data textures are RGBA32F and read with textureLoad only
        for (const entry of gpuProgram.gpuLayout[2] ?? []) {
            if (entry.texture && (entry.binding <= 2 || entry.binding === 8))
                entry.texture.sampleType = 'unfilterable-float';
        }
    }
    const page = (i: number) => r.pages[i] ?? r.pages[0];
    const info = (i: number) => ({ value: r.pageInfo[i] ?? r.pageInfo[0], type: 'vec4<f32>' as const });

    return new Shader({
        glProgram,
        gpuProgram,
        resources: {
            messageUniforms: new UniformGroup({ uPage0: info(0), uPage1: info(1), uPage2: info(2), uPage3: info(3) }),
            uMetrics: r.metrics,
            uStyles: r.styles,
            uAtlas0: page(0),
            uAtlas1: page(1),
            uAtlas2: page(2),
            uAtlas3: page(3),
            uAtlasSampler: page(0).style,
            uTransforms: r.transforms ?? identityTransforms(),
        },
    });
}
