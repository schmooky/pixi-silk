import { Container, Text } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { bindHistoryKeys, History, recordGizmo, recordSignals } from 'pixi-silk/history';
import { bindGizmo, bindOutline, Selection } from 'pixi-silk/selection';
import { type Signal, signal, watch } from 'pixi-silk/signal';
import { SilkButton } from 'pixi-silk/ui/button';
import { TransformGizmo } from 'pixi-silk/ui/gizmo';
import { SelectionOutline } from 'pixi-silk/ui/outline';
import { defineDemo } from './runtime';

const COLORS = [0x0a84ff, 0x30d158, 0xff9f0a, 0xff375f, 0xbf5af2, 0x64d2ff];

// Click a shape, Shift + click to add more, then drag the gizmo. Circles selects by a test.
// Tint recolours the selection through signals, recorded without writing a command.
// Every step lands in the list on the right. Cmd or ctrl + Z undoes, Shift + cmd + Z redoes.
export default defineDemo({
    size: [760, 420],
    background: 0x151517,
    touchAction: 'none',
    setup({ stage, silk }) {
        const ticker = silk.app.ticker;
        const scene = new Container();
        const overlay = new Container();
        const history = new History();
        const selection = new Selection<Container>();
        const outline = new SelectionOutline({ ticker });
        const hover = new SelectionOutline({ ticker });
        const gizmo = new TransformGizmo({ ticker, readout: false });
        const colors = new Map<Container, Signal<number>>();

        overlay.addChild(hover, outline, gizmo);
        stage.addChild(scene, overlay);
        stage.eventMode = 'static';
        stage.hitArea = { contains: (x: number, y: number) => x >= 0 && y >= 0 && x <= 760 && y <= 420 };
        // a press on the background (not on a button or a shape) clears the selection
        stage.on('pointerdown', (e) => e.target === stage && !e.shiftKey && selection.clear());

        const shape = (kind: 'circle' | 'square', x: number, y: number, i: number) => {
            const item = new Container({ label: kind });
            const g = new SilkGraphics();
            const color = signal(COLORS[i % COLORS.length]);

            watch(color, (c) => {
                g.clear();
                if (kind === 'circle') g.circle(0, 0, 38).fill(c);
                else g.roundRect(-36, -36, 72, 72, 18, 0.6).fill(c);
            });
            item.addChild(g);
            item.position.set(x, y);
            item.eventMode = 'static';
            item.cursor = 'pointer';
            item.on('pointerover', () => selection.state.hovered.set(item));
            item.on('pointerout', () => selection.state.hovered.set(null));
            item.on('pointerdown', (e) => {
                e.stopPropagation();
                selection.pick(item, e.shiftKey ? 'toggle' : 'replace');
                // press and drag in one go
                if (!e.shiftKey) gizmo.grab(e);
            });
            scene.addChild(item);
            colors.set(item, color);

            return item;
        };
        const items = [
            shape('circle', 110, 150, 0),
            shape('square', 240, 150, 1),
            shape('circle', 370, 150, 2),
            shape('square', 110, 290, 3),
            shape('circle', 240, 290, 4),
            shape('square', 370, 290, 5),
        ];
        const stops = [
            bindOutline(selection, outline, hover),
            bindGizmo(selection, gizmo),
            // one undo step per drag, and colour changes recorded from the signals
            recordGizmo(gizmo, history),
            recordSignals(history, [...colors.values()], { label: 'Tint' }).stop,
            bindHistoryKeys(history),
        ];

        // buttons
        const dark = { fill: 0x2c2c2e, fillHover: 0x3a3a3c, fillPress: 0x1c1c1e, fillDisabled: 0x232325 };
        let tint = 0;
        const button = (label: string, x: number, onPress: () => void) => {
            const b = new SilkButton({ ticker, label, width: 84, height: 32, theme: dark, onPress });

            b.position.set(x, 40);
            overlay.addChild(b);

            return b;
        };

        button('Circles', 66, () => selection.selectWhere(items, (s) => s.label === 'circle'));
        button('Tint', 160, () => {
            tint++;
            // one handler, one step: every colour set here undoes together
            for (const item of selection.items)
                colors.get(item)?.set(COLORS[(COLORS.indexOf(colors.get(item)?.value ?? 0) + tint) % COLORS.length]);
        });
        const undo = button('Undo', 254, () => history.undo());
        const redo = button('Redo', 348, () => history.redo());

        stops.push(
            watch(history.state.canUndo, (v) => undo.state.enabled.set(v)),
            watch(history.state.canRedo, (v) => redo.state.enabled.set(v)),
        );

        // the stack, newest at the bottom, undone steps greyed out
        const panel = new SilkGraphics();
        const list = new Container();

        panel.roundRect(470, 24, 266, 372, 18, 0.6).fill(0x1c1c1e);
        stage.addChildAt(panel, 0);
        stage.addChild(list);
        const style = (fill: number) => ({ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13, fill });
        const render = () => {
            list.removeChildren().forEach((c) => {
                c.destroy();
            });
            const rows = [
                ...history.past.slice(-8).map((s) => ({ label: s.label, done: true })),
                ...history.future.slice(0, 4).map((s) => ({ label: s.label, done: false })),
            ];
            const title = new Text({ text: 'History', style: style(0x8e8e93), resolution: 4 });

            title.position.set(494, 42);
            list.addChild(title);
            if (!rows.length) rows.push({ label: 'Nothing yet', done: false });
            rows.forEach((row, i) => {
                const t = new Text({ text: row.label, style: style(row.done ? 0xf2f2f7 : 0x636366), resolution: 4 });

                t.position.set(494, 74 + i * 26);
                list.addChild(t);
            });
        };

        stops.push(history.onChange(render));
        render();
        selection.pick(items[1]);

        return () => {
            for (const stop of stops) stop();
        };
    },
});
