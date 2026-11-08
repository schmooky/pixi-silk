/**
 * Build-time GLSL and WGSL minification for the `/* glsl *\/` and `/* wgsl *\/` template literals
 * in `src/`. WGSL has the same comment syntax and no preprocessor, so the same rules apply.
 *
 * JavaScript minifiers never touch the contents of template literals, so the shader source would
 * ship with its comments and indentation (about a quarter of its size). This removes comments and
 * collapses whitespace only: every token keeps a separator and every line keeps its own line, so
 * preprocessor directives stay intact and the program the GPU compiles is unchanged.
 * `tests/glsl.test.ts` checks that the token stream survives.
 */
import type { Rolldown } from 'tsdown';

const MARKER = /\/\* (glsl|wgsl) \*\//;
const LITERAL = /\/\* (glsl|wgsl) \*\/ `([^`]*)`/g;

/** Removes comments, indentation, repeated spaces and blank lines. Newlines are kept. */
export function minifyGlsl(source: string): string {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/[^\n]*/g, '')
        .split('\n')
        .map((line) => line.trim().replace(/\s+/g, ' '))
        .filter(Boolean)
        .join('\n');
}

/** Rolldown / Vite plugin that minifies the GLSL template literals of the library's modules. */
export function glsl(): Rolldown.Plugin {
    return {
        name: 'pixi-silk:glsl',
        transform: {
            filter: { code: MARKER },
            handler(code, id) {
                const out = code.replace(LITERAL, (_, lang: string, body: string) => {
                    // interpolations or escapes would change meaning once the text is rewritten
                    if (body.includes('${') || body.includes('\\')) {
                        this.error(`${id}: ${lang.toUpperCase()} literals must not contain \${} or backslashes`);
                    }

                    return `\`${minifyGlsl(body)}\``;
                });

                return out === code ? null : { code: out, map: null };
            },
        },
    };
}
