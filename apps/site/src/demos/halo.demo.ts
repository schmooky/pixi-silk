import { Container } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { trackGesture } from 'pixi-silk/ui/gesture';
import { ContextHalo } from 'pixi-silk/ui/halo';
import { defineDemo } from './runtime';

// Icons drawn in white around (0, 0). The halo tints them.
const copy = (g: SilkGraphics, s: number) => {
    g.roundRect(-s * 0.4, -s * 0.2, s * 0.55, s * 0.6, 3).stroke({ width: s * 0.1, color: 0xffffff });
    g.roundRect(-s * 0.15, -s * 0.45, s * 0.55, s * 0.6, 3).fill(0xffffff);
};
const trash = (g: SilkGraphics, s: number) => {
    g.roundRect(-s * 0.3, -s * 0.22, s * 0.6, s * 0.66, 3).fill(0xffffff);
    g.line(-s * 0.42, -s * 0.34, s * 0.42, -s * 0.34).stroke({ width: s * 0.1, cap: 'round', color: 0xffffff });
};
const lock = (g: SilkGraphics, s: number) => {
    g.roundRect(-s * 0.32, -s * 0.05, s * 0.64, s * 0.46, 4).fill(0xffffff);
    g.arcSweep(0, -s * 0.08, s * 0.2, Math.PI, Math.PI).stroke({ width: s * 0.1, color: 0xffffff });
};
const front = (g: SilkGraphics, s: number) => {
    g.regularPoly(0, -s * 0.12, s * 0.3, 3, 0, 2).fill(0xffffff);
    g.line(-s * 0.3, s * 0.32, s * 0.3, s * 0.32).stroke({ width: s * 0.1, cap: 'round', color: 0xffffff });
};
const paint = (g: SilkGraphics, s: number) => g.circle(0, 0, s * 0.36).fill(0xffffff);

// Click a shape to select it. Drag it around: the halo follows and turns away from the edges.
export default defineDemo({
    title: 'Selection halo',
    size: [640, 380],
    touchAction: 'none',
    controls: {
        hideWhileDragging: { type: 'toggle', label: 'hide while dragging', value: false },
    },
    setup({ silk, stage, params, tick }) {
        const world = new Container();
        const halo = new ContextHalo({
            items: [
                { id: 'copy', label: 'Duplicate', icon: copy },
                { id: 'paint', label: 'Colour', icon: paint },
                { id: 'front', label: 'Bring to front', icon: front },
                { id: 'lock', label: 'Lock', icon: lock, disabled: true },
                { id: 'delete', label: 'Delete', icon: trash },
            ],
            bounds: { x: 0, y: 0, width: 640, height: 380 },
            ticker: silk.app.ticker,
            onSelect: (item) => {
                const target = halo.state.target.value as SilkGraphics | null;

                if (!target) return;
                if (item.id === 'delete') {
                    halo.detach();
                    target.destroy();
                } else if (item.id === 'front') world.addChild(target);
                else if (item.id === 'paint') redraw(target, (Math.random() * 0xffffff) | 0);
            },
        });
        const redraw = (g: SilkGraphics, colour: number) => {
            g.clear().roundRect(-60, -40, 120, 80, 18, 0.6).fill(colour);
        };
        const backdrop = new Container();

        backdrop.eventMode = 'static';
        backdrop.hitArea = { contains: () => true };
        backdrop.on('pointerdown', () => halo.detach());
        stage.addChild(backdrop, world, halo);

        [
            [170, 190, 0x0a84ff],
            [420, 110, 0x30d158],
            [520, 300, 0xff9f0a],
        ].forEach(([x, y, colour]) => {
            const g = new SilkGraphics();
            let grab = { x: 0, y: 0 };

            redraw(g, colour);
            g.position.set(x, y);
            g.cursor = 'grab';
            world.addChild(g);
            trackGesture(g, {
                onDown: (p) => {
                    halo.attach(g);
                    grab = { x: p.x - g.x, y: p.y - g.y };
                },
                onDragStart: () => halo.state.dragging.set(true),
                onDrag: (p) => g.position.set(p.x - grab.x, p.y - grab.y),
                onDragEnd: () => halo.state.dragging.set(false),
            });
        });
        halo.attach(world.children[0]);

        tick(() => {
            halo.hideWhileDragging = params.hideWhileDragging;
        });

        return undefined;
    },
});
