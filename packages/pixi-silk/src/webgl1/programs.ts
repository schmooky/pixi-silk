import { INSTANCE_ATTRIBUTES, PATH_CHUNK, STRIDE } from '../constants';
import { type Glsl100, type Glsl100Options, type Patch, toGlsl100 } from './glsl100';

/*
 * The WebGL1 programs, built from the WebGL2 sources by toGlsl100 plus the patches below.
 *
 * WebGL1 guarantees only 8 varying vectors, and the WebGL2 uber shader hands 16 from the vertex to
 * the fragment stage. So on WebGL1 the fragment stage reads each instance itself, from a float
 * texture (`uInstances`) that mirrors the instance buffer, indexed by the `aIndex` attribute. The
 * vertex stage keeps only what places the quad. The inverse of the local -> clip map comes from the
 * uniforms, so every instance of a path sees the same bits, as the flat varying gives on WebGL2.
 */

/** @internal Instances per row of the instance texture. */
export const INSTANCES_PER_ROW = 64;
/** @internal Texels per instance in the instance texture (one vec4 attribute each). */
export const TEXELS_PER_INSTANCE: number = STRIDE / 4;
/** @internal Width of the instance texture in texels. */
export const INSTANCE_TEXTURE_WIDTH: number = INSTANCES_PER_ROW * TEXELS_PER_INSTANCE;

/** @internal Most edges of a filled path, and most records of a union, the WebGL1 shader reads. */
export const GL1_MAX_EDGES = 4096;
/** @internal Most segment windows (own and nearby) one stroked path instance reads on WebGL1. */
export const GL1_MAX_WINDOWS = 256;

/** @internal Instance attributes the WebGL1 vertex stage still reads (8 attributes is the WebGL1 minimum). */
export const GL1_VERTEX_ATTRIBUTES: ReadonlySet<string> = new Set(['aBounds', 'aShape0', 'aShape2', 'aMeta', 'aFx']);
const KEPT = GL1_VERTEX_ATTRIBUTES;
const FLAT = [
    'Shape0',
    'Shape1',
    'Shape2',
    'Meta',
    'Fill',
    'Stroke',
    'Grad',
    'Paint',
    'Dash',
    'Fx',
    'Tint',
    'Inv',
    'InvT',
    'Base',
];

const silkVertexPatches: Patch[] = [
    { find: /^uniform highp sampler2D uBatch;\n/m, replace: '' },
    { find: /^vBase = 0\.0;\nint idx[\s\S]*?vBase = r1\.z;\n\}\n/m, replace: '' },
    { find: /^flat out .*\n/gm, replace: '' },
    { find: new RegExp(`^v(${FLAT.join('|')}) = .*\\n`, 'gm'), replace: '' },
    {
        find: new RegExp(`^in vec4 (${INSTANCE_ATTRIBUTES.filter((a) => !KEPT.has(a)).join('|')});\\n`, 'gm'),
        replace: '',
    },
    { find: 'in vec2 aCorner;\n', replace: 'in vec2 aCorner;\nin float aIndex;\n' },
    { find: 'out vec2 vPos;\n', replace: 'out vec2 vPos;\nout float vIndex;\n' },
    { find: 'vPos = pos;\n', replace: 'vPos = pos;\nvIndex = aIndex;\n' },
];

function instanceSetup(): string {
    const reads = INSTANCE_ATTRIBUTES.map((a, i) =>
        a === 'aBounds' ? '' : `    v${a.slice(1)} = instanceTexel(${i});\n`,
    ).join('');

    return `// WebGL1: what the WebGL2 vertex stage passes in flat varyings, read here from uInstances
vec4 instanceTexel(int i)
{
    int slot = int(vIndex + 0.5);
    int row = slot / ${INSTANCES_PER_ROW};
    return texelFetch(uInstances, ivec2((slot - row * ${INSTANCES_PER_ROW}) * ${TEXELS_PER_INSTANCE} + i, row), 0);
}

void gl1Setup()
{
${reads}    vTint = uColor * uWorldColorAlpha;
    vBase = 0.0;
    mat3 m = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
    float idet = 1.0 / (m[0].x * m[1].y - m[1].x * m[0].y);
    mat2 ai = mat2(m[1].y, -m[0].y, -m[1].x, m[0].x) * idet;
    vInv = vec4(ai[0], ai[1]);
    vInvT = -(ai * m[2].xy);
}

`;
}

const sdPolygon6 = `float sdPolygon6(vec2 p, vec2 v[6], int n)
{
    // WebGL1 indexes arrays with loop indices only: walk the edges with the previous vertex in hand
    vec2 prev = v[0];
    for (int i = 0; i < 6; i++)
    {
        if (i == n - 1) prev = v[i];
    }
    float d = dot(p - v[0], p - v[0]);
    float s = 1.0;
    for (int i = 0; i < 6; i++)
    {
        if (i >= n) break;
        vec2 vi = v[i];
        vec2 e = prev - vi;
        vec2 w = p - vi;
        vec2 b = w - e * clamp(dot(w, e) / max(dot(e, e), 1e-12), 0.0, 1.0);
        d = min(d, dot(b, b));
        bvec3 c = bvec3(p.y >= vi.y, p.y < prev.y, e.x * w.y > e.y * w.x);
        if (all(c) || all(not(c))) s = -s;
        prev = vi;
    }
    return s * sqrt(d);
}`;

const silkFragmentPatches: Patch[] = [
    // flat inputs become globals that gl1Setup fills
    { find: /^flat in (vec4|vec2|float) (\w+);\n/gm, replace: '$1 $2;\n' },
    {
        find: 'in float vProg;\n',
        replace: `in float vProg;
in float vIndex;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform vec4 uColor;
uniform vec4 uWorldColorAlpha;
uniform highp sampler2D uInstances;
`,
    },
    {
        find: /float sdPolygon6\(vec2 p, vec2 v\[6\], int n\)\n\{[\s\S]*?return s \* sqrt\(d\);\n\}/,
        replace: sdPolygon6,
    },
    {
        find: `    P[k] = v + d1 * e + n1 * hw;
    P[k + 1] = v + d1 * e + n1 * inner;
    P[k + 2] = v - d0 * e + n0 * inner;
`,
        replace: `    vec2 t0 = v + d1 * e + n1 * hw;
    vec2 t1 = v + d1 * e + n1 * inner;
    vec2 t2 = v - d0 * e + n0 * inner;
    if (k == 2)
    {
        P[2] = t0;
        P[3] = t1;
        P[4] = t2;
        P[5] = t2;
    }
    else
    {
        P[3] = t0;
        P[4] = t1;
        P[5] = t2;
    }
`,
    },
    // the union stack: a global array read and written through loop indices
    {
        find: 'float closedSD(vec2 p, int type, float px)\n',
        replace: `float gSt[8];

float stGet(int i)
{
    float r = 0.0;
    for (int j = 0; j < 8; j++)
    {
        if (j == i) r = gSt[j];
    }
    return r;
}

void stSet(int i, float v)
{
    for (int j = 0; j < 8; j++)
    {
        if (j == i) gSt[j] = v;
    }
}

float closedSD(vec2 p, int type, float px)
`,
    },
    { find: 'float st[8];', replace: '' },
    // no int min and max in GLSL ES 1.00
    { find: /\b(min|max)\((sp[^,()]*), (\d+)\)/g, replace: 'i$1($2, $3)' },
    { find: /\bst\[([^\]]+)\] = ([^;]+);/g, replace: 'stSet($1, $2);' },
    { find: /\bst\[([^\]]+)\]/g, replace: 'stGet($1)' },
    { find: 'void main(void)\n{', replace: `${instanceSetup()}void main(void)\n{\ngl1Setup();` },
];

/*
 * Gradient ramps: WebGL1 filters half floats only with OES_texture_half_float_linear. Without it the
 * ramps switch to nearest filtering (hooks.ts), so the programs blend the two texels themselves.
 * At a texel centre either filter gives the texel, so this matches linear filtering everywhere.
 */
const rampLinear = `vec4 rampLinear(float t, float row)
{
    float x = t * 255.0;
    float i = floor(x);
    float v = (row + 0.5) / 256.0;
    vec4 a = texture(uGradients, vec2((i + 0.5) / 256.0, v));
    vec4 b = texture(uGradients, vec2((min(i + 1.0, 255.0) + 0.5) / 256.0, v));
    return mix(a, b, x - i);
}
`;

const rampPatches: Patch[] = [
    {
        find: 'uniform highp sampler2D uGradients;\n',
        replace: `uniform highp sampler2D uGradients;\n\n${rampLinear}\n`,
    },
    {
        find: /textureLod\(uGradients, vec2\(\(t \* 255\.0 \+ 0\.5\) \/ 256\.0, \((\w+)\.y \+ 0\.5\) \/ 256\.0\), 0\.0\)/g,
        replace: 'rampLinear(t, $1.y)',
    },
];

/** @internal Both stages of one WebGL1 program. */
export interface Gl1Sources {
    vertex: Glsl100;
    fragment: Glsl100;
}

/** Per-program conversion options, by program name. Programs not listed need only the general rules. */
const OPTIONS: Record<string, { vertex?: Glsl100Options; fragment?: Glsl100Options }> = {
    'silk-sdf': {
        vertex: { patches: silkVertexPatches },
        fragment: {
            patches: [...silkFragmentPatches, ...rampPatches],
            caps: { n: GL1_MAX_EDGES, nAll: GL1_MAX_WINDOWS, 's + cnt': PATH_CHUNK },
        },
    },
    'silk-text': { fragment: { patches: rampPatches } },
};

/** @internal Converts the GLSL ES 3.00 stages of the program called `name` to GLSL ES 1.00. */
export function gl1Sources(name: string, vertex: string, fragment: string): Gl1Sources {
    const options = OPTIONS[name] ?? {};

    return {
        vertex: toGlsl100(vertex, 'vertex', options.vertex),
        fragment: toGlsl100(fragment, 'fragment', options.fragment),
    };
}
