import { Container, type FederatedPointerEvent, type PointData } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { SnapEngine, type SnapRect } from 'pixi-silk/ui/snap';
import { findSpacing, gapsBetween, SpacingMarkers } from 'pixi-silk/ui/spacing';
import { defineDemo } from './runtime';

// Drag a card: it snaps to equal gaps and shared edges, and pink markers show every equal gap.
// Hover the stack on the right to see its spacing, the way an auto-layout frame shows it.
export default defineDemo({
    title: 'Smart spacing',
    size: [760, 380],
    touchAction: 'none',
    controls: {
        snap: { type: 'toggle', label: 'snap', value: true },
    },
    setup({ stage, params }) {
        const scene = new Container();
        const markers = new SpacingMarkers({ space: scene });
        const stack = new Container();
        const engine = new SnapEngine({ threshold: 8 });
        const cards: Container[] = [];
        const rect = (c: Container): SnapRect => {
            const b = c.getLocalBounds();

            return { x: c.x + b.minX, y: c.y + b.minY, width: b.width, height: b.height };
        };
        let drag: { card: Container; grab: PointData; id: number } | null = null;

        stage.addChild(scene, markers);
        stage.eventMode = 'static';
        stage.hitArea = { contains: () => true };

        const card = (x: number, y: number, w: number, h: number, color: number) => {
            const c = new Container();

            c.addChild(new SilkGraphics().roundRect(0, 0, w, h, 14, 0.6).fill(color));
            c.position.set(x, y);
            c.eventMode = 'static';
            c.cursor = 'grab';
            c.on('pointerdown', (e: FederatedPointerEvent) => {
                const p = scene.toLocal(e.global);

                drag = { card: c, grab: { x: p.x - c.x, y: p.y - c.y }, id: e.pointerId };
                engine.targets = cards.filter((o) => o !== c).map(rect);
            });
            scene.addChild(c);
            cards.push(c);

            return c;
        };

        card(40, 60, 110, 80, 0x0a84ff);
        card(190, 60, 110, 80, 0x5e5ce6);
        card(380, 80, 90, 60, 0xbf5af2);
        card(110, 220, 140, 90, 0x30d158);

        stage.on('globalpointermove', (e: FederatedPointerEvent) => {
            if (!drag || e.pointerId !== drag.id) return;
            const p = scene.toLocal(e.global);
            const c = drag.card;
            const b = c.getLocalBounds();
            const moving = {
                x: p.x - drag.grab.x + b.minX,
                y: p.y - drag.grab.y + b.minY,
                width: b.width,
                height: b.height,
            };
            const snap = params.snap ? engine.snap(moving) : { dx: 0, dy: 0 };

            c.position.set(p.x - drag.grab.x + snap.dx, p.y - drag.grab.y + snap.dy);
            // what lines up after snapping
            markers.show(findSpacing(rect(c), engine.targets));
        });
        const end = () => {
            drag = null;
            markers.clear();
        };

        stage.on('pointerup', end);
        stage.on('pointerupoutside', end);

        // an auto-layout stack: its children's gaps on hover
        stack.position.set(560, 40);
        for (const [i, h] of [56, 40, 72].entries()) {
            const row = new SilkGraphics().roundRect(0, 0, 150, h, 10, 0.6).fill(0x2c2c2e);

            row.y = [0, 72, 128][i];
            stack.addChild(row);
        }
        stack.eventMode = 'static';
        stack.on('pointerover', () => {
            const rows = stack.children.map((r) => ({ x: stack.x, y: stack.y + r.y, width: 150, height: r.height }));

            markers.show({ gaps: gapsBetween(rows, 'y') });
        });
        stack.on('pointerout', () => markers.clear());
        scene.addChild(stack);

        return undefined;
    },
});
