/**
 * TypeDoc for every entry point of pixi-silk. The entry points come from package.json `exports`
 * (scripts/api-paths.mjs), so a new subpath gets its API pages without touching this file.
 * scripts/typedoc-subpaths.mjs names the modules after their import paths and checks the JSDoc.
 * scripts/postprocess-api.mjs turns the output into Astro pages.
 */
import { ENTRIES } from './scripts/api-paths.mjs';

/** @type {Partial<import('typedoc').TypeDocOptions & import('typedoc-plugin-markdown').PluginOptions>} */
export default {
    entryPoints: ENTRIES.map((e) => e.source),
    tsconfig: '../../packages/pixi-silk/tsconfig.build.json',
    out: 'src/pages/api',
    plugin: ['typedoc-plugin-markdown', './scripts/typedoc-subpaths.mjs'],
    entryModule: 'pixi-silk',
    entryFileName: 'index',
    readme: 'none',
    githubPages: false,
    hideGenerator: true,
    excludePrivate: true,
    excludeProtected: true,
    excludeInternal: true,
    excludeExternals: true,
    excludeNotDocumented: false,
    sort: ['kind', 'alphabetical'],
    categorizeByGroup: true,
    hidePageHeader: true,
    hideBreadcrumbs: true,
    hidePageTitle: true,
    useCodeBlocks: true,
    expandObjects: true,
    expandParameters: true,
    parametersFormat: 'table',
    propertiesFormat: 'table',
    enumMembersFormat: 'table',
    typeDeclarationFormat: 'table',
    indexFormat: 'table',
    fileExtension: '.md',
    router: 'member',
    flattenOutputFiles: false,
    validation: {
        notExported: true,
        invalidLink: true,
        // typedoc-subpaths.mjs checks the JSDoc instead: every member of the root import, every export of a subpath
        notDocumented: false,
    },
    // internal to the library: referenced from JSDoc or a signature, not exported by any entry point
    intentionallyNotExported: ['Box'],
    externalSymbolLinkMappings: { 'pixi-silk': { INPUT_PROFILES: '/api/ui/interfaces/InputProfile/' } },
    treatValidationWarningsAsErrors: true,
    gitRevision: 'main',
    sourceLinkTemplate: 'https://github.com/schmooky/pixi-silk/blob/{gitRevision}/{path}#L{line}',
};
