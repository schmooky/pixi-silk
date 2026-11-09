import { GpuProgram } from 'pixi.js';

/*
 * WGSL port of the uber program in shader.ts, for Pixi's WebGPU renderer. It is a line-by-line
 * translation: same signed distances, same coverage, same paints. Keep the two in step.
 *
 * Bindings (Pixi's mesh layout):
 *   group 0  globalUniforms  (set by the renderer)
 *   group 1  localUniforms   (set by the mesh pipe)
 *   group 2  silkUniforms, uGradients, uPolys, uBatch (the SilkGraphics' own resources)
 *
 * Differences from GLSL that are forced by WGSL:
 *   - GLSL `mod` floors, WGSL `%` truncates: `fmod` below is the GLSL one.
 *   - helpers cannot read stage inputs, so the fragment entry copies them to private globals.
 *   - derivatives need uniform control flow, so dpdx / dpdy run first, before any branch.
 *   - the framebuffer y axis points down (gl_FragCoord's points up): dither and the local
 *     position rebuilt from @builtin(position) account for it.
 *   - batched draws read the object table (uBatch) with textureLoad, as the GLSL program does
 *     with texelFetch. Unbatched draws bind a 1x1 table and have aFx.w 0.
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
// batched draws: 3 texels per object (a, b, c, d), (tx, ty, path texel base, 0), premultiplied tint
@group(2) @binding(3) var uBatch: texture_2d<f32>;

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
    @location(12) @interpolate(flat) vBase: f32,
    @location(13) @interpolate(flat) vInv: vec4<f32>, // inverse of the local -> clip map: 2x2 part
    @location(14) @interpolate(flat) vInvT: vec2<f32>, // and its translation
    @location(15) vProg: f32,
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
    var obj = localUniforms.uTransformMatrix;
    var tint = localUniforms.uColor;
    var base = 0.0;
    let idx = i32(aFx.w + 0.5) - 1;
    if (idx >= 0) {
        let bw = i32(textureDimensions(uBatch, 0).x);
        let t = idx * 3;
        let r0 = textureLoad(uBatch, vec2<i32>(t % bw, t / bw), 0);
        let r1 = textureLoad(uBatch, vec2<i32>((t + 1) % bw, (t + 1) / bw), 0);
        tint = textureLoad(uBatch, vec2<i32>((t + 2) % bw, (t + 2) / bw), 0);
        obj = mat3x3<f32>(r0.x, r0.y, 0.0, r0.z, r0.w, 0.0, r1.x, r1.y, 1.0);
        base = r1.z;
    }
    let m = globalUniforms.uProjectionMatrix * globalUniforms.uWorldTransformMatrix * obj;
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
    var pad = (0.5 * uSilk.y + 1.0) * lpx;

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
        // stroked paths: hairlines are drawn wider than their bounds say
        if (prim == 10) {
            pad += 0.5 * lpx * uSilk.z;
        }
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
    out.vBase = base;
    // Every instance of an object computes the same inverse, so the local position rebuilt from
    // @builtin(position) is bit-identical across instances (an interpolated vPos is not).
    let idet = 1.0 / (m[0].x * m[1].y - m[1].x * m[0].y);
    let ai = mat2x2<f32>(m[1].y, -m[0].y, -m[1].x, m[0].x) * idet;
    out.vInv = vec4<f32>(ai[0], ai[1]);
    out.vInvT = -(ai * m[2].xy);
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
    out.vTint = tint * globalUniforms.uWorldColorAlpha;

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
var<private> gBase: i32; // first path texel of this object in uPolys (non-zero in batched draws)
// width of uPolys, read once in fs_main rather than for every texel, as in the GLSL twin
var<private> gPolysW: i32;

fn polyTexel(i0: i32) -> vec4<f32> {
    let i = i0 + gBase;
    return textureLoad(uPolys, vec2<i32>(i % gPolysW, i / gPolysW), 0);
}

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
    var dd = 1e20;
    var inside = false;
    for (var i = 0; i < n; i++) {
        let e = polyTexel(start + i);
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

// Signed distance to a simple polygon of up to 6 points (any winding).
fn sdPolygon6(p: vec2<f32>, v0: array<vec2<f32>, 6>, n: i32) -> f32 {
    var v = v0;
    var d = dot(p - v[0], p - v[0]);
    var s = 1.0;
    for (var i = 0; i < 6; i++) {
        if (i >= n) {
            break;
        }
        let j = select(i - 1, n - 1, i == 0);
        let e = v[j] - v[i];
        let w = p - v[i];
        let b = w - e * clamp(dot(w, e) / max(dot(e, e), 1e-12), 0.0, 1.0);
        d = min(d, dot(b, b));
        let c = vec3<bool>(p.y >= v[i].y, (p.y < v[j].y), (e.x * w.y > e.y * w.x));
        if (all(c) || !any(c)) {
            s = -s;
        }
    }
    return s * sqrt(d);
}

// One straight stroke piece in its own frame (q.x along, q.y across) covering [s0, s1].
// End kinds: 0 butt, 1 round, 2 square, and at the start 3: the round join of an inner vertex.
// That disc is cut to the stroke: at most 'back' before s0 and no further than the piece's end.
// Only the piece after a vertex owns its disc, so two chunks never see the same shape twice.
fn pieceSD(q: vec2<f32>, s0: f32, s1: f32, k0: i32, k1: i32, hw: f32, back: f32) -> f32 {
    let lo = s0 - select(0.0, hw, k0 == 2);
    let hi = s1 + select(0.0, hw, k1 == 2);
    let b = vec2<f32>(abs(q.x - 0.5 * (lo + hi)) - 0.5 * (hi - lo), abs(q.y) - hw);
    var d = length(max(b, vec2<f32>(0.0))) + min(max(b.x, b.y), 0.0);
    let disc = length(vec2<f32>(q.x - s0, q.y)) - hw;
    if (k0 == 1) {
        d = min(d, disc);
    }
    if (k0 == 3) {
        d = min(d, max(disc, max(s0 - back - q.x, q.x - hi)));
    }
    if (k1 == 1) {
        d = min(d, length(vec2<f32>(q.x - s1, q.y)) - hw);
    }
    return d;
}

// How two pieces meet at a vertex: 0 butt ends only (the path folds back), 1 round ends (round
// joins, and miters or bevels that differ from round by under a tenth of a pixel), 2 miter, 3 bevel.
fn joinKind(d0: vec2<f32>, d1: vec2<f32>, hw: f32, join: i32, limit: f32, px: f32) -> i32 {
    if (join == 0) {
        return 1;
    }
    let ch = sqrt(max(0.5 * (1.0 + dot(d0, d1)), 0.0)); // cos of half the turn
    if (ch < 1e-4) {
        return 0;
    }
    let miter = join == 1 && 1.0 / ch <= limit;
    let diff = select(hw * (1.0 - ch), hw * (1.0 / ch - 1.0), miter);
    if (diff < 0.1 * px) {
        return 1;
    }
    return select(3, 2, miter);
}

// Miter (kind 2) or bevel (kind 3) at v between directions d0 and d1. The polygon also reaches e
// back along both butt pieces, so it overlaps them and no seam shows where they meet. Its inner
// side runs through the inner corners of the two butt ends, which keeps it inside the stroke.
fn joinSD(p: vec2<f32>, v: vec2<f32>, d0: vec2<f32>, d1: vec2<f32>, hw: f32, e0: f32, kind: i32) -> f32 {
    let cr = d0.x * d1.y - d0.y * d1.x;
    let sg = select(1.0, -1.0, cr > 0.0);
    let n0 = sg * vec2<f32>(-d0.y, d0.x);
    let n1 = sg * vec2<f32>(-d1.y, d1.x);
    let m = normalize(n0 + n1);
    let ch = dot(n0, m);
    let th = dot(d0, m) / max(ch, 1e-6); // tan of half the turn
    let e = min(e0, hw / max(th, 1e-6));
    let inner = e * th - hw;
    var P: array<vec2<f32>, 6>;
    P[0] = v - d0 * e + n0 * hw;
    var k = 1;
    if (kind == 2) {
        P[1] = v + m * (hw / ch);
        k = 2;
    } else {
        P[1] = v + n0 * hw;
        P[2] = v + n1 * hw;
        k = 3;
    }
    P[k] = v + d1 * e + n1 * hw;
    P[k + 1] = v + d1 * e + n1 * inner;
    P[k + 2] = v - d0 * e + n0 * inner;
    return sdPolygon6(p, P, k + 3);
}

// Segment i of a subpath with n segments starting at texel 'first'. ok = false past an open end.
fn segFetch(first: i32, n: i32, closed: bool, i0: i32, ok: ptr<function, bool>) -> vec4<f32> {
    *ok = true;
    var i = i0;
    if (i < 0 || i >= n) {
        if (!closed) {
            *ok = false;
            return vec4<f32>(0.0);
        }
        i = (i % n + n) % n;
    }
    return polyTexel(first + i);
}

fn segDir(e: vec4<f32>) -> vec2<f32> {
    let ab = e.zw - e.xy;
    let len = length(ab);
    if (len > 1e-9) {
        return ab / len;
    }
    return vec2<f32>(1.0, 0.0);
}

// Component i (0 to 3) of v.
fn comp(v: vec4<f32>, i: i32) -> f32 {
    return dot(v, select(vec4<f32>(0.0), vec4<f32>(1.0), vec4<i32>(i) == vec4<i32>(0, 1, 2, 3)));
}

// Stroke of a path (Prim 10): butt pieces, caps at open ends, a join at every inner vertex.
// Segments come in windows: texels (header texel, first segment, count, owner key). The instance
// owns its first windows and also evaluates the windows of other instances of the path that come
// near its own. A pixel is shaded by the instance with the nearest segment, the lower key winning a
// tie, so it is shaded once even where a long path crosses itself. Every instance computes a
// segment's distance from the same texels in the same loop, so they agree.
fn pathSD(p: vec2<f32>, hw: f32, cap0: i32, cap1: i32, dashed: bool, px: f32) -> f32 {
    let win = i32(vShape0.x + 0.5);
    let nOwn = i32(vShape0.y + 0.5);
    let nAll = nOwn + i32(vShape0.z + 0.5);
    let key = vShape0.w;
    let join = i32(vShape1.x + 0.5);
    let limit = vShape1.y;
    var own = 1e20;
    // distances closer than this count as a tie, which the key settles the same way everywhere
    let tol = 1e-3 * px;
    var taken = false;
    gU = 0.0;
    gL = 1.0;
    for (var w = 0; w < nAll; w++) {
        let wt = polyTexel(win + w);
        let hdr = i32(wt.x + 0.5);
        let s = i32(wt.y + 0.5);
        let cnt = i32(wt.z + 0.5);
        let h = polyTexel(hdr);
        let n = i32(h.x + 0.5);
        let closed = h.y > 0.5;
        let L = h.z;
        // closed outlines stretch the dash pattern so it tiles: the factor is in the header
        let dash = vDash.x * h.w;
        let period = max((vDash.x + vDash.y) * h.w, 1e-5);
        let first = hdr + 1;
        let cumAt = first + n;
        var hp: bool;
        var hn: bool;
        var ep = segFetch(first, n, closed, s - 1, &hp);
        var ec = polyTexel(first + s);
        var wmin = 1e20;
        for (var k = s; k < s + cnt; k++) {
            let en = segFetch(first, n, closed, k + 1, &hn);
            let c = comp(polyTexel(cumAt + k / 4), k % 4);
            let sa = ec.xy;
            let len = length(ec.zw - sa);
            let dir = segDir(ec);
            let dp = segDir(ep);
            var js = -1;
            if (hp) {
                js = joinKind(dp, dir, hw, join, limit, px);
            }
            var je = -1;
            if (hn) {
                je = joinKind(dir, segDir(en), hw, join, limit, px);
            }
            let ks = select(select(0, 3, js == 1), cap0, js < 0);
            let ke = select(0, cap1, je < 0);
            // how far the stroke (or a dash, through its start cap) reaches back before this segment
            let capBack = select(0.0, hw, cap0 != 0);
            let back = select(c + capBack, 1e20, closed);
            let ej = min(hw, min(len, length(ep.zw - ep.xy)));
            let q = vec2<f32>(dot(p - sa, dir), dir.x * (p.y - sa.y) - dir.y * (p.x - sa.x));
            var d = 1e20;
            if (!dashed) {
                d = pieceSD(q, 0.0, len, ks, ke, hw, back);
                if (js >= 2) {
                    d = min(d, joinSD(p, sa, dp, dir, hw, ej, js));
                }
            } else {
                let kk = floor((c + clamp(q.x, 0.0, len) + vDash.z) / period);
                for (var j = -1; j <= 1; j++) {
                    let t0 = (kk + f32(j)) * period - vDash.z;
                    let t1 = t0 + dash;
                    let lo = max(t0, c);
                    let hi = min(t1, c + len);
                    if (hi < lo || (hi == lo && dash > 0.0)) {
                        continue;
                    }
                    // a dash cut by a vertex goes on along the next segment: the vertex decides that end
                    d = min(d, pieceSD(q, lo - c, hi - c, select(cap0, ks, t0 < c), select(cap1, ke, t1 > c + len), hw, min(back, c - t0 + capBack)));
                }
                // a dash that runs through the vertex (not one that starts or ends on it) gets the join
                let ph = fmod(c + vDash.z, period);
                let inDash = min(ph, dash - ph);
                if (js >= 2 && inDash > 1e-4 * period) {
                    d = min(d, joinSD(p, sa, dp, dir, hw, min(ej, inDash), js));
                }
            }
            if (w < nOwn && d < own) {
                own = d;
                gU = c + clamp(q.x, 0.0, len);
                gL = L;
            }
            wmin = min(wmin, d);
            ep = ec;
            hp = true;
            ec = en;
        }
        // own windows come first, so own is final here: a nearer segment of another instance takes the pixel.
        // The discard waits until after the loop, as in the GLSL twin (FXC fails on it inside the loop).
        if (w >= nOwn && (wmin < own - tol || (wmin <= own + tol && wt.w < key))) {
            taken = true;
            break;
        }
    }
    if (taken) {
        discard;
    }
    return own;
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

// Signed distance of a closed shape (rect, ellipse, sector, heart, star, triangle, path fill) at p,
// with its parameters in s0, s1, s2. Sets gFillScale, and gU / gL (position and length along the
// outline, for dashes and path gradients).
fn shapeSD(p: vec2<f32>, prim: i32, s0: vec4<f32>, s1: vec4<f32>, s2: vec4<f32>, px: f32) -> f32 {
    var d = 1e6;
    var fillScale = 1.0;
    var u = 0.0;
    var L = 1.0;
    let hwEff = gHwEff;
    let align = gAlign;

    if (prim == 0) {
        let b = s0.zw;
        let bi = max(b, vec2<f32>(0.5 * px));
        fillScale = (b.x / bi.x) * (b.y / bi.y);
        var q = p - s0.xy;
        if (s2.w != 0.0) {
            q = rotate(q, -s2.w);
        }
        d = sdRoundBox(q, bi, s1, s2.x);
    } else if (prim == 1) {
        let ab = s0.zw;
        let abi = max(ab, vec2<f32>(0.5 * px));
        fillScale = (ab.x / abi.x) * (ab.y / abi.y);
        var q = p - s0.xy;
        if (s2.w != 0.0) {
            q = rotate(q, -s2.w);
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
        let q = p - s0.xy;
        let sweep = s1.x;
        let h = min(abs(sweep) * 0.5, PI);
        let mid = s0.w + 0.5 * sweep;
        let cm = cos(mid);
        let sm = sin(mid);
        let qr = vec2<f32>(sm * q.x - cm * q.y, cm * q.x + sm * q.y); // arc middle -> +y
        let len = length(q);
        let full = h >= PI - 1e-4;
        // annular sector with rounded corners
        let r1 = s0.z;
        let r0 = s1.y;
        let rc = s1.z;
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
        let s = s0.z;
        var q = p - s0.xy;
        if (s2.w != 0.0) {
            q = rotate(q, -s2.w);
        }
        q /= s;
        d = (sdHeart(vec2<f32>(q.x, 0.552 - q.y)) - s0.w) * s;
    } else if (prim == 7) {
        var q = rotate(p - s0.xy, -s0.w);
        q.y = -q.y;
        let rc = s1.z;
        d = sdStar(q, s0.z - rc, s1.x, s1.y) - rc;
    } else if (prim == 8) {
        d = sdTriangle(p, s0.xy, s0.zw, s1.xy) - s1.z;
    } else if (prim == 9) {
        d = sdPoly(p, i32(s0.x + 0.5), i32(s0.y + 0.5)) - s0.z;
    }

    gFillScale = fillScale;
    gU = u;
    gL = L;
    return d;
}

// Two operands combined: 0 union, 1 subtract (a minus b), 2 intersect, 3 exclude. Exact on the
// outline. Inside, max and min of distances are a bound, not the exact distance.
fn combineSD(a: f32, b: f32, op: i32) -> f32 {
    if (op == 1) {
        return max(a, -b);
    }
    if (op == 2) {
        return max(a, b);
    }
    if (op == 3) {
        return max(min(a, b), -max(a, b));
    }
    return min(a, b);
}

// Closed shape of this instance. A union (Prim 11) is several shapes combined into one: records of
// 4 texels, (type, op, 0, 0) then s0, s1, s2, in uPolys, folded on a small stack. Op 4 pushes the
// shape as a new operand and ops 0 to 3 fold it into the top one. Type 255 folds the top operand
// into the one below it with its op. One shape, painted once.
fn closedSD(p: vec2<f32>, prim: i32, px: f32) -> f32 {
    if (prim == 11) {
        let start = i32(vShape0.x + 0.5);
        let n = i32(vShape0.y + 0.5);
        var st: array<f32, 8>;
        var sp = 0;
        st[0] = 1e6;
        for (var i = 0; i < n; i++) {
            let t = start + i * 4;
            let h = polyTexel(t);
            let rt = i32(h.x + 0.5);
            let op = i32(h.y + 0.5);
            if (rt == 255) {
                sp = max(sp - 1, 1);
                st[sp - 1] = combineSD(st[sp - 1], st[sp], op);
            } else {
                let d = shapeSD(p, rt, polyTexel(t + 1), polyTexel(t + 2), polyTexel(t + 3), px);
                if (op == 4) {
                    st[min(sp, 7)] = d;
                    sp = min(sp + 1, 8);
                } else {
                    st[max(sp - 1, 0)] = combineSD(st[max(sp - 1, 0)], d, op);
                }
            }
        }
        gFillScale = 1.0;
        gU = 0.0;
        gL = 1.0;
        return st[0];
    }
    return shapeSD(p, prim, vShape0, vShape1, vShape2, px);
}

fn ign(p: vec2<f32>) -> f32 {
    return fract(52.9829189 * fract(dot(p, vec2<f32>(0.06711056, 0.00583715))));
}

@fragment
fn mainFragment(input: VSOut) -> @location(0) vec4<f32> {
    // derivatives first: WGSL only allows them in uniform control flow
    var p = input.vPos;
    let ddx = dpdx(input.vPos);
    let ddy = dpdy(input.vPos);
    var px = max(sqrt(abs(ddx.x * ddy.y - ddx.y * ddy.x)), 1e-7); // local units per device pixel

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
    gBase = i32(input.vBase + 0.5);
    gPolysW = i32(textureDimensions(uPolys, 0).x);

    let prim = i32(vMeta.x + 0.5);
    if (prim == 10) {
        // chunks of one path decide who shades a pixel by comparing distances: they must all see
        // exactly the same position (kept only when it matches vPos, in case of an odd viewport).
        // Clip space from the framebuffer position, whose y goes down.
        let hres = 0.5 * abs(globalUniforms.uResolution);
        let fc = input.position.xy;
        let clip = vec2<f32>(fc.x / hres.x - 1.0, 1.0 - fc.y / hres.y);
        let vInv = input.vInv;
        let q = mat2x2<f32>(vInv.xy, vInv.zw) * clip + input.vInvT;
        if (length(q - p) < 0.25 * px) {
            p = q;
            // the pixel size too: joins switch to round below a tenth of a pixel
            px = max(sqrt(abs(vInv.x * vInv.w - vInv.y * vInv.z) / (hres.x * hres.y)), 1e-7);
            gPx = px * uSilk.y;
        }
    }
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
    } else if (prim == 10) {
        isOpen = true;
        sd = pathSD(p, hwEff, cap0, cap1, dashed, px);
        u = gU;
        L = gL;
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
