import { linear, SilkGraphics } from 'pixi-silk';
import { Island, IslandFrame, IslandGauge } from 'pixi-silk/ui/island';
import { defineDemo } from './runtime';

const W = 640;
const H = 400;

const icon = (draw: (g: SilkGraphics) => void) => {
    const g = new SilkGraphics();

    draw(g);

    return g;
};
const line = { width: 2, color: 0xffffff, cap: 'round', join: 'round' } as const;

// A bezel that eats into the canvas: a side rail of icons, thin bands elsewhere and a rounded
// window. Islands grow out of the bezel, and the window is a viewport for the app inside.
export default defineDemo({
    title: 'Island frame and rail',
    size: [W, H],
    touchAction: 'none',
    controls: {
        rail: { type: 'range', label: 'rail', min: 0, max: 80, step: 2, value: 56 },
        bezel: { type: 'range', label: 'bezel', min: 0, max: 24, step: 1, value: 8 },
        radius: { type: 'range', label: 'corners', min: 0, max: 40, step: 1, value: 22 },
    },
    setup({ silk, stage, params, tick }) {
        const ticker = silk.app.ticker;
        const frame = new IslandFrame({
            viewport: { width: W, height: H },
            bands: { left: params.rail, top: params.bezel, right: params.bezel, bottom: params.bezel },
            radius: params.radius,
            rail: {
                start: [
                    icon((g) => g.circle(12, 12, 9).stroke(line)),
                    icon((g) => g.roundRect(3, 3, 18, 18, 5).stroke(line)),
                    icon((g) => g.moveTo(3, 16).lineTo(9, 10).lineTo(14, 14).lineTo(21, 6).stroke(line)),
                ],
                end: [
                    icon((g) =>
                        g
                            .circle(12, 12, 11)
                            .fill({ gradient: linear([0xff2d55, 0x0a84ff], { from: [0, 0], to: [1, 1] }) }),
                    ),
                ],
            },
            ticker,
        });
        // the app: a sky in the window, repainted when the window changes
        const sky = new SilkGraphics();
        const paint = () => {
            const r = frame.inner.value;

            sky.clear()
                .rect(r.x, r.y, r.width, r.height)
                .fill({ gradient: linear([0xe0e1dd, 0x778da9], { from: [0, 0], to: [0.3, 1] }) });
        };
        const dot = (g: SilkGraphics, s: number) => g.circle(0, 0, s * 0.2).fill(0xffffff);
        const side = new Island({
            viewport: frame.inner,
            edge: 'right',
            items: [
                new IslandGauge({ value: 0.64, color: 0xff9f0a, icon: dot, size: 44, ticker }),
                new IslandGauge({ value: 0.32, color: 0x30d158, icon: dot, size: 44, ticker }),
            ],
            gap: 12,
            padding: 14,
            state: 'open',
            ticker,
        });

        frame.inner.subscribe(paint);
        paint();
        stage.addChild(sky, frame, side);
        let key = '';

        tick(() => {
            const next = `${params.rail}/${params.bezel}`;

            if (frame.radius !== params.radius) frame.radius = params.radius;
            if (next === key) return;
            key = next;
            frame.setBands({ left: params.rail, top: params.bezel, right: params.bezel, bottom: params.bezel });
        });

        return undefined;
    },
});
