import { GpuProgram } from 'pixi.js';

/*
 * WGSL port of the uber program in shader.ts, for Pixi's WebGPU renderer. It is a line-by-line
 * translation: same signed distances, same coverage, same paints. Keep the two in step.
 *
 * Bindings (Pixi's mesh layout):
 *   group 0  globalUniforms  (set by the renderer)
 *   group 1  localUniforms   (set by the mesh pipe)
 *   group 2  silkUniforms, uGradients, uPolys (the SilkGraphics' own resources)
 *
 * Differences from GLSL that are forced by WGSL:
 *   - GLSL `mod` floors, WGSL `%` truncates: `fmod` below is the GLSL one.
 *   - helpers cannot read stage inputs, so the fragment entry copies them to private globals.
 *   - derivatives need uniform control flow, so dpdx / dpdy run first, before any branch.
 *   - the gradient ramp is read with textureLoad and blended by hand (the same bilinear tap as
 *     textureLod on the linear atlas), so the program needs no sampler.
 */

/** @internal The uber program in WGSL: vertex entry `mainVertex`, fragment entry `mainFragment`. */
export const wgsl = /* wgsl */ `
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

struct SilkUniforms {
    uSilk: vec4<f32>,
}

@group(0) @binding(0) var<uniform> globalUniforms: GlobalUniforms;
@group(1) @binding(0) var<uniform> localUniforms: LocalUniforms;
@group(2) @binding(0) var<uniform> silkUniforms: SilkUniforms;
@group(2) @binding(1) var uGradients: texture_2d<f32>;
@group(2) @binding(2) var uPolys: texture_2d<f32>;

struct VSOut {
    @builtin(position) position: vec4<f32>,
    @location(0) vPos: vec2<f32>,
    @location(1) @interpolate(flat) vShape0: vec4<f32>,
    @location(2) @interpolate(flat) vShape1: vec4<f32>,
    @location(3) @interpolate(flat) vShape2: vec4<f32>,
    @location(4) @interpolate(flat) vMeta: vec4<f32>,
    @location(5) @interpolate(flat) vFill: vec4<f32>,
    @location(6) @interpolate(flat) vStroke: vec4<f32>,
    @location(7) @interpolate(flat) vGrad: vec4<f32>,
    @location(8) @interpolate(flat) vPaint: vec4<f32>,
    @location(9) @interpolate(flat) vDash: vec4<f32>,
    @location(10) @interpolate(flat) vFx: vec4<f32>,
    @location(11) @interpolate(flat) vTint: vec4<f32>,
    @location(12) vProg: f32,
}

const PI: f32 = 3.14159265358979;
const TAU: f32 = 6.28318530717959;

@vertex
fn mainVertex(
    @location(0) aCorner: vec2<f32>,
    @location(1) aBounds: vec4<f32>,
    @location(2) aShape0: vec4<f32>,
    @location(3) aShape1: vec4<f32>,
    @location(4) aShape2: vec4<f32>,
    @location(5) aMeta: vec4<f32>,
    @location(6) aFill: vec4<f32>,
    @location(7) aStroke: vec4<f32>,
    @location(8) aGrad: vec4<f32>,
    @location(9) aPaint: vec4<f32>,
    @location(10) aDash: vec4<f32>,
    @location(11) aFx: vec4<f32>,
) -> VSOut {
    let m = globalUniforms.uProjectionMatrix * globalUniforms.uWorldTransformMatrix * localUniforms.uTransformMatrix;
    let uSilk = silkUniforms.uSilk;

    // Jacobian local -> device pixels; its smallest singular value tells how many
    // local units one device pixel spans in the worst direction.
    let hr = 0.5 * abs(globalUniforms.uResolution);
    let jx = m[0].xy * hr;
    let jy = m[1].xy * hr;
    let a2 = dot(jx, jx) + dot(jy, jy);
    let det = abs(jx.x * jy.y - jx.y * jy.x);
    let smin = sqrt(max(0.5 * (a2 - sqrt(max(a2 * a2 - 4.0 * det * det, 0.0))), 1e-12));
    let lpx = 1.0 / smin;
    let pad = (0.5 * uSilk.y + 1.0) * lpx;

    let prim = i32(aMeta.x + 0.5);
    let flags = i32(aMeta.y + 0.5);
    var pos: vec2<f32>;

    if (prim == 4) {
        // polyline segment: oriented quad hugging the capsule
        let a = aShape0.xy;
        let b = aShape0.zw;
        let ab = b - a;
        let len = length(ab);
        var dir = vec2<f32>(1.0, 0.0);
        if (len > 1e-9) {
            dir = ab / len;
        }
        let nrm = vec2<f32>(-dir.y, dir.x);
        let ext = max(max(aShape2.z, aShape2.w), 0.5 * lpx * uSilk.z) + 3.0 * aMeta.w + pad;

        pos = select(b + dir * ext, a - dir * ext, aCorner.x < 0.5) + nrm * select(ext, -ext, aCorner.y < 0.5);
    } else {
        var pl = pad;
        var pr = pad;

        if (prim == 5) {
            // area columns tile exactly; only the outer sides get an AA margin
            pl = select(0.0, pad, (flags & 64) != 0);
            pr = select(0.0, pad, (flags & 128) != 0);
        }
        pos = vec2<f32>(
            select(aBounds.z + pr, aBounds.x - pl, aCorner.x < 0.5),
            select(aBounds.w + pad, aBounds.y - pad, aCorner.y < 0.5),
        );
    }

    var out: VSOut;

    out.vPos = pos;
    out.position = vec4<f32>((m * vec3<f32>(pos, 1.0)).xy, 0.0, 1.0);

    // progressive blur: 0 at the shape's start edge along the angle, 1 at its far edge
    out.vProg = 0.0;
    if ((flags & 65536) != 0) {
        let dir = vec2<f32>(cos(aFx.z), sin(aFx.z));
        let ins = 3.0 * max(aMeta.w, aFx.y) + max(aFx.x, 0.0);
        let bx = vec4<f32>(aBounds.xy + ins, aBounds.zw - ins);
        let lo = dot(bx.xy, dir) - abs(dir.x) * (bx.z - bx.x) * select(0.0, 1.0, dir.x < 0.0) - abs(dir.y) * (bx.w - bx.y) * select(0.0, 1.0, dir.y < 0.0);
        let span = max(abs(dir.x) * (bx.z - bx.x) + abs(dir.y) * (bx.w - bx.y), 1e-6);
        out.vProg = (dot(pos, dir) - lo) / span;
    }

    out.vShape0 = aShape0;
    out.vShape1 = aShape1;
    out.vShape2 = aShape2;
    out.vMeta = aMeta;
    out.vFill = aFill;
    out.vStroke = aStroke;
    out.vGrad = aGrad;
    out.vPaint = aPaint;
    out.vDash = aDash;
    out.vFx = aFx;
    out.vTint = localUniforms.uColor * globalUniforms.uWorldColorAlpha;

    return out;
}

// fragment stage inputs, copied here so the helpers can read them like the GLSL varyings
var<private> vShape0: vec4<f32>;
var<private> vShape1: vec4<f32>;
var<private> vShape2: vec4<f32>;
var<private> vMeta: vec4<f32>;
var<private> vFill: vec4<f32>;
var<private> vStroke: vec4<f32>;
var<private> vGrad: vec4<f32>;
var<private> vPaint: vec4<f32>;
var<private> vDash: vec4<f32>;
var<private> vFx: vec4<f32>;
var<private> vTint: vec4<f32>;

var<private> gPx: f32;
var<private> gSigma: f32;
var<private> gFillScale: f32;
var<private> gU: f32;
var<private> gL: f32;
var<private> gHwEff: f32;
var<private> gAlign: f32;

// GLSL mod: x - y * floor(x / y)
fn fmod(x: f32, y: f32) -> f32 {
    return x - y * floor(x / y);
}

fn erfApprox(x: f32) -> f32 {
    let s = sign(x);
    let a = abs(x);
    var t = 1.0 + (0.278393 + (0.230389 + 0.078108 * (a * a)) * a) * a;
    t *= t;
    return s - s / (t * t);
}

// Coverage of the region {sd < 0}. Box filter over one pixel, or a gaussian when blurred.
fn cover(sd: f32) -> f32 {
    if (gSigma > 0.0) {
        let s = sqrt(gSigma * gSigma + 0.1 * gPx * gPx);
        return 0.5 - 0.5 * erfApprox(sd / (s * 1.41421356));
    }
    return clamp(0.5 - sd / gPx, 0.0, 1.0);
}

fn dot2(v: vec2<f32>) -> f32 {
    return dot(v, v);
}

fn rotate(p: vec2<f32>, a: f32) -> vec2<f32> {
    let c = cos(a);
    let s = sin(a);
    return vec2<f32>(c * p.x - s * p.y, s * p.x + c * p.y);
}

// Rounded box with per-corner radii r = (br, tr, bl, tl) (y-down) and optional
// superellipse corners (n > 2) for continuous-curvature "squircle" corners.
fn sdRoundBox(p: vec2<f32>, b: vec2<f32>, r4: vec4<f32>, n: f32) -> f32 {
    let rs = select(r4.zw, r4.xy, p.x > 0.0);
    var rad = select(rs.y, rs.x, p.y > 0.0);
    rad = min(rad, min(b.x, b.y));
    let q = abs(p) - b + rad;
    let inner = min(max(q.x, q.y), 0.0);
    if (n <= 2.001 || rad <= 0.0) {
        return inner + length(max(q, vec2<f32>(0.0))) - rad;
    }
    let m = max(q, vec2<f32>(0.0)) / rad;
    let ln = pow(pow(m.x, n) + pow(m.y, n), 1.0 / n);
    var g = 1.0;
    if (ln > 1e-5) {
        g = length(pow(m / ln, vec2<f32>(n - 1.0)));
    }
    return inner + rad * (ln - 1.0) / max(g, 0.5);
}

// Ellipse distance, 3 Newton-like iterations (no trig, stable near circles).
fn sdEllipse(p: vec2<f32>, ab: vec2<f32>) -> f32 {
    let pa = abs(p);
    var t = vec2<f32>(0.70710678);
    let k = ab.x * ab.x - ab.y * ab.y;
    for (var i = 0; i < 3; i++) {
        let xy = ab * t;
        let e = vec2<f32>(k * t.x * t.x * t.x / ab.x, -k * t.y * t.y * t.y / ab.y);
        let r = xy - e;
        let q = pa - e;
        t = clamp((q * length(r) / max(length(q), 1e-9) + e) / ab, vec2<f32>(0.0), vec2<f32>(1.0));
        t /= max(length(t), 1e-9);
    }
    let d = length(pa - ab * t);
    let n = pa / ab;
    return select(-d, d, dot(n, n) > 1.0);
}

// Signed distance to an infinite wedge of half-aperture h, symmetric about +y.
fn sdWedge(q0: vec2<f32>, h: f32) -> f32 {
    let c = vec2<f32>(sin(h), cos(h));
    let q = vec2<f32>(abs(q0.x), q0.y);
    let m = length(q - c * max(dot(q, c), 0.0));
    return m * sign(c.y * q.x - c.x * q.y);
}

fn sdHeart(p0: vec2<f32>) -> f32 {
    let p = vec2<f32>(abs(p0.x), p0.y);
    if (p.y + p.x > 1.0) {
        return sqrt(dot2(p - vec2<f32>(0.25, 0.75))) - 0.35355339;
    }
    return sqrt(min(dot2(p - vec2<f32>(0.0, 1.0)), dot2(p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
}

// Star with n points (iq). en = angle of the edge; en = PI/2 gives a regular polygon.
fn sdStar(p0: vec2<f32>, r: f32, n: f32, en: f32) -> f32 {
    let an = PI / n;
    let acs = vec2<f32>(cos(an), sin(an));
    let ecs = vec2<f32>(cos(en), sin(en));
    let bn = fmod(atan2(p0.x, p0.y), 2.0 * an) - an;
    var p = length(p0) * vec2<f32>(cos(bn), abs(sin(bn)));
    p -= r * acs;
    p += ecs * clamp(-dot(p, ecs), 0.0, r * acs.y / ecs.y);
    return length(p) * sign(p.x);
}

fn sdTriangle(p: vec2<f32>, p0: vec2<f32>, p1: vec2<f32>, p2: vec2<f32>) -> f32 {
    let e0 = p1 - p0;
    let e1 = p2 - p1;
    let e2 = p0 - p2;
    let v0 = p - p0;
    let v1 = p - p1;
    let v2 = p - p2;
    let pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
    let pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
    let pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
    let s = sign(e0.x * e2.y - e0.y * e2.x);
    let d = min(min(vec2<f32>(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)),
                    vec2<f32>(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))),
                    vec2<f32>(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));
    return -sqrt(d.x) * sign(d.y);
}

// Filled path: exact distance to the nearest edge, sign from even-odd crossings.
// Edges are texels (ax, ay, bx, by) of uPolys, starting at texel 'start'.
fn sdPoly(p: vec2<f32>, start: i32, n: i32) -> f32 {
    let w = i32(textureDimensions(uPolys, 0).x);
    var dd = 1e20;
    var inside = false;
    for (var i = 0; i < n; i++) {
        let t = start + i;
        let e = textureLoad(uPolys, vec2<i32>(t % w, t / w), 0);
        let a = e.xy;
        let ab = e.zw - a;
        let ap = p - a;
        let q = ap - ab * clamp(dot(ap, ab) / max(dot(ab, ab), 1e-12), 0.0, 1.0);
        dd = min(dd, dot(q, q));
        if ((a.y <= p.y) != (e.w <= p.y) && p.x < a.x + (p.y - a.y) * ab.x / ab.y) {
            inside = !inside;
        }
    }
    return select(1.0, -1.0, inside) * sqrt(dd);
}

// Tapered capsule between circles (pa, ra) and (pb, rb) - iq's exact uneven capsule.
fn sdTaper(p0: vec2<f32>, pa: vec2<f32>, pb0: vec2<f32>, ra: f32, rb: f32) -> f32 {
    let p = p0 - pa;
    let pb = pb0 - pa;
    let h = dot(pb, pb);
    let b = ra - rb;
    if (h < 1e-10 || b * b >= h) {
        return select(length(p - pb) - rb, length(p) - ra, ra >= rb);
    }
    var q = vec2<f32>(dot(p, vec2<f32>(pb.y, -pb.x)), dot(p, pb)) / h;
    q.x = abs(q.x);
    let c = vec2<f32>(sqrt(h - b * b), b);
    let k = c.x * q.y - c.y * q.x;
    let m = dot(c, q);
    let n = dot(q, q);
    if (k < 0.0) {
        return sqrt(h * n) - ra;
    }
    if (k > c.x) {
        return sqrt(h * (n + 1.0 - 2.0 * q.y)) - rb;
    }
    return m - ra;
}

fn distSeg(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> f32 {
    let pa = p - a;
    let ba = b - a;
    let h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-12), 0.0, 1.0);
    return length(pa - ba * h);
}

// Distance of a band end: e = signed distance past the end along the path, v = distance across.
fn boxEnd(e: f32, v: f32, hw: f32) -> f32 {
    let q = vec2<f32>(e, v - hw);
    return length(max(q, vec2<f32>(0.0))) + min(max(q.x, q.y), 0.0);
}

// Stroke distance for a dashed path. u: position along the path, v: distance to the path.
fn dashSD(u: f32, v: f32, L: f32, hw: f32, cap: i32, closed: bool) -> f32 {
    let dash = vDash.x;
    let period = max(vDash.x + vDash.y, 1e-5);
    let k = floor((u + vDash.z) / period);
    var best = 1e6;
    for (var i = -1; i <= 1; i++) {
        var s0 = (k + f32(i)) * period - vDash.z;
        var s1 = s0 + dash;
        if (!closed) {
            s0 = max(s0, 0.0);
            s1 = min(s1, L);
            if (s1 < s0) {
                continue;
            }
        }
        let e = abs(u - 0.5 * (s0 + s1)) - 0.5 * (s1 - s0);
        var sd: f32;
        if (cap == 1) {
            sd = length(vec2<f32>(max(e, 0.0), v)) - hw;
        } else {
            sd = boxEnd(select(e, e - hw, cap == 2), v, hw);
        }
        best = min(best, sd);
    }
    return best;
}

// Catmull-Rom weights for the four samples around fraction f
fn crWeights(f: f32) -> vec4<f32> {
    let f2 = f * f;
    let f3 = f2 * f;
    return vec4<f32>(-0.5 * f3 + f2 - 0.5 * f, 1.5 * f3 - 2.5 * f2 + 1.0, -1.5 * f3 + 2.0 * f2 + 0.5 * f, 0.5 * f3 - 0.5 * f2);
}

// Colour mesh: a 16 x 16 premultiplied grid in one atlas row, sampled with a bicubic Catmull-Rom.
fn meshColor(p: vec2<f32>) -> vec4<f32> {
    let uv = clamp((p - vGrad.xy) / max(vGrad.zw - vGrad.xy, vec2<f32>(1e-6)), vec2<f32>(0.0), vec2<f32>(1.0)) * 15.0;
    let i0 = floor(min(uv, vec2<f32>(14.999)));
    var wx = crWeights(uv.x - i0.x);
    var wy = crWeights(uv.y - i0.y);
    let row = i32(vPaint.y + 0.5);
    var acc = vec4<f32>(0.0);
    for (var j = 0; j < 4; j++) {
        let y = i32(clamp(i0.y + f32(j - 1), 0.0, 15.0));
        var line = vec4<f32>(0.0);
        for (var i = 0; i < 4; i++) {
            let x = i32(clamp(i0.x + f32(i - 1), 0.0, 15.0));
            line += wx[i] * textureLoad(uGradients, vec2<i32>(y * 16 + x, row), 0);
        }
        acc += wy[j] * line;
    }
    let alpha = clamp(acc.a, 0.0, 1.0);
    return vec4<f32>(clamp(acc.rgb, vec3<f32>(0.0), vec3<f32>(alpha)), alpha);
}

// One ramp sample at t in 0..1: the bilinear tap textureLod makes at ((t * 255 + 0.5) / 256, row centre)
fn rampAt(t: f32, row: i32) -> vec4<f32> {
    let x = t * 255.0;
    let i0 = i32(floor(x));
    let f = x - f32(i0);
    let a = textureLoad(uGradients, vec2<i32>(i0, row), 0);
    let b = textureLoad(uGradients, vec2<i32>(min(i0 + 1, 255), row), 0);
    return mix(a, b, f);
}

fn gradientColor(p: vec2<f32>, u: f32, L: f32, kind: i32) -> vec4<f32> {
    if (kind == 5) {
        return meshColor(p);
    }
    var t: f32;
    if (kind == 1) {
        let ab = vGrad.zw - vGrad.xy;
        t = dot(p - vGrad.xy, ab) / max(dot(ab, ab), 1e-12);
    } else if (kind == 2) {
        t = (length(p - vGrad.xy) - vGrad.w) / max(vGrad.z - vGrad.w, 1e-9);
    } else if (kind == 3) {
        let q = p - vGrad.xy;
        let sw = vGrad.w;
        let asw = max(abs(sw), 1e-9);
        var rel = fmod((atan2(q.y, q.x) - vGrad.z) * select(1.0, -1.0, sw < 0.0), TAU);
        // keep the region right before the start on the start color (round caps)
        if (asw < TAU - 1e-4 && rel > 0.5 * (asw + TAU)) {
            rel -= TAU;
        }
        t = rel / asw;
    } else {
        t = u / max(L, 1e-9);
    }
    let ext = i32(vPaint.z + 0.5);
    if (ext == 1) {
        t = fract(t);
    } else if (ext == 2) {
        t = 1.0 - abs(fmod(t, 2.0) - 1.0);
    }
    t = clamp(t, 0.0, 1.0);
    return rampAt(t, i32(vPaint.y + 0.5));
}

// Signed distance of a closed shape (rect, ellipse, sector, heart, star, triangle, path) at p.
// Sets gFillScale, and gU / gL (position and length along the outline, for dashes and path gradients).
fn closedSD(p: vec2<f32>, prim: i32, px: f32) -> f32 {
    var d = 1e6;
    var fillScale = 1.0;
    var u = 0.0;
    var L = 1.0;
    let hwEff = gHwEff;
    let align = gAlign;

    if (prim == 0) {
        let b = vShape0.zw;
        let bi = max(b, vec2<f32>(0.5 * px));
        fillScale = (b.x / bi.x) * (b.y / bi.y);
        var q = p - vShape0.xy;
        if (vShape2.w != 0.0) {
            q = rotate(q, -vShape2.w);
        }
        d = sdRoundBox(q, bi, vShape1, vShape2.x);
    } else if (prim == 1) {
        let ab = vShape0.zw;
        let abi = max(ab, vec2<f32>(0.5 * px));
        fillScale = (ab.x / abi.x) * (ab.y / abi.y);
        var q = p - vShape0.xy;
        if (vShape2.w != 0.0) {
            q = rotate(q, -vShape2.w);
        }
        if (abs(abi.x - abi.y) <= 1e-4 * max(abi.x, abi.y)) {
            d = length(q) - abi.x;
        } else {
            d = sdEllipse(q, abi);
        }
        let rm = 0.5 * (abi.x + abi.y) + align * hwEff;
        u = fmod(atan2(q.y, q.x) + 0.5 * PI, TAU) * rm;
        L = TAU * rm;
    } else if (prim == 3) {
        let q = p - vShape0.xy;
        let sweep = vShape1.x;
        let h = min(abs(sweep) * 0.5, PI);
        let mid = vShape0.w + 0.5 * sweep;
        let cm = cos(mid);
        let sm = sin(mid);
        let qr = vec2<f32>(sm * q.x - cm * q.y, cm * q.x + sm * q.y); // arc middle -> +y
        let len = length(q);
        let full = h >= PI - 1e-4;
        // annular sector with rounded corners
        let r1 = vShape0.z;
        let r0 = vShape1.y;
        let rc = vShape1.z;
        var dA = len - (r1 - rc);
        if (r0 > 0.0) {
            dA = max(dA, (r0 + rc) - len);
        }
        var dW = -1e6;
        if (!full) {
            dW = sdWedge(qr, h) + rc;
        }
        let w = vec2<f32>(dA, dW);
        d = length(max(w, vec2<f32>(0.0))) + min(max(w.x, w.y), 0.0) - rc;
    } else if (prim == 6) {
        let s = vShape0.z;
        var q = p - vShape0.xy;
        if (vShape2.w != 0.0) {
            q = rotate(q, -vShape2.w);
        }
        q /= s;
        d = (sdHeart(vec2<f32>(q.x, 0.552 - q.y)) - vShape0.w) * s;
    } else if (prim == 7) {
        var q = rotate(p - vShape0.xy, -vShape0.w);
        q.y = -q.y;
        let rc = vShape1.z;
        d = sdStar(q, vShape0.z - rc, vShape1.x, vShape1.y) - rc;
    } else if (prim == 8) {
        d = sdTriangle(p, vShape0.xy, vShape0.zw, vShape1.xy) - vShape1.z;
    } else if (prim == 9) {
        d = sdPoly(p, i32(vShape0.x + 0.5), i32(vShape0.y + 0.5)) - vShape0.z;
    }

    gFillScale = fillScale;
    gU = u;
    gL = L;
    return d;
}

fn ign(p: vec2<f32>) -> f32 {
    return fract(52.9829189 * fract(dot(p, vec2<f32>(0.06711056, 0.00583715))));
}

@fragment
fn mainFragment(input: VSOut) -> @location(0) vec4<f32> {
    // derivatives first: WGSL only allows them in uniform control flow
    let p = input.vPos;
    let ddx = dpdx(p);
    let ddy = dpdy(p);
    let px = max(sqrt(abs(ddx.x * ddy.y - ddx.y * ddy.x)), 1e-7); // local units per device pixel

    vShape0 = input.vShape0;
    vShape1 = input.vShape1;
    vShape2 = input.vShape2;
    vMeta = input.vMeta;
    vFill = input.vFill;
    vStroke = input.vStroke;
    vGrad = input.vGrad;
    vPaint = input.vPaint;
    vDash = input.vDash;
    vFx = input.vFx;
    vTint = input.vTint;

    // x: dither amplitude (LSB), y: AA ramp width (device px), z: min stroke width (device px)
    let uSilk = silkUniforms.uSilk;

    gPx = px * uSilk.y;
    gSigma = vMeta.w;

    let prim = i32(vMeta.x + 0.5);
    let flags = i32(vMeta.y + 0.5);
    let inner = (flags & 32768) != 0;
    if ((flags & 65536) != 0) {
        gSigma = mix(vMeta.w, vFx.y, clamp(input.vProg, 0.0, 1.0));
    }
    let hasFill = (flags & 1) != 0;
    let hasStroke = (flags & 2) != 0 && vMeta.z > 0.0;
    let dashed = (flags & 8) != 0;
    let cap0 = (flags >> 8u) & 3;
    let cap1 = (flags >> 10u) & 3;

    // hairlines: never thinner than uSilk.z device px; fade instead (energy conserving)
    let hw = 0.5 * vMeta.z;
    let hwEff = max(hw, 0.5 * px * uSilk.z);
    var strokeScale = hw / max(hwEff, 1e-9);
    let align = vDash.w;

    var d = 1e6;   // closed shapes: signed distance to the fill boundary
    var sd = 1e6;  // open paths: signed distance to the stroke
    var isOpen = false;
    var u = 0.0;
    var L = 1.0;
    var fillScale = 1.0;
    var areaCov = 0.0;

    gHwEff = hwEff;
    gAlign = align;
    if (prim == 2) {
        let q = p - vShape0.xy;
        let sweep = vShape1.x;
        let h = min(abs(sweep) * 0.5, PI);
        let mid = vShape0.w + 0.5 * sweep;
        let cm = cos(mid);
        let sm = sin(mid);
        let qr = vec2<f32>(sm * q.x - cm * q.y, cm * q.x + sm * q.y); // arc middle -> +y
        let len = length(q);
        let full = h >= PI - 1e-4;

        isOpen = true;
        let r = vShape0.z;
        u = (h - select(1.0, -1.0, sweep < 0.0) * atan2(qr.x, qr.y)) * r;
        L = 2.0 * h * r;
        let v = abs(len - r);
        if (dashed) {
            sd = dashSD(u, v, L, hwEff, cap0, full);
        } else if (full) {
            sd = v - hwEff;
        } else if (cap0 == 1) {
            let sc = vec2<f32>(sin(h), cos(h));
            let qa = vec2<f32>(abs(qr.x), qr.y);
            sd = select(v, length(qa - sc * r), sc.y * qa.x > sc.x * qa.y) - hwEff;
        } else {
            let e = sdWedge(qr, h);
            sd = boxEnd(select(e, e - hwEff, cap0 == 2), v, hwEff);
        }
    } else if (prim == 4) {
        isOpen = true;
        let a = vShape0.xy;
        let b = vShape0.zw;
        // per-end radii (tapered strokes); hairlines keep at least uSilk.z device px
        let mn = 0.5 * px * uSilk.z;
        let ra = max(vShape2.z, mn);
        let rb = max(vShape2.w, mn);
        let dSelf = sdTaper(p, a, b, ra, rb);
        // Ownership: every pixel is shaded once, by the segment whose stroke is nearest,
        // so translucent polylines have no double-blended joints. The bias breaks ties.
        let bias = 1e-3 * px;
        if ((flags & 16) != 0 && sdTaper(p, vShape1.xy, a, max(vDash.w, mn), ra) - dSelf < bias) {
            discard;
        }
        if ((flags & 32) != 0 && dSelf - sdTaper(p, b, vShape1.zw, rb, max(vPaint.w, mn)) >= bias) {
            discard;
        }

        let ab = b - a;
        let ls = length(ab);
        var dir = vec2<f32>(1.0, 0.0);
        if (ls > 1e-9) {
            dir = ab / ls;
        }
        let us = dot(p - a, dir);
        let hr = mix(vShape2.z, vShape2.w, clamp(us / max(ls, 1e-9), 0.0, 1.0));
        let hrEff = max(hr, mn);

        strokeScale = hr / max(hrEff, 1e-9);
        u = vShape2.x + us;
        L = vShape2.y;
        if (dashed) {
            sd = dashSD(u, distSeg(p, a, b), L, hrEff, cap0, (flags & 8192) != 0);
        } else {
            // path ends get their caps; interior ends are round joins
            let nearStart = us < 0.5 * ls;
            let v = abs(dir.x * (p.y - a.y) - dir.y * (p.x - a.x));
            if (nearStart && (flags & 16) == 0 && cap0 != 1) {
                sd = boxEnd(-us - select(0.0, ra, cap0 == 2), v, ra);
            } else if (!nearStart && (flags & 32) == 0 && cap1 != 1) {
                sd = boxEnd(us - ls - select(0.0, rb, cap1 == 2), v, rb);
            } else {
                sd = dSelf;
            }
        }
    } else if (prim == 5) {
        let a = vShape0.xy;
        let b = vShape0.zw;
        let c = vShape1.xy;
        let e = vShape1.zw;
        let t1 = (b - a) / max(length(b - a), 1e-9);
        let t2 = (e - c) / max(length(e - c), 1e-9);
        areaCov = cover(dot(p - a, vec2<f32>(t1.y, -t1.x))) * cover(dot(p - c, vec2<f32>(-t2.y, t2.x)));
        if ((flags & 64) != 0) {
            areaCov *= cover(a.x - p.x);
        }
        if ((flags & 128) != 0) {
            areaCov *= cover(p.x - b.x);
        }
    } else {
        d = closedSD(p, prim, px);
        fillScale = gFillScale;
        u = gU;
        L = gL;
    }

    // spread grows (or shrinks) the shape before it is blurred, like a Figma shadow spread
    if (!inner) {
        d -= vFx.x;
        sd -= vFx.x;
    }

    // paints
    var fillCol = select(vec4<f32>(0.0), vFill, hasFill);
    var strokeCol = vStroke;
    let gk = i32(vPaint.x + 0.5);
    if (gk > 0) {
        let g = gradientColor(p, u, L, gk);
        if ((flags & 4096) != 0) {
            strokeCol *= g;
        } else {
            fillCol *= g;
        }
    }

    var col: vec4<f32>;
    if (inner) {
        // inner shadow: the shape, minus a copy moved by the offset and shrunk by the spread, blurred
        let blur = gSigma;
        gSigma = 0.0;
        let mask = cover(d) * fillScale;
        gSigma = blur;
        let lit = cover(closedSD(p - vStroke.xy, prim, px) + vFx.x);
        col = vFill * (mask * (1.0 - lit));
    } else if (prim == 5) {
        col = fillCol * areaCov;
    } else if (isOpen) {
        col = strokeCol * (cover(sd) * strokeScale);
    } else if (hasStroke) {
        let off = align * hwEff;
        if (dashed) {
            let cS = cover(dashSD(u, abs(d - off), L, hwEff, cap0, true)) * strokeScale;
            col = strokeCol * cS + fillCol * (cover(d) * fillScale * (1.0 - strokeCol.a * cS));
        } else {
            // exact partition: stroke band, fill outside the band, fill under the band
            let cLo = cover(d - (off - hwEff));
            let cHi = cover(d - (off + hwEff));
            let cS = max(cHi - cLo, 0.0) * strokeScale;
            let under = max(cover(d) - cLo, 0.0);
            col = strokeCol * cS + fillCol * ((cLo + under * (1.0 - strokeCol.a * strokeScale)) * fillScale);
        }
    } else {
        col = fillCol * (cover(d) * fillScale);
    }

    col *= vTint;
    if (col.a <= 0.0 && max(col.r, max(col.g, col.b)) <= 0.0) {
        discard;
    }

    if ((flags & 4) != 0) {
        // +-0.5 LSB dither: kills 8-bit banding in gradients and blurs
        let n = ign(input.position.xy) - 0.5;
        col = vec4<f32>(clamp(col.rgb + n * (uSilk.x / 255.0), vec3<f32>(0.0), vec3<f32>(col.a)), col.a);
    }
    // plus lighter: premultiplied colour with zero alpha adds to the framebuffer
    if ((flags & 16384) != 0) {
        col.a = 0.0;
    }
    return col;
}
`;

let program: GpuProgram | null = null;

/** @internal Builds (once) the WebGPU program of the uber shader. */
export function createSilkGpuProgram(): GpuProgram {
    if (program) return program;
    program = GpuProgram.from({
        name: 'silk-sdf',
        vertex: { source: wgsl, entryPoint: 'mainVertex' },
        fragment: { source: wgsl, entryPoint: 'mainFragment' },
    });
    // Pixi lays every texture out as filterable float. The path texture is RGBA32F, which WebGPU
    // only filters with an optional feature, so bind group creation would fail. Both textures are
    // read with textureLoad only, so they are declared unfilterable.
    for (const entry of program.gpuLayout[2] ?? []) {
        if (entry.texture) entry.texture.sampleType = 'unfilterable-float';
    }

    return program;
}
