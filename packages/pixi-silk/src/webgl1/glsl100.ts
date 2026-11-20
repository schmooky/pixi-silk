/*
 * GLSL ES 3.00 to GLSL ES 1.00, for the WebGL1 programs. The 3.00 sources stay the one place the
 * shading lives: this module rewrites them when `enableWebGL1()` runs. It handles what WebGL1 lacks
 * in general (flat varyings, bit operators, `%`, texelFetch, textureSize, textureLod, loops with a
 * bound that is not a constant). Each program adds patches for what only it does. A patch or a cap
 * that no longer matches the source throws, and the unit tests run every conversion, so a change
 * to a 3.00 source that breaks its WebGL1 version fails a test instead of a user's draw.
 */

/**
 * @internal A text edit the conversion applies before its general rules. It must match. It sees
 * the source after {@link normalizeGlsl}: write patterns without comments or indentation. A text
 * `find` is normalized too.
 */
export interface Patch {
    /** Text or pattern to find. A global pattern replaces every match. */
    find: string | RegExp;
    /** Replacement, with `$1` style groups for a pattern. */
    replace: string;
}

/** @internal Options of {@link toGlsl100}. */
export interface Glsl100Options {
    /** Edits applied first, in order. Each must match at least once. */
    patches?: readonly Patch[];
    /**
     * Iteration cap for each loop whose bound is not a constant, keyed by the bound as written
     * (`n`, `s + cnt`). WebGL1 loops need a constant bound: the loop runs to the cap and breaks
     * at the real bound. A dynamic loop with no cap here throws.
     */
    caps?: Readonly<Record<string, number>>;
}

/** @internal What {@link toGlsl100} returns. */
export interface Glsl100 {
    /** The GLSL ES 1.00 source. */
    source: string;
    /** Samplers whose size the shader reads from a `<name>Size` vec2 uniform (texelFetch, textureSize). */
    sized: string[];
}

/**
 * @internal Replaces every call `name(...)` with `fn(args)`. Arguments are split at the commas of
 * the call itself, so nested calls and constructors stay whole.
 */
export function rewriteCalls(src: string, name: string, fn: (args: string[]) => string): string {
    const re = new RegExp(`\\b${name}\\(`, 'g');
    let out = '';
    let at = 0;

    for (let m = re.exec(src); m !== null; m = re.exec(src)) {
        const args: string[] = [];
        let depth = 1;
        let start = m.index + m[0].length;
        let j = start;

        for (; j < src.length && depth > 0; j++) {
            const c = src[j];

            if (c === '(') depth++;
            else if (c === ')') {
                depth--;
                if (depth === 0) args.push(src.slice(start, j).trim());
            } else if (c === ',' && depth === 1) {
                args.push(src.slice(start, j).trim());
                start = j + 1;
            }
        }
        if (depth !== 0) throw new Error(`pixi-silk/webgl1: unclosed call to ${name}`);
        out += src.slice(at, m.index) + fn(args);
        at = j;
        re.lastIndex = j;
    }

    return out + src.slice(at);
}

/**
 * @internal The build's shader minifier (`build/glsl.ts`): no comments, no indentation, one
 * statement per line as written. The published sources come out of it, the sources in a test or a
 * dev server do not, so the conversion runs both through it and patches never see the difference.
 */
export function normalizeGlsl(source: string): string {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, '')
        .split('\n')
        .map((line) => line.trim().replace(/\s+/g, ' '))
        .filter(Boolean)
        .join('\n');
}

function applyPatch(src: string, patch: Patch): string {
    const replace = patch.replace;
    const find = typeof patch.find === 'string' ? normalizeGlsl(patch.find) : patch.find;
    const hit = typeof find === 'string' ? src.includes(find) : src.search(find) >= 0;

    if (!hit) throw new Error(`pixi-silk/webgl1: shader patch no longer matches: ${String(find).slice(0, 80)}`);
    if (typeof find === 'string') return src.split(find).join(replace);
    if (find.global) find.lastIndex = 0;

    return src.replace(find, replace);
}

const isConstant = (s: string): boolean => /^-?\d+$/.test(s.trim());

/** @internal Rewrites a GLSL ES 3.00 stage as GLSL ES 1.00. Throws when something is left that 1.00 lacks. */
export function toGlsl100(src: string, stage: 'vertex' | 'fragment', options: Glsl100Options = {}): Glsl100 {
    src = normalizeGlsl(src);
    for (const patch of options.patches ?? []) src = applyPatch(src, patch);
    src = src.replace(/^#version 300 es\n/, '');

    // bit operators on int flags: float maths, exact below 2^24
    src = src.replace(
        /\((\w+) >> (\d+)\) & (\d+)/g,
        (_, v, s, m) => `bitsAt(${v}, ${2 ** Number(s)}.0, ${Number(m) + 1}.0)`,
    );
    src = src.replace(/\((\w+) & (\d+)\) (!=|==) 0/g, (_, v, b, op) => `${op === '==' ? '!' : ''}bitSet(${v}, ${b}.0)`);
    // % on ints: a parenthesised left side (one level of nesting) or a plain name
    src = src.replace(/\(((?:[^()]|\([^()]*\))*)\) % (\w+)/g, (_, a, b) => `imod(${a}, ${b})`);
    src = src.replace(/(\w+) % (\w+)/g, (_, a, b) => `imod(${a}, ${b})`);

    // loops with a bound that is not a constant: run to a cap, break at the bound
    const caps = options.caps ?? {};
    const used = new Set<string>();

    src = src.replace(/for \(int (\w+) = ([^;]+); \1 < ([^;]+); \1\+\+\)(\s*)\{/g, (all, v, from, to, ws) => {
        if (isConstant(from) && isConstant(to)) return all;
        const cap = caps[to.trim()];

        if (cap === undefined) throw new Error(`pixi-silk/webgl1: loop bound '${to}' has no cap`);
        used.add(to.trim());
        const i = `${v}_gl1`;
        const inner = ws;

        return `for (int ${i} = 0; ${i} < ${cap}; ${i}++)${ws}{${inner}int ${v} = ${from} + ${i};${inner}if (${v} >= ${to}) break;`;
    });
    for (const key of Object.keys(caps)) {
        if (!used.has(key)) throw new Error(`pixi-silk/webgl1: cap for loop bound '${key}' matches no loop`);
    }

    src = src.replace(/\bflat /g, '');
    if (stage === 'vertex') {
        src = src.replace(/^in /gm, 'attribute ').replace(/^out /gm, 'varying ');
    } else {
        src = src.replace(/^in /gm, 'varying ').replace(/^out vec4 finalColor;\n/m, '');
        src = src.replace(/\bfinalColor\b/g, 'gl_FragColor');
    }

    // textures: no texelFetch, textureSize or textureLod in 1.00
    const sized = new Set<string>();

    src = rewriteCalls(src, 'textureLod', ([s, uv, lod]) => {
        if (lod !== '0.0') throw new Error('pixi-silk/webgl1: textureLod with a level other than 0');

        return `texture2D(${s}, ${uv})`;
    });
    src = rewriteCalls(src, 'texelFetch', ([s, c]) => {
        sized.add(s);

        return `texel_${s}(${c})`;
    });
    src = rewriteCalls(src, 'textureSize', ([s]) => {
        sized.add(s);

        return `ivec2(${s}Size)`;
    });
    src = src.replace(/\btexture\(/g, 'texture2D(');

    // helpers go after the last uniform, before the first function that needs them
    const helpers: string[] = [];

    for (const s of sized) {
        helpers.push(`uniform vec2 ${s}Size;`);
        if (src.includes(`texel_${s}(`)) {
            helpers.push(`vec4 texel_${s}(ivec2 c) { return texture2D(${s}, (vec2(c) + 0.5) / ${s}Size); }`);
        }
    }
    if (src.includes('bitSet('))
        helpers.push('bool bitSet(int f, float b) { return mod(floor(float(f) / b), 2.0) >= 1.0; }');
    if (src.includes('bitsAt('))
        helpers.push('int bitsAt(int f, float s, float m) { return int(mod(floor(float(f) / s), m)); }');
    if (src.includes('imin(')) helpers.push('int imin(int a, int b) { return a < b ? a : b; }');
    if (src.includes('imax(')) helpers.push('int imax(int a, int b) { return a > b ? a : b; }');
    if (src.includes('imod(')) {
        helpers.push('int imod(int a, int b) { int q = int(floor((float(a) + 0.5) / float(b))); return a - q * b; }');
    }
    if (helpers.length > 0) {
        const lines = src.split('\n');
        let last = -1;

        lines.forEach((line, i) => {
            if (/^uniform /.test(line)) last = i;
        });
        if (last < 0) throw new Error('pixi-silk/webgl1: no uniform to place the helpers after');
        lines.splice(last + 1, 0, '', ...helpers);
        src = lines.join('\n');
    }

    if (stage === 'fragment' && /\b(dFdx|dFdy|fwidth)\(/.test(src)) {
        // precision first, so Pixi does not put a statement ahead of the directive
        src = src.replace(/^precision highp float;\n/m, '');
        src = `precision highp float;\n#extension GL_OES_standard_derivatives : enable\n${src}`;
    }

    const left = src.match(
        /#version|\btexelFetch\(|\btextureSize\(|\btextureLod\(|\bflat\b|\s%\s|>>|<<|(?<!&)&(?!&)|^(in|out) /m,
    );

    if (left) throw new Error(`pixi-silk/webgl1: '${left[0].trim()}' has no GLSL ES 1.00 rewrite`);

    return { source: src, sized: [...sized] };
}
