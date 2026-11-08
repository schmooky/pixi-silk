import { Container } from 'pixi.js';
import { damp, SilkGraphics, Spring } from 'pixi-silk';
import { defineDemo } from './runtime';

// Frame-rate independent motion: the knob glides the same at 60, 120 or 144 Hz.
export default defineDemo({
    title: 'Spring',
    size: [480, 200],
    touchAction: 'none',
    controls: {
        stiffness: { type: 'range', label: 'stiffness', min: 40, max: 400, step: 1, value: 170 },
        damping: { type: 'range', label: 'damping', min: 4, max: 40, step: 1, value: 14 },
    },
    setup({ stage, params, tick }) {
        const g = new SilkGraphics();
        const hit = new Container();
        const x = new Spring(120);
        let glow = 0;
        let dragging = false;

        hit.eventMode = 'static';
        hit.hitArea = { contains: (px: number, py: number) => px >= 0 && px <= 480 && py >= 0 && py <= 200 };
        hit.on('pointerdown', (e) => {
            dragging = true;
            x.target = Math.min(440, Math.max(40, e.getLocalPosition(stage).x));
        });
        hit.on('globalpointermove', (e) => {
            if (dragging) x.target = Math.min(440, Math.max(40, e.getLocalPosition(stage).x));
        });
        hit.on('pointerup', () => (dragging = false));
        hit.on('pointerupoutside', () => (dragging = false));
        stage.addChild(g, hit);
        tick((_t, dt) => {
            x.stiffness = params.stiffness;
            x.damping = params.damping;
            x.step(dt);
            glow = damp(glow, dragging ? 1 : 0, 10, dt);
            g.clear();
            g.pill(40, 94, 400, 12).fill(0x2c2c2e);
            g.pill(40, 94, Math.max(12, x.value - 40), 12).fill(0x0a84ff);
            g.circle(x.value, 100, 22 + glow * 6).fill({ color: 0x0a84ff, alpha: 0.35 * glow, blur: 10 });
            g.circle(x.value, 100, 20).fill(0xffffff);
        });
    },
});
