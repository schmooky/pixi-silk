import { Container } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { bindHistoryKeys, History, recordGizmo } from 'pixi-silk/history';
import { bindGizmo, bindMeasure, bindOutline, Selection } from 'pixi-silk/selection';
import { watch } from 'pixi-silk/signal';
import { silkLabel } from 'pixi-silk/text';
import { Camera } from 'pixi-silk/ui/camera';
import { TransformGizmo } from 'pixi-silk/ui/gizmo';
import { Inspector, type InspectorField } from 'pixi-silk/ui/inspector';
import { altDown } from 'pixi-silk/ui/keys';
import { LayerTree, pixiTreeAdapter } from 'pixi-silk/ui/layers';
import { Measure } from 'pixi-silk/ui/measure';
import { SelectionOutline } from 'pixi-silk/ui/outline';
import { PANEL_THEME, PANEL_THEME_LIGHT, Panel, type PanelTheme, panelHitTest } from 'pixi-silk/ui/panel';
import { BG, defineDemo } from './runtime';

/** A layer with a fill, a size and a corner radius the inspector can edit. */
class Shape extends Container {
    private readonly g = new SilkGraphics();
    private _fill: number;
    private _w: number;
    private _h: number;
    private _radius: number;
    readonly round: boolean;

    constructor(label: string, w: number, h: number, fill: number, radius = 0, round = false) {
        super({ label });
        this._w = w;
        this._h = h;
        this._fill = fill;
        this._radius = radius;
        this.round = round;
        this.addChild(this.g);
        this.redraw();
    }

    get fill(): number {
        return this._fill;
    }
    set fill(v: number) {
        this._fill = v;
        this.redraw();
    }
    get w(): number {
        return this._w;
    }
    set w(v: number) {
        this._w = Math.max(1, v);
        this.redraw();
    }
    get h(): number {
        return this._h;
    }
    set h(v: number) {
        this._h = Math.max(1, v);
        this.redraw();
    }
    get radius(): number {
        return this._radius;
    }
    set radius(v: number) {
        this._radius = Math.max(0, v);
        this.redraw();
    }

    private redraw(): void {
        const g = this.g.clear();

        if (this.round) g.ellipse(this._w / 2, this._h / 2, this._w / 2, this._h / 2).fill(this._fill);
        else
            g.roundRect(0, 0, this._w, this._h, Math.min(this._radius, this._w / 2, this._h / 2), 0.6).fill(this._fill);
    }
}

// The inspector rows for a layer. Keys are paths on the selected objects.
const schema: InspectorField[] = [
    {
        type: 'section',
        label: 'Layer',
        fields: [
            { type: 'text', key: 'label', label: 'Name' },
            { type: 'toggle', key: 'visible', label: 'Visible' },
            { type: 'number', key: 'alpha', label: 'Opacity', min: 0, max: 1, step: 0.01, perPixel: 0.005 },
            {
                type: 'choice',
                key: 'blendMode',
                label: 'Blend',
                options: [
                    { value: 'inherit', label: 'Pass' },
                    { value: 'normal', label: 'Normal' },
                    { value: 'add', label: 'Add' },
                ],
            },
        ],
    },
    {
        type: 'section',
        label: 'Transform',
        fields: [
            { type: 'vector', keys: ['position.x', 'position.y'], label: 'Position' },
            { type: 'vector', keys: ['w', 'h'], label: 'Size', labels: ['W', 'H'], min: 1, lockAspect: true },
            { type: 'number', key: 'angle', label: 'Rotation', step: 1, unit: 'deg' },
        ],
    },
    {
        type: 'section',
        label: 'Fill',
        fields: [
            { type: 'color', key: 'fill', label: 'Colour' },
            { type: 'number', key: 'radius', label: 'Radius', min: 0, step: 1, unit: 'px' },
        ],
    },
];

// A small editor drawn entirely on the canvas: layers on the left, the inspector on the right and
// the scene in the middle. Pick a layer in the list or on the canvas, drag rows to reorder them,
// scrub a number, or open the colour swatch. Cmd or ctrl + Z undoes every step. Drag a panel by
// its title to float it, and drop it near an edge to dock it. On a narrow canvas both panels start
// folded: click a chevron to open one.
export default defineDemo({
    title: 'Editor panels',
    size: [720, 620],
    touchAction: 'none',
    ownsCamera: true,
    controls: {
        theme: { type: 'select', label: 'theme', options: ['dark', 'light'], value: 'dark' },
    },
    setup({ silk, params, tick }) {
        const app = silk.app;
        const world = new Container({ label: 'Page' });
        const overlay = new Container();
        const panelLayer = new Container();
        const selection = new Selection<Container>();
        const history = new History();
        const label = silkLabel();
        const hover = new SelectionOutline({ ticker: app.ticker });
        const outline = new SelectionOutline({ ticker: app.ticker });
        const measure = new Measure({ space: world, ticker: app.ticker, label });
        const gizmo = new TransformGizmo({ ticker: app.ticker, onChange: () => synced() });
        const panels: Panel[] = [];
        const camera = new Camera({ world, element: app.canvas, ignore: panelHitTest(() => panels) });
        const viewport = { width: camera.state.width, height: camera.state.height };

        gizmo.state.mode.set('move');
        overlay.addChild(hover, outline, gizmo, measure);
        app.stage.addChild(world, overlay, panelLayer);
        app.stage.eventMode = 'static';
        app.stage.hitArea = app.screen;
        app.stage.on('pointerdown', (e) => e.target === app.stage && !e.shiftKey && selection.clear());

        // ------------------------------------------------------------------ the scene
        const layer = <T extends Container>(item: T, parent: Container, x: number, y: number): T => {
            item.position.set(x, y);
            item.eventMode = 'static';
            item.cursor = 'pointer';
            item.on('pointerover', () => selection.state.hovered.set(item));
            item.on('pointerout', () => {
                if (selection.state.hovered.value === item) selection.state.hovered.set(null);
            });
            item.on('pointerdown', (e) => {
                e.stopPropagation();
                selection.pick(item, e.shiftKey ? 'toggle' : 'replace');
            });
            parent.addChild(item);

            return item;
        };
        const group = (name: string, parent: Container, x = 0, y = 0) => {
            const g = new Container({ label: name });

            g.position.set(x, y);
            parent.addChild(g);

            return g;
        };

        const home = group('Home', world);

        layer(new Shape('Background', 390, 620, 0xf4f4f6), home, 0, 0);
        layer(new Shape('Hero', 342, 180, 0x5e5ce6, 24), home, 24, 24);
        const cards = group('Cards', home, 24, 228);

        layer(new Shape('Card A', 160, 120, 0xffffff, 18), cards, 0, 0);
        layer(new Shape('Card B', 160, 120, 0xffffff, 18), cards, 182, 0);
        const list = group('List', home, 24, 372);

        for (let i = 0; i < 3; i++) {
            const row = group(`Row ${i + 1}`, list, 0, i * 52);

            layer(new Shape('Row background', 342, 44, 0xffffff, 12), row, 0, 0);
            layer(new Shape('Avatar', 28, 28, [0x30d158, 0xff9f0a, 0xff375f][i], 0, true), row, 10, 8);
            layer(new Shape('Title', 140, 10, 0xd1d1d6, 5), row, 50, 17);
        }
        layer(new Shape('Tab bar', 342, 52, 0x1c1c1e, 26), home, 24, 548);
        const profile = group('Profile', world, 470, 0);

        layer(new Shape('Background', 390, 620, 0xf4f4f6), profile, 0, 0);
        layer(new Shape('Cover', 390, 200, 0xbf5af2), profile, 0, 0);
        layer(new Shape('Photo', 96, 96, 0xffd60a, 0, true), profile, 147, 152);
        layer(new Shape('Bio', 300, 80, 0xffffff, 16), profile, 45, 280);

        // ------------------------------------------------------------------ the panels
        let ui: ReturnType<typeof buildPanels> | null = null;
        const synced = () => ui?.inspector.refresh();
        // panel widths for the canvas the demo got: a phone gets two folded title bars
        const narrow = silk.width < 560;
        const sizes = narrow ? { layers: 140, inspector: 176 } : { layers: 196, inspector: 244 };
        // the light theme builds the panels again with the other tokens
        const buildPanels = (theme: Partial<PanelTheme>) => {
            const layersPanel = new Panel({
                title: 'Layers',
                dock: narrow ? 'top-left' : 'left',
                width: sizes.layers,
                minWidth: sizes.layers,
                height: 360,
                collapsed: narrow,
                viewport,
                scroll: false,
                theme,
            });
            const inspectorPanel = new Panel({
                title: 'Inspector',
                dock: narrow ? 'top-right' : 'right',
                width: sizes.inspector,
                minWidth: sizes.inspector,
                height: 420,
                collapsed: narrow,
                viewport,
                theme,
            });
            const tree = new LayerTree({
                adapter: pixiTreeAdapter({ leaf: (c) => c instanceof Shape }),
                root: world,
                selection,
                history,
                element: app.canvas,
                theme,
            });
            const inspector = new Inspector({ schema, history, element: app.canvas, popoverLayer: panelLayer, theme });

            layersPanel.content.add(tree, { grow: 1, onSize: (w, h) => tree.resize(w, h) });
            inspectorPanel.content.add(inspector);
            panels.length = 0;
            panels.push(layersPanel, inspectorPanel);
            panelLayer.addChild(...panels);
            const stops = [
                watch(selection.state.items, (items) => {
                    inspector.bind(items);
                    inspectorPanel.title =
                        items.length > 1 ? `${items.length} layers` : (items[0]?.label ?? 'Inspector');
                }),
                history.onChange(() => {
                    tree.refresh();
                    synced();
                }),
            ];

            return {
                inspector,
                destroy: () => {
                    for (const stop of stops) stop();
                    for (const p of panels) p.destroy({ children: true });
                },
            };
        };

        ui = buildPanels(PANEL_THEME);
        const redlines = () => altDown();
        const measured = bindMeasure(selection, measure, { between: redlines });
        const syncHover = () => {
            const over = selection.state.hovered.value;

            hover.hover(!over || selection.has(over) ? null : over);
        };
        // everything reads the one selection, and every change goes through the one history
        const stops = [
            bindOutline(selection, outline),
            bindGizmo(selection, gizmo),
            measured.stop,
            recordGizmo(gizmo, history),
            bindHistoryKeys(history),
            watch(selection.state.hovered, syncHover),
            watch(selection.state.items, syncHover),
        ];
        let theme = params.theme;

        tick(() => {
            if (params.theme === theme) return;
            theme = params.theme;
            app.renderer.background.color = theme === 'light' ? 0xe4e4ea : BG;
            ui?.destroy();
            ui = buildPanels(theme === 'light' ? PANEL_THEME_LIGHT : PANEL_THEME);
        });

        selection.pick(cards.children[0] as Container);
        // frame the first artboard in the space the panels leave free, again when the canvas gets its size
        const frame = () =>
            camera.fit(
                home,
                narrow
                    ? { left: 24, right: 24, top: 64, bottom: 24 }
                    : { left: sizes.layers + 20, right: sizes.inspector + 20, top: 24, bottom: 24 },
                false,
            );
        let framed = camera.state.width.value > 0;
        const stopFrame = camera.state.width.subscribe((w) => {
            if (framed || w <= 0) return;
            framed = true;
            frame();
        });

        stops.push(stopFrame);
        frame();

        return () => {
            for (const stop of stops) stop();
            ui?.destroy();
            camera.destroy();
        };
    },
});
