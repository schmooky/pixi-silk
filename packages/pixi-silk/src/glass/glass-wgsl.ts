/**
 * @internal WGSL port of the glass filter (`glassVertex` and `glassFragment` in GlassFilter.ts), for
 * Pixi's WebGPU renderer. Pixi's filter system copies the backdrop into `uBackTexture` on WebGPU
 * too, so the glass looks the same on both renderers. The back texture is read with
 * textureSampleLevel at level 0, because the frost loop runs in non-uniform control flow. It has
 * no mipmaps, so that equals GLSL's texture().
 */
export const glassWgsl = /* wgsl */ `
struct GlobalFilterUniforms {
    uInputSize: vec4<f32>,
    uInputPixel: vec4<f32>,
    uInputClamp: vec4<f32>,
    uOutputFrame: vec4<f32>,
    uGlobalFrame: vec4<f32>,
    uOutputTexture: vec4<f32>,
}

struct GlassUniforms {
    uShape: vec4<f32>,
    uOptics: vec4<f32>,
    uTint: vec4<f32>,
    uLight: vec4<f32>,
    uSurface: vec4<f32>,
    uFrame: vec4<f32>,
}

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(0) @binding(3) var uBackTexture: texture_2d<f32>;
@group(1) @binding(0) var<uniform> glassUniforms: GlassUniforms;

struct VSOut {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@vertex
fn mainVertex(@location(0) aPosition: vec2<f32>) -> VSOut {
    var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;

    position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;

    var out: VSOut;

    out.position = vec4<f32>(position, 0.0, 1.0);
    out.uv = aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);
    return out;
}

fn hash(p: vec2<f32>) -> f32 {
    return fract(52.9829189 * fract(dot(p, vec2<f32>(0.06711056, 0.00583715))));
}

fn sdShape(p: vec2<f32>) -> f32 {
    let shape = glassUniforms.uShape;
    let b = shape.xy;
    let r = min(shape.z, min(b.x, b.y));
    let q = abs(p) - b + r;
    let m = max(q, vec2<f32>(0.0));
    let k = mix(2.0, 5.0, clamp(shape.w, 0.0, 1.0));
    let corner = pow(pow(m.x, k) + pow(m.y, k), 1.0 / k);

    return corner + min(max(q.x, q.y), 0.0) - r;
}

fn backAt(uv: vec2<f32>) -> vec3<f32> {
    return textureSampleLevel(uBackTexture, uSampler, clamp(uv, gfu.uInputClamp.xy, gfu.uInputClamp.zw), 0.0).rgb;
}

fn frosted(uv: vec2<f32>, radius: f32, spin: f32) -> vec3<f32> {
    if (radius < 0.5) {
        return backAt(uv);
    }
    var acc = vec3<f32>(0.0);
    var total = 0.0;

    for (var i = 0; i < 24; i++) {
        let f = f32(i);
        let r = sqrt((f + 0.5) / 24.0);
        let a = f * 2.39996323 + spin;
        let o = vec2<f32>(cos(a), sin(a)) * r * radius * gfu.uInputSize.zw;
        let w = exp(-r * r * 1.6);

        acc += backAt(uv + o) * w;
        total += w;
    }

    return acc / total;
}

@fragment
fn mainFragment(input: VSOut) -> @location(0) vec4<f32> {
    let uv = input.uv;
    let size = gfu.uOutputFrame.zw;
    let p = uv * gfu.uInputSize.xy - size * 0.5;
    // the pane's own axes: p is in screen pixels, uFrame.xy is the cosine and sine of its rotation
    let axis = glassUniforms.uFrame.xy;
    let q = vec2<f32>(axis.x * p.x + axis.y * p.y, axis.x * p.y - axis.y * p.x);
    let d = sdShape(q);
    // derivatives first: WGSL only allows them in uniform control flow
    let aa = max(fwidth(d), 1e-3);
    let cover = clamp(0.5 - d / aa, 0.0, 1.0);

    if (cover <= 0.0) {
        return vec4<f32>(0.0);
    }

    let optics = glassUniforms.uOptics;
    let tint = glassUniforms.uTint;
    let light = glassUniforms.uLight;
    let surface = glassUniforms.uSurface;
    let e = vec2<f32>(0.75, 0.0);
    let nq = vec2<f32>(sdShape(q + e.xy) - sdShape(q - e.xy), sdShape(q + e.yx) - sdShape(q - e.yx));
    // back to screen space, where the backdrop is sampled and the light sits
    var n = vec2<f32>(axis.x * nq.x - axis.y * nq.y, axis.y * nq.x + axis.x * nq.y);

    n = n / max(length(n), 1e-5);

    let bevel = max(optics.w, 1.0);
    let rim = 1.0 - smoothstep(0.0, bevel, -d);
    let bend = rim * rim;
    let shift = n * optics.y * bend * gfu.uInputSize.zw;
    let spin = hash(input.position.xy) * 6.2831853;
    let blur = optics.x;
    var col: vec3<f32>;

    if (optics.z > 0.001) {
        let split = optics.z * bend;

        col = vec3<f32>(
            frosted(uv + shift * (1.0 + split), blur, spin).r,
            frosted(uv + shift, blur, spin).g,
            frosted(uv + shift * (1.0 - split), blur, spin).b,
        );
    } else {
        col = frosted(uv + shift, blur, spin);
    }

    let luma = dot(col, vec3<f32>(0.2126, 0.7152, 0.0722));

    col = max(mix(vec3<f32>(luma), col, surface.z), vec3<f32>(0.0));
    col = mix(col, vec3<f32>(1.0), surface.x);
    col = mix(col, tint.rgb, tint.a);

    let toLight = light.xy;
    let span = max(glassUniforms.uShape.x, glassUniforms.uShape.y);
    let sheen = clamp(dot(p / span, toLight) * 0.5 + 0.5, 0.0, 1.0);
    let facing = max(dot(n, toLight), 0.0);
    let hairline = exp(-abs(d + 0.9) * 1.1);

    col += light.z * (0.10 * sheen * sheen + 0.55 * pow(rim, 3.0) * facing + 0.35 * hairline * (0.35 + 0.65 * facing));
    col += (hash(input.position.xy + surface.w) - 0.5) * light.w;

    return vec4<f32>(col, 1.0) * cover * surface.y;
}
`;
