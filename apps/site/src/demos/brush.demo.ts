import { Container, RenderTexture, Sprite } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { BrushCursor } from 'pixi-silk/ui/brush';
import { defineDemo, SERIES } from './runtime';

// Paint on the canvas. Hold F and move (or drag with the right button) to resize: sideways is
// size, up and down is hardness. [ and ] step the size. A pen's pressure shows as the inner disc.
// Each stroke takes the next colour of the palette.
export default defineDemo({
    title: 'Brush cursor',
    size: [720, 360],
    touchAction: 'none',
    setup({ silk, stage, width, height }) {
        const surface = new Container();
        const canvas = RenderTexture.create({ width, height, resolution: silk.resolution });
        const dab = new SilkGraphics();
        const brush = new BrushCursor({ size: 36, hardness: 0.6, surface, ticker: silk.app.ticker });
        let painting = false;
        let last: { x: number; y: number } | null = null;
        let colour = 0;

        surface.eventMode = 'static';
        surface.hitArea = { contains: (x, y) => x >= 0 && y >= 0 && x <= width && y <= height };
        const paper = new Sprite(canvas);

        stage.addChild(paper, surface, brush);

        const stamp = (x: number, y: number, pressure: number) => {
            const { size, hardness, opacity } = brush.state;
            const r = (size.value / 2) * (0.35 + 0.65 * pressure);

            // soft brushes are a blurred dab, hard ones a crisp disc
            dab.clear()
                .circle(x, y, r * (0.6 + 0.4 * hardness.value))
                .fill({
                    color: SERIES[colour % SERIES.length],
                    alpha: 0.35 * opacity.value,
                    blur: r * (1 - hardness.value) * 0.6,
                });
            silk.app.renderer.render({ container: dab, target: canvas, clear: false });
        };
        const paintTo = (x: number, y: number, pressure: number) => {
            const from = last ?? { x, y };
            const step = Math.max(1, brush.state.size.value * 0.12);
            const n = Math.max(1, Math.ceil(Math.hypot(x - from.x, y - from.y) / step));

            for (let i = 1; i <= n; i++)
                stamp(from.x + ((x - from.x) * i) / n, from.y + ((y - from.y) * i) / n, pressure);
            last = { x, y };
        };

        // a few strokes to start from: a hard one, a soft one and a thin one
        const strokes: [size: number, hardness: number, path: (u: number) => [number, number]][] = [
            [40, 0.85, (u) => [80 + u * 560, 120 + Math.sin(u * Math.PI * 2) * 50]],
            [64, 0.15, (u) => [100 + u * 520, 230 + Math.sin(u * Math.PI * 2 + 2) * 40]],
            [14, 1, (u) => [140 + u * 440, 290 - Math.sin(u * Math.PI) * 30]],
        ];

        for (const [size, hardness, path] of strokes) {
            brush.state.size.set(size);
            brush.state.hardness.set(hardness);
            last = null;
            for (let i = 0; i <= 60; i++) paintTo(...path(i / 60), 0.4 + 0.6 * Math.sin((i / 60) * Math.PI));
            colour++;
        }
        brush.state.size.set(36);
        brush.state.hardness.set(0.6);
        last = null;

        surface.on('pointerdown', (e) => {
            if (e.button !== 0 || brush.state.resizing.value) return;
            painting = true;
            last = null;
            const p = stage.toLocal(e.global);

            paintTo(p.x, p.y, e.pointerType === 'pen' ? e.pressure : 0.6);
        });
        surface.on('globalpointermove', (e) => {
            if (!painting || brush.state.resizing.value) return;
            const p = stage.toLocal(e.global);

            paintTo(p.x, p.y, e.pointerType === 'pen' ? e.pressure : 0.6);
        });
        const stop = () => {
            if (painting) colour++;
            painting = false;
            last = null;
        };

        surface.on('pointerup', stop);
        surface.on('pointerupoutside', stop);

        return () => {
            // take the sprite off the stage first, then free the texture once the GPU is done with it
            paper.destroy();
            requestAnimationFrame(() => canvas.destroy(true));
        };
    },
});
