/**
 * @internal WGSL twin of the SilkMessage shader in `shader.ts`: the same instance layout, data
 * textures and effect math. Data textures are read with textureLoad (they are RGBA32F).
 */
export const messageWgsl = /* wgsl */ `
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

struct MessageUniforms {
    uPage0: vec4<f32>,
    uPage1: vec4<f32>,
    uPage2: vec4<f32>,
    uPage3: vec4<f32>,
}

@group(0) @binding(0) var<uniform> globalUniforms: GlobalUniforms;
@group(1) @binding(0) var<uniform> localUniforms: LocalUniforms;
@group(2) @binding(0) var<uniform> messageUniforms: MessageUniforms;
@group(2) @binding(1) var uMetrics: texture_2d<f32>;
@group(2) @binding(2) var uStyles: texture_2d<f32>;
@group(2) @binding(3) var uAtlas0: texture_2d<f32>;
@group(2) @binding(4) var uAtlas1: texture_2d<f32>;
@group(2) @binding(5) var uAtlas2: texture_2d<f32>;
@group(2) @binding(6) var uAtlas3: texture_2d<f32>;
@group(2) @binding(7) var uAtlasSampler: sampler;

struct VSOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) vPos: vec2<f32>,
    @location(1) vUv: vec2<f32>,
    @location(2) @interpolate(flat) vCell: vec4<f32>,
    @location(3) @interpolate(flat) vInfo: vec4<f32>,
    @location(4) @interpolate(flat) vRect: vec4<f32>,
    @location(5) @interpolate(flat) vTint: vec4<f32>,
}

fn metric(glyph: f32, t: i32) -> vec4<f32> {
    let g = i32(glyph);
    return textureLoad(uMetrics, vec2<i32>((g % 512) * 3 + t, g / 512), 0);
}

fn styleTexel(row: f32, t: i32) -> vec4<f32> {
    let r = i32(row);
    return textureLoad(uStyles, vec2<i32>((r % 64) * 8 + t, r / 64), 0);
}

@vertex
fn mainVertex(
    @location(0) aCorner: vec2<f32>,
    @location(1) aInst0: vec4<f32>,
    @location(2) aInst1: vec4<f32>,
) -> VSOutput {
    let m = globalUniforms.uProjectionMatrix * globalUniforms.uWorldTransformMatrix * localUniforms.uTransformMatrix;
    let kind = aInst1.y;
    let size = aInst1.z;
    var out: VSOutput;
    var pos: vec2<f32>;

    out.vTint = localUniforms.uColor * globalUniforms.uWorldColorAlpha;
    if (kind < 0.5) {
        let t0 = metric(aInst0.w, 0);
        let t1 = metric(aInst0.w, 1);
        let t2 = metric(aInst0.w, 2);
        let scale = aInst0.z;
        let lo = vec2<f32>(aInst0.x + t1.y * scale, aInst0.y - t2.x * scale);
        let hi = vec2<f32>(aInst0.x + t1.w * scale, aInst0.y - t1.z * scale);
        let off = styleTexel(aInst1.x, 5).xy;

        pos = mix(lo + min(vec2<f32>(0.0), off), hi + max(vec2<f32>(0.0), off), aCorner);
        let k = t2.y / scale;

        out.vUv = t0.yz + (pos - lo) * k;
        out.vCell = vec4<f32>(t0.yz, t0.yz + vec2<f32>(t0.w, t1.x));
        out.vInfo = vec4<f32>(t0.x, k, kind, aInst1.x);
        out.vRect = vec4<f32>(0.0, size, 0.0, 0.0);
    } else {
        let s5 = styleTexel(aInst1.x, 5);
        let s7 = styleTexel(aInst1.x, 7);
        let thickness = select(s7.x, s5.z, kind < 1.5) * size;
        let centre = select(aInst0.y - s7.y * size, aInst0.y + s5.w * size, kind < 1.5);
        let lo = vec2<f32>(aInst0.x, centre - thickness * 0.5 - 1.0);
        let hi = vec2<f32>(aInst0.x + aInst1.w, centre + thickness * 0.5 + 1.0);

        pos = mix(lo, hi, aCorner);
        out.vUv = vec2<f32>(0.0);
        out.vCell = vec4<f32>(0.0);
        out.vInfo = vec4<f32>(0.0, 0.0, kind, aInst1.x);
        out.vRect = vec4<f32>(centre, size, thickness, 0.0);
    }
    out.vPos = pos;
    out.position = vec4<f32>((m * vec3<f32>(pos, 1.0)).xy, 0.0, 1.0);

    return out;
}

fn page(slot: f32) -> vec4<f32> {
    if (slot < 0.5) { return messageUniforms.uPage0; }
    if (slot < 1.5) { return messageUniforms.uPage1; }
    if (slot < 2.5) { return messageUniforms.uPage2; }
    return messageUniforms.uPage3;
}

fn sampleAtlas(slot: f32, uv: vec2<f32>, cell: vec4<f32>) -> vec4<f32> {
    let c = clamp(uv, cell.xy + 0.5, cell.zw - 0.5) / page(slot).xy;
    // sample every page in uniform control flow, then pick one
    let a0 = textureSampleLevel(uAtlas0, uAtlasSampler, c, 0.0);
    let a1 = textureSampleLevel(uAtlas1, uAtlasSampler, c, 0.0);
    let a2 = textureSampleLevel(uAtlas2, uAtlasSampler, c, 0.0);
    let a3 = textureSampleLevel(uAtlas3, uAtlasSampler, c, 0.0);

    return select(select(select(a3, a2, slot < 2.5), a1, slot < 1.5), a0, slot < 0.5);
}

fn median3(v: vec3<f32>) -> f32 {
    return max(min(v.r, v.g), min(max(v.r, v.g), v.b));
}

fn distanceAt(uv: vec2<f32>, info: vec4<f32>, cell: vec4<f32>) -> f32 {
    let p = page(info.x);
    let s = sampleAtlas(info.x, uv, cell);
    let v = select(median3(s.rgb), s.r, p.w > 0.5 && p.w < 1.5);

    return (v - 0.5) * p.z / info.y;
}

fn over(top: vec4<f32>, bottom: vec4<f32>) -> vec4<f32> {
    return top + bottom * (1.0 - top.a);
}

fn premul(c: vec4<f32>, cov: f32) -> vec4<f32> {
    return vec4<f32>(c.rgb * c.a, c.a) * cov;
}

@fragment
fn mainFragment(input: VSOutput) -> @location(0) vec4<f32> {
    let aa = max(0.5 * (length(dpdx(input.vPos)) + length(dpdy(input.vPos))), 1e-4);
    let row = input.vInfo.w;
    let fill = styleTexel(row, 0);
    var color = vec4<f32>(0.0);

    if (input.vInfo.z > 0.5) {
        let line = styleTexel(row, 6);
        let d = input.vRect.z * 0.5 - abs(input.vPos.y - input.vRect.x);
        let cov = clamp(d / aa + 0.5, 0.0, 1.0);

        color = premul(select(fill, line, line.a > 0.0), cov);
    } else {
        let outline = styleTexel(row, 1);
        let glow = styleTexel(row, 2);
        let shadow = styleTexel(row, 3);
        let fx = styleTexel(row, 4);
        let s5 = styleTexel(row, 5);
        let bias = fx.w * input.vRect.y;
        let sd = distanceAt(input.vUv, input.vInfo, input.vCell) + bias;
        let ss = distanceAt(input.vUv - s5.xy * input.vInfo.y, input.vInfo, input.vCell) + bias + fx.x;

        if (shadow.a > 0.0) {
            let blur = fx.z * 4.0;
            color = premul(shadow, smoothstep(-0.5 * blur - aa * 0.5, 0.5 * blur + aa * 0.5, ss));
        }
        if (glow.a > 0.0 && fx.y > 0.0) {
            let g = clamp(1.0 + (sd + fx.x) / fx.y, 0.0, 1.0);
            color = over(premul(glow, g * g), color);
        }
        if (outline.a > 0.0 && fx.x > 0.0) {
            color = over(premul(outline, clamp((sd + fx.x) / aa + 0.5, 0.0, 1.0)), color);
        }
        color = over(premul(fill, clamp(sd / aa + 0.5, 0.0, 1.0)), color);
    }

    return color * input.vTint.a * vec4<f32>(input.vTint.rgb, 1.0);
}
`;
