import { type Container, Matrix, Sprite } from 'pixi.js';
import type { LayerIcon, TreeAdapter } from './tree';

/** Options of {@link pixiTreeAdapter}. */
export interface PixiTreeOptions {
    /** Which children show as rows. Default every child. */
    filter?: (child: Container) => boolean;
    /** The row name of an unnamed container. Default its kind: Group, Shape, Text or Image. */
    name?: (node: Container) => string;
    /** The row icon. Default from the kind of display object. */
    icon?: (node: Container) => LayerIcon | null;
    /**
     * Containers shown as single layers: their children stay out of the list and nothing drops
     * inside them. Use it for components drawn from several parts. Default none.
     */
    leaf?: (node: Container) => boolean;
}

/** What {@link pixiTreeAdapter} returns: an adapter for containers, plus the lock state it keeps. */
export interface PixiTreeAdapter extends Required<Omit<TreeAdapter<Container>, 'getIcon'>> {
    /** The row icon. */
    getIcon(node: Container): LayerIcon | null;
}

const kindOf = (c: Container, leaf?: (node: Container) => boolean): 'text' | 'image' | 'shape' | 'group' => {
    if (leaf?.(c)) return 'shape';
    // Text, BitmapText, HTMLText and SilkText all have a string `text`
    if (typeof (c as Container & { text?: unknown }).text === 'string') return 'text';
    if (c instanceof Sprite) return 'image';
    if ((c as Container & { allowChildren?: boolean }).allowChildren === false) return 'shape';

    return 'group';
};

const NAMES = { text: 'Text', image: 'Image', shape: 'Shape', group: 'Group' };

/**
 * A {@link TreeAdapter} for a Pixi scene graph. Rows list a container's children front to back,
 * the way design tools do, so the last child is the top row. Names are `label`. Hiding sets
 * `visible`. Locking turns pointer events off for the node and everything under it. Moves keep
 * each node where it is on screen.
 *
 * @example
 * ```ts
 * const tree = new LayerTree({ adapter: pixiTreeAdapter(), root: world, selection });
 * ```
 */
export function pixiTreeAdapter(options: PixiTreeOptions = {}): PixiTreeAdapter {
    const locked = new WeakMap<Container, Container['eventMode']>();
    const filter = options.filter ?? (() => true);
    const leaf = options.leaf;
    const kids = (node: Container): Container[] => {
        const out: Container[] = [];

        if (leaf?.(node)) return out;
        // front first: the last child is drawn on top
        for (let i = node.children.length - 1; i >= 0; i--) {
            const c = node.children[i];

            if (filter(c)) out.push(c);
        }

        return out;
    };

    return {
        getChildren: kids,
        getName: (node) => node.label || (options.name?.(node) ?? NAMES[kindOf(node, leaf)]),
        getParent: (node) => node.parent ?? null,
        setName: (node, name) => {
            node.label = name;
        },
        getIcon: (node) => (options.icon ? options.icon(node) : kindOf(node, leaf)),
        isVisible: (node) => node.visible,
        setVisible: (node, visible) => {
            node.visible = visible;
        },
        isLocked: (node) => locked.has(node),
        setLocked: (node, lock) => {
            if (lock === locked.has(node)) return;
            if (lock) {
                locked.set(node, node.eventMode);
                node.eventMode = 'none';
            } else {
                node.eventMode = locked.get(node) ?? 'passive';
                locked.delete(node);
            }
        },
        canHaveChildren: (node) => kindOf(node, leaf) === 'group',
        move: (node, parent, index) => {
            // display index counts front first and leaves the node out
            const shown = kids(parent).filter((c) => c !== node);
            const at = Math.max(0, Math.min(index, shown.length));
            // the child it goes in front of, in Pixi order: the one shown right below it
            const below = shown[at];
            const rest = parent.children.filter((c) => c !== node);
            const pixiIndex = below === undefined ? 0 : rest.indexOf(below) + 1;

            const at2 = Math.min(pixiIndex, rest.length);

            if (node.parent === parent) {
                parent.addChildAt(node, at2);

                return;
            }
            // keep it in place on screen: its global transform, seen from the new parent
            const global = node.getGlobalTransform(new Matrix(), false);
            const local = parent.getGlobalTransform(new Matrix(), false).invert().append(global);

            parent.addChildAt(node, at2);
            node.setFromMatrix(local);
        },
    };
}
