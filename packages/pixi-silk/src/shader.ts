import { BufferImageSource, GlProgram, Shader, type TextureSource, UniformGroup } from 'pixi.js';
import { GradientAtlas } from './atlas';
import { silkGpu } from './shader-slot';

/*
 * One uber-program draws every primitive. Each instance is a quad; the fragment
 * shader evaluates the primitive's signed distance d (local units) and turns it into
 * coverage with a 1-device-pixel box filter:  coverage = clamp(0.5 - d / px, 0, 1),
 * where px = local units per device pixel from the screen-space derivatives of the
 * local position. The same holds at any zoom, rotation, resolution or render target, with no
 * MSAA and no tessellation. shader-wgsl.ts is the WebGPU twin of this program.
 */

/** @internal Vertex stage of the uber program (GLSL ES 3.00). */
export const vertex = /* glsl */ `#version 300 es
in vec2 aCorner;
in vec4 aBounds;
in vec4 aShape0;
in vec4 aShape1;
in vec4 aShape2;
in vec4 aMeta;
in vec4 aFill;
in vec4 aStroke;
in vec4 aGrad;
in vec4 aPaint;
in vec4 aDash;
in vec4 aFx;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform vec4 uWorldColorAlpha;
uniform vec2 uResolution;
uniform mat3 uTransformMatrix;
uniform vec4 uColor;
uniform vec4 uSilk;
// batched draws: 3 texels per object (a, b, c, d), (tx, ty, path texel base, 0), premultiplied tint
uniform highp sampler2D uBatch;

out vec2 vPos;
flat out vec4 vShape0;
flat out vec4 vShape1;
flat out vec4 vShape2;
flat out vec4 vMeta;
flat out vec4 vFill;
flat out vec4 vStroke;
flat out vec4 vGrad;
flat out vec4 vPaint;
flat out vec4 vDash;
flat out vec4 vFx;
flat out vec4 vTint;
flat out float vBase;
flat out vec4 vInv; // inverse of the local -> clip map: 2x2 part
flat out vec2 vInvT; // and its translation
out float vProg;

void main(void)
{
    mat3 obj = uTransformMatrix;
    vec4 tint = uColor;
    vBase = 0.0;
    int idx = int(aFx.w + 0.5) - 1;
    if (idx >= 0)
    {
        int bw = textureSize(uBatch, 0).x;
        int t = idx * 3;
        vec4 r0 = texelFetch(uBatch, ivec2(t % bw, t / bw), 0);
        vec4 r1 = texelFetch(uBatch, ivec2((t + 1) % bw, (t + 1) / bw), 0);
        tint = texelFetch(uBatch, ivec2((t + 2) % bw, (t + 2) / bw), 0);
        obj = mat3(r0.x, r0.y, 0.0, r0.z, r0.w, 0.0, r1.x, r1.y, 1.0);
        vBase = r1.z;
    }
    mat3 m = uProjectionMatrix * uWorldTransformMatrix * obj;

    // Jacobian local -> device pixels; its smallest singular value tells how many
    // local units one device pixel spans in the worst direction.
    vec2 hr = 0.5 * abs(uResolution);
    vec2 jx = m[0].xy * hr;
    vec2 jy = m[1].xy * hr;
    float a2 = dot(jx, jx) + dot(jy, jy);
    float det = abs(jx.x * jy.y - jx.y * jy.x);
    float smin = sqrt(max(0.5 * (a2 - sqrt(max(a2 * a2 - 4.0 * det * det, 0.0))), 1e-12));
    float lpx = 1.0 / smin;
    float pad = (0.5 * uSilk.y + 1.0) * lpx;

    int type = int(aMeta.x + 0.5);
    int flags = int(aMeta.y + 0.5);
    vec2 pos;

    if (type == 4)
    {
        // polyline segment: oriented quad hugging the capsule
        vec2 a = aShape0.xy;
        vec2 b = aShape0.zw;
        vec2 ab = b - a;
        float len = length(ab);
        vec2 dir = len > 1e-9 ? ab / len : vec2(1.0, 0.0);
        vec2 nrm = vec2(-dir.y, dir.x);
        float ext = max(max(aShape2.z, aShape2.w), 0.5 * lpx * uSilk.z) + 3.0 * aMeta.w + pad;

        pos = (aCorner.x < 0.5 ? a - dir * ext : b + dir * ext) + nrm * (aCorner.y < 0.5 ? -ext : ext);
    }
    else
    {
        // stroked paths: hairlines are drawn wider than their bounds say
        if (type == 10) pad += 0.5 * lpx * uSilk.z;
        float pl = pad;
        float pr = pad;

        if (type == 5)
        {
            // area columns tile exactly; only the outer sides get an AA margin
            pl = (flags & 64) != 0 ? pad : 0.0;
            pr = (flags & 128) != 0 ? pad : 0.0;
        }
        pos = vec2(aCorner.x < 0.5 ? aBounds.x - pl : aBounds.z + pr,
                   aCorner.y < 0.5 ? aBounds.y - pad : aBounds.w + pad);
    }

    vPos = pos;
    // Every instance of an object computes the same inverse, so the local position rebuilt from
    // gl_FragCoord is bit-identical across instances (an interpolated vPos is not).
    float idet = 1.0 / (m[0].x * m[1].y - m[1].x * m[0].y);
    mat2 ai = mat2(m[1].y, -m[0].y, -m[1].x, m[0].x) * idet;
    vInv = vec4(ai[0], ai[1]);
    vInvT = -(ai * m[2].xy);
    gl_Position = vec4((m * vec3(pos, 1.0)).xy, 0.0, 1.0);

    // progressive blur: 0 at the shape's start edge along the angle, 1 at its far edge
    vProg = 0.0;
    if ((flags & 65536) != 0)
    {
        vec2 dir = vec2(cos(aFx.z), sin(aFx.z));
        float ins = 3.0 * max(aMeta.w, aFx.y) + max(aFx.x, 0.0);
        vec4 bx = vec4(aBounds.xy + ins, aBounds.zw - ins);
        float lo = dot(bx.xy, dir) - abs(dir.x) * (bx.z - bx.x) * float(dir.x < 0.0) - abs(dir.y) * (bx.w - bx.y) * float(dir.y < 0.0);
        float span = max(abs(dir.x) * (bx.z - bx.x) + abs(dir.y) * (bx.w - bx.y), 1e-6);
        vProg = (dot(pos, dir) - lo) / span;
    }

    vShape0 = aShape0;
    vShape1 = aShape1;
    vShape2 = aShape2;
    vMeta = aMeta;
    vFill = aFill;
    vStroke = aStroke;
    vGrad = aGrad;
    vPaint = aPaint;
    vDash = aDash;
    vFx = aFx;
    vTint = tint * uWorldColorAlpha;
}
`;

/** @internal Fragment stage: signed distance, coverage and paint for every primitive type. */
export const fragment = /* glsl */ `#version 300 es
precision highp int;

in vec2 vPos;
flat in vec4 vShape0;
flat in vec4 vShape1;
flat in vec4 vShape2;
flat in vec4 vMeta;
flat in vec4 vFill;
flat in vec4 vStroke;
flat in vec4 vGrad;
flat in vec4 vPaint;
flat in vec4 vDash;
flat in vec4 vFx;
flat in vec4 vTint;
flat in float vBase;
flat in vec4 vInv;
flat in vec2 vInvT;
in float vProg;

uniform highp sampler2D uGradients;
uniform highp sampler2D uPolys;
uniform vec2 uResolution;
uniform vec4 uSilk; // x: dither amplitude (LSB), y: AA ramp width (device px), z: min stroke width (device px)

out vec4 finalColor;

const float PI = 3.14159265358979;
const float TAU = 6.28318530717959;

float gPx;
float gSigma;
int gBase; // first path texel of this object in uPolys (non-zero in batched draws)
// Width of uPolys, read once in main. ANGLE's Direct3D 11 backend turns textureSize into
// GetDimensions, and FXC fails on it inside the path loops ("invalid access of unbound variable").
int gPolysW;

vec4 polyTexel(int i)
{
    int t = i + gBase;
    return texelFetch(uPolys, ivec2(t % gPolysW, t / gPolysW), 0);
}

float erfApprox(float x)
{
    float s = sign(x);
    float a = abs(x);
    float t = 1.0 + (0.278393 + (0.230389 + 0.078108 * (a * a)) * a) * a;
    t *= t;
    return s - s / (t * t);
}

// Coverage of the region {sd < 0}. Box filter over one pixel, or a gaussian when blurred.
float cover(float sd)
{
    if (gSigma > 0.0)
    {
        float s = sqrt(gSigma * gSigma + 0.1 * gPx * gPx);
        return 0.5 - 0.5 * erfApprox(sd / (s * 1.41421356));
    }
    return clamp(0.5 - sd / gPx, 0.0, 1.0);
}

float dot2(vec2 v) { return dot(v, v); }

vec2 rotate(vec2 p, float a)
{
    float c = cos(a);
    float s = sin(a);
    return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

// Rounded box with per-corner radii r = (br, tr, bl, tl) (y-down) and optional
// superellipse corners (n > 2) for continuous-curvature "squircle" corners.
float sdRoundBox(vec2 p, vec2 b, vec4 r, float n)
{
    r.xy = (p.x > 0.0) ? r.xy : r.zw;
    float rad = (p.y > 0.0) ? r.x : r.y;
    rad = min(rad, min(b.x, b.y));
    vec2 q = abs(p) - b + rad;
    float inner = min(max(q.x, q.y), 0.0);
    if (n <= 2.001 || rad <= 0.0) return inner + length(max(q, 0.0)) - rad;
    vec2 m = max(q, 0.0) / rad;
    float ln = pow(pow(m.x, n) + pow(m.y, n), 1.0 / n);
    float g = 1.0;
    if (ln > 1e-5) g = length(pow(m / ln, vec2(n - 1.0)));
    return inner + rad * (ln - 1.0) / max(g, 0.5);
}

// Ellipse distance, 3 Newton-like iterations (no trig, stable near circles).
float sdEllipse(vec2 p, vec2 ab)
{
    vec2 pa = abs(p);
    vec2 t = vec2(0.70710678);
    float k = ab.x * ab.x - ab.y * ab.y;
    for (int i = 0; i < 3; i++)
    {
        vec2 xy = ab * t;
        vec2 e = vec2(k * t.x * t.x * t.x / ab.x, -k * t.y * t.y * t.y / ab.y);
        vec2 r = xy - e;
        vec2 q = pa - e;
        t = clamp((q * length(r) / max(length(q), 1e-9) + e) / ab, 0.0, 1.0);
        t /= max(length(t), 1e-9);
    }
    float d = length(pa - ab * t);
    vec2 n = pa / ab;
    return dot(n, n) > 1.0 ? d : -d;
}

// Signed distance to an infinite wedge of half-aperture h, symmetric about +y.
float sdWedge(vec2 q, float h)
{
    vec2 c = vec2(sin(h), cos(h));
    q.x = abs(q.x);
    float m = length(q - c * max(dot(q, c), 0.0));
    return m * sign(c.y * q.x - c.x * q.y);
}

float sdHeart(vec2 p)
{
    p.x = abs(p.x);
    if (p.y + p.x > 1.0) return sqrt(dot2(p - vec2(0.25, 0.75))) - 0.35355339;
    return sqrt(min(dot2(p - vec2(0.0, 1.0)), dot2(p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
}

// Star with n points (iq). en = angle of the edge; en = PI/2 gives a regular polygon.
float sdStar(vec2 p, float r, float n, float en)
{
    float an = PI / n;
    vec2 acs = vec2(cos(an), sin(an));
    vec2 ecs = vec2(cos(en), sin(en));
    float bn = mod(atan(p.x, p.y), 2.0 * an) - an;
    p = length(p) * vec2(cos(bn), abs(sin(bn)));
    p -= r * acs;
    p += ecs * clamp(-dot(p, ecs), 0.0, r * acs.y / ecs.y);
    return length(p) * sign(p.x);
}

float sdTriangle(vec2 p, vec2 p0, vec2 p1, vec2 p2)
{
    vec2 e0 = p1 - p0, e1 = p2 - p1, e2 = p0 - p2;
    vec2 v0 = p - p0, v1 = p - p1, v2 = p - p2;
    vec2 pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
    vec2 pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
    vec2 pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
    float s = sign(e0.x * e2.y - e0.y * e2.x);
    vec2 d = min(min(vec2(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)),
                     vec2(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))),
                     vec2(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));
    return -sqrt(d.x) * sign(d.y);
}

// Filled path: exact distance to the nearest edge, sign from even-odd crossings.
// Edges are texels (ax, ay, bx, by) of uPolys, starting at texel 'start'.
float sdPoly(vec2 p, int start, int n)
{
    float dd = 1e20;
    bool inside = false;
    for (int i = 0; i < n; i++)
    {
        vec4 e = polyTexel(start + i);
        vec2 a = e.xy;
        vec2 ab = e.zw - a;
        vec2 ap = p - a;
        vec2 q = ap - ab * clamp(dot(ap, ab) / max(dot(ab, ab), 1e-12), 0.0, 1.0);
        dd = min(dd, dot(q, q));
        if ((a.y <= p.y) != (e.w <= p.y) && p.x < a.x + (p.y - a.y) * ab.x / ab.y) inside = !inside;
    }
    return (inside ? -1.0 : 1.0) * sqrt(dd);
}

// Tapered capsule between circles (pa, ra) and (pb, rb) - iq's exact uneven capsule.
float sdTaper(vec2 p, vec2 pa, vec2 pb, float ra, float rb)
{
    p -= pa;
    pb -= pa;
    float h = dot(pb, pb);
    float b = ra - rb;
    if (h < 1e-10 || b * b >= h) return ra >= rb ? length(p) - ra : length(p - pb) - rb;
    vec2 q = vec2(dot(p, vec2(pb.y, -pb.x)), dot(p, pb)) / h;
    q.x = abs(q.x);
    vec2 c = vec2(sqrt(h - b * b), b);
    float k = c.x * q.y - c.y * q.x;
    float m = dot(c, q);
    float n = dot(q, q);
    if (k < 0.0) return sqrt(h * n) - ra;
    if (k > c.x) return sqrt(h * (n + 1.0 - 2.0 * q.y)) - rb;
    return m - ra;
}

float distSeg(vec2 p, vec2 a, vec2 b)
{
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-12), 0.0, 1.0);
    return length(pa - ba * h);
}

// Distance of a band end: e = signed distance past the end along the path, v = distance across.
float boxEnd(float e, float v, float hw)
{
    vec2 q = vec2(e, v - hw);
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}

// Stroke distance for a dashed path. u: position along the path, v: distance to the path.
float dashSD(float u, float v, float L, float hw, int cap, bool closed)
{
    float dash = vDash.x;
    float period = max(vDash.x + vDash.y, 1e-5);
    float k = floor((u + vDash.z) / period);
    float best = 1e6;
    for (int i = -1; i <= 1; i++)
    {
        float s0 = (k + float(i)) * period - vDash.z;
        float s1 = s0 + dash;
        if (!closed)
        {
            s0 = max(s0, 0.0);
            s1 = min(s1, L);
            if (s1 < s0) continue;
        }
        float e = abs(u - 0.5 * (s0 + s1)) - 0.5 * (s1 - s0);
        float sd;
        if (cap == 1) sd = length(vec2(max(e, 0.0), v)) - hw;
        else sd = boxEnd(cap == 2 ? e - hw : e, v, hw);
        best = min(best, sd);
    }
    return best;
}

// Position along the outline and its length, for dashes and path gradients.
float gU;
float gL;

// Signed distance to a simple polygon of up to 6 points (any winding).
float sdPolygon6(vec2 p, vec2 v[6], int n)
{
    float d = dot(p - v[0], p - v[0]);
    float s = 1.0;
    for (int i = 0; i < 6; i++)
    {
        if (i >= n) break;
        int j = i == 0 ? n - 1 : i - 1;
        vec2 e = v[j] - v[i];
        vec2 w = p - v[i];
        vec2 b = w - e * clamp(dot(w, e) / max(dot(e, e), 1e-12), 0.0, 1.0);
        d = min(d, dot(b, b));
        bvec3 c = bvec3(p.y >= v[i].y, p.y < v[j].y, e.x * w.y > e.y * w.x);
        if (all(c) || all(not(c))) s = -s;
    }
    return s * sqrt(d);
}

// One straight stroke piece in its own frame (q.x along, q.y across) covering [s0, s1].
// End kinds: 0 butt, 1 round, 2 square, and at the start 3: the round join of an inner vertex.
// That disc is cut to the stroke: at most 'back' before s0 and no further than the piece's end.
// Only the piece after a vertex owns its disc, so two chunks never see the same shape twice.
float pieceSD(vec2 q, float s0, float s1, int k0, int k1, float hw, float back)
{
    float lo = s0 - (k0 == 2 ? hw : 0.0);
    float hi = s1 + (k1 == 2 ? hw : 0.0);
    vec2 b = vec2(abs(q.x - 0.5 * (lo + hi)) - 0.5 * (hi - lo), abs(q.y) - hw);
    float d = length(max(b, 0.0)) + min(max(b.x, b.y), 0.0);
    float disc = length(vec2(q.x - s0, q.y)) - hw;
    if (k0 == 1) d = min(d, disc);
    if (k0 == 3) d = min(d, max(disc, max(s0 - back - q.x, q.x - hi)));
    if (k1 == 1) d = min(d, length(vec2(q.x - s1, q.y)) - hw);
    return d;
}

// How two pieces meet at a vertex: 0 butt ends only (the path folds back), 1 round ends (round
// joins, and miters or bevels that differ from round by under a tenth of a pixel), 2 miter, 3 bevel.
int joinKind(vec2 d0, vec2 d1, float hw, int join, float limit, float px)
{
    if (join == 0) return 1;
    float ch = sqrt(max(0.5 * (1.0 + dot(d0, d1)), 0.0)); // cos of half the turn
    if (ch < 1e-4) return 0;
    bool miter = join == 1 && 1.0 / ch <= limit;
    float diff = miter ? hw * (1.0 / ch - 1.0) : hw * (1.0 - ch);
    if (diff < 0.1 * px) return 1;
    return miter ? 2 : 3;
}

// Miter (kind 2) or bevel (kind 3) at v between directions d0 and d1. The polygon also reaches e
// back along both butt pieces, so it overlaps them and no seam shows where they meet. Its inner
// side runs through the inner corners of the two butt ends, which keeps it inside the stroke.
float joinSD(vec2 p, vec2 v, vec2 d0, vec2 d1, float hw, float e, int kind)
{
    float cr = d0.x * d1.y - d0.y * d1.x;
    float sg = cr > 0.0 ? -1.0 : 1.0;
    vec2 n0 = sg * vec2(-d0.y, d0.x);
    vec2 n1 = sg * vec2(-d1.y, d1.x);
    vec2 m = normalize(n0 + n1);
    float ch = dot(n0, m);
    float th = dot(d0, m) / max(ch, 1e-6); // tan of half the turn
    e = min(e, hw / max(th, 1e-6));
    float inner = e * th - hw;
    vec2 P[6];
    P[0] = v - d0 * e + n0 * hw;
    int k = 1;
    if (kind == 2)
    {
        P[1] = v + m * (hw / ch);
        k = 2;
    }
    else
    {
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
vec4 segFetch(int first, int n, bool closed, int i, out bool ok)
{
    ok = true;
    if (i < 0 || i >= n)
    {
        if (!closed)
        {
            ok = false;
            return vec4(0.0);
        }
        i = (i % n + n) % n;
    }
    return polyTexel(first + i);
}

vec2 segDir(vec4 e)
{
    vec2 ab = e.zw - e.xy;
    float len = length(ab);
    return len > 1e-9 ? ab / len : vec2(1.0, 0.0);
}

// Component i (0 to 3) of v.
float comp(vec4 v, int i)
{
    return dot(v, vec4(equal(ivec4(i), ivec4(0, 1, 2, 3))));
}

// Stroke of a path (Prim 10): butt pieces, caps at open ends, a join at every inner vertex.
// Segments come in windows: texels (header texel, first segment, count, owner key). The instance
// owns its first windows and also evaluates the windows of other instances of the path that come
// near its own. A pixel is shaded by the instance with the nearest segment, the lower key winning a
// tie, so it is shaded once even where a long path crosses itself. Every instance computes a
// segment's distance from the same texels in the same loop, so they agree.
float pathSD(vec2 p, float hw, int cap0, int cap1, bool dashed, float px)
{
    int win = int(vShape0.x + 0.5);
    int nOwn = int(vShape0.y + 0.5);
    int nAll = nOwn + int(vShape0.z + 0.5);
    float key = vShape0.w;
    int join = int(vShape1.x + 0.5);
    float limit = vShape1.y;
    float own = 1e20;
    // distances closer than this count as a tie, which the key settles the same way everywhere
    float tol = 1e-3 * px;
    bool taken = false;
    gU = 0.0;
    gL = 1.0;
    for (int w = 0; w < nAll; w++)
    {
        vec4 wt = polyTexel(win + w);
        int hdr = int(wt.x + 0.5);
        int s = int(wt.y + 0.5);
        int cnt = int(wt.z + 0.5);
        vec4 h = polyTexel(hdr);
        int n = int(h.x + 0.5);
        bool closed = h.y > 0.5;
        float L = h.z;
        // closed outlines stretch the dash pattern so it tiles: the factor is in the header
        float dash = vDash.x * h.w;
        float period = max((vDash.x + vDash.y) * h.w, 1e-5);
        int first = hdr + 1;
        int cumAt = first + n;
        bool hp;
        bool hn;
        vec4 ep = segFetch(first, n, closed, s - 1, hp);
        vec4 ec = polyTexel(first + s);
        float wmin = 1e20;
        for (int k = s; k < s + cnt; k++)
        {
            vec4 en = segFetch(first, n, closed, k + 1, hn);
            float c = comp(polyTexel(cumAt + k / 4), k % 4);
            vec2 sa = ec.xy;
            float len = length(ec.zw - sa);
            vec2 dir = segDir(ec);
            vec2 dp = segDir(ep);
            int js = hp ? joinKind(dp, dir, hw, join, limit, px) : -1;
            int je = hn ? joinKind(dir, segDir(en), hw, join, limit, px) : -1;
            int ks = js < 0 ? cap0 : (js == 1 ? 3 : 0);
            int ke = je < 0 ? cap1 : 0;
            // how far the stroke (or a dash, through its start cap) reaches back before this segment
            float capBack = cap0 != 0 ? hw : 0.0;
            float back = closed ? 1e20 : c + capBack;
            float ej = min(hw, min(len, length(ep.zw - ep.xy)));
            vec2 q = vec2(dot(p - sa, dir), dir.x * (p.y - sa.y) - dir.y * (p.x - sa.x));
            float d = 1e20;
            if (!dashed)
            {
                d = pieceSD(q, 0.0, len, ks, ke, hw, back);
                if (js >= 2) d = min(d, joinSD(p, sa, dp, dir, hw, ej, js));
            }
            else
            {
                float kk = floor((c + clamp(q.x, 0.0, len) + vDash.z) / period);
                for (int j = -1; j <= 1; j++)
                {
                    float t0 = (kk + float(j)) * period - vDash.z;
                    float t1 = t0 + dash;
                    float lo = max(t0, c);
                    float hi = min(t1, c + len);
                    if (hi < lo || (hi == lo && dash > 0.0)) continue;
                    // a dash cut by a vertex goes on along the next segment: the vertex decides that end
                    d = min(d, pieceSD(q, lo - c, hi - c, t0 < c ? ks : cap0, t1 > c + len ? ke : cap1, hw, min(back, c - t0 + capBack)));
                }
                // a dash that runs through the vertex (not one that starts or ends on it) gets the join
                float ph = mod(c + vDash.z, period);
                float inDash = min(ph, dash - ph);
                if (js >= 2 && inDash > 1e-4 * period) d = min(d, joinSD(p, sa, dp, dir, hw, min(ej, inDash), js));
            }
            if (w < nOwn && d < own)
            {
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
        // The discard waits until after the loop: FXC (Direct3D 11) fails on a discard in this loop.
        if (w >= nOwn && (wmin < own - tol || (wmin <= own + tol && wt.w < key)))
        {
            taken = true;
            break;
        }
    }
    if (taken) discard;
    return own;
}

// Catmull-Rom weights for the four samples around fraction f
vec4 crWeights(float f)
{
    float f2 = f * f;
    float f3 = f2 * f;
    return vec4(-0.5 * f3 + f2 - 0.5 * f, 1.5 * f3 - 2.5 * f2 + 1.0, -1.5 * f3 + 2.0 * f2 + 0.5 * f, 0.5 * f3 - 0.5 * f2);
}

// Colour mesh: a 16 x 16 premultiplied grid in one atlas row, sampled with a bicubic Catmull-Rom.
vec4 meshColor(vec2 p)
{
    vec2 uv = clamp((p - vGrad.xy) / max(vGrad.zw - vGrad.xy, vec2(1e-6)), 0.0, 1.0) * 15.0;
    vec2 i0 = floor(min(uv, vec2(14.999)));
    vec4 wx = crWeights(uv.x - i0.x);
    vec4 wy = crWeights(uv.y - i0.y);
    int row = int(vPaint.y + 0.5);
    vec4 acc = vec4(0.0);
    for (int j = 0; j < 4; j++)
    {
        int y = int(clamp(i0.y + float(j - 1), 0.0, 15.0));
        vec4 line = vec4(0.0);
        for (int i = 0; i < 4; i++)
        {
            int x = int(clamp(i0.x + float(i - 1), 0.0, 15.0));
            line += wx[i] * texelFetch(uGradients, ivec2(y * 16 + x, row), 0);
        }
        acc += wy[j] * line;
    }
    acc.a = clamp(acc.a, 0.0, 1.0);
    acc.rgb = clamp(acc.rgb, 0.0, acc.a);
    return acc;
}

vec4 gradientColor(vec2 p, float u, float L, int kind)
{
    if (kind == 5) return meshColor(p);
    float t;
    if (kind == 1)
    {
        vec2 ab = vGrad.zw - vGrad.xy;
        t = dot(p - vGrad.xy, ab) / max(dot(ab, ab), 1e-12);
    }
    else if (kind == 2)
    {
        t = (length(p - vGrad.xy) - vGrad.w) / max(vGrad.z - vGrad.w, 1e-9);
    }
    else if (kind == 3)
    {
        vec2 q = p - vGrad.xy;
        float sw = vGrad.w;
        float as = max(abs(sw), 1e-9);
        float rel = mod((atan(q.y, q.x) - vGrad.z) * (sw < 0.0 ? -1.0 : 1.0), TAU);
        // keep the region right before the start on the start color (round caps)
        if (as < TAU - 1e-4 && rel > 0.5 * (as + TAU)) rel -= TAU;
        t = rel / as;
    }
    else
    {
        t = u / max(L, 1e-9);
    }
    int ext = int(vPaint.z + 0.5);
    if (ext == 1) t = fract(t);
    else if (ext == 2) t = 1.0 - abs(mod(t, 2.0) - 1.0);
    t = clamp(t, 0.0, 1.0);
    return textureLod(uGradients, vec2((t * 255.0 + 0.5) / 256.0, (vPaint.y + 0.5) / 256.0), 0.0);
}

// Signed distance of a closed shape (rect, ellipse, sector, heart, star, triangle, path fill) at p,
// with its parameters in s0, s1, s2. Sets gFillScale, and gU / gL (position and length along the
// outline, for dashes and path gradients).
float gFillScale;
float gHwEff;
float gAlign;

float shapeSD(vec2 p, int type, vec4 s0, vec4 s1, vec4 s2, float px)
{
    float d = 1e6;
    float fillScale = 1.0;
    float u = 0.0;
    float L = 1.0;
    float hwEff = gHwEff;
    float align = gAlign;

    if (type == 0)
    {
        vec2 b = s0.zw;
        vec2 bi = max(b, vec2(0.5 * px));
        fillScale = (b.x / bi.x) * (b.y / bi.y);
        vec2 q = p - s0.xy;
        if (s2.w != 0.0) q = rotate(q, -s2.w);
        d = sdRoundBox(q, bi, s1, s2.x);
    }
    else if (type == 1)
    {
        vec2 ab = s0.zw;
        vec2 abi = max(ab, vec2(0.5 * px));
        fillScale = (ab.x / abi.x) * (ab.y / abi.y);
        vec2 q = p - s0.xy;
        if (s2.w != 0.0) q = rotate(q, -s2.w);
        d = abs(abi.x - abi.y) <= 1e-4 * max(abi.x, abi.y) ? length(q) - abi.x : sdEllipse(q, abi);
        float rm = 0.5 * (abi.x + abi.y) + align * hwEff;
        u = mod(atan(q.y, q.x) + 0.5 * PI, TAU) * rm;
        L = TAU * rm;
    }
    else if (type == 3)
    {
        vec2 q = p - s0.xy;
        float sweep = s1.x;
        float h = min(abs(sweep) * 0.5, PI);
        float mid = s0.w + 0.5 * sweep;
        float cm = cos(mid);
        float sm = sin(mid);
        vec2 qr = vec2(sm * q.x - cm * q.y, cm * q.x + sm * q.y); // arc middle -> +y
        float len = length(q);
        bool full = h >= PI - 1e-4;
        // annular sector with rounded corners
        float r1 = s0.z;
        float r0 = s1.y;
        float rc = s1.z;
        float dA = len - (r1 - rc);
        if (r0 > 0.0) dA = max(dA, (r0 + rc) - len);
        float dW = full ? -1e6 : sdWedge(qr, h) + rc;
        vec2 w = vec2(dA, dW);
        d = length(max(w, 0.0)) + min(max(w.x, w.y), 0.0) - rc;
    }
    else if (type == 6)
    {
        float s = s0.z;
        vec2 q = p - s0.xy;
        if (s2.w != 0.0) q = rotate(q, -s2.w);
        q /= s;
        d = (sdHeart(vec2(q.x, 0.552 - q.y)) - s0.w) * s;
    }
    else if (type == 7)
    {
        vec2 q = rotate(p - s0.xy, -s0.w);
        q.y = -q.y;
        float rc = s1.z;
        d = sdStar(q, s0.z - rc, s1.x, s1.y) - rc;
    }
    else if (type == 8)
    {
        d = sdTriangle(p, s0.xy, s0.zw, s1.xy) - s1.z;
    }
    else if (type == 9)
    {
        d = sdPoly(p, int(s0.x + 0.5), int(s0.y + 0.5)) - s0.z;
    }

    gFillScale = fillScale;
    gU = u;
    gL = L;
    return d;
}

// Two operands combined: 0 union, 1 subtract (a minus b), 2 intersect, 3 exclude. Exact on the
// outline. Inside, max and min of distances are a bound, not the exact distance.
float combineSD(float a, float b, int op)
{
    if (op == 1) return max(a, -b);
    if (op == 2) return max(a, b);
    if (op == 3) return max(min(a, b), -max(a, b));
    return min(a, b);
}

// Closed shape of this instance. A union (Prim 11) is several shapes combined into one: records of
// 4 texels, (type, op, 0, 0) then s0, s1, s2, in uPolys, folded on a small stack. Op 4 pushes the
// shape as a new operand and ops 0 to 3 fold it into the top one. Type 255 folds the top operand
// into the one below it with its op. One shape, painted once.
float closedSD(vec2 p, int type, float px)
{
    if (type == 11)
    {
        int start = int(vShape0.x + 0.5);
        int n = int(vShape0.y + 0.5);
        float st[8];
        int sp = 0;
        st[0] = 1e6;
        for (int i = 0; i < n; i++)
        {
            int t = start + i * 4;
            vec4 h = polyTexel(t);
            int rt = int(h.x + 0.5);
            int op = int(h.y + 0.5);
            if (rt == 255)
            {
                sp = max(sp - 1, 1);
                st[sp - 1] = combineSD(st[sp - 1], st[sp], op);
            }
            else
            {
                float d = shapeSD(p, rt, polyTexel(t + 1), polyTexel(t + 2), polyTexel(t + 3), px);
                if (op == 4)
                {
                    st[min(sp, 7)] = d;
                    sp = min(sp + 1, 8);
                }
                else st[max(sp - 1, 0)] = combineSD(st[max(sp - 1, 0)], d, op);
            }
        }
        gFillScale = 1.0;
        gU = 0.0;
        gL = 1.0;
        return st[0];
    }
    return shapeSD(p, type, vShape0, vShape1, vShape2, px);
}

float ign(vec2 p)
{
    return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

void main(void)
{
    vec2 p = vPos;
    vec2 ddx = dFdx(p);
    vec2 ddy = dFdy(p);
    float px = max(sqrt(abs(ddx.x * ddy.y - ddx.y * ddy.x)), 1e-7); // local units per device pixel
    gPx = px * uSilk.y;
    gSigma = vMeta.w;
    gBase = int(vBase + 0.5);
    gPolysW = textureSize(uPolys, 0).x;

    int type = int(vMeta.x + 0.5);
    if (type == 10)
    {
        // chunks of one path decide who shades a pixel by comparing distances: they must all see
        // exactly the same position (kept only when it matches vPos, in case of an odd viewport)
        vec2 hres = 0.5 * abs(uResolution);
        vec2 q = mat2(vInv.xy, vInv.zw) * (gl_FragCoord.xy / hres - 1.0) + vInvT;
        if (length(q - p) < 0.25 * px)
        {
            p = q;
            // the pixel size too: joins switch to round below a tenth of a pixel
            px = max(sqrt(abs(vInv.x * vInv.w - vInv.y * vInv.z) / (hres.x * hres.y)), 1e-7);
            gPx = px * uSilk.y;
        }
    }
    int flags = int(vMeta.y + 0.5);
    bool inner = (flags & 32768) != 0;
    if ((flags & 65536) != 0) gSigma = mix(vMeta.w, vFx.y, clamp(vProg, 0.0, 1.0));
    bool hasFill = (flags & 1) != 0;
    bool hasStroke = (flags & 2) != 0 && vMeta.z > 0.0;
    bool dashed = (flags & 8) != 0;
    int cap0 = (flags >> 8) & 3;
    int cap1 = (flags >> 10) & 3;

    // hairlines: never thinner than uSilk.z device px; fade instead (energy conserving)
    float hw = 0.5 * vMeta.z;
    float hwEff = max(hw, 0.5 * px * uSilk.z);
    float strokeScale = hw / max(hwEff, 1e-9);
    float align = vDash.w;

    float d = 1e6;   // closed shapes: signed distance to the fill boundary
    float sd = 1e6;  // open paths: signed distance to the stroke
    bool open = false;
    float u = 0.0;
    float L = 1.0;
    float fillScale = 1.0;
    float areaCov = 0.0;

    gHwEff = hwEff;
    gAlign = align;
    if (type == 2)
    {
        vec2 q = p - vShape0.xy;
        float sweep = vShape1.x;
        float h = min(abs(sweep) * 0.5, PI);
        float mid = vShape0.w + 0.5 * sweep;
        float cm = cos(mid);
        float sm = sin(mid);
        vec2 qr = vec2(sm * q.x - cm * q.y, cm * q.x + sm * q.y); // arc middle -> +y
        float len = length(q);
        bool full = h >= PI - 1e-4;

        if (type == 2)
        {
            open = true;
            float r = vShape0.z;
            u = (h - (sweep < 0.0 ? -1.0 : 1.0) * atan(qr.x, qr.y)) * r;
            L = 2.0 * h * r;
            float v = abs(len - r);
            if (dashed) sd = dashSD(u, v, L, hwEff, cap0, full);
            else if (full) sd = v - hwEff;
            else if (cap0 == 1)
            {
                vec2 sc = vec2(sin(h), cos(h));
                vec2 qa = vec2(abs(qr.x), qr.y);
                sd = ((sc.y * qa.x > sc.x * qa.y) ? length(qa - sc * r) : v) - hwEff;
            }
            else
            {
                float e = sdWedge(qr, h);
                sd = boxEnd(cap0 == 2 ? e - hwEff : e, v, hwEff);
            }
        }
    }
    else if (type == 4)
    {
        open = true;
        vec2 a = vShape0.xy;
        vec2 b = vShape0.zw;
        // per-end radii (tapered strokes); hairlines keep at least uSilk.z device px
        float mn = 0.5 * px * uSilk.z;
        float ra = max(vShape2.z, mn);
        float rb = max(vShape2.w, mn);
        float dSelf = sdTaper(p, a, b, ra, rb);
        // Ownership: every pixel is shaded once, by the segment whose stroke is nearest,
        // so translucent polylines have no double-blended joints. The bias breaks ties.
        float bias = 1e-3 * px;
        if ((flags & 16) != 0 && sdTaper(p, vShape1.xy, a, max(vDash.w, mn), ra) - dSelf < bias) discard;
        if ((flags & 32) != 0 && dSelf - sdTaper(p, b, vShape1.zw, rb, max(vPaint.w, mn)) >= bias) discard;

        vec2 ab = b - a;
        float ls = length(ab);
        vec2 dir = ls > 1e-9 ? ab / ls : vec2(1.0, 0.0);
        float us = dot(p - a, dir);
        float hr = mix(vShape2.z, vShape2.w, clamp(us / max(ls, 1e-9), 0.0, 1.0));
        float hrEff = max(hr, mn);

        strokeScale = hr / max(hrEff, 1e-9);
        u = vShape2.x + us;
        L = vShape2.y;
        if (dashed)
        {
            sd = dashSD(u, distSeg(p, a, b), L, hrEff, cap0, (flags & 8192) != 0);
        }
        else
        {
            // path ends get their caps; interior ends are round joins
            bool nearStart = us < 0.5 * ls;
            float v = abs(dir.x * (p.y - a.y) - dir.y * (p.x - a.x));
            if (nearStart && (flags & 16) == 0 && cap0 != 1) sd = boxEnd(-us - (cap0 == 2 ? ra : 0.0), v, ra);
            else if (!nearStart && (flags & 32) == 0 && cap1 != 1) sd = boxEnd(us - ls - (cap1 == 2 ? rb : 0.0), v, rb);
            else sd = dSelf;
        }
    }
    else if (type == 10)
    {
        open = true;
        sd = pathSD(p, hwEff, cap0, cap1, dashed, px);
        u = gU;
        L = gL;
    }
    else if (type == 5)
    {
        vec2 a = vShape0.xy;
        vec2 b = vShape0.zw;
        vec2 c = vShape1.xy;
        vec2 e = vShape1.zw;
        vec2 t1 = (b - a) / max(length(b - a), 1e-9);
        vec2 t2 = (e - c) / max(length(e - c), 1e-9);
        areaCov = cover(dot(p - a, vec2(t1.y, -t1.x))) * cover(dot(p - c, vec2(-t2.y, t2.x)));
        if ((flags & 64) != 0) areaCov *= cover(a.x - p.x);
        if ((flags & 128) != 0) areaCov *= cover(p.x - b.x);
    }
    else
    {
        d = closedSD(p, type, px);
        fillScale = gFillScale;
        u = gU;
        L = gL;
    }

    // spread grows (or shrinks) the shape before it is blurred, like a Figma shadow spread
    if (!inner)
    {
        d -= vFx.x;
        sd -= vFx.x;
    }

    // paints
    vec4 fillCol = hasFill ? vFill : vec4(0.0);
    vec4 strokeCol = vStroke;
    int gk = int(vPaint.x + 0.5);
    if (gk > 0)
    {
        vec4 g = gradientColor(p, u, L, gk);
        if ((flags & 4096) != 0) strokeCol *= g;
        else fillCol *= g;
    }

    vec4 col;
    if (inner)
    {
        // inner shadow: the shape, minus a copy moved by the offset and shrunk by the spread, blurred
        float blur = gSigma;
        gSigma = 0.0;
        float mask = cover(d) * fillScale;
        gSigma = blur;
        float lit = cover(closedSD(p - vStroke.xy, type, px) + vFx.x);
        col = vFill * (mask * (1.0 - lit));
    }
    else if (type == 5)
    {
        col = fillCol * areaCov;
    }
    else if (open)
    {
        col = strokeCol * (cover(sd) * strokeScale);
    }
    else if (hasStroke)
    {
        float off = align * hwEff;
        if (dashed)
        {
            float cS = cover(dashSD(u, abs(d - off), L, hwEff, cap0, true)) * strokeScale;
            col = strokeCol * cS + fillCol * (cover(d) * fillScale * (1.0 - strokeCol.a * cS));
        }
        else
        {
            // exact partition: stroke band, fill outside the band, fill under the band
            float cLo = cover(d - (off - hwEff));
            float cHi = cover(d - (off + hwEff));
            float cS = max(cHi - cLo, 0.0) * strokeScale;
            float under = max(cover(d) - cLo, 0.0);
            col = strokeCol * cS + fillCol * ((cLo + under * (1.0 - strokeCol.a * strokeScale)) * fillScale);
        }
    }
    else
    {
        col = fillCol * (cover(d) * fillScale);
    }

    col *= vTint;
    if (col.a <= 0.0 && max(col.r, max(col.g, col.b)) <= 0.0) discard;

    if ((flags & 4) != 0)
    {
        // +-0.5 LSB dither: kills 8-bit banding in gradients and blurs
        float n = ign(gl_FragCoord.xy) - 0.5;
        col.rgb = clamp(col.rgb + n * (uSilk.x / 255.0), 0.0, col.a);
    }
    // plus lighter: premultiplied colour with zero alpha adds to the framebuffer
    if ((flags & 16384) != 0) col.a = 0.0;
    finalColor = col;
}
`;

let program: GlProgram | null = null;

/** @internal Per-object settings the shader reads from `uSilk`, as in `SilkGraphicsOptions`. */
export interface SilkShaderSettings {
    /** Dither amplitude in 8-bit steps (0 disables). Default 1. */
    dither: number;
    /** Width of the anti-aliasing ramp in device pixels. 1 is a box filter, larger is softer. */
    aaWidth: number;
    /** Strokes thinner than this many device pixels are drawn at this width with reduced alpha. */
    minStrokePx: number;
}

let noBatch: BufferImageSource | null = null;

/** @internal A 1x1 object table for draws that are not batched (they never read it). */
export function emptyBatchTable(): BufferImageSource {
    noBatch ??= new BufferImageSource({
        resource: new Float32Array(4),
        width: 1,
        height: 1,
        format: 'rgba32float',
        alphaMode: 'premultiplied-alpha',
        scaleMode: 'nearest',
        autoGenerateMipmaps: false,
        label: 'silk-batch-empty',
    });

    return noBatch;
}

/**
 * @internal The uber shader. `polys` holds the path and union texels. `batch` is the object table of a
 * batched draw: 3 texels per object (matrix a b c d, then tx ty and path texel base, then tint).
 */
export function createSilkShader(
    settings: SilkShaderSettings,
    polys: TextureSource,
    batch: TextureSource = emptyBatchTable(),
): Shader {
    program ??= GlProgram.from({
        vertex,
        fragment,
        name: 'silk-sdf',
        preferredVertexPrecision: 'highp',
        preferredFragmentPrecision: 'highp',
    });

    return new Shader({
        glProgram: program,
        // WGSL twin from `pixi-silk/webgpu` (shader-wgsl.ts), when installed: Pixi picks the one its renderer runs
        gpuProgram: silkGpu.program ?? undefined,
        resources: {
            uGradients: GradientAtlas.shared.source,
            uPolys: polys,
            uBatch: batch,
            silkUniforms: new UniformGroup({
                uSilk: {
                    value: new Float32Array([settings.dither, settings.aaWidth, settings.minStrokePx, 0]),
                    type: 'vec4<f32>',
                },
            }),
        },
    });
}
