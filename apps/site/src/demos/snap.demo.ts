import { Container } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { TransformGizmo } from 'pixi-silk/ui/gizmo';
import { boundsQuad, SelectionOutline } from 'pixi-silk/ui/outline';
import { SnapEngine, SnapGuides } from 'pixi-silk/ui/snap';

import { defineDemo } from './runtime';

// Drag a card: edges and centres line up with the others, and equal gaps show their size.
// Hold Ctrl or Cmd to move without guides.
export default defineDemo({
    title: 'Snapping',
    size: [640, 380],
    touchAction: 'none',
    controls: {
        spacing: { type: 'toggle', label: 'equal spacing', value: true },
        threshold: { type: 'range', label: 'threshold', min: 2, max: 16, step: 1, value: 6 },
    },
    setup({ silk, stage, params, tick }) {
        const ticker = silk.app.ticker;
        const scene = new Container();
        const engine = new SnapEngine({ lines: { x: [320], y: [190] } });
        const guides = new SnapGuides({ ticker });
        const selection = new SelectionOutline({ ticker });
        const gizmo = new TransformGizmo({ ticker, mode: 'box', snapEngine: engine, snapGuides: guides });
        const cards: Container[] = [];
        const colors = [0x0a84ff, 0xff9f0a, 0x30d158, 0xbf5af2];
        const select = (card: Container | null) => {
            selection.select(card);
            gizmo.attach(card);
        };

        stage.eventMode = 'static';
        stage.hitArea = { contains: () => true };
        stage.on('pointerdown', () => select(null));
        stage.addChild(scene, guides, selection, gizmo);
        [
            [70, 80],
            [250, 80],
            [430, 120],
            [140, 240],
        ].forEach(([x, y], i) => {
            const card = new Container();
            const g = new SilkGraphics();

            g.roundRect(0, 0, i === 2 ? 140 : 110, 80, 14, 0.6).fill(colors[i]);
            card.addChild(g);
            card.position.set(x, y);
            card.eventMode = 'static';
            card.cursor = 'move';
            card.on('pointerdown', (e) => {
                e.stopPropagation();
                select(card);
                // press and drag in one go, even on a card that was not selected yet
                gizmo.grab(e);
            });
            scene.addChild(card);
            cards.push(card);
        });
        select(cards[3]);

        // what to snap against: every card, read as rectangles in the scene's space
        const refresh = () => {
            engine.targets = cards.map((c) => {
                const q = boundsQuad(c, scene);
                const xs = q.map((p) => p.x);
                const ys = q.map((p) => p.y);

                return {
                    x: Math.min(...xs),
                    y: Math.min(...ys),
                    width: Math.max(...xs) - Math.min(...xs),
                    height: Math.max(...ys) - Math.min(...ys),
                };
            });
        };

        gizmo.state.dragging.subscribe((on) => on && refresh());
        refresh();
        tick(() => {
            engine.spacing = params.spacing;
            engine.threshold = params.threshold;
        });

        return undefined;
    },
});
