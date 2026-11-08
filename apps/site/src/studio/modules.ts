/**
 * Run a demo or lab module from its source, in the browser.
 *
 * Studio holds the code as an editable string, so it cannot `import()` it. The source is compiled
 * with sucrase to CommonJS and evaluated with a `require` that resolves each specifier to a module
 * the site already bundles. What the reader edits is exactly what runs.
 *
 * Every entry loads on demand: Vite splits each into its own chunk.
 */
import { transform } from 'sucrase';

type Loader = () => Promise<Record<string, unknown>>;

/** Packages a module may import. */
const PACKAGES: Record<string, Loader> = {
    'pixi.js': () => import('pixi.js'),
    'pixi-silk': () => import('pixi-silk'),
    'pixi-silk/signal': () => import('pixi-silk/signal'),
    'pixi-silk/glass': () => import('pixi-silk/glass'),
    'pixi-silk/glow': () => import('pixi-silk/glow'),
    'pixi-silk/text': () => import('pixi-silk/text'),
    'pixi-silk/ui': () => import('pixi-silk/ui'),
    'pixi-silk/ui/radial': () => import('pixi-silk/ui/radial'),
    'pixi-silk/ui/button': () => import('pixi-silk/ui/button'),
    'pixi-silk/ui/dock': () => import('pixi-silk/ui/dock'),
    'pixi-silk/ui/gizmo': () => import('pixi-silk/ui/gizmo'),
    'pixi-silk/ui/outline': () => import('pixi-silk/ui/outline'),
    'pixi-silk/ui/snap': () => import('pixi-silk/ui/snap'),
    'pixi-silk/ui/color': () => import('pixi-silk/ui/color'),
    'pixi-silk/ui/halo': () => import('pixi-silk/ui/halo'),
    'pixi-silk/ui/brush': () => import('pixi-silk/ui/brush'),
    'pixi-silk/ui/modes': () => import('pixi-silk/ui/modes'),
    'pixi-silk/ui/dial': () => import('pixi-silk/ui/dial'),
    'pixi-silk/ui/timeline': () => import('pixi-silk/ui/timeline'),
    'pixi-silk/ui/odometer': () => import('pixi-silk/ui/odometer'),
    'pixi-silk/ui/gesture': () => import('pixi-silk/ui/gesture'),
    'pixi-silk/ui/arc': () => import('pixi-silk/ui/arc'),
    'pixi-silk/ui/keys': () => import('pixi-silk/ui/keys'),
    'pixi-silk/ui/pill': () => import('pixi-silk/ui/pill'),
    './runtime': () => import('@/demos/runtime'),
};

// the lab's shared helpers, widgets and sheets, addressed the way a lab page imports them
const LAB = import.meta.glob(['../lab/_shared/*.{ts,css}', '../lab/_widgets/*.ts', '../lab/_sheets/*.ts']);

function loader(specifier: string): Loader | undefined {
    if (PACKAGES[specifier]) return PACKAGES[specifier];
    if (!specifier.startsWith('./_')) return undefined;
    const base = `../lab/${specifier.slice(2)}`;

    return (LAB[base] ?? LAB[`${base}.ts`]) as Loader | undefined;
}

/** Specifiers a module may import, for error messages. */
export const IMPORTABLE: string[] = [...Object.keys(PACKAGES), './_shared/*', './_widgets/*', './_sheets/*'];

/** Compiles TypeScript module source and runs it. Resolves with its exports. */
export async function runModule(source: string): Promise<Record<string, unknown>> {
    const cjs = transform(source, { transforms: ['typescript', 'imports'], filePath: 'studio.ts' }).code;
    const specifiers = [...new Set([...cjs.matchAll(/\brequire\(\s*(['"])([^'"]+)\1\s*\)/g)].map((m) => m[2]))];
    const resolved = new Map<string, unknown>();

    await Promise.all(
        specifiers.map(async (s) => {
            const load = loader(s);

            if (!load) throw new Error(`Studio cannot import '${s}'. It resolves: ${IMPORTABLE.join(', ')}.`);
            // `__esModule` so sucrase's interop reads default exports from the namespace as they are
            resolved.set(s, { __esModule: true, ...(await load()) });
        }),
    );
    const module = { exports: {} as Record<string, unknown> };
    const require = (s: string) => resolved.get(s);
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
        ...args: string[]
    ) => (...args: unknown[]) => Promise<void>;

    // an async body keeps the lab pages' top-level `await`
    await new AsyncFunction('require', 'module', 'exports', cjs)(require, module, module.exports);

    return module.exports;
}
