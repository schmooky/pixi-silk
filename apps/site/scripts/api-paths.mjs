/**
 * The entry points of pixi-silk and where their API pages live. Shared by the TypeDoc config, its
 * plugin (typedoc-subpaths.mjs), postprocess-api.mjs and build-llms.mjs, so the three agree on
 * every URL.
 *
 * Layout under src/pages/api (served at /api/):
 *   index.md                     overview: the entry points and the root import's exports
 *   classes/SilkGraphics.md      root import (`pixi-silk`): <kind>/<Name>
 *   ui/gizmo/index.md            a subpath (`pixi-silk/ui/gizmo`): its overview
 *   ui/gizmo/classes/TransformGizmo.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const PKG_DIR = path.resolve(HERE, '../../../packages/pixi-silk');
export const PKG = JSON.parse(fs.readFileSync(path.join(PKG_DIR, 'package.json'), 'utf8'));

/**
 * Every code entry point: `{ subpath: 'ui/gizmo', specifier: 'pixi-silk/ui/gizmo', source }`, root
 * first and the `pixi-silk/ui` barrel last, so each symbol is documented under its own subpath and
 * the barrel only re-exports it.
 */
export const ENTRIES = Object.entries(PKG.exports)
    .filter(([key, target]) => key !== './package.json' && typeof target === 'object')
    .map(([key, target]) => {
        const subpath = key === '.' ? '' : key.slice(2);

        return {
            key,
            subpath,
            specifier: subpath ? `${PKG.name}/${subpath}` : PKG.name,
            source: path.join(PKG_DIR, 'src', target.default.replace(/^\.\/dist\//, '').replace(/\.js$/, '.ts')),
        };
    })
    .sort((a, b) => rank(a) - rank(b));

function rank(e) {
    if (e.subpath === '') return 0;
    if (e.subpath === 'ui') return 2;

    return 1;
}

/** Folder of each reflection kind, as typedoc-plugin-markdown's kind router names them. */
export const KIND_FOLDERS = {
    Class: 'classes',
    Interface: 'interfaces',
    Function: 'functions',
    Variable: 'variables',
    TypeAlias: 'types',
    Enum: 'enumerations',
    Namespace: 'namespaces',
};

/** Human label of each folder. */
export const FOLDER_KINDS = {
    classes: 'Class',
    interfaces: 'Interface',
    functions: 'Function',
    variables: 'Variable',
    'type-aliases': 'Type',
    types: 'Type',
    enumerations: 'Enum',
    namespaces: 'Namespace',
};

/** File of a symbol's page, relative to src/pages/api. */
export const apiFile = (subpath, folder, name) => [subpath, folder, `${name}.md`].filter(Boolean).join('/');

/** URL of a page from its file. */
export const apiHref = (rel) => {
    const clean = rel.replace(/\.md$/, '').replace(/(^|\/)index$/, '');

    return clean ? `/api/${clean}/` : '/api/';
};

/** URL of a subpath's overview. */
export const moduleHref = (subpath) => (subpath ? `/api/${subpath}/` : '/api/');
