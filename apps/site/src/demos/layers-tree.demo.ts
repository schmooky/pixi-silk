import { History } from 'pixi-silk/history';
import { Selection } from 'pixi-silk/selection';
import { watch } from 'pixi-silk/signal';
import { SilkText } from 'pixi-silk/text';
import { type LayerIcon, LayerTree, type TreeAdapter } from 'pixi-silk/ui/layers';
import { PANEL_THEME, Panel } from 'pixi-silk/ui/panel';
import { defineDemo } from './runtime';

/** The app's own model: plain objects, no Pixi in them. */
interface Item {
    name: string;
    kind: 'frame' | 'group' | 'shape' | 'text';
    children: Item[];
    parent: Item | null;
    hidden: boolean;
    locked: boolean;
}

const item = (name: string, kind: Item['kind'], parent: Item | null): Item => {
    const it: Item = { name, kind, children: [], parent, hidden: false, locked: false };

    parent?.children.push(it);

    return it;
};

// Two thousand layers in a plain object model. Only the rows in view are drawn. Click, Shift +
// click and cmd or ctrl + click select. Drag rows to reorder them, or drop them on a group to move
// them inside. Double click a name to rename it. Arrow keys move the selection.
export default defineDemo({
    size: [640, 460],
    background: 0x141416,
    touchAction: 'none',
    setup({ silk, stage }) {
        const canvas = silk.app.canvas;
        const still = (e: WheelEvent) => e.preventDefault();

        canvas.addEventListener('wheel', still, { passive: false });
        const root = item('Document', 'frame', null);
        let count = 0;

        for (let f = 0; f < 40; f++) {
            const frame = item(`Screen ${f + 1}`, 'frame', root);

            for (let g = 0; g < 5; g++) {
                const group = item(`Section ${g + 1}`, 'group', frame);

                for (let s = 0; s < 9; s++)
                    item(s % 3 === 0 ? `Label ${s + 1}` : `Shape ${s + 1}`, s % 3 ? 'shape' : 'text', group);
                count += 10;
            }
            count++;
        }
        const adapter: TreeAdapter<Item> = {
            getChildren: (n) => n.children,
            getName: (n) => n.name,
            getParent: (n) => n.parent,
            setName: (n, name) => {
                n.name = name;
            },
            getIcon: (n): LayerIcon => n.kind,
            isVisible: (n) => !n.hidden,
            setVisible: (n, v) => {
                n.hidden = !v;
            },
            isLocked: (n) => n.locked,
            setLocked: (n, v) => {
                n.locked = v;
            },
            canHaveChildren: (n) => n.kind === 'frame' || n.kind === 'group',
            move: (n, parent, index) => {
                n.parent?.children.splice(n.parent.children.indexOf(n), 1);
                parent.children.splice(index, 0, n);
                n.parent = parent;
            },
        };
        const selection = new Selection<Item>();
        const history = new History();
        const panel = new Panel({ title: 'Layers', x: 24, y: 24, width: 300, height: 412, scroll: false });
        const tree = new LayerTree({ adapter, root, selection, history, element: canvas });
        const info = new SilkText({
            fontFamily: PANEL_THEME.fontFamily,
            fontSize: 13,
            lineHeight: 20,
            fill: 0x8e8e96,
            wordWrap: true,
            wordWrapWidth: 260,
        });
        const onKey = (e: KeyboardEvent) => {
            const mod = e.metaKey || e.ctrlKey;

            if (!mod || e.code !== 'KeyZ') return;
            e.preventDefault();
            if (e.shiftKey) history.redo();
            else history.undo();
        };

        addEventListener('keydown', onKey);
        tree.expand(root.children[0], true);
        panel.content.add(tree, { grow: 1, onSize: (w, h) => tree.resize(w, h) });
        info.position.set(356, 40);
        stage.addChild(panel, info);
        const show = () => {
            const picked = selection.items.map((n) => n.name);

            info.text = [
                `${count} layers, ${tree.rows.length} rows open`,
                '',
                picked.length
                    ? `Selected: ${picked.slice(0, 6).join(', ')}${picked.length > 6 ? ' and more' : ''}`
                    : 'Nothing selected',
                '',
                history.state.undoLabel.value ? `Undo: ${history.state.undoLabel.value}` : 'Nothing to undo',
            ].join('\n');
        };
        const stops = [watch(selection.state.items, show), watch(tree.state.rows, show), history.onChange(show)];

        return () => {
            for (const stop of stops) stop();
            removeEventListener('keydown', onKey);
            canvas.removeEventListener('wheel', still);
        };
    },
});
