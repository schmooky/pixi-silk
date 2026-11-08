import { Text } from 'pixi.js';
import { SilkGraphics } from 'pixi-silk';
import { defineDemo } from './runtime';

/** CSS-style shadows: blur is the CSS blur radius (twice the gaussian sigma), `spread` grows the shape first. */
const STACKS: [blur: number, spread: number][][] = [
    [],
    [[8, 0]],
    [
        [8, 0],
        [32, 8],
    ],
    [
        [8, 0],
        [32, 8],
        [128, 32],
    ],
];
const S = 110;

export default defineDemo({
    size: [760, 300],
    background: 0x0a0a0c,
    setup({ stage }) {
        const g = new SilkGraphics();

        g.blendMode = 'add';
        STACKS.forEach((stack, i) => {
            const x = 60 + i * 175;
            const y = 80;

            for (const [blur, spread] of stack) {
                g.roundRect(x, y, S, S, 26, 0.6).fill({ color: 0xffffff, alpha: 0.55, blur: blur / 2, spread });
            }
            g.roundRect(x, y, S, S, 26, 0.6).fill(0xffffff);
            const label = new Text({
                text: stack.length ? stack.map(([b, s]) => (s ? `${b} / ${s}` : `${b}`)).join('  +  ') : 'no shadow',
                style: { fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: 10, fill: 0x8e8e93 },
            });

            label.anchor.set(0.5, 0);
            label.position.set(x + S / 2, 250);
            stage.addChild(label);
        });
        stage.addChildAt(g, 0);

        return undefined;
    },
});
