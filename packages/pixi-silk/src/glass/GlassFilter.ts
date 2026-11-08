import { Filter, GlProgram, GpuProgram, Texture, UniformGroup } from 'pixi.js';
import { glassWgsl } from './glass-wgsl';

/** @internal Filter vertex stage: Pixi's default filter vertex shader. */
export const glassVertex = /* glsl */ `#version 300 es
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

void main(void)
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;

    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    gl_Position = vec4(position, 0.0, 1.0);
    vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}
`;

/**
 * @internal Glass fragment stage. The filter covers exactly the glass shape and reads what is
 * already drawn behind it (`uBackTexture`). It blurs that with a jittered golden-angle disc. Near
 * the rim it bends it along the normal of the shape's distance field and splits the channels.
 * Frost, tint, a sheen, a lit rim and grain go on top. Coverage is analytic.
 */
export const glassFragment = /* glsl */ `#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform sampler2D uBackTexture;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform vec4 uOutputFrame;

uniform vec4 uShape;
uniform vec4 uOptics;
uniform vec4 uTint;
uniform vec4 uLight;
uniform vec4 uSurface;

float hash(vec2 p)
{
    return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

float sdShape(vec2 p)
{
    vec2 b = uShape.xy;
    float r = min(uShape.z, min(b.x, b.y));
    vec2 q = abs(p) - b + r;
    vec2 m = max(q, 0.0);
    float k = mix(2.0, 5.0, clamp(uShape.w, 0.0, 1.0));
    float corner = pow(pow(m.x, k) + pow(m.y, k), 1.0 / k);

    return corner + min(max(q.x, q.y), 0.0) - r;
}

vec3 backAt(vec2 uv)
{
    return texture(uBackTexture, clamp(uv, uInputClamp.xy, uInputClamp.zw)).rgb;
}

vec3 frosted(vec2 uv, float radius, float spin)
{
    if (radius < 0.5) return backAt(uv);
    vec3 acc = vec3(0.0);
    float total = 0.0;

    for (int i = 0; i < 24; i++)
    {
        float f = float(i);
        float r = sqrt((f + 0.5) / 24.0);
        float a = f * 2.39996323 + spin;
        vec2 o = vec2(cos(a), sin(a)) * r * radius * uInputSize.zw;
        float w = exp(-r * r * 1.6);

        acc += backAt(uv + o) * w;
        total += w;
    }

    return acc / total;
}

void main(void)
{
    vec2 size = uOutputFrame.zw;
    vec2 p = vTextureCoord * uInputSize.xy - size * 0.5;
    float d = sdShape(p);
    float aa = max(fwidth(d), 1e-3);
    float cover = clamp(0.5 - d / aa, 0.0, 1.0);

    if (cover <= 0.0)
    {
        finalColor = vec4(0.0);
        return;
    }

    vec2 e = vec2(0.75, 0.0);
    vec2 n = vec2(sdShape(p + e.xy) - sdShape(p - e.xy), sdShape(p + e.yx) - sdShape(p - e.yx));

    n = n / max(length(n), 1e-5);

    float bevel = max(uOptics.w, 1.0);
    float rim = 1.0 - smoothstep(0.0, bevel, -d);
    float bend = rim * rim;
    vec2 shift = n * uOptics.y * bend * uInputSize.zw;
    float spin = hash(gl_FragCoord.xy) * 6.2831853;
    float blur = uOptics.x;
    vec3 col;

    if (uOptics.z > 0.001)
    {
        float split = uOptics.z * bend;

        col.r = frosted(vTextureCoord + shift * (1.0 + split), blur, spin).r;
        col.g = frosted(vTextureCoord + shift, blur, spin).g;
        col.b = frosted(vTextureCoord + shift * (1.0 - split), blur, spin).b;
    }
    else
    {
        col = frosted(vTextureCoord + shift, blur, spin);
    }

    float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));

    col = max(mix(vec3(luma), col, uSurface.z), 0.0);
    col = mix(col, vec3(1.0), uSurface.x);
    col = mix(col, uTint.rgb, uTint.a);

    vec2 toLight = uLight.xy;
    float span = max(uShape.x, uShape.y);
    float sheen = clamp(dot(p / span, toLight) * 0.5 + 0.5, 0.0, 1.0);
    float facing = max(dot(n, toLight), 0.0);
    float hairline = exp(-abs(d + 0.9) * 1.1);

    col += uLight.z * (0.10 * sheen * sheen + 0.55 * pow(rim, 3.0) * facing + 0.35 * hairline * (0.35 + 0.65 * facing));
    col += (hash(gl_FragCoord.xy + uSurface.w) - 0.5) * uLight.w;

    finalColor = vec4(col, 1.0) * cover * uSurface.y;
}
`;

let program: GlProgram | null = null;
let gpuProgram: GpuProgram | null = null;

/**
 * The frosted glass filter behind {@link Glass}. Prefer {@link Glass}: it sizes the filter, keeps it
 * in step with the transform and turns on the WebGL back buffer the filter needs.
 *
 * Using it alone, set `filterArea` on the filtered container to the glass rectangle. Pass every
 * distance in screen pixels, so multiply by the world scale yourself. The filter reads the backdrop
 * (`blendRequired`), so on WebGL it needs `useBackBuffer: true` on the renderer. Each setter
 * uploads its uniform only when a value changes.
 */
export class GlassFilter extends Filter {
    private readonly _u: UniformGroup;

    constructor() {
        program ??= GlProgram.from({
            vertex: glassVertex,
            fragment: glassFragment,
            name: 'silk-glass',
            preferredFragmentPrecision: 'highp',
        });
        gpuProgram ??= GpuProgram.from({
            name: 'silk-glass',
            vertex: { source: glassWgsl, entryPoint: 'mainVertex' },
            fragment: { source: glassWgsl, entryPoint: 'mainFragment' },
        });
        const u = new UniformGroup({
            uShape: { value: new Float32Array([50, 50, 16, 0]), type: 'vec4<f32>' },
            uOptics: { value: new Float32Array([16, 12, 0.3, 18]), type: 'vec4<f32>' },
            uTint: { value: new Float32Array([1, 1, 1, 0.04]), type: 'vec4<f32>' },
            uLight: { value: new Float32Array([-Math.SQRT1_2, -Math.SQRT1_2, 0.8, 0.035]), type: 'vec4<f32>' },
            uSurface: { value: new Float32Array([0.06, 1, 1.15, 0]), type: 'vec4<f32>' },
        });

        super({
            glProgram: program,
            gpuProgram,
            resources: { glassUniforms: u, uBackTexture: Texture.EMPTY },
            blendRequired: true,
            clipToViewport: false,
            padding: 0,
            resolution: 'inherit',
        });
        this._u = u;
    }

    /** Half width, half height and corner radius in screen pixels, and squircle smoothing 0 to 1. Defaults 50, 50, 16, 0. */
    setShape(halfWidth: number, halfHeight: number, radius: number, smoothing: number): void {
        this._set('uShape', halfWidth, halfHeight, radius, smoothing);
    }

    /** Blur radius, refraction distance and bevel width in screen pixels, and dispersion 0 to 1. Defaults 16, 12, 0.3, 18. */
    setOptics(blur: number, refraction: number, dispersion: number, bevel: number): void {
        this._set('uOptics', blur, refraction, dispersion, bevel);
    }

    /** Tint colour as straight sRGB 0 to 1 per channel, and how much of it to mix in, 0 to 1. Default white at 0.04. */
    setTint(r: number, g: number, b: number, amount: number): void {
        this._set('uTint', r, g, b, amount);
    }

    /** Unit vector towards the light (see {@link lightVector}), light strength and grain amount. Defaults top left, 0.8, 0.035. */
    setLight(x: number, y: number, strength: number, grain: number): void {
        this._set('uLight', x, y, strength, grain);
    }

    /** Frost 0 to 1, opacity 0 to 1, saturation (1 keeps colours) and a grain seed. Defaults 0.06, 1, 1.15, 0. */
    setSurface(frost: number, opacity: number, saturation: number, seed: number): void {
        this._set('uSurface', frost, opacity, saturation, seed);
    }

    private _set(name: string, a: number, b: number, c: number, d: number): void {
        const v = this._u.uniforms[name] as Float32Array;

        if (v[0] === a && v[1] === b && v[2] === c && v[3] === d) return;
        v[0] = a;
        v[1] = b;
        v[2] = c;
        v[3] = d;
        this._u.update();
    }
}
