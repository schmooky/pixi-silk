/**
 * TypeDoc plugin for pixi-silk's API reference.
 *
 * - Names each module after its import path (`pixi-silk/ui/gizmo` becomes `ui/gizmo`, the root
 *   import `pixi-silk`), so the pages, the sidebar and the llms files use the specifier you import.
 * - Resolves `{@link Name}` across entry points: a widget's JSDoc may link a class that lives
 *   under another subpath.
 * - Checks the JSDoc: every member of the root import and every export of the subpaths needs a
 *   comment, or the build fails (`treatValidationWarningsAsErrors`).
 */
import path from 'node:path';
import { Converter, ReflectionKind } from 'typedoc';
import { ENTRIES, PKG } from './api-paths.mjs';

const ROOT_NAME = PKG.name;

/** Kinds that need a comment: TypeDoc's defaults for the root, the exports alone for subpaths. */
const MEMBER_KINDS =
    ReflectionKind.Enum |
    ReflectionKind.EnumMember |
    ReflectionKind.Variable |
    ReflectionKind.Function |
    ReflectionKind.Class |
    ReflectionKind.Interface |
    ReflectionKind.Property |
    ReflectionKind.Method |
    ReflectionKind.Accessor |
    ReflectionKind.TypeAlias;
const EXPORT_KINDS =
    ReflectionKind.Enum |
    ReflectionKind.Variable |
    ReflectionKind.Function |
    ReflectionKind.Class |
    ReflectionKind.Interface |
    ReflectionKind.TypeAlias;

/** Module name of an entry: `pixi-silk` for the root, else the subpath. */
export const moduleName = (entry) => entry.subpath || ROOT_NAME;

/** @param {import('typedoc').Application} app */
export function load(app) {
    const bySource = new Map(ENTRIES.map((e) => [path.resolve(e.source), e]));

    app.converter.on(
        Converter.EVENT_RESOLVE_BEGIN,
        (context) => {
            for (const mod of context.project.getChildrenByKind(ReflectionKind.Module)) {
                const file = context.project.getSymbolIdFromReflection(mod)?.fileName;
                const entry = file && bySource.get(path.resolve(file));

                if (!entry) {
                    app.logger.warn(`typedoc-subpaths: module ${mod.name} matches no entry point in package.json`);
                    continue;
                }
                mod.name = moduleName(entry);
            }
        },
        100,
    );

    // {@link Camera} in a file that does not import Camera: find the export by name
    app.converter.addUnknownSymbolResolver((ref, refl) => {
        const name = ref.symbolReference?.path?.map((p) => p.path).join('.');

        if (ref.moduleSource || !name) return undefined;
        const project = refl.project;
        const target = project
            .getReflectionsByKind(EXPORT_KINDS)
            .find((r) => r.name === name && r.parent?.kindOf(ReflectionKind.Module));

        return target ? { target, caption: name } : undefined;
    });

    app.converter.on(Converter.EVENT_RESOLVE_END, (context) => {
        const project = context.project;
        let missing = 0;

        for (const refl of project.getReflectionsByKind(MEMBER_KINDS)) {
            const mod = moduleOf(refl);

            if (!mod || refl.flags.isPrivate || refl.flags.isExternal || refl.kindOf(ReflectionKind.Reference))
                continue;
            if (mod.name !== ROOT_NAME && refl.parent !== mod) continue;
            if (insideParameter(refl) || refl.inheritedFrom) continue;
            if (project.getSymbolIdFromReflection(refl)?.packageName !== PKG.name) continue;
            if (documented(refl)) continue;
            app.logger.warn(
                `${mod.name}: ${refl.getFriendlyFullName()} (${ReflectionKind.singularString(refl.kind)}) has no JSDoc`,
            );
            missing++;
        }
        if (missing) app.logger.warn(`typedoc-subpaths: ${missing} exports without JSDoc`);
    });
}

function moduleOf(refl) {
    let r = refl.parent;

    while (r && !r.kindOf(ReflectionKind.Module)) r = r.parent;

    return r;
}

function insideParameter(refl) {
    for (let r = refl.parent; r; r = r.parent)
        if (r.kindOf(ReflectionKind.Parameter | ReflectionKind.TypeLiteral)) return true;

    return false;
}

function documented(refl) {
    if (refl.hasComment()) return true;
    const sigs = refl.type?.declaration?.getNonIndexSignatures?.() ?? refl.getNonIndexSignatures?.() ?? [];
    const accessors = [refl.getSignature, refl.setSignature].filter(Boolean);

    return [...sigs, ...accessors].some((s) => s.hasComment());
}
