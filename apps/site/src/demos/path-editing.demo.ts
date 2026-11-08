import { Container, Text } from 'pixi.js';
import { linear, SilkGraphics } from 'pixi-silk';
import { bindHistoryKeys, History } from 'pixi-silk/history';
import { type BezierPath, drawPath, parseSvgPath, pathBounds } from 'pixi-silk/path';
import { watch } from 'pixi-silk/signal';
import { SilkButton } from 'pixi-silk/ui/button';
import { Camera } from 'pixi-silk/ui/camera';
import { SegmentedSwitch } from 'pixi-silk/ui/modes';
import { PathGizmo } from 'pixi-silk/ui/pathgizmo';
import { defineDemo } from './runtime';

// Drag anchors and handles. Click the outline to add a point, double-click a point to switch it
// between corner and smooth, Alt + drag a handle to break the curve. The pen adds points: click
// for corners, drag for curves, click the first point to close. Cmd or ctrl + Z undoes.
export default defineDemo({
    size: [760, 480],
    background: 0x151517,
    touchAction: 'none',
    ownsCamera: true,
    controls: {
        snap: { type: 'toggle', label: 'snap to 10', value: false },
    },
    setup({ silk, params }) {
        const app = silk.app;
        const world = new Container();
        const overlay = new Container();
        const camera = new Camera({ world, element: app.canvas });
        const history = new History();
        const shape = new SilkGraphics();
        const [heart] = parseSvgPath(
            'M0 -60 C 0 -140 -140 -140 -140 -40 C -140 60 0 120 0 180 C 0 120 140 60 140 -40 C 140 -140 0 -140 0 -60 Z',
        );
        const gizmo = new PathGizmo({ path: heart, space: world, history, ticker: app.ticker });
        const paint = linear([0xff375f, 0xbf5af2], { from: [0, 0], to: [1, 1] });

        world.addChild(shape);
        overlay.addChild(gizmo);
        app.stage.addChild(world, overlay);
        gizmo.snap = (p) => (params.snap ? { x: Math.round(p.x / 10) * 10, y: Math.round(p.y / 10) * 10 } : p);

        // the shape is drawn from the path: one exact fill, then the stroke
        const draw = (path: BezierPath) => {
            shape.clear();
            if (path.anchors.length < 2) return;
            if (path.closed) drawPath(shape, path).fill(paint);
            drawPath(shape, path).stroke({ width: 2, color: 0xf2f2f7, alpha: path.closed ? 0.35 : 0.9 });
        };
        const stops = [watch(gizmo.state.path, draw)];

        // a toolbar: tools, undo, redo and a fresh path for the pen
        const dark = { fill: 0x2c2c2e, fillHover: 0x3a3a3c, fillPress: 0x1c1c1e, fillDisabled: 0x232325 };
        const tools = new SegmentedSwitch({
            ticker: app.ticker,
            value: 'edit',
            segmentWidth: 64,
            height: 32,
            options: [
                { id: 'edit', label: 'Edit' },
                { id: 'pen', label: 'Pen' },
            ],
        });
        const button = (label: string, onPress: () => void) =>
            new SilkButton({ ticker: app.ticker, label, width: 72, height: 32, theme: dark, onPress });
        const undo = button('Undo', () => history.undo());
        const redo = button('Redo', () => history.redo());
        const fresh = button('New', () => {
            gizmo.edit('New path', () => ({ anchors: [], closed: false }), []);
            gizmo.state.tool.set('pen');
        });
        const hint = new Text({
            text: '',
            style: { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12, fill: 0x8e8e93 },
            resolution: 4,
        });

        overlay.addChild(tools, undo, redo, fresh, hint);
        tools.position.set(76, 28);
        undo.position.set(200, 28);
        redo.position.set(280, 28);
        fresh.position.set(360, 28);
        hint.position.set(16, 452);
        stops.push(
            // the switch and the gizmo share one tool
            watch(tools.state.value, (v) => gizmo.state.tool.set(v === 'pen' ? 'pen' : 'edit')),
            watch(gizmo.state.tool, (v) => tools.state.value.set(v)),
            watch(history.state.canUndo, (v) => undo.state.enabled.set(v)),
            watch(history.state.canRedo, (v) => redo.state.enabled.set(v)),
            watch(history.state.undoLabel, (label) => {
                hint.text = label
                    ? `Undo ${label.toLowerCase()} with cmd or ctrl + Z`
                    : 'Edit the heart, or press New to draw';
            }),
            bindHistoryKeys(history),
        );

        const b = pathBounds(heart);

        camera.fit(b, 72, false);

        return () => {
            for (const stop of stops) stop();
            camera.destroy();
        };
    },
});
