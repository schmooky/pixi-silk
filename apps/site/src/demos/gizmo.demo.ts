import { Container } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { type GizmoMode, type GizmoSpace, TransformGizmo } from 'pixi-silk/ui/gizmo';
import { SelectionOutline } from 'pixi-silk/ui/outline';
import { defineDemo } from './runtime';

// Click a shape to select it, then drag the handles. Hold Shift to snap.
export default defineDemo({
    title: 'Transform gizmo',
    size: [640, 420],
    touchAction: 'none',
    controls: {
        mode: {
            type: 'select',
            label: 'mode',
            options: ['universal', 'move', 'rotate', 'scale', 'box'],
            value: 'universal',
        },
        space: { type: 'select', label: 'space', options: ['local', 'world'], value: 'local' },
        snap: { type: 'toggle', label: 'always snap', value: false },
    },
    setup({ silk, stage, params, tick }) {
        const ticker = silk.app.ticker;
        const scene = new Container();
        const overlay = new Container();
        const background = new Container();
        const hover = new SelectionOutline({ ticker });
        const selection = new SelectionOutline({ ticker });
        const gizmo = new TransformGizmo({ ticker });

        background.eventMode = 'static';
        background.hitArea = { contains: () => true };
        background.on('pointerdown', () => {
            gizmo.attach(null);
            selection.select(null);
        });
        stage.addChild(background, scene, overlay);
        overlay.addChild(hover, selection, gizmo);

        const shape = (x: number, y: number, rotation: number, draw: (g: SilkGraphics) => void) => {
            const item = new Container();
            const g = new SilkGraphics();

            draw(g);
            item.addChild(g);
            item.position.set(x, y);
            item.rotation = rotation;
            item.eventMode = 'static';
            item.cursor = 'pointer';
            item.on('pointerover', () => hover.hover(item));
            item.on('pointerout', () => hover.hover(null));
            item.on('pointerdown', (e) => {
                e.stopPropagation();
                selection.select(item);
                gizmo.attach(item);
            });
            scene.addChild(item);

            return item;
        };

        const card = shape(190, 210, -0.2, (g) => g.roundRect(-70, -45, 140, 90, 18, 0.6).fill(0x30d158));

        shape(400, 150, 0.3, (g) => g.star(0, 0, 5, 52, undefined, 0, 6).fill(0xffd60a));
        shape(460, 300, 0, (g) => g.roundRect(-55, -30, 110, 60, 30).fill(0xbf5af2));
        selection.select(card);
        gizmo.attach(card);

        tick(() => {
            gizmo.state.mode.set(params.mode as GizmoMode);
            gizmo.state.space.set(params.space as GizmoSpace);
            // the box mode draws its own frame
            selection.alpha = params.mode === 'box' ? 0 : 1;
            gizmo.snap.enabled = params.snap;
        });

        return undefined;
    },
});
