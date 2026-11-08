import { Container, type FederatedPointerEvent } from 'pixi.js';
import { linear, SilkGraphics } from 'pixi-silk';
import { silkLabel } from 'pixi-silk/text';
import { Camera, ZoomControl } from 'pixi-silk/ui/camera';
import { TransformGizmo } from 'pixi-silk/ui/gizmo';
import { CanvasGrid } from 'pixi-silk/ui/grid';
import { SelectionGroup } from 'pixi-silk/ui/group';
import { Guides } from 'pixi-silk/ui/guides';
import { altDown } from 'pixi-silk/ui/keys';
import { Marquee } from 'pixi-silk/ui/marquee';
import { Measure } from 'pixi-silk/ui/measure';
import { boundsQuad, SelectionOutline, unionQuad } from 'pixi-silk/ui/outline';
import { Ruler } from 'pixi-silk/ui/ruler';
import { SnapEngine, type SnapRect } from 'pixi-silk/ui/snap';
import { findSpacing, SpacingMarkers } from 'pixi-silk/ui/spacing';
import { defineDemo } from './runtime';

// Drag on empty canvas to select, Shift adds and Alt takes away. Drag selected layers to move
// them: pink markers show equal gaps. Drag guides out of the rulers, drop them back to remove.
// Scroll to pan, pinch or ctrl + scroll to zoom.
export default defineDemo({
    size: [760, 520],
    background: 0x151517,
    touchAction: 'none',
    ownsCamera: true,
    controls: {
        grid: { type: 'select', label: 'grid', options: ['lines', 'dots', 'off'], value: 'lines' },
        marquee: { type: 'select', label: 'marquee', options: ['intersect', 'contain'], value: 'intersect' },
    },
    setup({ silk, params }) {
        const app = silk.app;
        const world = new Container();
        const overlay = new Container();
        const camera = new Camera({ world, element: app.canvas });
        const grid = new CanvasGrid({ camera, ticker: app.ticker });
        // SilkText labels: distance fields stay sharp at any zoom
        const label = silkLabel();
        const ruler = new Ruler({ camera, ticker: app.ticker, label });
        const engine = new SnapEngine();
        const guides = new Guides({ camera, ruler, snap: engine, ticker: app.ticker, label });
        const group = new SelectionGroup();
        const hover = new SelectionOutline({ ticker: app.ticker });
        const outline = new SelectionOutline({ ticker: app.ticker, brackets: false });
        const spacing = new SpacingMarkers({ space: world, ticker: app.ticker });
        const measure = new Measure({ space: world, ticker: app.ticker, label });
        const layers: Container[] = [];
        let selected: readonly Container[] = [];
        let hovered: Container | null = null;

        const rectOf = (items: readonly Container[]): SnapRect => {
            const q = unionQuad(items.map((t) => boundsQuad(t, world)));

            return { x: q[0].x, y: q[0].y, width: q[2].x - q[0].x, height: q[2].y - q[0].y };
        };
        const others = () => layers.filter((l) => !selected.includes(l)).map((l) => rectOf([l]));
        const hooks = group.hooks();
        const gizmo = new TransformGizmo({
            mode: 'box',
            snapEngine: engine,
            ticker: app.ticker,
            onStart: () => {
                hooks.onStart();
                // snap to everything that is not moving, and to the guides
                engine.targets = others();
            },
            onChange: (_t, handle) => {
                hooks.onChange();
                if (handle === 'box-move') spacing.show(findSpacing(rectOf(selected), engine.targets));
            },
            onEnd: () => {
                hooks.onEnd();
                spacing.clear();
            },
        });
        const marquee = new Marquee({
            camera,
            surface: app.stage,
            candidates: () => layers,
            selection: () => selected,
            ticker: app.ticker,
            // live while dragging: only the outline follows, the gizmo comes when it ends
            onChange: (list) => (marquee.state.active.value ? preview(list) : select(list)),
            onEnd: (list) => select(list),
        });
        const zoom = new ZoomControl(camera, { label });

        world.addChild(group);
        guides.bindSnap(engine);
        camera.state.zoom.subscribe((k) => {
            engine.threshold = 6 / k;
        });
        engine.threshold = 6 / camera.zoom;
        overlay.addChild(hover, outline, spacing, measure, gizmo, guides, marquee, ruler, zoom);
        app.stage.addChild(grid, world, overlay);
        app.stage.eventMode = 'static';
        app.stage.hitArea = app.screen;

        function preview(list: readonly Container[]) {
            selected = list;
            outline.select(list);
            ruler.highlight(list.length ? list : null);
        }
        function select(list: readonly Container[]) {
            preview(list);
            // the gizmo's box frames the selection from here on
            outline.select([]);
            group.set(list);
            gizmo.attach(group.target);
            measure.size(list.length ? group.target : null);
            sync();
        }
        const sync = () => {
            const pair = altDown() && selected.length === 1 && hovered && hovered !== selected[0];

            measure.between(pair ? selected[0] : null, pair ? hovered : null);
            hover.hover(pair || (hovered && selected.includes(hovered)) ? null : hovered);
        };

        // an artboard: a frame you can marquee across, with layers on it
        const board = new SilkGraphics().rect(0, 0, 480, 360).fill(0xf4f4f6);

        world.addChildAt(board, 0);
        const layer = (x: number, y: number, draw: (g: SilkGraphics) => void) => {
            const item = new Container();
            const g = new SilkGraphics();

            draw(g);
            item.addChild(g);
            item.position.set(x, y);
            item.eventMode = 'static';
            item.cursor = 'pointer';
            item.on('pointerover', () => {
                hovered = item;
                sync();
            });
            item.on('pointerout', () => {
                if (hovered === item) hovered = null;
                sync();
            });
            item.on('pointerdown', (e: FederatedPointerEvent) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                if (e.shiftKey)
                    select(selected.includes(item) ? selected.filter((s) => s !== item) : [...selected, item]);
                else if (!selected.includes(item)) select([item]);
                // press and move in one go
                if (selected.includes(item)) gizmo.grab(e);
            });
            world.addChildAt(item, world.children.length - 1);
            layers.push(item);

            return item;
        };

        layer(32, 32, (g) =>
            g.roundRect(0, 0, 416, 120, 24, 0.6).fill(linear([0x5e5ce6, 0xbf5af2], { from: [0, 0], to: [1, 1] })),
        );
        const a = layer(32, 184, (g) => g.roundRect(0, 0, 120, 96, 18, 0.6).fill(0xffffff));

        layer(180, 184, (g) => g.roundRect(0, 0, 120, 96, 18, 0.6).fill(0xffffff));
        layer(360, 184, (g) => g.roundRect(0, 0, 88, 96, 18, 0.6).fill(0xffffff));
        layer(32, 304, (g) => g.circle(12, 12, 12).fill(0x30d158));
        layer(72, 308, (g) => g.pill(0, 0, 160, 16).fill(0x1c1c1e));

        guides.add('x', 32);
        guides.add('y', 184);

        const place = () =>
            zoom.position.set(app.screen.width - zoom.size[0] - 12, app.screen.height - zoom.size[1] - 12);

        app.renderer.on('resize', place);
        place();
        select([a]);
        camera.fit({ x: -40, y: -40, width: 560, height: 440 }, 24, false);

        const onKey = (e: KeyboardEvent) => e.key === 'Alt' && sync();

        addEventListener('keydown', onKey);
        addEventListener('keyup', onKey);
        app.ticker.add(() => {
            grid.state.visible.set(params.grid !== 'off');
            if (params.grid !== 'off') grid.state.style.set(params.grid as 'lines' | 'dots');
            marquee.mode = params.marquee as 'intersect' | 'contain';
        });

        return () => {
            removeEventListener('keydown', onKey);
            removeEventListener('keyup', onKey);
            camera.destroy();
            ruler.destroy();
            marquee.destroy();
        };
    },
});
