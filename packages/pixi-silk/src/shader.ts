import { GlProgram, Shader, UniformGroup } from 'pixi.js';
import { GradientAtlas } from './atlas';

/*
 * One uber-program draws every primitive. Each instance is a quad; the fragment
 * shader evaluates the primitive's signed distance d (local units) and turns it into
 * coverage with a 1-device-pixel box filter:  coverage = clamp(0.5 - d / px, 0, 1),
 * where px = local units per device pixel from the screen-space derivatives of the
 * local position. That is exact analytic anti-aliasing at any zoom, rotation,
 * resolution or render target - no MSAA, no tessellation.
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

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform vec4 uWorldColorAlpha;
uniform vec2 uResolution;
uniform mat3 uTransformMatrix;
uniform vec4 uColor;
uniform vec4 uSilk;

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
flat out vec4 vTint;

void main(void)
{
    mat3 m = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;

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
    gl_Position = vec4((m * vec3(pos, 1.0)).xy, 0.0, 1.0);

    vShape0 = aShape0;
    vShape1 = aShape1;
    vShape2 = aShape2;
    vMeta = aMeta;
    vFill = aFill;
    vStroke = aStroke;
    vGrad = aGrad;
    vPaint = aPaint;
    vDash = aDash;
    vTint = uColor * uWorldColorAlpha;
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
flat in vec4 vTint;

uniform highp sampler2D uGradients;
uniform vec4 uSilk; // x: dither amplitude (LSB), y: AA ramp width (device px), z: min stroke width (device px)

out vec4 finalColor;

const float PI = 3.14159265358979;
const float TAU = 6.28318530717959;

float gPx;
float gSigma;

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

vec4 rampColor(float t)
{
    int ext = int(vPaint.z + 0.5);
    if (ext == 1) t = fract(t);
    else if (ext == 2) t = 1.0 - abs(mod(t, 2.0) - 1.0);
    t = clamp(t, 0.0, 1.0);
    return textureLod(uGradients, vec2((t * 255.0 + 0.5) / 256.0, (vPaint.y + 0.5) / 256.0), 0.0);
}

// x: end-cap coverage, y: occlusion of the earlier stroke beneath it.
// Resolve ownership from the nearest earlier point on the path, including its
// start cap when the projected point lies before the start of the arc.
vec2 arcTipOverlap(vec2 q, float r, float start, float sweep, float hw, bool shadow)
{
    float e = start + sweep, s = sign(sweep);
    vec2 v = vec2(cos(e), sin(e)), p = q - r * v;
    float a = length(p);
    if (s == 0.0 || dot(p, s * vec2(-v.y, v.x)) < 0.0) return vec2(0.0);

    // Ownership of the gradient end colour can extend beyond the shadow's reach.
    if (shadow && a >= 2.0 * hw) return vec2(0.0);

    bool onArc = mod((e - atan(q.y, q.x)) * s, TAU) <= abs(sweep);
    float b = onArc ? abs(length(q) - r) : length(q - r * vec2(cos(start), sin(start)));
    if (!onArc && b >= a) return vec2(0.0);

    float tip = cover(a - hw);
    if (!shadow) return vec2(tip, 0.0);

    float k = hw / max(a, hw), c = cover(b - hw);
    float fade = 1.0 - smoothstep(hw, 2.0 * hw, a);
    return vec2(tip,
        (1.0 - sqrt(max(1.0 - k * k, 0.0))) * step(1e-9, c) * fade);
}

// Decorative occlusion is independent of arc geometry and paint selection.
vec4 shadeStrokeOverlap(vec4 color, vec4 tip, vec2 overlap)
{
    color.rgb *= 1.0 - overlap.y;
    return mix(color, tip, overlap.x);
}

vec4 gradientColor(vec2 p, float u, float L, int kind, int cap, float hw)
{
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
        bool partialArc = as < TAU - 1e-4;
        bool alignedArc = (int(vMeta.y + 0.5) & 16384) != 0;
        bool padRoundCaps = cap == 1 && int(vPaint.z + 0.5) == 0;
        float rel = mod((atan(q.y, q.x) - vGrad.z) * (sw < 0.0 ? -1.0 : 1.0), TAU);
        // keep the region right before the start on the start color (round caps)
        if (partialArc && rel > 0.5 * (as + TAU)) rel -= TAU;
        // On overlapping turns, sample the most recent lap at this angle.
        if (as > TAU && alignedArc) rel += floor((as - rel) / TAU) * TAU;
        // A zero-length round arc is a dot in the first stop, not a split ramp.
        t = abs(sw) < 1e-9 ? 0.0 : rel / as;
        if (alignedArc && partialArc && padRoundCaps)
        {
            // The cap diameter is the minimum length that separates the two caps.
            float capDiameter = hw + hw;
            t = clamp(t, 0.0, 1.0) * smoothstep(0.0, capDiameter, L);
        }
    }
    else
    {
        t = u / max(L, 1e-9);
    }
    return rampColor(t);
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

    int type = int(vMeta.x + 0.5);
    int flags = int(vMeta.y + 0.5);
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
    vec2 tipOverlap = vec2(0.0);

    if (type == 0)
    {
        vec2 b = vShape0.zw;
        vec2 bi = max(b, vec2(0.5 * px));
        fillScale = (b.x / bi.x) * (b.y / bi.y);
        vec2 q = p - vShape0.xy;
        if (vShape2.w != 0.0) q = rotate(q, -vShape2.w);
        d = sdRoundBox(q, bi, vShape1, vShape2.x);
    }
    else if (type == 1)
    {
        vec2 ab = vShape0.zw;
        vec2 abi = max(ab, vec2(0.5 * px));
        fillScale = (ab.x / abi.x) * (ab.y / abi.y);
        vec2 q = p - vShape0.xy;
        if (vShape2.w != 0.0) q = rotate(q, -vShape2.w);
        d = abs(abi.x - abi.y) <= 1e-4 * max(abi.x, abi.y) ? length(q) - abi.x : sdEllipse(q, abi);
        float rm = 0.5 * (abi.x + abi.y) + align * hwEff;
        u = mod(atan(q.y, q.x) + 0.5 * PI, TAU) * rm;
        L = TAU * rm;
    }
    else if (type == 2 || type == 3)
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
            if (full) u = mod((atan(q.y, q.x) - vShape0.w) * sign(sweep), TAU) * r;
            // Only crossing aligned gradients need end-cap colour ownership without a shadow.
            bool tipShadow = vPaint.w > 0.5;
            if (tipShadow || (flags & 32768) != 0)
                tipOverlap = arcTipOverlap(q, r, vShape0.w, sweep, hwEff, tipShadow);
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
        else
        {
            // annular sector with rounded corners
            float r1 = vShape0.z;
            float r0 = vShape1.y;
            float rc = vShape1.z;
            float dA = len - (r1 - rc);
            if (r0 > 0.0) dA = max(dA, (r0 + rc) - len);
            float dW = full ? -1e6 : sdWedge(qr, h) + rc;
            vec2 w = vec2(dA, dW);
            d = length(max(w, 0.0)) + min(max(w.x, w.y), 0.0) - rc;
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
    else if (type == 6)
    {
        float s = vShape0.z;
        vec2 q = p - vShape0.xy;
        if (vShape2.w != 0.0) q = rotate(q, -vShape2.w);
        q /= s;
        d = (sdHeart(vec2(q.x, 0.552 - q.y)) - vShape0.w) * s;
    }
    else if (type == 7)
    {
        vec2 q = rotate(p - vShape0.xy, -vShape0.w);
        q.y = -q.y;
        float rc = vShape1.z;
        d = sdStar(q, vShape0.z - rc, vShape1.x, vShape1.y) - rc;
    }
    else if (type == 8)
    {
        d = sdTriangle(p, vShape0.xy, vShape0.zw, vShape1.xy) - vShape1.z;
    }

    // paints
    vec4 fillCol = hasFill ? vFill : vec4(0.0);
    vec4 strokeCol = vStroke;
    vec4 tipCol = vStroke;
    int gk = int(vPaint.x + 0.5);
    if (gk > 0)
    {
        vec4 g = gradientColor(p, u, L, gk, cap0, hwEff);
        if ((flags & 4096) != 0)
        {
            strokeCol *= g;
            tipCol = gk == 3 && (flags & 16384) != 0 ? vStroke * rampColor(1.0) : strokeCol;
        }
        else fillCol *= g;
    }

    strokeCol = shadeStrokeOverlap(strokeCol, tipCol, tipOverlap);

    vec4 col;
    if (type == 5)
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
    if (col.a <= 0.0) discard;

    if ((flags & 4) != 0)
    {
        // +-0.5 LSB dither: kills 8-bit banding in gradients and blurs
        float n = ign(gl_FragCoord.xy) - 0.5;
        col.rgb = clamp(col.rgb + n * (uSilk.x / 255.0), 0.0, col.a);
    }
    finalColor = col;
}
`;

let program: GlProgram | null = null;

export interface SilkShaderSettings {
    /** Dither amplitude in 8-bit steps (0 disables). Default 1. */
    dither: number;
    /** Width of the anti-aliasing ramp in device pixels. 1 is a box filter, larger is softer. */
    aaWidth: number;
    /** Strokes thinner than this many device pixels are drawn at this width with reduced alpha. */
    minStrokePx: number;
}

export function createSilkShader(settings: SilkShaderSettings): Shader {
    program ??= GlProgram.from({
        vertex,
        fragment,
        name: 'silk-sdf',
        preferredVertexPrecision: 'highp',
        preferredFragmentPrecision: 'highp',
    });

    return new Shader({
        glProgram: program,
        resources: {
            uGradients: GradientAtlas.shared.source,
            silkUniforms: new UniformGroup({
                uSilk: {
                    value: new Float32Array([settings.dither, settings.aaWidth, settings.minStrokePx, 0]),
                    type: 'vec4<f32>',
                },
            }),
        },
    });
}
