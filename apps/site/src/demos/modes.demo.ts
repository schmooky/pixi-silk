import { Text } from 'pixi.js';
import type { SilkGraphics } from 'pixi-silk';
import { ModeSwitcher, SegmentedSwitch } from 'pixi-silk/ui/modes';
import { defineDemo } from './runtime';

type Icon = (g: SilkGraphics, s: number) => void;
const brush: Icon = (g, s) => {
    g.line(-s * 0.3, s * 0.3, s * 0.3, -s * 0.3).stroke({ width: s * 0.14, cap: 'round', color: 0xffffff });
    g.circle(-s * 0.32, s * 0.32, s * 0.14).fill(0xffffff);
};
const eraser: Icon = (g, s) => g.roundRect(-s * 0.36, -s * 0.2, s * 0.72, s * 0.4, 4).fill(0xffffff);
const smudge: Icon = (g, s) => g.heart(0, 0, s * 0.7, 0.2).fill(0xffffff);
const fill: Icon = (g, s) => g.regularPoly(0, 0, s * 0.38, 6, 0, 3).fill(0xffffff);
const pick: Icon = (g, s) => {
    g.circle(0, 0, s * 0.3).stroke({ width: s * 0.1, color: 0xffffff });
    g.circle(0, 0, s * 0.08).fill(0xffffff);
};

// Hold Space over the canvas (or long-press it) for the mode ring, release on a mode.
// Tap Space to swap back to the previous mode. The pill below is a SegmentedSwitch.
export default defineDemo({
    title: 'Mode ring',
    size: [640, 360],
    // the layout is centred on the width, so phones only need a narrower design size
    phone: { size: [360, 360] },
    touchAction: 'none',
    setup({ silk, stage, width, height }) {
        const ticker = silk.app.ticker;
        const status = new Text({
            text: '',
            style: { fill: 0xf2f2f7, fontFamily: 'system-ui, sans-serif', fontSize: 18, fontWeight: '600' },
        });
        const hint = new Text({
            text: 'hold Space or long-press, tap Space to swap back',
            style: { fill: 0x8e8e93, fontFamily: 'system-ui, sans-serif', fontSize: 13 },
        });
        const speed = new SegmentedSwitch({
            options: [
                { id: 'slow', label: 'Slow' },
                { id: 'normal', label: 'Normal' },
                { id: 'turbo', label: 'Turbo' },
            ],
            value: 'normal',
            ticker,
        });
        const tools = new SegmentedSwitch({
            options: [
                { id: 'brush', icon: brush },
                { id: 'eraser', icon: eraser },
                { id: 'smudge', icon: smudge },
                { id: 'fill', icon: fill },
                { id: 'pick', icon: pick },
            ],
            segmentWidth: 48,
            ticker,
        });
        const modes = new ModeSwitcher({
            modes: [
                { id: 'brush', label: 'BRUSH', icon: brush },
                { id: 'eraser', label: 'ERASER', icon: eraser },
                { id: 'smudge', label: 'SMUDGE', icon: smudge },
                { id: 'fill', label: 'FILL', icon: fill },
                { id: 'pick', label: 'PICKER', icon: pick },
            ],
            longPressTarget: stage,
            ticker,
        });

        stage.eventMode = 'static';
        stage.hitArea = { contains: (x, y) => x >= 0 && y >= 0 && x <= width && y <= height };
        status.anchor.set(0.5);
        hint.anchor.set(0.5);
        status.position.set(width / 2, 70);
        hint.position.set(width / 2, 100);
        tools.position.set(width / 2, 190);
        speed.position.set(width / 2, 290);
        stage.addChild(status, hint, tools, speed, modes);

        // the switcher and the toolbar share one source of truth
        const show = (mode: string) => {
            status.text = `mode: ${mode}`;
            tools.state.value.set(mode);
        };

        modes.state.mode.subscribe(show);
        tools.state.value.subscribe((id) => modes.set(id));
        show(modes.mode);

        return undefined;
    },
});
